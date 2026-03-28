// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VaultPolicy} from "../src/VaultPolicy.sol";

/// @dev Run: forge script script/DeployVaultPolicy.s.sol --rpc-url privacy_node --broadcast --legacy
contract DeployVaultPolicy is Script {
    function run() external {
        uint256 deployerKey  = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerAddr = vm.addr(deployerKey);

        // Manager and agent are both the deployer wallet for the hackathon.
        // In production: manager = multisig, agent = AI wallet.
        address manager = deployerAddr;
        address agent   = deployerAddr;

        // Governance parameters
        uint256 valueThreshold = 5_000_000_00; // $50,000 in cents
        uint256 maxTxPerWindow = 10;
        uint256 windowDuration = 3600;          // 1 hour

        vm.startBroadcast(deployerKey);

        VaultPolicy policy = new VaultPolicy(
            manager,
            agent,
            valueThreshold,
            maxTxPerWindow,
            windowDuration
        );

        vm.stopBroadcast();

        console.log("VaultPolicy:        ", address(policy));
        console.log("Manager:            ", manager);
        console.log("Agent:              ", agent);
        console.log("Value threshold:    $50,000");
        console.log("Rate limit:         10 tx/hour");
        console.log("Art category:       human-only");
        console.log("\n=== Copy into .env ===");
        console.log("VAULT_POLICY_ADDRESS=", address(policy));
    }
}
