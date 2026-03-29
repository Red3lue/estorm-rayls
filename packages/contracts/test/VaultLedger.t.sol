// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {VaultLedger} from "../src/VaultLedger.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {MockDEX} from "../src/MockDEX.sol";
import {DvPExchange} from "../src/DvPExchange.sol";
import {MockERC20} from "./mocks/Mocks.sol";

contract VaultLedgerTest is Test {
    VaultLedger ledger;
    PriceOracle oracle;
    MockERC20   bond;
    MockERC20   recvA;
    MockERC20   stable;

    address owner = address(this);
    address alice = makeAddr("alice");

    address constant PICASSO = address(0x2001);
    address constant WARHOL  = address(0x2002);

    // bond:   18 dec, 1_000 tokens at $1_000 → $1_000_000 = 100_000_000 cents
    // recvA:  18 dec,   500 tokens at $1_000 → $500_000   =  50_000_000 cents
    // stable:  6 dec, 500_000 tokens at $1   → $500_000   =  50_000_000 cents
    // total NAV = 200_000_000 cents = $2_000_000
    uint256 constant BOND_PRICE    = 100_000; // cents per whole token
    uint256 constant RECV_PRICE    = 100_000;
    uint256 constant STABLE_PRICE  = 100;

    uint256 constant BOND_BALANCE   = 1_000e18;
    uint256 constant RECV_BALANCE   =   500e18;
    uint256 constant STABLE_BALANCE = 500_000e6;

    uint256 constant BOND_VALUE     = 1_000 * BOND_PRICE;          // 100_000_000
    uint256 constant RECV_VALUE     =   500 * RECV_PRICE;          //  50_000_000
    uint256 constant STABLE_VALUE   = 500_000 * STABLE_PRICE;      //  50_000_000
    uint256 constant TOTAL_NAV      = BOND_VALUE + RECV_VALUE + STABLE_VALUE; // 200_000_000

    function setUp() public {
        oracle = new PriceOracle(address(this));
        bond   = new MockERC20("BOND-GOV-6M", 18);
        recvA  = new MockERC20("RECV-ACME",   18);
        stable = new MockERC20("STABLE-USDr",  6);

        oracle.setPrice(address(bond),   BOND_PRICE);
        oracle.setPrice(address(recvA),  RECV_PRICE);
        oracle.setPrice(address(stable), STABLE_PRICE);

        ledger = new VaultLedger(owner, address(oracle));

        // Fund vault (tokens must be in vault before addERC20Asset)
        bond.mint(address(ledger),   BOND_BALANCE);
        recvA.mint(address(ledger),  RECV_BALANCE);
        stable.mint(address(ledger), STABLE_BALANCE);
    }

    // ─── addERC20Asset ───────────────────────────────────────────────────────

    function test_addERC20Asset_registersAsset() public {
        ledger.addERC20Asset(address(bond), "BOND-GOV-6M", 15, 420);
        (address addr, string memory sym,,,,,,, bool active) = ledger.erc20Assets(address(bond));
        assertEq(addr, address(bond));
        assertEq(sym,  "BOND-GOV-6M");
        assertTrue(active);
    }

    function test_addERC20Asset_readsBalanceFromChain() public {
        ledger.addERC20Asset(address(bond), "BOND-GOV-6M", 15, 420);
        (,,,uint256 bal,,,,, ) = ledger.erc20Assets(address(bond));
        assertEq(bal, BOND_BALANCE);
    }

    function test_addERC20Asset_derivesValueFromOracle() public {
        ledger.addERC20Asset(address(bond), "BOND-GOV-6M", 15, 420);
        (,,,,uint256 val,,,, ) = ledger.erc20Assets(address(bond));
        assertEq(val, BOND_VALUE);
    }

    function test_addERC20Asset_revertsOnDuplicate() public {
        ledger.addERC20Asset(address(bond), "BOND-GOV-6M", 15, 420);
        vm.expectRevert("already registered");
        ledger.addERC20Asset(address(bond), "BOND-GOV-6M", 15, 420);
    }

    function test_addERC20Asset_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        ledger.addERC20Asset(address(bond), "BOND-GOV-6M", 15, 420);
    }

    // ─── getNAV ──────────────────────────────────────────────────────────────

    function test_getNAV_empty() public view {
        assertEq(ledger.getNAV(), 0);
    }

    function test_getNAV_singleAsset() public {
        ledger.addERC20Asset(address(bond), "BOND-GOV-6M", 15, 420);
        assertEq(ledger.getNAV(), BOND_VALUE);
    }

    function test_getNAV_multipleAssets() public {
        ledger.addERC20Asset(address(bond),   "BOND-GOV-6M",   15,  420);
        ledger.addERC20Asset(address(recvA),  "RECV-ACME-90D", 55, 1100);
        ledger.addERC20Asset(address(stable), "STABLE-USDr",    0,    0);
        assertEq(ledger.getNAV(), TOTAL_NAV);
    }

    // ─── updatePortfolio ─────────────────────────────────────────────────────

    function test_updatePortfolio_refreshesFromChain() public {
        ledger.addERC20Asset(address(bond),  "BOND-GOV-6M",   15,  420);
        ledger.addERC20Asset(address(recvA), "RECV-ACME-90D", 55, 1100);

        // Simulate a trade: vault gets 200 more bond, loses 100 recvA
        bond.mint(address(ledger),  200e18);
        recvA.burn(address(ledger), 100e18);

        address[] memory addrs  = new address[](2);
        uint8[]   memory risks  = new uint8[](2);
        uint256[] memory yields = new uint256[](2);
        addrs[0]  = address(bond);  risks[0]  = 12; yields[0] = 450;
        addrs[1]  = address(recvA); risks[1]  = 60; yields[1] = 900;

        ledger.updatePortfolio(addrs, risks, yields);

        // bond: 1200 * 100_000 = 120_000_000
        // recvA: 400 * 100_000 = 40_000_000
        assertEq(ledger.getNAV(), (1_200 * BOND_PRICE) + (400 * RECV_PRICE));
        assertGt(ledger.lastUpdated(), 0);
    }

    function test_updatePortfolio_emitsEvent() public {
        ledger.addERC20Asset(address(bond), "BOND-GOV-6M", 15, 420);
        address[] memory addrs  = new address[](1);
        uint8[]   memory risks  = new uint8[](1);
        uint256[] memory yields = new uint256[](1);
        addrs[0] = address(bond); risks[0] = 15; yields[0] = 420;

        vm.expectEmit(false, false, false, false);
        emit VaultLedger.PortfolioUpdated(0, 0);
        ledger.updatePortfolio(addrs, risks, yields);
    }

    function test_updatePortfolio_revertsOnUnknownAsset() public {
        address[] memory addrs  = new address[](1);
        uint8[]   memory risks  = new uint8[](1);
        uint256[] memory yields = new uint256[](1);
        addrs[0] = address(bond);
        vm.expectRevert("unknown asset");
        ledger.updatePortfolio(addrs, risks, yields);
    }

    // ─── getAssetValue / getTokenValue ───────────────────────────────────────

    function test_getAssetValue_liveBalance() public view {
        // bond not registered yet, falls back to token.decimals()
        uint256 val = ledger.getAssetValue(address(bond));
        assertEq(val, BOND_VALUE);
    }

    function test_getTokenValue() public view {
        uint256 val = ledger.getTokenValue(address(bond), 100e18);
        assertEq(val, 100 * BOND_PRICE); // 100 tokens * $1000 = $100,000
    }

    // ─── swap ────────────────────────────────────────────────────────────────

    function test_swap_updatesBalances() public {
        ledger.addERC20Asset(address(bond),   "BOND-GOV-6M",  15,  420);
        ledger.addERC20Asset(address(stable), "STABLE-USDr",   0,    0);

        MockDEX dex = new MockDEX();
        // Pre-fund DEX with stable reserves
        stable.mint(address(dex), 100_000e6);

        // Sell 100 bond for 10_000 stable
        ledger.swap(address(bond), 100e18, address(stable), 10_000e6, address(dex));

        assertEq(bond.balanceOf(address(ledger)),   BOND_BALANCE   - 100e18);
        assertEq(stable.balanceOf(address(ledger)), STABLE_BALANCE + 10_000e6);
    }

    function test_swap_revertsUnregisteredToken() public {
        ledger.addERC20Asset(address(bond), "BOND-GOV-6M", 15, 420);
        vm.expectRevert("tokenOut not registered");
        ledger.swap(address(bond), 100e18, address(stable), 10_000e6, address(0xDEA));
    }

    // ─── addERC721Asset ──────────────────────────────────────────────────────

    function test_addERC721Asset() public {
        ledger.addERC721Asset(PICASSO, 1, "ART-PICASSO-01", 50_000_000_00, 20);
        assertEq(ledger.getERC721Count(), 1);
    }

    function test_addERC721Asset_revertsOnDuplicate() public {
        ledger.addERC721Asset(PICASSO, 1, "ART-PICASSO-01", 50_000_000_00, 20);
        vm.expectRevert("already registered");
        ledger.addERC721Asset(PICASSO, 1, "ART-PICASSO-01", 50_000_000_00, 20);
    }

    function test_addERC721Asset_differentTokenIds() public {
        ledger.addERC721Asset(PICASSO, 1, "ART-PICASSO-01", 50_000_000_00, 20);
        ledger.addERC721Asset(PICASSO, 2, "ART-PICASSO-02", 30_000_000_00, 22);
        assertEq(ledger.getERC721Count(), 2);
    }

    // ─── updateERC721 ────────────────────────────────────────────────────────

    function test_updateERC721_certify() public {
        ledger.addERC721Asset(PICASSO, 1, "ART-PICASSO-01", 50_000_000_00, 20);
        ledger.updateERC721(PICASSO, 1, 55_000_000_00, true, 85, 18);
        bytes32 key = keccak256(abi.encodePacked(PICASSO, uint256(1)));
        (,,, uint256 val, bool cert, uint8 score, uint8 risk,) = ledger.erc721Assets(key);
        assertEq(val,  55_000_000_00);
        assertTrue(cert);
        assertEq(score, 85);
        assertEq(risk,  18);
    }

    function test_updateERC721_emitsEvent() public {
        ledger.addERC721Asset(PICASSO, 1, "ART-PICASSO-01", 50_000_000_00, 20);
        vm.expectEmit(true, true, false, true);
        emit VaultLedger.ERC721Updated(PICASSO, 1, 55_000_000_00, true);
        ledger.updateERC721(PICASSO, 1, 55_000_000_00, true, 85, 18);
    }

    function test_updateERC721_revertsOnUnknown() public {
        vm.expectRevert("unknown nft");
        ledger.updateERC721(PICASSO, 99, 0, false, 0, 0);
    }

    // ─── getVaultSnapshot ────────────────────────────────────────────────────

    function test_getVaultSnapshot() public {
        ledger.addERC20Asset(address(bond),   "BOND-GOV-6M",   15, 420);
        ledger.addERC20Asset(address(stable), "STABLE-USDr",    0,   0);
        ledger.addERC721Asset(PICASSO, 1, "ART-PICASSO-01", 50_000_000_00, 20);
        ledger.addERC721Asset(WARHOL,  1, "ART-WARHOL-01",  25_000_000_00, 25);

        (VaultLedger.ERC20Asset[] memory fungible, VaultLedger.ERC721Asset[] memory nfts) =
            ledger.getVaultSnapshot();

        assertEq(fungible.length, 2);
        assertEq(nfts.length,     2);
        assertEq(fungible[0].symbol, "BOND-GOV-6M");
        assertEq(nfts[0].symbol,     "ART-PICASSO-01");
    }

    // ─── allocationPct ───────────────────────────────────────────────────────

    function test_allocationPctRecomputed() public {
        // BOND $1M, RECV $500K, STABLE $500K → total $2M
        // BOND = 100M/200M * 100 = 50%, RECV = 25%, STABLE = 25%
        ledger.addERC20Asset(address(bond),   "BOND-GOV-6M",   15,  420);
        ledger.addERC20Asset(address(recvA),  "RECV-ACME-90D", 55, 1100);
        ledger.addERC20Asset(address(stable), "STABLE-USDr",    0,    0);

        (,,,,, uint8 pct,,,) = ledger.erc20Assets(address(bond));
        assertEq(pct, 50);
    }

    // ─── recordTrade / getTradeHistory ───────────────────────────────────────

    function test_recordTrade() public {
        ledger.addERC20Asset(address(bond), "BOND-GOV-6M", 15, 420);
        ledger.recordTrade(VaultLedger.TradeAction.REBALANCE, "Yield rebalance", ledger.getNAV(), 3, false);
        assertEq(ledger.getTradeCount(), 1);
    }

    function test_recordTrade_storesFields() public {
        ledger.recordTrade(VaultLedger.TradeAction.CERTIFY, "Picasso certified", 0, 4, true);
        VaultLedger.TradeRecord[] memory history = ledger.getTradeHistory();
        assertEq(history.length,            1);
        assertEq(history[0].description,    "Picasso certified");
        assertEq(history[0].quorumVotes,    4);
        assertTrue(history[0].humanApproved);
        assertGt(history[0].timestamp,      0);
    }

    function test_recordTrade_emitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit VaultLedger.TradeRecorded(0, VaultLedger.TradeAction.REBALANCE, 0, false);
        ledger.recordTrade(VaultLedger.TradeAction.REBALANCE, "test", 0, 3, false);
    }

    function test_getTradeHistory_publiclyReadable() public {
        ledger.recordTrade(VaultLedger.TradeAction.REBALANCE, "r1", 0, 3, false);
        vm.prank(alice);
        VaultLedger.TradeRecord[] memory history = ledger.getTradeHistory();
        assertEq(history.length, 1);
    }

    function test_multipleTradeRecords() public {
        ledger.recordTrade(VaultLedger.TradeAction.REBALANCE, "r1",  0, 3, false);
        ledger.recordTrade(VaultLedger.TradeAction.CERTIFY,   "c1",  0, 4, true);
        ledger.recordTrade(VaultLedger.TradeAction.ISSUE,     "i1",  0, 4, false);
        assertEq(ledger.getTradeCount(), 3);
        VaultLedger.TradeRecord[] memory h = ledger.getTradeHistory();
        assertEq(uint8(h[1].action), uint8(VaultLedger.TradeAction.CERTIFY));
    }

    // ─── createDvPExchange ──────────────────────────────────────────────────

    function test_createDvPExchange_escrrowsBond() public {
        ledger.addERC20Asset(address(bond),   "BOND-GOV-6M",  15,  420);
        ledger.addERC20Asset(address(stable), "STABLE-USDr",   0,    0);

        DvPExchange dvp = new DvPExchange();
        address counterparty = makeAddr("cp");

        uint256 amountIn = 100e18;
        uint256 amountOut = 10_000e6;
        uint256 expiration = block.timestamp + 1 hours;

        uint256 bondBefore = bond.balanceOf(address(ledger));

        ledger.createDvPExchange(
            address(bond), amountIn, counterparty,
            address(stable), amountOut, address(dvp), expiration
        );

        // Bond moved from vault to DvP escrow
        assertEq(bond.balanceOf(address(ledger)), bondBefore - amountIn);
        assertEq(bond.balanceOf(address(dvp)),    amountIn);
    }

    function test_createDvPExchange_returnsExchangeId() public {
        ledger.addERC20Asset(address(bond),   "BOND-GOV-6M",  15,  420);
        ledger.addERC20Asset(address(stable), "STABLE-USDr",   0,    0);

        DvPExchange dvp = new DvPExchange();
        uint256 id = ledger.createDvPExchange(
            address(bond), 100e18, makeAddr("cp"),
            address(stable), 10_000e6, address(dvp), block.timestamp + 1 hours
        );
        assertEq(id, 0);
    }

    function test_createDvPExchange_refreshesNAV() public {
        ledger.addERC20Asset(address(bond),   "BOND-GOV-6M",  15,  420);
        ledger.addERC20Asset(address(stable), "STABLE-USDr",   0,    0);

        uint256 navBefore = ledger.getNAV();
        DvPExchange dvp = new DvPExchange();

        ledger.createDvPExchange(
            address(bond), 100e18, makeAddr("cp"),
            address(stable), 10_000e6, address(dvp), block.timestamp + 1 hours
        );

        // NAV should drop by value of 100 bond tokens
        uint256 navAfter = ledger.getNAV();
        assertLt(navAfter, navBefore);
        assertEq(navBefore - navAfter, 100 * BOND_PRICE);
    }

    function test_createDvPExchange_thenCounterpartySettles() public {
        ledger.addERC20Asset(address(bond),   "BOND-GOV-6M",  15,  420);
        ledger.addERC20Asset(address(stable), "STABLE-USDr",   0,    0);

        DvPExchange dvp = new DvPExchange();
        address cp = makeAddr("cp");
        uint256 amountIn  = 100e18;
        uint256 amountOut = 10_000e6;

        // Fund counterparty with stable
        stable.mint(cp, amountOut);
        vm.prank(cp);
        stable.approve(address(dvp), amountOut);

        uint256 stableBefore = stable.balanceOf(address(ledger));

        uint256 id = ledger.createDvPExchange(
            address(bond), amountIn, cp,
            address(stable), amountOut, address(dvp), block.timestamp + 1 hours
        );

        // Counterparty settles the exchange
        vm.prank(cp);
        dvp.executeExchange(id);

        // Counterparty got the bond tokens
        assertEq(bond.balanceOf(cp), amountIn);
        // Vault DIDN'T get stable (beneficiary was set to cp in this test path)
        // Actually, beneficiary is address(ledger) in createDvPExchange
        // Wait - let me check. createDvPExchange sets beneficiary = address(this) = ledger
        // But counterparty is set to `cp` — the counterparty calls execute.
        // Leg 1: pull counterpartyAsset from executor(cp) → send to beneficiary(ledger)
        // Leg 2: release creatorAsset from escrow → send to executor(cp)
        assertEq(stable.balanceOf(address(ledger)), stableBefore + amountOut);
        assertEq(bond.balanceOf(cp), amountIn);
    }

    function test_createDvPExchange_unregisteredToken_reverts() public {
        ledger.addERC20Asset(address(bond), "BOND-GOV-6M", 15, 420);
        DvPExchange dvp = new DvPExchange();
        vm.expectRevert("tokenOut not registered");
        ledger.createDvPExchange(
            address(bond), 100e18, makeAddr("cp"),
            address(stable), 10_000e6, address(dvp), block.timestamp + 1 hours
        );
    }

    function test_createDvPExchange_onlyOwner() public {
        ledger.addERC20Asset(address(bond),   "BOND-GOV-6M",  15,  420);
        ledger.addERC20Asset(address(stable), "STABLE-USDr",   0,    0);
        DvPExchange dvp = new DvPExchange();

        vm.prank(alice);
        vm.expectRevert();
        ledger.createDvPExchange(
            address(bond), 100e18, makeAddr("cp"),
            address(stable), 10_000e6, address(dvp), block.timestamp + 1 hours
        );
    }
}
