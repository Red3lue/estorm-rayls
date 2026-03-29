// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Minimal Attestation interface for certification verification.
interface IAttestation {
    struct AttestationData {
        address attester;
        address token;
        bool    approved;
        string  reason;
        uint256 score;
        uint256 timestamp;
        uint8   decisionType;
        uint8   decisionOrigin;
        uint8   quorumVotes;
        uint8   quorumTotal;
        uint256 nav;
        uint256 riskScore;
        string  portfolioBreakdown;
        string  yieldHistory;
    }

    function getAttestationCountForToken(address token) external view returns (uint256);
    function getLatestAttestation(address token) external view returns (AttestationData memory);
}

/// @title ReceiptToken
/// @notice ERC-20 fractionalized receipt token on the Public Chain, backed by a
///         private ERC-721 asset (e.g. certified artwork on the Privacy Node).
///
///         PRIVACY MODEL:
///           The receipt token stores public certification data (provenance hash,
///           confidence score, risk score, valuation) but NEVER the private NFT
///           address or metadata. Investors can verify the AI certification via
///           Attestation.sol without seeing the underlying asset.
///
///         MINTING:
///           Only the owner (AI agent) can mint, and only after the backing asset
///           has been AI-certified (at least one attestation must exist for this
///           receipt token's address on the Attestation contract).
///
///         OWNERSHIP:
///           Owner = AI agent wallet. Only owner can mint and update backing info.
contract ReceiptToken is ERC20, Ownable {

    // ─── Backing Asset Info (public, privacy-preserving) ─────────────────────

    struct BackingInfo {
        string  assetType;       // e.g. "ART", "COLLECTIBLE"
        string  assetLabel;      // e.g. "Picasso — Weeping Woman" (public-facing label)
        uint256 valuationUSD;    // 18-decimal USDr — valuation at certification time
        uint256 certScore;       // 0-100 confidence score from AI certification
        uint256 riskScore;       // 0-100 risk score
        string  provenanceHash;  // IPFS hash or keccak256 of provenance docs
        uint256 certifiedAt;     // timestamp of certification
        bool    certified;       // whether the backing asset has been AI-certified
    }

    BackingInfo public backingInfo;

    /// @notice Attestation.sol contract on the Public Chain.
    address public attestationContract;

    /// @notice Total fractionalized supply cap (set at creation, e.g. 10,000 receipts).
    uint256 public supplyCap;

    // ─── Events ──────────────────────────────────────────────────────────────

    event BackingInfoUpdated(string assetType, uint256 valuationUSD, uint256 certScore, uint256 riskScore);
    event ReceiptsMinted(address indexed to, uint256 amount, uint256 totalSupply);

    // ─── Constructor ─────────────────────────────────────────────────────────

    /// @param _name               Token name (e.g. "Picasso Receipt Token")
    /// @param _symbol             Token symbol (e.g. "rPICASSO")
    /// @param _owner              AI agent wallet
    /// @param _attestation        Attestation.sol address on Public Chain
    /// @param _supplyCap          Max fractional supply (18-decimal, e.g. 10_000e18)
    /// @param _assetType          Backing asset type label (e.g. "ART")
    /// @param _assetLabel         Public-facing label (e.g. "Picasso — Weeping Woman")
    /// @param _valuationUSD       Initial valuation in 18-decimal USDr
    constructor(
        string memory _name,
        string memory _symbol,
        address _owner,
        address _attestation,
        uint256 _supplyCap,
        string memory _assetType,
        string memory _assetLabel,
        uint256 _valuationUSD
    ) ERC20(_name, _symbol) Ownable(_owner) {
        require(_attestation != address(0), "zero attestation");
        require(_supplyCap > 0, "zero supply cap");

        attestationContract = _attestation;
        supplyCap = _supplyCap;

        backingInfo = BackingInfo({
            assetType:     _assetType,
            assetLabel:    _assetLabel,
            valuationUSD:  _valuationUSD,
            certScore:     0,
            riskScore:     0,
            provenanceHash: "",
            certifiedAt:   0,
            certified:     false
        });
    }

    // ─── Certification ───────────────────────────────────────────────────────

    /// @notice Update backing info after AI certification. Agent-only.
    ///         The agent calls this after writing the attestation to Attestation.sol,
    ///         then verifies on-chain that the attestation exists before allowing mints.
    function updateBackingInfo(
        uint256 certScore,
        uint256 riskScore,
        string calldata provenanceHash,
        uint256 valuationUSD
    ) external onlyOwner {
        require(certScore <= 100, "certScore out of range");
        require(riskScore <= 100, "riskScore out of range");

        backingInfo.certScore      = certScore;
        backingInfo.riskScore      = riskScore;
        backingInfo.provenanceHash = provenanceHash;
        backingInfo.valuationUSD   = valuationUSD;
        backingInfo.certifiedAt    = block.timestamp;
        backingInfo.certified      = true;

        emit BackingInfoUpdated(backingInfo.assetType, valuationUSD, certScore, riskScore);
    }

    // ─── Minting ─────────────────────────────────────────────────────────────

    /// @notice Mint receipt tokens. Only after certification AND attestation on-chain.
    ///         The attestation check uses this contract's own address as the token key
    ///         in Attestation.sol — the agent must have attested for address(this).
    function mint(address to, uint256 amount) external onlyOwner {
        require(backingInfo.certified, "not certified");
        require(
            IAttestation(attestationContract).getAttestationCountForToken(address(this)) > 0,
            "no attestation exists"
        );
        require(totalSupply() + amount <= supplyCap, "exceeds supply cap");

        _mint(to, amount);
        emit ReceiptsMinted(to, amount, totalSupply());
    }

    // ─── Read ────────────────────────────────────────────────────────────────

    /// @notice Public backing info — reveals certification data but NOT the private
    ///         NFT address, token ID, or private metadata.
    function getBackingInfo() external view returns (BackingInfo memory) {
        return backingInfo;
    }

    /// @notice Price per receipt in 18-decimal USDr.
    ///         receiptPrice = valuationUSD / supplyCap
    function getReceiptPrice() external view returns (uint256) {
        if (supplyCap == 0) return 0;
        return (backingInfo.valuationUSD * 1e18) / supplyCap;
    }

    /// @notice Verify the AI certification attestation on-chain.
    ///         Returns the latest attestation from Attestation.sol for this receipt token.
    function getAttestation() external view returns (IAttestation.AttestationData memory) {
        return IAttestation(attestationContract).getLatestAttestation(address(this));
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
