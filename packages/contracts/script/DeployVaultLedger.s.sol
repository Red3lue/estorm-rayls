// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VaultLedger} from "../src/VaultLedger.sol";

/// @dev Run: forge script script/DeployVaultLedger.s.sol --rpc-url privacy_node --broadcast --legacy
contract DeployVaultLedger is Script {
    function run() external {
        uint256 deployerKey  = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerAddr = vm.addr(deployerKey);

        // Token addresses (deployed in Phase 2A.1)
        address bondGov    = vm.envAddress("BOND_GOV_ADDRESS");
        address recvAcme   = vm.envAddress("RECV_ACME_ADDRESS");
        address recvBeta   = vm.envAddress("RECV_BETA_ADDRESS");
        address stableUsdr = vm.envAddress("STABLE_USDR_ADDRESS");
        address picasso    = vm.envAddress("PICASSO_NFT_ADDRESS");
        address warhol     = vm.envAddress("WARHOL_NFT_ADDRESS");

        vm.startBroadcast(deployerKey);

        VaultLedger ledger = new VaultLedger(deployerAddr);

        // ── Register ERC-20 assets ──────────────────────────────────────────
        // valueUSD in cents, yieldBps in basis points
        ledger.addERC20Asset(bondGov,    "BOND-GOV-6M",   350_000 * 1e18, 35_000_000_00, 15,  420);
        ledger.addERC20Asset(recvAcme,   "RECV-ACME-90D", 200_000 * 1e18, 20_000_000_00, 55, 1100);
        ledger.addERC20Asset(recvBeta,   "RECV-BETA-30D", 150_000 * 1e18, 15_000_000_00, 45,  800);
        ledger.addERC20Asset(stableUsdr, "STABLE-USDr",   200_000 * 1e6,  20_000_000_00,  0,    0);

        // ── Register ERC-721 assets ─────────────────────────────────────────
        ledger.addERC721Asset(picasso, 1, "ART-PICASSO-01", 50_000_000_00, 20);
        ledger.addERC721Asset(warhol,  1, "ART-WARHOL-01",  25_000_000_00, 25);

        vm.stopBroadcast();

        console.log("VaultLedger:    ", address(ledger));
        console.log("NAV (cents):    ", ledger.getNAV());
        console.log("\n=== Copy into .env ===");
        console.log("VAULT_LEDGER_ADDRESS=", address(ledger));
    }
}
