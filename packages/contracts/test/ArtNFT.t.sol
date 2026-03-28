// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArtNFT} from "../src/ArtNFT.sol";

contract ArtNFTTest is Test {
    address constant MOCK_ENDPOINT = address(1);
    address constant MOCK_RN       = address(0);
    address constant MOCK_GOV      = address(0);

    ArtNFT picasso;
    // Use EOA addresses — _safeMint reverts if recipient is a contract without IERC721Receiver
    address owner = makeAddr("vault");
    address alice = makeAddr("alice");

    function setUp() public {
        picasso = new ArtNFT(
            "Sovereign Vault: Picasso", "ART-PICASSO-01",
            "ipfs://QmPicassoVaultArt",
            MOCK_ENDPOINT, MOCK_RN, MOCK_GOV
        );
    }

    function test_nameAndSymbol() public view {
        assertEq(picasso.name(),   "Sovereign Vault: Picasso");
        assertEq(picasso.symbol(), "ART-PICASSO-01");
    }

    function test_mintArt() public {
        picasso.mintArt(owner, 1, "Weeping Woman", "Pablo Picasso", 50_000_000_00);
        assertEq(picasso.ownerOf(1), owner);
    }

    function test_mintArt_storesMetadata() public {
        picasso.mintArt(owner, 1, "Weeping Woman", "Pablo Picasso", 50_000_000_00);
        (
            string memory title,
            string memory artist,
            uint256 valuation,
            bool certified,
            uint8 certScore,
            string memory provenanceHash
        ) = picasso.metadata(1);

        assertEq(title,        "Weeping Woman");
        assertEq(artist,       "Pablo Picasso");
        assertEq(valuation,    50_000_000_00);
        assertFalse(certified);
        assertEq(certScore,    0);
        assertEq(provenanceHash, "");
    }

    function test_certify() public {
        picasso.mintArt(owner, 1, "Weeping Woman", "Pablo Picasso", 50_000_000_00);
        picasso.certify(1, 85, "ipfs://QmProvenanceHash");

        (,, , bool certified, uint8 certScore, string memory provenanceHash) = picasso.metadata(1);
        assertTrue(certified);
        assertEq(certScore,      85);
        assertEq(provenanceHash, "ipfs://QmProvenanceHash");
    }

    function test_certify_emitsEvent() public {
        picasso.mintArt(owner, 1, "Weeping Woman", "Pablo Picasso", 50_000_000_00);
        vm.expectEmit(true, false, false, true);
        emit ArtNFT.ArtCertified(1, 85, "ipfs://QmProvenanceHash");
        picasso.certify(1, 85, "ipfs://QmProvenanceHash");
    }

    function test_certify_revertsOnNonExistentToken() public {
        vm.expectRevert("token does not exist");
        picasso.certify(99, 85, "ipfs://QmHash");
    }

    function test_mintArt_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        picasso.mintArt(alice, 1, "Fake", "Nobody", 0);
    }

    function test_certify_onlyOwner() public {
        picasso.mintArt(owner, 1, "Weeping Woman", "Pablo Picasso", 50_000_000_00);
        vm.prank(alice);
        vm.expectRevert();
        picasso.certify(1, 85, "ipfs://QmHash");
    }

    function test_multipleMints() public {
        picasso.mintArt(owner, 1, "Weeping Woman",  "Pablo Picasso", 50_000_000_00);
        picasso.mintArt(alice, 2, "Guernica Study",  "Pablo Picasso", 10_000_000_00);
        assertEq(picasso.ownerOf(1), owner);
        assertEq(picasso.ownerOf(2), alice);
    }
}
