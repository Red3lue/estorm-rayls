// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ReceiptToken} from "../src/ReceiptToken.sol";

/// @notice Deploy ReceiptToken.sol (Picasso) to Public Chain (Chain ID 7295799).
///         The deployer wallet (PUBLIC_DEPLOYER_KEY = AI agent) becomes the owner.
///
///         forge script script/DeployReceiptToken.s.sol \
///           --rpc-url $PUBLIC_CHAIN_RPC_URL \
///           --broadcast \
///           --legacy
///
///         Required env vars:
///           PUBLIC_DEPLOYER_KEY   — AI agent wallet (becomes owner)
///           ATTESTATION_ADDRESS   — deployed Attestation.sol on Public Chain
///
///         Output: RECEIPT_TOKEN_ADDRESS (copy to .env)
contract DeployReceiptToken is Script {
    function run() external {
        uint256 deployerKey  = vm.envUint("PUBLIC_DEPLOYER_KEY");
        address deployerAddr = vm.addr(deployerKey);
        address attestation  = vm.envAddress("ATTESTATION_ADDRESS");

        // Picasso: $500,000 valuation, 10,000 fractional receipts ($50 each)
        uint256 supplyCap   = 10_000e18;
        uint256 valuationUSD = 500_000e18;

        console.log("Deployer (agent): ", deployerAddr);
        console.log("Attestation:      ", attestation);
        console.log("Supply cap:       ", supplyCap / 1e18, "tokens");
        console.log("Valuation:        ", valuationUSD / 1e18, "USDr");

        vm.startBroadcast(deployerKey);

        ReceiptToken rt = new ReceiptToken(
            "Picasso Receipt Token",
            "rPICASSO",
            deployerAddr,
            attestation,
            supplyCap,
            "ART",
            "Picasso - Weeping Woman",
            valuationUSD
        );

        vm.stopBroadcast();

        console.log("ReceiptToken:     ", address(rt));
        console.log("Owner:            ", rt.owner());
        console.log("\n=== Copy into .env ===");
        console.log("RECEIPT_TOKEN_ADDRESS=", address(rt));
    }
}
