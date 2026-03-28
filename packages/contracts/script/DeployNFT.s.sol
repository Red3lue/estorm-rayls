// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IDeploymentProxyRegistryV1} from "rayls-protocol-sdk/interfaces/IDeploymentProxyRegistryV1.sol";
import {ArtNFT} from "../src/ArtNFT.sol";

/// @notice Deploys 2 ERC-721 art NFTs and mints one token each to the vault deployer.
/// @dev Run with: forge script script/DeployNFT.s.sol --rpc-url privacy_node --broadcast --legacy
contract DeployNFT is Script {
    function run() external {
        address registry = vm.envAddress("DEPLOYMENT_PROXY_REGISTRY");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerAddr = vm.addr(deployerKey);

        IDeploymentProxyRegistryV1 reg = IDeploymentProxyRegistryV1(registry);
        address endpoint       = reg.getContract("Endpoint");
        address rnEndpoint     = reg.getContract("RNEndpoint");
        address userGovernance = reg.getContract("RNUserGovernance");

        vm.startBroadcast(deployerKey);

        // ART-PICASSO-01
        ArtNFT picasso = new ArtNFT(
            "Sovereign Vault: Picasso",
            "ART-PICASSO-01",
            "ipfs://QmPicassoVaultArt",
            endpoint,
            rnEndpoint,
            userGovernance
        );
        picasso.mintArt(
            deployerAddr,
            1,
            "Weeping Woman",
            "Pablo Picasso",
            50_000_000_00  // $500,000.00 in cents
        );
        console.log("ART-PICASSO-01: ", address(picasso));

        // ART-WARHOL-01
        ArtNFT warhol = new ArtNFT(
            "Sovereign Vault: Warhol",
            "ART-WARHOL-01",
            "ipfs://QmWarholVaultArt",
            endpoint,
            rnEndpoint,
            userGovernance
        );
        warhol.mintArt(
            deployerAddr,
            1,
            "Marilyn Diptych",
            "Andy Warhol",
            25_000_000_00  // $250,000.00 in cents
        );
        console.log("ART-WARHOL-01:  ", address(warhol));

        vm.stopBroadcast();

        console.log("\n=== Copy these into .env ===");
        console.log("PICASSO_NFT_ADDRESS=", address(picasso));
        console.log("WARHOL_NFT_ADDRESS=", address(warhol));
    }
}
