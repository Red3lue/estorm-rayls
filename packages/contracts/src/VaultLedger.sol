// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IDex {
    function swap(address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut) external;
}

interface IPriceOracle {
    function getPrice(address token) external view returns (uint256); // cents per whole token
}

/// @title VaultLedger
/// @notice On-chain custodian and state store for the Sovereign Vault.
///
///         KEY DESIGN:
///           • VaultLedger physically holds the ERC-20 tokens (custodian role).
///           • balance is ALWAYS read from IERC20.balanceOf(address(this)) — never trusted from AI.
///           • valueUSD is ALWAYS derived from PriceOracle — never trusted from AI.
///           • Swaps are executed by approving a MockDEX and forwarding the call — no off-chain trust.
///
///         ERC-721 art assets keep their current model (valuation set by manager/certifier).
///         Deployed on Privacy Node — contents never visible on Public Chain.
contract VaultLedger is Ownable {

    // ─── Oracle ──────────────────────────────────────────────────────────────

    address public oracle;

    // ─── ERC-20 Portfolio ────────────────────────────────────────────────────

    struct ERC20Asset {
        address tokenAddress;
        string  symbol;
        uint8   decimals;     // stored from token.decimals() at registration time
        uint256 balance;      // raw units — last snapshot from balanceOf(address(this))
        uint256 valueUSD;     // cents — last snapshot from oracle × balance
        uint8   allocationPct;
        uint8   riskScore;
        uint256 yieldBps;     // basis points (100 = 1%)
        bool    active;
    }

    address[] public erc20Keys;
    mapping(address => ERC20Asset) public erc20Assets;

    // ─── ERC-721 Collection ──────────────────────────────────────────────────

    struct ERC721Asset {
        address tokenAddress;
        uint256 tokenId;
        string  symbol;
        uint256 valuationUSD; // in cents — set by manager / certifier (not AI)
        bool    certified;
        uint8   certScore;
        uint8   riskScore;
        bool    active;
    }

    bytes32[] public erc721Keys;
    mapping(bytes32 => ERC721Asset) public erc721Assets;

    // ─── NAV ─────────────────────────────────────────────────────────────────

    uint256 public lastNAV;
    uint256 public lastUpdated;

    // ─── Trade History ───────────────────────────────────────────────────────

    enum TradeAction { REBALANCE, CERTIFY, ISSUE, DELIST, SWAP }

    struct TradeRecord {
        uint256     timestamp;
        TradeAction action;
        string      description;
        uint256     navBefore;
        uint256     navAfter;
        uint8       quorumVotes;
        bool        humanApproved;
    }

    TradeRecord[] private _tradeHistory;

    // ─── Events ──────────────────────────────────────────────────────────────

    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event PortfolioUpdated(uint256 navUSD, uint256 timestamp);
    event AssetAdded(address indexed tokenAddress, string symbol, uint256 balance, uint256 valueUSD);
    event AssetSwapped(address indexed tokenIn, uint256 amountIn, address indexed tokenOut, uint256 amountOut);
    event ERC721Updated(address indexed tokenAddress, uint256 indexed tokenId, uint256 valuationUSD, bool certified);
    event NFTAdded(address indexed tokenAddress, uint256 indexed tokenId, string symbol);
    event TradeRecorded(uint256 indexed index, TradeAction action, uint256 navAfter, bool humanApproved);

    constructor(address _owner, address _oracle) Ownable(_owner) {
        require(_oracle != address(0), "zero oracle");
        oracle = _oracle;
    }

    // ─── Oracle admin ─────────────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "zero oracle");
        emit OracleUpdated(oracle, _oracle);
        oracle = _oracle;
    }

    // ─── ERC-20 Write ────────────────────────────────────────────────────────

    /// @notice Register a new ERC-20 asset already held by this contract.
    ///         Tokens MUST be transferred to VaultLedger BEFORE calling this.
    ///         balance  = IERC20.balanceOf(address(this))  — not from caller
    ///         valueUSD = oracle.getPrice(token) × balance — not from caller
    function addERC20Asset(
        address tokenAddress,
        string  calldata symbol,
        uint8   riskScore,
        uint256 yieldBps
    ) external onlyOwner {
        require(!erc20Assets[tokenAddress].active, "already registered");
        require(tokenAddress != address(0), "zero token");

        uint8   dec     = IERC20(tokenAddress).decimals();
        uint256 balance = IERC20(tokenAddress).balanceOf(address(this));
        uint256 value   = _tokenValue(tokenAddress, balance, dec);

        erc20Keys.push(tokenAddress);
        erc20Assets[tokenAddress] = ERC20Asset({
            tokenAddress:  tokenAddress,
            symbol:        symbol,
            decimals:      dec,
            balance:       balance,
            valueUSD:      value,
            allocationPct: 0,
            riskScore:     riskScore,
            yieldBps:      yieldBps,
            active:        true
        });

        _recomputeAllocations();
        emit AssetAdded(tokenAddress, symbol, balance, value);
    }

    /// @notice Refresh portfolio snapshot from live balances + oracle prices.
    ///         Agent may update riskScores and yieldBps (metadata only, not value).
    function updatePortfolio(
        address[] calldata tokenAddresses,
        uint8[]   calldata riskScores,
        uint256[] calldata yieldBps
    ) external onlyOwner {
        require(
            tokenAddresses.length == riskScores.length &&
            riskScores.length     == yieldBps.length,
            "length mismatch"
        );
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            ERC20Asset storage asset = erc20Assets[tokenAddresses[i]];
            require(asset.active, "unknown asset");
            asset.balance   = IERC20(tokenAddresses[i]).balanceOf(address(this));
            asset.valueUSD  = _tokenValue(tokenAddresses[i], asset.balance, asset.decimals);
            asset.riskScore = riskScores[i];
            asset.yieldBps  = yieldBps[i];
        }
        _recomputeAllocations();
        lastNAV     = getNAV();
        lastUpdated = block.timestamp;
        emit PortfolioUpdated(lastNAV, lastUpdated);
    }

    /// @notice Execute a swap via a DEX adapter.
    ///         Approves `dex` for `amountIn` of `tokenIn`, then calls dex.swap().
    ///         After the swap the DEX sends `amountOut` of `tokenOut` back here.
    ///         No AI-trusted amounts — governance is enforced by VaultPolicy before
    ///         this is called (the policy checks amountIn × oracle price).
    function swap(
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOut,
        address dex
    ) external onlyOwner {
        require(erc20Assets[tokenIn].active,  "tokenIn not registered");
        require(erc20Assets[tokenOut].active, "tokenOut not registered");
        require(dex != address(0), "zero dex");

        IERC20(tokenIn).approve(dex, amountIn);
        IDex(dex).swap(tokenIn, amountIn, tokenOut, amountOut);

        // Refresh both sides from live balances after the swap
        _refreshAsset(tokenIn);
        _refreshAsset(tokenOut);

        _recomputeAllocations();
        lastNAV     = getNAV();
        lastUpdated = block.timestamp;

        emit AssetSwapped(tokenIn, amountIn, tokenOut, amountOut);
        emit PortfolioUpdated(lastNAV, lastUpdated);
    }

    // ─── ERC-721 Write ───────────────────────────────────────────────────────

    function addERC721Asset(
        address tokenAddress,
        uint256 tokenId,
        string  calldata symbol,
        uint256 valuationUSD,
        uint8   riskScore
    ) external onlyOwner {
        bytes32 key = _nftKey(tokenAddress, tokenId);
        require(!erc721Assets[key].active, "already registered");
        erc721Keys.push(key);
        erc721Assets[key] = ERC721Asset({
            tokenAddress: tokenAddress,
            tokenId:      tokenId,
            symbol:       symbol,
            valuationUSD: valuationUSD,
            certified:    false,
            certScore:    0,
            riskScore:    riskScore,
            active:       true
        });
        emit NFTAdded(tokenAddress, tokenId, symbol);
    }

    function updateERC721(
        address tokenAddress,
        uint256 tokenId,
        uint256 valuationUSD,
        bool    certified,
        uint8   certScore,
        uint8   riskScore
    ) external onlyOwner {
        bytes32 key = _nftKey(tokenAddress, tokenId);
        ERC721Asset storage nft = erc721Assets[key];
        require(nft.active, "unknown nft");
        nft.valuationUSD = valuationUSD;
        nft.certified    = certified;
        nft.certScore    = certScore;
        nft.riskScore    = riskScore;
        emit ERC721Updated(tokenAddress, tokenId, valuationUSD, certified);
    }

    // ─── Read ────────────────────────────────────────────────────────────────

    /// @notice Cached NAV from last portfolio update (ERC-20 only).
    function getNAV() public view returns (uint256 nav) {
        for (uint256 i = 0; i < erc20Keys.length; i++) {
            ERC20Asset storage a = erc20Assets[erc20Keys[i]];
            if (a.active) nav += a.valueUSD;
        }
    }

    /// @notice Live value of a specific token held by this contract.
    ///         Works for both registered and unregistered tokens.
    ///         Decimals fall back to 18 if token not yet registered.
    function getAssetValue(address tokenAddress) external view returns (uint256) {
        uint256 balance = IERC20(tokenAddress).balanceOf(address(this));
        uint8   dec     = erc20Assets[tokenAddress].active
            ? erc20Assets[tokenAddress].decimals
            : IERC20(tokenAddress).decimals();
        return _tokenValue(tokenAddress, balance, dec);
    }

    /// @notice Live value of an arbitrary raw amount of a token (for VaultPolicy checks).
    function getTokenValue(address tokenAddress, uint256 rawAmount) external view returns (uint256) {
        uint8 dec = erc20Assets[tokenAddress].active
            ? erc20Assets[tokenAddress].decimals
            : IERC20(tokenAddress).decimals();
        return _tokenValue(tokenAddress, rawAmount, dec);
    }

    function getVaultSnapshot()
        external view
        returns (ERC20Asset[] memory fungible, ERC721Asset[] memory nonFungible)
    {
        fungible = new ERC20Asset[](erc20Keys.length);
        for (uint256 i = 0; i < erc20Keys.length; i++) {
            fungible[i] = erc20Assets[erc20Keys[i]];
        }
        nonFungible = new ERC721Asset[](erc721Keys.length);
        for (uint256 i = 0; i < erc721Keys.length; i++) {
            nonFungible[i] = erc721Assets[erc721Keys[i]];
        }
    }

    function getERC20Count() external view returns (uint256) { return erc20Keys.length; }
    function getERC721Count() external view returns (uint256) { return erc721Keys.length; }

    // ─── Trade History ───────────────────────────────────────────────────────

    function recordTrade(
        TradeAction action,
        string calldata description,
        uint256 navBefore,
        uint8   quorumVotes,
        bool    humanApproved
    ) external onlyOwner {
        uint256 navAfter = getNAV();
        _tradeHistory.push(TradeRecord({
            timestamp:     block.timestamp,
            action:        action,
            description:   description,
            navBefore:     navBefore,
            navAfter:      navAfter,
            quorumVotes:   quorumVotes,
            humanApproved: humanApproved
        }));
        emit TradeRecorded(_tradeHistory.length - 1, action, navAfter, humanApproved);
    }

    function getTradeHistory() external view onlyOwner returns (TradeRecord[] memory) {
        return _tradeHistory;
    }

    function getTradeCount() external view returns (uint256) { return _tradeHistory.length; }

    // ─── Internal ────────────────────────────────────────────────────────────

    /// @dev cents = rawAmount * oraclePrice / 10^decimals
    function _tokenValue(address token, uint256 rawAmount, uint8 dec) internal view returns (uint256) {
        if (rawAmount == 0 || oracle == address(0)) return 0;
        uint256 price = IPriceOracle(oracle).getPrice(token); // cents per whole token
        if (price == 0) return 0;
        return (rawAmount * price) / (10 ** uint256(dec));
    }

    function _refreshAsset(address tokenAddress) internal {
        ERC20Asset storage asset = erc20Assets[tokenAddress];
        asset.balance  = IERC20(tokenAddress).balanceOf(address(this));
        asset.valueUSD = _tokenValue(tokenAddress, asset.balance, asset.decimals);
    }

    function _recomputeAllocations() internal {
        uint256 nav = getNAV();
        if (nav == 0) return;
        for (uint256 i = 0; i < erc20Keys.length; i++) {
            ERC20Asset storage a = erc20Assets[erc20Keys[i]];
            if (a.active) {
                a.allocationPct = uint8((a.valueUSD * 100) / nav);
            }
        }
    }

    function _nftKey(address tokenAddress, uint256 tokenId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(tokenAddress, tokenId));
    }
}
