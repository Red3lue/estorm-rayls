// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VaultShareToken} from "../src/VaultShareToken.sol";

/// @notice Deploy VaultShareToken.sol to Public Chain (Chain ID 7295799).
///         The deployer wallet (PROTOCOL_OWNER_PRIVATE_KEY = AI agent) becomes the owner.
///
///         forge script script/DeployVaultShareToken.s.sol \
///           --rpc-url $PUBLIC_CHAIN_RPC_URL \
///           --broadcast \
///           --legacy
///
///         Required env vars:
///           PROTOCOL_OWNER_PRIVATE_KEY   — AI agent wallet (becomes owner)
///
///         Output: VAULT_SHARE_TOKEN_ADDRESS (copy to .env)
contract DeployVaultShareToken is Script {
    function run() external {
        uint256 deployerKey  = vm.envUint("PROTOCOL_OWNER_PRIVATE_KEY");
        address deployerAddr = vm.addr(deployerKey);

        // NAV = $100M in 18-decimal USDr
        // Initial share price: $1 per share → buy with available USDr
        uint256 initialNAV        = 100_000_000e18;
        uint256 initialSharePrice = 1e18;

        console.log("Deployer (agent): ", deployerAddr);
        console.log("Initial NAV:      ", initialNAV, "cents ($900,000)");
        console.log("Initial price:    ", initialSharePrice, "cents ($10.00)");

        vm.startBroadcast(deployerKey);

        VaultShareToken vst = new VaultShareToken(
            deployerAddr,
            initialNAV,
            initialSharePrice
        );

        vm.stopBroadcast();

        console.log("VaultShareToken:  ", address(vst));
        console.log("Owner:            ", vst.owner());
        console.log("NAV:              ", vst.getNAV());
        console.log("Share price:      ", vst.getSharePrice());
        console.log("\n=== Copy into .env ===");
        console.log("VAULT_SHARE_TOKEN_ADDRESS=", address(vst));
    }
}
