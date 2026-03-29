// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Minimal VaultLedger interface for value extraction
interface IVaultLedger {
    function getNAV() external view returns (uint256);
    /// @notice Live value of `rawAmount` of `token` based on oracle + decimals.
    function getTokenValue(address token, uint256 rawAmount) external view returns (uint256);
    /// @notice Live value of the entire balance of `token` held by the vault.
    function getAssetValue(address token) external view returns (uint256);
    function erc721Assets(bytes32 key) external view returns (
        address tokenAddress, uint256 tokenId, string memory symbol,
        uint256 valuationUSD, bool certified, uint8 certScore, uint8 riskScore, bool active
    );
}

/// @title VaultPolicy
/// @notice On-chain governance gateway and execution engine for the Sovereign Vault Protocol.
///
///         The AI agent submits an encoded vault operation (target + calldata). VaultPolicy
///         derives the true transaction value from the calldata + VaultLedger on-chain state
///         — the agent CANNOT misreport the value. Three governance gates are checked:
///
///           1. Category permission  — asset category must be AI-managed
///           2. Value threshold      — derived value <= valueThreshold
///           3. Rate limit           — auto-executed txs this window < maxTxPerWindow
///
///         If all pass  → call is executed immediately  (AUTO_EXECUTED)
///         If any fails → call is queued for manager    (PENDING → APPROVED → executed)
///
///         VaultPolicy must own the vault contracts it manages (VaultLedger, ArtNFT, etc.)
///         so that forwarded calls pass onlyOwner checks.
contract VaultPolicy {

    // ─── Roles ───────────────────────────────────────────────────────────────

    address public manager;
    address public agent;
    address public vaultLedger; // source of truth for value checks

    modifier onlyManager() { require(msg.sender == manager, "not manager"); _; }
    modifier onlyAgent()   { require(msg.sender == agent,   "not agent");   _; }
    modifier notPaused()   { require(!settings.paused, "emergency stop active"); _; }

    // ─── Asset Categories ────────────────────────────────────────────────────

    enum AssetCategory { BOND, RECEIVABLE, STABLECOIN, ART, NAV_UPDATE, ISSUANCE }

    // ─── Governance Settings ─────────────────────────────────────────────────

    struct GovernanceSettings {
        uint256 valueThreshold;  // cents — derived value above this requires human approval
        uint256 maxTxPerWindow;  // max auto-executed txs per rate-limit window
        uint256 windowDuration;  // window duration in seconds
        bool    paused;
    }

    GovernanceSettings public settings;

    /// @dev category => true = AI-managed, false = human-only
    mapping(AssetCategory => bool) public categoryPermissions;

    // ─── Rate Limit State ────────────────────────────────────────────────────

    uint256 private _windowStart;
    uint256 private _txCountInWindow;

    // ─── Function Selectors (for on-chain value extraction) ──────────────────

    // VaultLedger.updatePortfolio(address[],uint8[],uint256[])
    bytes4 internal constant SEL_UPDATE_PORTFOLIO =
        bytes4(keccak256("updatePortfolio(address[],uint8[],uint256[])"));
    // VaultLedger.addERC20Asset(address,string,uint8,uint256)
    bytes4 internal constant SEL_ADD_ERC20 =
        bytes4(keccak256("addERC20Asset(address,string,uint8,uint256)"));
    // VaultLedger.swap(address,uint256,address,uint256,address)
    bytes4 internal constant SEL_SWAP =
        bytes4(keccak256("swap(address,uint256,address,uint256,address)"));
    // VaultLedger.createDvPExchange(address,uint256,address,address,uint256,address,uint256)
    bytes4 internal constant SEL_CREATE_DVP =
        bytes4(keccak256("createDvPExchange(address,uint256,address,address,uint256,address,uint256)"));
    // VaultLedger.updateERC721(address,uint256,uint256,bool,uint8,uint8)
    bytes4 internal constant SEL_UPDATE_ERC721 =
        bytes4(keccak256("updateERC721(address,uint256,uint256,bool,uint8,uint8)"));
    // ArtNFT.certify(uint256,uint8,string)
    bytes4 internal constant SEL_CERTIFY =
        bytes4(keccak256("certify(uint256,uint8,string)"));

    // ─── Selector Allowlist ──────────────────────────────────────────────────

    /// @dev Only whitelisted selectors can be proposed or executed.
    ///      The agent cannot call arbitrary functions — even on contracts owned by this policy.
    mapping(bytes4 => bool) public allowedSelectors;

    event SelectorAllowed(bytes4 indexed selector, bool allowed);

    // ─── Proposal Lifecycle ──────────────────────────────────────────────────

    enum ProposalStatus { PENDING, AUTO_EXECUTED, APPROVED, DISMISSED, WITHDRAWN }

    struct Proposal {
        uint256        id;
        address        target;
        bytes          callData;
        AssetCategory  category;
        uint256        valueUSD;     // derived on-chain from callData + VaultLedger
        string         reasoning;
        uint8          quorumVotes;
        ProposalStatus status;
        uint256        createdAt;
        uint256        resolvedAt;
        address        resolvedBy;
    }

    /// @dev index 0 is a placeholder — IDs start at 1
    Proposal[] private _proposals;

    uint256 public pendingProposalId;
    uint256 public totalProposals;

    // ─── Events ──────────────────────────────────────────────────────────────

    event ProposalAutoExecuted(uint256 indexed id, AssetCategory category, uint8 quorumVotes, uint256 derivedValueUSD, address target);
    event ProposalPending(uint256 indexed id, AssetCategory category, uint8 quorumVotes, uint256 derivedValueUSD, string reasoning);
    event ProposalApproved(uint256 indexed id, address indexed by);
    event ProposalDismissed(uint256 indexed id, address indexed by);
    event ProposalWithdrawn(uint256 indexed id);
    event ExecutionFailed(uint256 indexed id, bytes reason);
    event SettingsUpdated(uint256 valueThreshold, uint256 maxTxPerWindow, uint256 windowDuration);
    event CategoryPermissionSet(AssetCategory category, bool aiManaged);
    event EmergencyStop(address indexed by);
    event Resumed(address indexed by);
    event ManagerTransferred(address indexed oldManager, address indexed newManager);
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);
    event VaultLedgerUpdated(address indexed oldLedger, address indexed newLedger);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        address _manager,
        address _agent,
        address _vaultLedger,
        uint256 _valueThreshold,
        uint256 _maxTxPerWindow,
        uint256 _windowDuration
    ) {
        require(_manager     != address(0), "zero manager");
        require(_agent       != address(0), "zero agent");
        require(_vaultLedger != address(0), "zero vaultLedger");

        manager     = _manager;
        agent       = _agent;
        vaultLedger = _vaultLedger;

        settings = GovernanceSettings({
            valueThreshold: _valueThreshold,
            maxTxPerWindow: _maxTxPerWindow,
            windowDuration: _windowDuration,
            paused:         false
        });

        categoryPermissions[AssetCategory.BOND]       = true;
        categoryPermissions[AssetCategory.RECEIVABLE] = true;
        categoryPermissions[AssetCategory.STABLECOIN] = true;
        categoryPermissions[AssetCategory.NAV_UPDATE] = true;
        categoryPermissions[AssetCategory.ISSUANCE]   = true;
        categoryPermissions[AssetCategory.ART]        = false; // human-only by default

        // Whitelist the exact vault operations the agent is allowed to propose.
        // Any other selector is rejected at propose() time.
        allowedSelectors[SEL_ADD_ERC20]       = true;
        allowedSelectors[SEL_UPDATE_PORTFOLIO] = true;
        allowedSelectors[SEL_SWAP]             = true;
        allowedSelectors[SEL_CREATE_DVP]       = true;
        allowedSelectors[SEL_UPDATE_ERC721]    = true;
        allowedSelectors[SEL_CERTIFY]          = true;
        // VaultLedger.addERC721Asset(address,uint256,string,uint256,uint8)
        allowedSelectors[bytes4(keccak256("addERC721Asset(address,uint256,string,uint256,uint8)"))] = true;
        // VaultLedger.recordTrade(uint8,string,uint256,uint8,bool)
        allowedSelectors[bytes4(keccak256("recordTrade(uint8,string,uint256,uint8,bool)"))]         = true;

        _proposals.push(Proposal({
            id: 0, target: address(0), callData: "", category: AssetCategory.BOND,
            valueUSD: 0, reasoning: "", quorumVotes: 0,
            status: ProposalStatus.DISMISSED, createdAt: 0, resolvedAt: 0, resolvedBy: address(0)
        }));

        _windowStart = block.timestamp;
    }

    // ─── Propose ─────────────────────────────────────────────────────────────

    /// @notice Agent submits a vault operation. Value is derived from calldata on-chain —
    ///         the agent cannot misreport it. Governance gates decide auto-exec vs queue.
    ///
    /// @param target      Contract to call (VaultLedger, ArtNFT, etc.)
    /// @param callData    ABI-encoded function call
    /// @param category    Asset category (for permission gate)
    /// @param reasoning   AI reasoning string (stored privately on Privacy Node)
    /// @param quorumVotes Number of agents that agreed (0-4)
    /// @return id         Proposal ID
    function propose(
        address         target,
        bytes calldata  callData,
        AssetCategory   category,
        string calldata reasoning,
        uint8           quorumVotes
    ) external onlyAgent notPaused returns (uint256 id) {
        require(target != address(0), "zero target");
        require(callData.length >= 4, "calldata too short");
        require(allowedSelectors[bytes4(callData[:4])], "selector not allowed");

        // Derive the true value from calldata — not from agent input
        uint256 derivedValue = _extractValue(callData, target);

        bool autoExec = _canAutoExecute(category, derivedValue);

        id = _proposals.length;
        totalProposals++;

        _proposals.push(Proposal({
            id:          id,
            target:      target,
            callData:    callData,
            category:    category,
            valueUSD:    derivedValue,
            reasoning:   reasoning,
            quorumVotes: quorumVotes,
            status:      autoExec ? ProposalStatus.AUTO_EXECUTED : ProposalStatus.PENDING,
            createdAt:   block.timestamp,
            resolvedAt:  autoExec ? block.timestamp : 0,
            resolvedBy:  address(0)
        }));

        if (autoExec) {
            _txCountInWindow++;
            _execute(id, target, callData);
            emit ProposalAutoExecuted(id, category, quorumVotes, derivedValue, target);
        } else {
            require(pendingProposalId == 0, "pending proposal exists: resolve it first");
            pendingProposalId = id;
            emit ProposalPending(id, category, quorumVotes, derivedValue, reasoning);
        }
    }

    // ─── Manager ─────────────────────────────────────────────────────────────

    /// @notice Approve pending proposal — executes the stored call.
    function approve(uint256 proposalId) external onlyManager notPaused {
        _assertPending(proposalId);
        Proposal storage p = _proposals[proposalId];
        p.status     = ProposalStatus.APPROVED;
        p.resolvedAt = block.timestamp;
        p.resolvedBy = msg.sender;
        pendingProposalId = 0;
        _execute(proposalId, p.target, p.callData);
        emit ProposalApproved(proposalId, msg.sender);
    }

    /// @notice Dismiss pending proposal — discards without executing.
    function dismiss(uint256 proposalId) external onlyManager {
        _assertPending(proposalId);
        Proposal storage p = _proposals[proposalId];
        p.status     = ProposalStatus.DISMISSED;
        p.resolvedAt = block.timestamp;
        p.resolvedBy = msg.sender;
        pendingProposalId = 0;
        emit ProposalDismissed(proposalId, msg.sender);
    }

    // ─── Agent ───────────────────────────────────────────────────────────────

    /// @notice Withdraw a pending proposal that is no longer valid (vault state changed).
    function withdraw(uint256 proposalId) external onlyAgent {
        _assertPending(proposalId);
        Proposal storage p = _proposals[proposalId];
        p.status     = ProposalStatus.WITHDRAWN;
        p.resolvedAt = block.timestamp;
        pendingProposalId = 0;
        emit ProposalWithdrawn(proposalId);
    }

    // ─── Settings ────────────────────────────────────────────────────────────

    function setValueThreshold(uint256 _threshold) external onlyManager {
        settings.valueThreshold = _threshold;
        emit SettingsUpdated(_threshold, settings.maxTxPerWindow, settings.windowDuration);
    }

    function setRateLimit(uint256 _maxTxPerWindow, uint256 _windowDuration) external onlyManager {
        require(_windowDuration > 0, "zero window");
        settings.maxTxPerWindow = _maxTxPerWindow;
        settings.windowDuration = _windowDuration;
        emit SettingsUpdated(settings.valueThreshold, _maxTxPerWindow, _windowDuration);
    }

    /// @notice Add or remove a function selector from the execution allowlist.
    ///         Only whitelisted selectors can be proposed or executed by the agent.
    function setAllowedSelector(bytes4 selector, bool allowed) external onlyManager {
        allowedSelectors[selector] = allowed;
        emit SelectorAllowed(selector, allowed);
    }

    function setCategoryPermission(AssetCategory category, bool aiManaged) external onlyManager {
        categoryPermissions[category] = aiManaged;
        emit CategoryPermissionSet(category, aiManaged);
    }

    function emergencyStop() external onlyManager {
        settings.paused = true;
        emit EmergencyStop(msg.sender);
    }

    function resume() external onlyManager {
        settings.paused = false;
        emit Resumed(msg.sender);
    }

    function transferManager(address newManager) external onlyManager {
        require(newManager != address(0), "zero address");
        emit ManagerTransferred(manager, newManager);
        manager = newManager;
    }

    function setAgent(address newAgent) external onlyManager {
        require(newAgent != address(0), "zero address");
        emit AgentUpdated(agent, newAgent);
        agent = newAgent;
    }

    function setVaultLedger(address newLedger) external onlyManager {
        require(newLedger != address(0), "zero address");
        emit VaultLedgerUpdated(vaultLedger, newLedger);
        vaultLedger = newLedger;
    }

    // ─── Read ────────────────────────────────────────────────────────────────

    function getSettings() external view returns (GovernanceSettings memory, bool[6] memory perms) {
        perms[0] = categoryPermissions[AssetCategory.BOND];
        perms[1] = categoryPermissions[AssetCategory.RECEIVABLE];
        perms[2] = categoryPermissions[AssetCategory.STABLECOIN];
        perms[3] = categoryPermissions[AssetCategory.ART];
        perms[4] = categoryPermissions[AssetCategory.NAV_UPDATE];
        perms[5] = categoryPermissions[AssetCategory.ISSUANCE];
        return (settings, perms);
    }

    function getPendingProposal() external view returns (Proposal memory) {
        require(pendingProposalId != 0, "no pending proposal");
        return _proposals[pendingProposalId];
    }

    function getProposalHistory() external view returns (Proposal[] memory history) {
        uint256 count = _proposals.length > 1 ? _proposals.length - 1 : 0;
        history = new Proposal[](count);
        for (uint256 i = 0; i < count; i++) {
            history[i] = _proposals[i + 1];
        }
    }

    function getRateLimitStatus() external view returns (uint256 used, uint256 max, uint256 windowEndsAt) {
        bool expired = block.timestamp >= _windowStart + settings.windowDuration;
        used         = expired ? 0 : _txCountInWindow;
        max          = settings.maxTxPerWindow;
        windowEndsAt = _windowStart + settings.windowDuration;
    }

    /// @notice Public helper — lets callers preview the derived value for a given calldata.
    function extractValue(bytes calldata callData, address target) external view returns (uint256) {
        return _extractValue(callData, target);
    }

    // ─── Internal: Value Extraction ──────────────────────────────────────────

    /// @notice Derive the true operation value from calldata + VaultLedger/Oracle state.
    ///         The agent CANNOT override this — computed entirely on-chain.
    ///
    ///         Supported selectors:
    ///           updatePortfolio(address[],uint8[],uint256[])
    ///               → current VaultLedger NAV (whole portfolio at stake)
    ///           addERC20Asset(address,string,uint8,uint256)
    ///               → live oracle value of vault's current balance of that token
    ///           swap(address,uint256,address,uint256,address)
    ///               → oracle value of amountIn being sold
    ///           createDvPExchange(address,uint256,address,address,uint256,address,uint256)
    ///               → oracle value of amountIn being sold (same as swap)
    ///           updateERC721(address,uint256,uint256,bool,uint8,uint8)
    ///               → valuationUSD from calldata param 2
    ///           certify(uint256,uint8,string)
    ///               → NFT current valuation from VaultLedger (by tokenId + target)
    ///           everything else → 0
    function _extractValue(bytes memory callData, address target) internal view returns (uint256) {
        if (callData.length < 4) return 0;

        bytes4 sel;
        assembly { sel := mload(add(callData, 32)) }

        // updatePortfolio: whole portfolio refreshed → NAV at stake
        if (sel == SEL_UPDATE_PORTFOLIO) {
            return IVaultLedger(vaultLedger).getNAV();
        }

        // addERC20Asset(address tokenAddress, string, uint8, uint256)
        // tokenAddress is param 0 at offset 4 — ask VaultLedger for live oracle value
        if (sel == SEL_ADD_ERC20 && callData.length >= 36) {
            address tokenAddress;
            assembly {
                tokenAddress := mload(add(add(callData, 32), 4))
            }
            return IVaultLedger(vaultLedger).getAssetValue(tokenAddress);
        }

        // swap(address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut, address dex)
        // value = oracle price of amountIn being sold
        if (sel == SEL_SWAP && callData.length >= 68) {
            address tokenIn;
            uint256 amountIn;
            assembly {
                tokenIn  := mload(add(add(callData, 32),  4))
                amountIn := mload(add(add(callData, 32), 36))
            }
            return IVaultLedger(vaultLedger).getTokenValue(tokenIn, amountIn);
        }

        // createDvPExchange(address tokenIn, uint256 amountIn, address, address, uint256, address, uint256)
        // value = oracle price of amountIn being sold (same logic as swap)
        if (sel == SEL_CREATE_DVP && callData.length >= 68) {
            address tokenIn;
            uint256 amountIn;
            assembly {
                tokenIn  := mload(add(add(callData, 32),  4))
                amountIn := mload(add(add(callData, 32), 36))
            }
            return IVaultLedger(vaultLedger).getTokenValue(tokenIn, amountIn);
        }

        // updateERC721(address, uint256, uint256 valuationUSD, bool, uint8, uint8)
        // valuationUSD = param 2 at byte offset 4 + 32 + 32 = 68
        if (sel == SEL_UPDATE_ERC721 && callData.length >= 100) {
            uint256 valuationUSD;
            assembly {
                valuationUSD := mload(add(add(callData, 32), 68))
            }
            return valuationUSD;
        }

        // certify(uint256 tokenId, uint8, string) on ArtNFT
        // tokenId = param 0 at offset 4 → look up valuation in VaultLedger
        if (sel == SEL_CERTIFY && callData.length >= 36) {
            uint256 tokenId;
            assembly {
                tokenId := mload(add(add(callData, 32), 4))
            }
            bytes32 nftKey = keccak256(abi.encodePacked(target, tokenId));
            (, , , uint256 valuationUSD, , , ,) = IVaultLedger(vaultLedger).erc721Assets(nftKey);
            return valuationUSD;
        }

        return 0;
    }

    // ─── Internal: Execution ─────────────────────────────────────────────────

    function _canAutoExecute(AssetCategory category, uint256 valueUSD) internal returns (bool) {
        if (!categoryPermissions[category])         return false;
        if (valueUSD > settings.valueThreshold)     return false;
        if (block.timestamp >= _windowStart + settings.windowDuration) {
            _windowStart     = block.timestamp;
            _txCountInWindow = 0;
        }
        if (_txCountInWindow >= settings.maxTxPerWindow) return false;
        return true;
    }

    function _execute(uint256 proposalId, address target, bytes memory callData) internal {
        // Defense-in-depth: re-check selector even if it was validated at propose time.
        // Guards against a selector being de-whitelisted after a proposal was queued.
        require(callData.length >= 4, "calldata too short");
        bytes4 sel;
        assembly { sel := mload(add(callData, 32)) }
        require(allowedSelectors[sel], "selector not allowed");

        (bool success, bytes memory returnData) = target.call(callData);
        if (!success) {
            emit ExecutionFailed(proposalId, returnData);
            revert(_getRevertMsg(returnData));
        }
    }

    function _getRevertMsg(bytes memory returnData) internal pure returns (string memory) {
        if (returnData.length < 68) return "execution failed";
        assembly { returnData := add(returnData, 0x04) }
        return abi.decode(returnData, (string));
    }

    function _assertPending(uint256 proposalId) internal view {
        require(proposalId != 0 && proposalId < _proposals.length, "invalid id");
        require(_proposals[proposalId].status == ProposalStatus.PENDING, "not pending");
        require(pendingProposalId == proposalId, "not the active pending proposal");
    }
}
