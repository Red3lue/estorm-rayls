// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title VaultPolicy
/// @notice On-chain governance gateway for the Sovereign Vault Protocol.
///         ALL vault operations proposed by the AI agent pass through here.
///         The contract checks governance rules and either auto-executes or queues
///         for human approval. Every decision is permanently recorded on-chain.
///
///         Two roles:
///           - manager  : human fund manager (approve/dismiss/configure/emergency)
///           - agent    : AI agent wallet (propose/withdraw)
///
///         Three auto-execution gates (all must pass for auto-exec):
///           1. Category permission  — asset category must be AI-managed
///           2. Value threshold      — transaction value must be ≤ valueThreshold
///           3. Rate limit           — txs executed this window < maxTxPerWindow
///
///         Deployed on Privacy Node — governance log stays private.
contract VaultPolicy {
    // ─── Roles ───────────────────────────────────────────────────────────────

    address public manager;
    address public agent;

    modifier onlyManager() {
        require(msg.sender == manager, "not manager");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == agent, "not agent");
        _;
    }

    modifier notPaused() {
        require(!settings.paused, "emergency stop active");
        _;
    }

    // ─── Asset Categories ────────────────────────────────────────────────────

    /// @dev Must match the asset types in the vault.
    enum AssetCategory { BOND, RECEIVABLE, STABLECOIN, ART, NAV_UPDATE, ISSUANCE }

    // ─── Governance Settings ─────────────────────────────────────────────────

    struct GovernanceSettings {
        uint256 valueThreshold;    // cents — proposals above this need human approval
        uint256 maxTxPerWindow;    // max auto-executed transactions per rate-limit window
        uint256 windowDuration;    // rate-limit window in seconds
        bool    paused;            // emergency stop flag
    }

    GovernanceSettings public settings;

    /// @dev category → true means AI-managed, false means human-only
    mapping(AssetCategory => bool) public categoryPermissions;

    // ─── Rate Limit State ────────────────────────────────────────────────────

    uint256 private _windowStart;
    uint256 private _txCountInWindow;

    // ─── Proposal Lifecycle ──────────────────────────────────────────────────

    enum ProposalStatus { PENDING, AUTO_EXECUTED, APPROVED, DISMISSED, WITHDRAWN }

    struct Proposal {
        uint256        id;
        AssetCategory  category;
        uint256        valueUSD;      // in cents
        string         reasoning;     // AI's full reasoning (private, on Privacy Node)
        uint8          quorumVotes;   // 0-4 agents agreed
        ProposalStatus status;
        uint256        createdAt;
        uint256        resolvedAt;
        address        resolvedBy;    // address(0) = auto-exec or agent withdraw
    }

    /// @dev proposals[0] is unused — IDs start at 1
    Proposal[] private _proposals;

    uint256 public pendingProposalId; // 0 = no pending proposal
    uint256 public totalProposals;

    // ─── Events ──────────────────────────────────────────────────────────────

    event ProposalAutoExecuted(uint256 indexed id, AssetCategory category, uint8 quorumVotes, uint256 valueUSD);
    event ProposalPending(uint256 indexed id, AssetCategory category, uint8 quorumVotes, uint256 valueUSD, string reasoning);
    event ProposalApproved(uint256 indexed id, address indexed manager);
    event ProposalDismissed(uint256 indexed id, address indexed manager);
    event ProposalWithdrawn(uint256 indexed id);
    event SettingsUpdated(uint256 valueThreshold, uint256 maxTxPerWindow, uint256 windowDuration);
    event CategoryPermissionSet(AssetCategory category, bool aiManaged);
    event EmergencyStop(address indexed by);
    event Resumed(address indexed by);
    event ManagerTransferred(address indexed oldManager, address indexed newManager);
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        address _manager,
        address _agent,
        uint256 _valueThreshold,
        uint256 _maxTxPerWindow,
        uint256 _windowDuration
    ) {
        require(_manager != address(0), "zero manager");
        require(_agent   != address(0), "zero agent");

        manager = _manager;
        agent   = _agent;

        settings = GovernanceSettings({
            valueThreshold: _valueThreshold,
            maxTxPerWindow: _maxTxPerWindow,
            windowDuration: _windowDuration,
            paused:         false
        });

        // Default category permissions:
        // Bonds, receivables, stablecoins, NAV updates, issuance → AI-managed
        // Art → human-only (requires explicit human approval)
        categoryPermissions[AssetCategory.BOND]        = true;
        categoryPermissions[AssetCategory.RECEIVABLE]  = true;
        categoryPermissions[AssetCategory.STABLECOIN]  = true;
        categoryPermissions[AssetCategory.NAV_UPDATE]  = true;
        categoryPermissions[AssetCategory.ISSUANCE]    = true;
        categoryPermissions[AssetCategory.ART]         = false; // human-only

        // Placeholder slot so IDs start at 1
        _proposals.push(Proposal(0, AssetCategory.BOND, 0, "", 0, ProposalStatus.DISMISSED, 0, 0, address(0)));

        _windowStart = block.timestamp;
    }

    // ─── Propose ─────────────────────────────────────────────────────────────

    /// @notice Agent submits a proposal. Auto-executes if all governance gates pass,
    ///         otherwise queues as PENDING for human approval.
    /// @param category    Asset category (determines permission check)
    /// @param valueUSD    Transaction value in cents (determines threshold check)
    /// @param reasoning   AI's reasoning string (stored on-chain, privately)
    /// @param quorumVotes Number of agents that agreed (0-4)
    /// @return id         The proposal ID
    function propose(
        AssetCategory  category,
        uint256        valueUSD,
        string calldata reasoning,
        uint8          quorumVotes
    ) external onlyAgent notPaused returns (uint256 id) {
        bool autoExec = _canAutoExecute(category, valueUSD);

        ProposalStatus status = autoExec ? ProposalStatus.AUTO_EXECUTED : ProposalStatus.PENDING;

        id = _proposals.length;
        totalProposals++;

        _proposals.push(Proposal({
            id:           id,
            category:     category,
            valueUSD:     valueUSD,
            reasoning:    reasoning,
            quorumVotes:  quorumVotes,
            status:       status,
            createdAt:    block.timestamp,
            resolvedAt:   autoExec ? block.timestamp : 0,
            resolvedBy:   address(0)
        }));

        if (autoExec) {
            _txCountInWindow++;
            emit ProposalAutoExecuted(id, category, quorumVotes, valueUSD);
        } else {
            require(pendingProposalId == 0, "pending proposal exists: resolve it first");
            pendingProposalId = id;
            emit ProposalPending(id, category, quorumVotes, valueUSD, reasoning);
        }
    }

    // ─── Manager Actions ─────────────────────────────────────────────────────

    /// @notice Manager approves the pending proposal → agent may execute the action.
    function approve(uint256 proposalId) external onlyManager notPaused {
        _assertPending(proposalId);
        Proposal storage p = _proposals[proposalId];
        p.status     = ProposalStatus.APPROVED;
        p.resolvedAt = block.timestamp;
        p.resolvedBy = msg.sender;
        pendingProposalId = 0;
        emit ProposalApproved(proposalId, msg.sender);
    }

    /// @notice Manager dismisses the pending proposal — action is discarded.
    function dismiss(uint256 proposalId) external onlyManager {
        _assertPending(proposalId);
        Proposal storage p = _proposals[proposalId];
        p.status     = ProposalStatus.DISMISSED;
        p.resolvedAt = block.timestamp;
        p.resolvedBy = msg.sender;
        pendingProposalId = 0;
        emit ProposalDismissed(proposalId, msg.sender);
    }

    // ─── Agent Actions ───────────────────────────────────────────────────────

    /// @notice Agent withdraws its own pending proposal (e.g. vault state changed,
    ///         proposal no longer valid after a subsequent auto-executed operation).
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

    // ─── Read ────────────────────────────────────────────────────────────────

    function getSettings() external view returns (GovernanceSettings memory, bool[6] memory permissions) {
        permissions[0] = categoryPermissions[AssetCategory.BOND];
        permissions[1] = categoryPermissions[AssetCategory.RECEIVABLE];
        permissions[2] = categoryPermissions[AssetCategory.STABLECOIN];
        permissions[3] = categoryPermissions[AssetCategory.ART];
        permissions[4] = categoryPermissions[AssetCategory.NAV_UPDATE];
        permissions[5] = categoryPermissions[AssetCategory.ISSUANCE];
        return (settings, permissions);
    }

    /// @notice Returns the current pending proposal. Reverts if none exists.
    function getPendingProposal() external view returns (Proposal memory) {
        require(pendingProposalId != 0, "no pending proposal");
        return _proposals[pendingProposalId];
    }

    /// @notice Returns all proposals (full history including auto-executed, approved, dismissed).
    function getProposalHistory() external view returns (Proposal[] memory history) {
        // Skip slot 0 (placeholder)
        uint256 count = _proposals.length > 1 ? _proposals.length - 1 : 0;
        history = new Proposal[](count);
        for (uint256 i = 0; i < count; i++) {
            history[i] = _proposals[i + 1];
        }
    }

    /// @notice Current rate-limit window usage.
    function getRateLimitStatus() external view returns (uint256 used, uint256 max, uint256 windowEndsAt) {
        bool windowExpired = block.timestamp >= _windowStart + settings.windowDuration;
        used        = windowExpired ? 0 : _txCountInWindow;
        max         = settings.maxTxPerWindow;
        windowEndsAt = _windowStart + settings.windowDuration;
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _canAutoExecute(AssetCategory category, uint256 valueUSD) internal returns (bool) {
        // Gate 1: category must be AI-managed
        if (!categoryPermissions[category]) return false;

        // Gate 2: value must be within threshold
        if (valueUSD > settings.valueThreshold) return false;

        // Gate 3: rate limit — refresh window if expired
        if (block.timestamp >= _windowStart + settings.windowDuration) {
            _windowStart     = block.timestamp;
            _txCountInWindow = 0;
        }
        if (_txCountInWindow >= settings.maxTxPerWindow) return false;

        return true;
    }

    function _assertPending(uint256 proposalId) internal view {
        require(proposalId != 0 && proposalId < _proposals.length, "invalid id");
        require(_proposals[proposalId].status == ProposalStatus.PENDING, "not pending");
        require(pendingProposalId == proposalId, "not the active pending proposal");
    }
}
