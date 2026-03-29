// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Attestation} from "../src/Attestation.sol";

/// @notice Deploy Attestation.sol to Public Chain (Chain ID 7295799).
///         The deployer wallet (PUBLIC_DEPLOYER_KEY = AI agent) becomes the
///         immutable owner — the only address that can ever call attest().
///
///         forge script script/DeployAttestation.s.sol \
///           --rpc-url public_chain \
///           --broadcast \
///           --legacy
///
///         Required env vars:
///           PUBLIC_DEPLOYER_KEY   — AI agent wallet (becomes immutable owner)
///
///         Output: ATTESTATION_ADDRESS (copy to .env for backend)
contract DeployAttestation is Script {
    function run() external {
        uint256 deployerKey  = vm.envUint("PUBLIC_DEPLOYER_KEY");
        address deployerAddr = vm.addr(deployerKey);

        console.log("Deployer (agent): ", deployerAddr);

        vm.startBroadcast(deployerKey);

        // No constructor arg — deployer = msg.sender = immutable owner
        Attestation att = new Attestation();

        vm.stopBroadcast();

        console.log("Attestation:      ", address(att));
        console.log("Owner (immutable):", att.owner());
        console.log("\n=== Copy into .env ===");
        console.log("ATTESTATION_ADDRESS=", address(att));
    }
}
