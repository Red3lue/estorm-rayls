// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Marketplace} from "../src/Marketplace.sol";

/// @notice Deploy Marketplace.sol to Public Chain (Chain ID 7295799).
///
///         forge script script/DeployMarketplace.s.sol \
///           --rpc-url $PUBLIC_CHAIN_RPC_URL \
///           --broadcast \
///           --legacy
///
///         Required env vars:
///           PROTOCOL_OWNER_PRIVATE_KEY — AI agent wallet (becomes owner)
///
///         Output: MARKETPLACE_ADDRESS (copy to .env)
contract DeployMarketplace is Script {
    function run() external {
        uint256 deployerKey  = vm.envUint("PROTOCOL_OWNER_PRIVATE_KEY");
        address deployerAddr = vm.addr(deployerKey);

        console.log("Deployer (agent): ", deployerAddr);

        vm.startBroadcast(deployerKey);

        Marketplace mp = new Marketplace(deployerAddr);

        vm.stopBroadcast();

        console.log("Marketplace:      ", address(mp));
        console.log("Owner:            ", mp.owner());
        console.log("\n=== Copy into .env ===");
        console.log("MARKETPLACE_ADDRESS=", address(mp));
    }
}
