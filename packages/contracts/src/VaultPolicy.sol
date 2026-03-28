// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title VaultPolicy
/// @notice On-chain governance gateway and execution engine for the Sovereign Vault Protocol.
///         The AI agent submits encoded calls (target + calldata + metadata). VaultPolicy
///         checks governance rules and either:
///           (A) Executes the call immediately     → ProposalAutoExecuted
///           (B) Queues it for human approval       → ProposalPending → ProposalApproved → executed
///
///         VaultPolicy must be the owner of all vault contracts it manages
///         (VaultLedger, ArtNFT, RWAToken) so that forwarded calls are accepted.
///
///         Two roles:
///           - manager : human fund manager (approve / dismiss / configure / emergency)
///           - agent   : AI agent wallet   (propose / withdraw)
///
///         Three auto-execution gates (ALL must pass):
///           1. Category permission  — asset category must be AI-managed
///           2. Value threshold      — valueUSD <= valueThreshold
///           3. Rate limit           — txs executed this window < maxTxPerWindow
///
///         Deployed on Privacy Node.
contract VaultPolicy {

    // ─── Roles ───────────────────────────────────────────────────────────────

    address public manager;
    address public agent;

    modifier onlyManager() { require(msg.sender == manager, "not manager"); _; }
    modifier onlyAgent()   { require(msg.sender == agent,   "not agent");   _; }
    modifier notPaused()   { require(!settings.paused, "emergency stop active"); _; }

    // ─── Asset Categories ────────────────────────────────────────────────────

    enum AssetCategory { BOND, RECEIVABLE, STABLECOIN, ART, NAV_UPDATE, ISSUANCE }

    // ─── Governance Settings ─────────────────────────────────────────────────

    struct GovernanceSettings {
        uint256 valueThreshold;  // cents — proposals above this require human approval
        uint256 maxTxPerWindow;  // max auto-executed tx per window
        uint256 windowDuration;  // window length in seconds
        bool    paused;          // emergency stop
    }

    GovernanceSettings public settings;

    /// @dev category => true = AI-managed, false = human-only
    mapping(AssetCategory => bool) public categoryPermissions;

    // ─── Rate Limit State ────────────────────────────────────────────────────

    uint256 private _windowStart;
    uint256 private _txCountInWindow;

    // ─── Proposal Lifecycle ──────────────────────────────────────────────────

    enum ProposalStatus { PENDING, AUTO_EXECUTED, APPROVED, DISMISSED, WITHDRAWN }

    struct Proposal {
        uint256        id;
        address        target;       // contract to call
        bytes          callData;     // encoded function call (built by agent)
        AssetCategory  category;
        uint256        valueUSD;     // in cents
        string         reasoning;    // AI reasoning (stored privately on Privacy Node)
        uint8          quorumVotes;  // 0-4 agents agreed
        ProposalStatus status;
        uint256        createdAt;
        uint256        resolvedAt;
        address        resolvedBy;   // address(0) = auto-exec or agent withdraw
    }

    /// @dev _proposals[0] is a placeholder — IDs start at 1
    Proposal[] private _proposals;

    uint256 public pendingProposalId; // 0 = no pending proposal
    uint256 public totalProposals;

    // ─── Events ──────────────────────────────────────────────────────────────

    event ProposalAutoExecuted(uint256 indexed id, AssetCategory category, uint8 quorumVotes, uint256 valueUSD, address target);
    event ProposalPending(uint256 indexed id, AssetCategory category, uint8 quorumVotes, uint256 valueUSD, string reasoning);
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

        // Default: bonds, receivables, stablecoins, NAV updates, issuance = AI-managed
        //          art = human-only
        categoryPermissions[AssetCategory.BOND]       = true;
        categoryPermissions[AssetCategory.RECEIVABLE] = true;
        categoryPermissions[AssetCategory.STABLECOIN] = true;
        categoryPermissions[AssetCategory.NAV_UPDATE] = true;
        categoryPermissions[AssetCategory.ISSUANCE]   = true;
        categoryPermissions[AssetCategory.ART]        = false;

        // Placeholder at index 0 so IDs start at 1
        _proposals.push(Proposal({
            id: 0, target: address(0), callData: "", category: AssetCategory.BOND,
            valueUSD: 0, reasoning: "", quorumVotes: 0,
            status: ProposalStatus.DISMISSED, createdAt: 0, resolvedAt: 0, resolvedBy: address(0)
        }));

        _windowStart = block.timestamp;
    }

    // ─── Propose ─────────────────────────────────────────────────────────────

    /// @notice Agent submits a vault operation. Governance gates decide auto-exec vs queue.
    /// @param target      Contract to call (e.g. VaultLedger, ArtNFT)
    /// @param callData    ABI-encoded function call to forward
    /// @param category    Asset category for permission check
    /// @param valueUSD    Transaction value in cents for threshold check
    /// @param reasoning   AI's reasoning (stored on-chain, private)
    /// @param quorumVotes Number of AI agents that agreed (0-4)
    /// @return id         Assigned proposal ID
    function propose(
        address         target,
        bytes calldata  callData,
        AssetCategory   category,
        uint256         valueUSD,
        string calldata reasoning,
        uint8           quorumVotes
    ) external onlyAgent notPaused returns (uint256 id) {
        require(target != address(0), "zero target");

        bool autoExec = _canAutoExecute(category, valueUSD);

        id = _proposals.length;
        totalProposals++;

        _proposals.push(Proposal({
            id:          id,
            target:      target,
            callData:    callData,
            category:    category,
            valueUSD:    valueUSD,
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
            emit ProposalAutoExecuted(id, category, quorumVotes, valueUSD, target);
        } else {
            require(pendingProposalId == 0, "pending proposal exists: resolve it first");
            pendingProposalId = id;
            emit ProposalPending(id, category, quorumVotes, valueUSD, reasoning);
        }
    }

    // ─── Manager: Approve ────────────────────────────────────────────────────

    /// @notice Manager approves the pending proposal → executes the stored call.
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

    /// @notice Manager dismisses the pending proposal — action is discarded, not executed.
    function dismiss(uint256 proposalId) external onlyManager {
        _assertPending(proposalId);
        Proposal storage p = _proposals[proposalId];
        p.status     = ProposalStatus.DISMISSED;
        p.resolvedAt = block.timestamp;
        p.resolvedBy = msg.sender;
        pendingProposalId = 0;
        emit ProposalDismissed(proposalId, msg.sender);
    }

    // ─── Agent: Withdraw ─────────────────────────────────────────────────────

    /// @notice Agent withdraws its own pending proposal when vault state has changed
    ///         and the queued action is no longer valid.
    function withdraw(uint256 proposalId) external onlyAgent {
        _assertPending(proposalId);
        Proposal storage p = _proposals[proposalId];
        p.status     = ProposalStatus.WITHDRAWN;
        p.resolvedAt = block.timestamp;
        pendingProposalId = 0;
        emit ProposalWithdrawn(proposalId);
    }

    // ─── Emergency ───────────────────────────────────────────────────────────

    function emergencyStop() external onlyManager {
        settings.paused = true;
        emit EmergencyStop(msg.sender);
    }

    function resume() external onlyManager {
        settings.paused = false;
        emit Resumed(msg.sender);
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

    /// @notice Returns the current pending proposal. Reverts if none.
    function getPendingProposal() external view returns (Proposal memory) {
        require(pendingProposalId != 0, "no pending proposal");
        return _proposals[pendingProposalId];
    }

    /// @notice Full history — skips placeholder at index 0.
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

    // ─── Internal ────────────────────────────────────────────────────────────

    function _canAutoExecute(AssetCategory category, uint256 valueUSD) internal returns (bool) {
        if (!categoryPermissions[category])          return false;
        if (valueUSD > settings.valueThreshold)      return false;
        if (block.timestamp >= _windowStart + settings.windowDuration) {
            _windowStart     = block.timestamp;
            _txCountInWindow = 0;
        }
        if (_txCountInWindow >= settings.maxTxPerWindow) return false;
        return true;
    }

    function _execute(uint256 proposalId, address target, bytes memory callData) internal {
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
