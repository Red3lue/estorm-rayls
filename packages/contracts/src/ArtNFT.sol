// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {RaylsErc721Handler} from "rayls-protocol-sdk/tokens/RaylsErc721Handler.sol";

/// @title ArtNFT
/// @notice ERC-721 art asset for the Sovereign Vault Protocol.
///         Each deployment represents one physical artwork held privately on the Privacy Node.
///         Metadata stores provenance, valuation, and AI certification status.
contract ArtNFT is RaylsErc721Handler {
    struct ArtMetadata {
        string title;
        string artist;
        uint256 valuationUSD;   // in cents to avoid decimals
        bool certified;
        uint8 certScore;        // 0-100, set by AI agent
        string provenanceHash;  // IPFS or keccak256 of provenance docs
    }

    mapping(uint256 => ArtMetadata) public metadata;

    event ArtCertified(uint256 indexed tokenId, uint8 score, string provenanceHash);

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _uri,
        address _endpoint,
        address _raylsNodeEndpoint,
        address _userGovernance
    )
        RaylsErc721Handler(
            _uri,
            _name,
            _symbol,
            _endpoint,
            _raylsNodeEndpoint,
            _userGovernance,
            msg.sender,
            false
        )
    {}

    /// @notice Mint a new art NFT with initial metadata. Called by vault deployer.
    function mintArt(
        address to,
        uint256 tokenId,
        string calldata title,
        string calldata artist,
        uint256 valuationUSD
    ) external onlyOwner {
        _mint(to, tokenId);
        metadata[tokenId] = ArtMetadata({
            title: title,
            artist: artist,
            valuationUSD: valuationUSD,
            certified: false,
            certScore: 0,
            provenanceHash: ""
        });
    }

    /// @notice Called by the AI agent after quorum certification.
    function certify(
        uint256 tokenId,
        uint8 score,
        string calldata provenanceHash
    ) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "token does not exist");
        ArtMetadata storage art = metadata[tokenId];
        art.certified = true;
        art.certScore = score;
        art.provenanceHash = provenanceHash;
        emit ArtCertified(tokenId, score, provenanceHash);
    }
}
