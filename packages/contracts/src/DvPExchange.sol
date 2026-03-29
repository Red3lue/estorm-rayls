// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Minimal ERC-20 interface for DvP token transfers.
interface IERC20DvP {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

/// @title DvPExchange
/// @notice Delivery-versus-Payment exchange on the Privacy Node.
///         Implements the Rayls DvP pattern: `createExchange` → `executeExchange`.
///
///         FLOW:
///           1. Creator calls `createExchange()` — deposits creatorAsset into escrow
///           2. Counterparty calls `executeExchange()` — deposits counterpartyAsset,
///              both sides settle atomically
///
///         ATOMICITY:
///           executeExchange() either fully settles both legs or reverts entirely.
///           No partial fills, no reentrancy risk (checks-effects-interactions).
///
///         This contract supports ERC-20 assets only (AssetType.ERC20).
///         ERC-1155 support matches the Rayls spec but is not implemented here.
contract DvPExchange {

    // ─── Types (matching Rayls SDK spec) ─────────────────────────────────────

    enum ExchangeStatus { NOT_EXISTS, INITIALIZED, EXECUTED, EXPIRED }
    enum AssetType       { ERC20, ERC1155 }

    struct Asset {
        AssetType assetType;
        address   tokenAddress;
        uint256   amount;
        uint256   tokenId; // ignored for ERC-20
    }

    struct Exchange {
        address        creator;
        Asset          creatorAsset;
        address        creatorBeneficiary;
        address        counterparty;
        Asset          counterpartyAsset;
        uint256        expirationDate;
        ExchangeStatus status;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    mapping(uint256 => Exchange) public exchanges;
    uint256 public nextExchangeId;

    // ─── Events ───────────────────────────────────────────────────────────────

    event ExchangeCreated(
        uint256 indexed exchangeId,
        address indexed creator,
        address         tokenIn,
        uint256         amountIn,
        address         tokenOut,
        uint256         amountOut,
        address         counterparty,
        uint256         expirationDate
    );

    event ExchangeExecuted(
        uint256 indexed exchangeId,
        address indexed executor
    );

    event ExchangeCancelled(uint256 indexed exchangeId);

    // ─── Create ───────────────────────────────────────────────────────────────

    /// @notice Create a new exchange. Pulls `creatorAsset` from msg.sender into escrow.
    ///         msg.sender must have approved this contract for `creatorAsset.amount`.
    ///
    /// @param creator           Address that is selling (usually VaultLedger via VaultPolicy)
    /// @param creatorAsset      What the creator is offering (ERC-20 token + amount)
    /// @param beneficiary       Address that receives the counterpartyAsset on settlement
    /// @param counterparty      Address allowed to execute (address(0) = anyone)
    /// @param counterpartyAsset What the creator wants in return
    /// @param expiration        Unix timestamp after which the exchange can be cancelled
    /// @return exchangeId       ID of the newly created exchange
    function createExchange(
        address  creator,
        Asset    calldata creatorAsset,
        address  beneficiary,
        address  counterparty,
        Asset    calldata counterpartyAsset,
        uint256  expiration
    ) external returns (uint256 exchangeId) {
        require(creatorAsset.assetType == AssetType.ERC20, "only ERC-20 supported");
        require(counterpartyAsset.assetType == AssetType.ERC20, "only ERC-20 supported");
        require(creatorAsset.tokenAddress != address(0), "zero creator token");
        require(counterpartyAsset.tokenAddress != address(0), "zero counterparty token");
        require(creatorAsset.amount > 0, "zero creator amount");
        require(counterpartyAsset.amount > 0, "zero counterparty amount");
        require(beneficiary != address(0), "zero beneficiary");
        require(expiration > block.timestamp, "already expired");

        // Pull creator's tokens into escrow
        require(
            IERC20DvP(creatorAsset.tokenAddress).transferFrom(
                msg.sender, address(this), creatorAsset.amount
            ),
            "creator deposit failed"
        );

        exchangeId = nextExchangeId++;
        exchanges[exchangeId] = Exchange({
            creator:            creator,
            creatorAsset:       creatorAsset,
            creatorBeneficiary: beneficiary,
            counterparty:       counterparty,
            counterpartyAsset:  counterpartyAsset,
            expirationDate:     expiration,
            status:             ExchangeStatus.INITIALIZED
        });

        emit ExchangeCreated(
            exchangeId,
            creator,
            creatorAsset.tokenAddress,
            creatorAsset.amount,
            counterpartyAsset.tokenAddress,
            counterpartyAsset.amount,
            counterparty,
            expiration
        );
    }

    // ─── Execute ──────────────────────────────────────────────────────────────

    /// @notice Execute (settle) an initialized exchange. Atomic — either both legs
    ///         complete or the entire transaction reverts.
    ///
    ///         msg.sender must be the counterparty (or anyone, if counterparty == address(0)).
    ///         msg.sender must have approved `counterpartyAsset.amount` to this contract.
    function executeExchange(uint256 exchangeId) external {
        Exchange storage ex = exchanges[exchangeId];
        require(ex.status == ExchangeStatus.INITIALIZED, "not initialized");
        require(block.timestamp <= ex.expirationDate, "exchange expired");
        require(
            ex.counterparty == address(0) || ex.counterparty == msg.sender,
            "not authorized counterparty"
        );

        // Mark executed BEFORE transfers (checks-effects-interactions)
        ex.status = ExchangeStatus.EXECUTED;

        // Leg 1: pull counterparty's tokens → send to creator's beneficiary
        require(
            IERC20DvP(ex.counterpartyAsset.tokenAddress).transferFrom(
                msg.sender, ex.creatorBeneficiary, ex.counterpartyAsset.amount
            ),
            "counterparty deposit failed"
        );

        // Leg 2: release creator's tokens from escrow → send to counterparty
        require(
            IERC20DvP(ex.creatorAsset.tokenAddress).transfer(
                msg.sender, ex.creatorAsset.amount
            ),
            "escrow release failed"
        );

        emit ExchangeExecuted(exchangeId, msg.sender);
    }

    // ─── Cancel ───────────────────────────────────────────────────────────────

    /// @notice Cancel an expired exchange. Returns escrowed tokens to creator.
    ///         Only callable after the expiration date has passed.
    function cancelExchange(uint256 exchangeId) external {
        Exchange storage ex = exchanges[exchangeId];
        require(ex.status == ExchangeStatus.INITIALIZED, "not initialized");
        require(block.timestamp > ex.expirationDate, "not expired yet");

        ex.status = ExchangeStatus.EXPIRED;

        // Return escrowed creator tokens
        require(
            IERC20DvP(ex.creatorAsset.tokenAddress).transfer(
                ex.creator, ex.creatorAsset.amount
            ),
            "refund failed"
        );

        emit ExchangeCancelled(exchangeId);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    function getExchange(uint256 exchangeId) external view returns (Exchange memory) {
        return exchanges[exchangeId];
    }
}
