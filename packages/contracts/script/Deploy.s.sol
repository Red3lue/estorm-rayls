// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IDeploymentProxyRegistryV1} from "rayls-protocol-sdk/interfaces/IDeploymentProxyRegistryV1.sol";
import {RWAToken} from "../src/RWAToken.sol";

/// @notice Deploys all 4 ERC-20 RWA asset tokens to the Privacy Node.
/// @dev Run with: forge script script/Deploy.s.sol --rpc-url $PRIVACY_NODE_RPC_URL --broadcast --legacy
contract Deploy is Script {
    function run() external {
        address registry = vm.envAddress("DEPLOYMENT_PROXY_REGISTRY");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Resolve Rayls infrastructure addresses from the on-chain registry
        IDeploymentProxyRegistryV1 reg = IDeploymentProxyRegistryV1(registry);
        address endpoint = reg.getContract("Endpoint");
        address rnEndpoint = reg.getContract("RNEndpoint");
        address userGovernance = reg.getContract("RNUserGovernance");

        console.log("Registry:        ", registry);
        console.log("Endpoint:        ", endpoint);
        console.log("RNEndpoint:      ", rnEndpoint);
        console.log("UserGovernance:  ", userGovernance);

        vm.startBroadcast(deployerKey);

        // BOND-GOV-6M: Government bond, 6-month maturity
        RWAToken bondGov = new RWAToken(
            "Government Bond 6M",
            "BOND-GOV-6M",
            18,
            endpoint,
            rnEndpoint,
            userGovernance,
            1_000_000   // 1M tokens = $1 face value each → $1M notional
        );
        console.log("BOND-GOV-6M:    ", address(bondGov));

        // RECV-ACME-90D: ACME Corp receivable, 90-day
        RWAToken recvAcme = new RWAToken(
            "ACME Receivable 90D",
            "RECV-ACME-90D",
            18,
            endpoint,
            rnEndpoint,
            userGovernance,
            500_000
        );
        console.log("RECV-ACME-90D:  ", address(recvAcme));

        // RECV-BETA-30D: Beta Corp receivable, 30-day
        RWAToken recvBeta = new RWAToken(
            "Beta Receivable 30D",
            "RECV-BETA-30D",
            18,
            endpoint,
            rnEndpoint,
            userGovernance,
            300_000
        );
        console.log("RECV-BETA-30D:  ", address(recvBeta));

        // STABLE-USDr: Rayls stablecoin reserve
        RWAToken stableUsdr = new RWAToken(
            "Stable USDr",
            "STABLE-USDr",
            6,          // stablecoins typically 6 decimals
            endpoint,
            rnEndpoint,
            userGovernance,
            500_000
        );
        console.log("STABLE-USDr:    ", address(stableUsdr));

        vm.stopBroadcast();

        console.log("\n=== Copy these into .env ===");
        console.log("BOND_GOV_ADDRESS=", address(bondGov));
        console.log("RECV_ACME_ADDRESS=", address(recvAcme));
        console.log("RECV_BETA_ADDRESS=", address(recvBeta));
        console.log("STABLE_USDR_ADDRESS=", address(stableUsdr));
    }
}
