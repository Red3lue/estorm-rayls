// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title VaultLedger
/// @notice On-chain state store for the Sovereign Vault. Tracks ERC-20 portfolio
///         allocations and ERC-721 art inventory. Single source of truth for the AI agent.
///         Deployed on Privacy Node — contents never visible on Public Chain.
contract VaultLedger is Ownable {
    // ─── ERC-20 Portfolio ────────────────────────────────────────────────────

    struct ERC20Asset {
        address tokenAddress;
        string symbol;
        uint256 balance; // raw token units (18 decimals)
        uint256 valueUSD; // in cents ($1 = 100)
        uint8 allocationPct; // 0-100
        uint8 riskScore; // 0-100
        uint256 yieldBps; // basis points (100 = 1%)
        bool active;
    }

    address[] public erc20Keys;
    mapping(address => ERC20Asset) public erc20Assets;

    // ─── ERC-721 Collection ──────────────────────────────────────────────────

    struct ERC721Asset {
        address tokenAddress;
        uint256 tokenId;
        string symbol;
        uint256 valuationUSD; // in cents
        bool certified;
        uint8 certScore; // 0-100
        uint8 riskScore; // 0-100
        bool active;
    }

    // key: keccak256(tokenAddress, tokenId)
    bytes32[] public erc721Keys;
    mapping(bytes32 => ERC721Asset) public erc721Assets;

    // ─── NAV ─────────────────────────────────────────────────────────────────

    uint256 public lastNAV;     // total fungible portfolio in cents
    uint256 public lastUpdated; // block.timestamp of last update

    // ─── Trade History ───────────────────────────────────────────────────────

    enum TradeAction { REBALANCE, CERTIFY, ISSUE, DELIST }

    struct TradeRecord {
        uint256     timestamp;
        TradeAction action;
        string      description; // human-readable summary (no private amounts)
        uint256     navBefore;   // in cents
        uint256     navAfter;    // in cents
        uint8       quorumVotes; // how many agents agreed (0-4)
        bool        humanApproved;
    }

    TradeRecord[] private _tradeHistory;

    // ─── Events ──────────────────────────────────────────────────────────────

    event PortfolioUpdated(uint256 navUSD, uint256 timestamp);
    event ERC721Updated(address indexed tokenAddress, uint256 indexed tokenId, uint256 valuationUSD, bool certified);
    event AssetAdded(address indexed tokenAddress, string symbol);
    event NFTAdded(address indexed tokenAddress, uint256 indexed tokenId, string symbol);
    event TradeRecorded(uint256 indexed index, TradeAction action, uint256 navAfter, bool humanApproved);

    constructor(address _owner) Ownable(_owner) {}

    // ─── ERC-20 Write ────────────────────────────────────────────────────────

    /// @notice Register a new ERC-20 asset in the vault
    function addERC20Asset(
        address tokenAddress,
        string calldata symbol,
        uint256 balance,
        uint256 valueUSD,
        uint8 riskScore,
        uint256 yieldBps
    ) external onlyOwner {
        require(!erc20Assets[tokenAddress].active, "already registered");
        erc20Keys.push(tokenAddress);
        erc20Assets[tokenAddress] = ERC20Asset({
            tokenAddress: tokenAddress,
            symbol: symbol,
            balance: balance,
            valueUSD: valueUSD,
            allocationPct: 0,
            riskScore: riskScore,
            yieldBps: yieldBps,
            active: true
        });
        emit AssetAdded(tokenAddress, symbol);
        _recomputeAllocations();
    }

    /// @notice Update portfolio state after AI rebalance. Called by agent after execution.
    function updatePortfolio(
        address[] calldata tokenAddresses,
        uint256[] calldata balances,
        uint256[] calldata valuesUSD,
        uint8[] calldata riskScores,
        uint256[] calldata yieldBps
    ) external onlyOwner {
        require(tokenAddresses.length == balances.length, "length mismatch");
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            ERC20Asset storage asset = erc20Assets[tokenAddresses[i]];
            require(asset.active, "unknown asset");
            asset.balance = balances[i];
            asset.valueUSD = valuesUSD[i];
            asset.riskScore = riskScores[i];
            asset.yieldBps = yieldBps[i];
        }
        _recomputeAllocations();
        lastNAV = getNAV();
        lastUpdated = block.timestamp;
        emit PortfolioUpdated(lastNAV, lastUpdated);
    }

    // ─── ERC-721 Write ───────────────────────────────────────────────────────

    /// @notice Register a new ERC-721 art asset
    function addERC721Asset(
        address tokenAddress,
        uint256 tokenId,
        string calldata symbol,
        uint256 valuationUSD,
        uint8 riskScore
    ) external onlyOwner {
        bytes32 key = _nftKey(tokenAddress, tokenId);
        require(!erc721Assets[key].active, "already registered");
        erc721Keys.push(key);
        erc721Assets[key] = ERC721Asset({
            tokenAddress: tokenAddress,
            tokenId: tokenId,
            symbol: symbol,
            valuationUSD: valuationUSD,
            certified: false,
            certScore: 0,
            riskScore: riskScore,
            active: true
        });
        emit NFTAdded(tokenAddress, tokenId, symbol);
    }

    /// @notice Update NFT valuation and certification after AI agent certifies it
    function updateERC721(
        address tokenAddress,
        uint256 tokenId,
        uint256 valuationUSD,
        bool certified,
        uint8 certScore,
        uint8 riskScore
    ) external onlyOwner {
        bytes32 key = _nftKey(tokenAddress, tokenId);
        ERC721Asset storage nft = erc721Assets[key];
        require(nft.active, "unknown nft");
        nft.valuationUSD = valuationUSD;
        nft.certified = certified;
        nft.certScore = certScore;
        nft.riskScore = riskScore;
        emit ERC721Updated(tokenAddress, tokenId, valuationUSD, certified);
    }

    // ─── Read ────────────────────────────────────────────────────────────────

    /// @notice Total fungible portfolio value in cents
    function getNAV() public view returns (uint256 nav) {
        for (uint256 i = 0; i < erc20Keys.length; i++) {
            ERC20Asset storage a = erc20Assets[erc20Keys[i]];
            if (a.active) nav += a.valueUSD;
        }
    }

    /// @notice Full snapshot: all ERC-20 assets + all ERC-721 assets
    function getVaultSnapshot()
        external
        view
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

    /// @notice Called by agent after any vault action to record it privately on-chain.
    function recordTrade(
        TradeAction    action,
        string calldata description,
        uint256        navBefore,
        uint8          quorumVotes,
        bool           humanApproved
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

    /// @notice Returns full trade history. Only owner (agent) can read private trade log.
    function getTradeHistory() external view onlyOwner returns (TradeRecord[] memory) {
        return _tradeHistory;
    }

    function getTradeCount() external view returns (uint256) { return _tradeHistory.length; }

    // ─── Internal ────────────────────────────────────────────────────────────

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
