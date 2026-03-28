// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VaultLedger} from "../src/VaultLedger.sol";
import {PriceOracle} from "../src/PriceOracle.sol";

/// @dev Run AFTER Phase 2A.1 tokens are deployed.
///      forge script script/DeployVaultLedger.s.sol --rpc-url privacy_node --broadcast --legacy
///
///      Required env vars:
///        DEPLOYER_PRIVATE_KEY, BOND_GOV_ADDRESS, RECV_ACME_ADDRESS, RECV_BETA_ADDRESS,
///        STABLE_USDR_ADDRESS, PICASSO_NFT_ADDRESS, WARHOL_NFT_ADDRESS
///
///      Flow:
///        1. Deploy PriceOracle (owned by deployer/manager)
///        2. Set token prices
///        3. Deploy VaultLedger with oracle
///        4. Transfer ERC-20 tokens from deployer → VaultLedger
///        5. Register assets (reads balanceOf + oracle price on-chain)
///        6. Register ERC-721 art assets
///
///      VaultLedger ownership is transferred to VaultPolicy in DeployVaultPolicy.s.sol

interface IERC20Transfer {
    function transfer(address to, uint256 amount) external returns (bool);
}

contract DeployVaultLedger is Script {
    function run() external {
        uint256 deployerKey  = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerAddr = vm.addr(deployerKey);

        address bondGov    = vm.envAddress("BOND_GOV_ADDRESS");
        address recvAcme   = vm.envAddress("RECV_ACME_ADDRESS");
        address recvBeta   = vm.envAddress("RECV_BETA_ADDRESS");
        address stableUsdr = vm.envAddress("STABLE_USDR_ADDRESS");
        address picasso    = vm.envAddress("PICASSO_NFT_ADDRESS");
        address warhol     = vm.envAddress("WARHOL_NFT_ADDRESS");

        vm.startBroadcast(deployerKey);

        // ── 1. Deploy PriceOracle ───────────────────────────────────────────
        PriceOracle oracle = new PriceOracle(deployerAddr);

        // Prices in USD cents per 1 whole token
        // BOND-GOV-6M:  $1 000 → 100_000
        // RECV-ACME-90D: $500  →  50_000
        // RECV-BETA-30D: $500  →  50_000
        // STABLE-USDr:     $1  →     100
        oracle.setPrice(bondGov,    100_000);
        oracle.setPrice(recvAcme,    50_000);
        oracle.setPrice(recvBeta,    50_000);
        oracle.setPrice(stableUsdr,     100);

        // ── 2. Deploy VaultLedger ───────────────────────────────────────────
        // Owned by deployer for now; ownership transferred to VaultPolicy later
        VaultLedger ledger = new VaultLedger(deployerAddr, address(oracle));

        // ── 3. Fund VaultLedger with ERC-20 tokens ──────────────────────────
        // Deployer received initial supply in Phase 2A.1 constructor mints
        IERC20Transfer(bondGov).transfer(address(ledger),    350_000 * 1e18);
        IERC20Transfer(recvAcme).transfer(address(ledger),   200_000 * 1e18);
        IERC20Transfer(recvBeta).transfer(address(ledger),   150_000 * 1e18);
        IERC20Transfer(stableUsdr).transfer(address(ledger), 200_000 * 1e6);

        // ── 4. Register ERC-20 assets (reads balanceOf + oracle price) ──────
        ledger.addERC20Asset(bondGov,    "BOND-GOV-6M",   15,  420);
        ledger.addERC20Asset(recvAcme,   "RECV-ACME-90D", 55, 1100);
        ledger.addERC20Asset(recvBeta,   "RECV-BETA-30D", 45,  800);
        ledger.addERC20Asset(stableUsdr, "STABLE-USDr",    0,    0);

        // ── 5. Register ERC-721 art assets (valuation set by manager) ───────
        ledger.addERC721Asset(picasso, 1, "ART-PICASSO-01", 50_000_000_00, 20);
        ledger.addERC721Asset(warhol,  1, "ART-WARHOL-01",  25_000_000_00, 25);

        vm.stopBroadcast();

        console.log("PriceOracle:     ", address(oracle));
        console.log("VaultLedger:     ", address(ledger));
        console.log("NAV (cents):     ", ledger.getNAV());
        console.log("\n=== Copy into .env ===");
        console.log("PRICE_ORACLE_ADDRESS=", address(oracle));
        console.log("VAULT_LEDGER_ADDRESS=", address(ledger));
    }
}
