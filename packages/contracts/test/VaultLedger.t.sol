// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {VaultLedger} from "../src/VaultLedger.sol";

contract VaultLedgerTest is Test {
    VaultLedger ledger;
    address owner = address(this);
    address agent = makeAddr("agent");
    address alice = makeAddr("alice");

    // Fake token addresses
    address constant BOND     = address(0x1001);
    address constant RECV_A   = address(0x1002);
    address constant STABLE   = address(0x1003);
    address constant PICASSO  = address(0x2001);
    address constant WARHOL   = address(0x2002);

    function setUp() public {
        ledger = new VaultLedger(owner);
    }

    // ─── addERC20Asset ───────────────────────────────────────────────────────

    function test_addERC20Asset() public {
        ledger.addERC20Asset(BOND, "BOND-GOV-6M", 350_000e18, 35_000_000_00, 15, 420);
        (address addr, string memory sym,,,,,, bool active) = ledger.erc20Assets(BOND);
        assertEq(addr, BOND);
        assertEq(sym, "BOND-GOV-6M");
        assertTrue(active);
    }

    function test_addERC20Asset_revertsOnDuplicate() public {
        ledger.addERC20Asset(BOND, "BOND-GOV-6M", 350_000e18, 35_000_000_00, 15, 420);
        vm.expectRevert("already registered");
        ledger.addERC20Asset(BOND, "BOND-GOV-6M", 350_000e18, 35_000_000_00, 15, 420);
    }

    function test_addERC20Asset_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        ledger.addERC20Asset(BOND, "BOND-GOV-6M", 350_000e18, 35_000_000_00, 15, 420);
    }

    // ─── getNAV ──────────────────────────────────────────────────────────────

    function test_getNAV_empty() public view {
        assertEq(ledger.getNAV(), 0);
    }

    function test_getNAV_singleAsset() public {
        ledger.addERC20Asset(BOND, "BOND-GOV-6M", 350_000e18, 35_000_000_00, 15, 420);
        assertEq(ledger.getNAV(), 35_000_000_00);
    }

    function test_getNAV_multipleAssets() public {
        ledger.addERC20Asset(BOND,   "BOND-GOV-6M",   350_000e18, 35_000_000_00, 15,  420);
        ledger.addERC20Asset(RECV_A, "RECV-ACME-90D", 200_000e18, 20_000_000_00, 55, 1100);
        ledger.addERC20Asset(STABLE, "STABLE-USDr",   200_000e6,  20_000_000_00,  0,    0);
        assertEq(ledger.getNAV(), 75_000_000_00);
    }

    // ─── updatePortfolio ─────────────────────────────────────────────────────

    function test_updatePortfolio() public {
        ledger.addERC20Asset(BOND,   "BOND-GOV-6M",   350_000e18, 35_000_000_00, 15,  420);
        ledger.addERC20Asset(RECV_A, "RECV-ACME-90D", 200_000e18, 20_000_000_00, 55, 1100);

        address[] memory addrs   = new address[](2);
        uint256[] memory bals    = new uint256[](2);
        uint256[] memory vals    = new uint256[](2);
        uint8[]   memory risks   = new uint8[](2);
        uint256[] memory yields  = new uint256[](2);

        addrs[0] = BOND;   bals[0] = 400_000e18; vals[0] = 40_000_000_00; risks[0] = 12; yields[0] = 450;
        addrs[1] = RECV_A; bals[1] = 150_000e18; vals[1] = 15_000_000_00; risks[1] = 60; yields[1] = 900;

        ledger.updatePortfolio(addrs, bals, vals, risks, yields);

        assertEq(ledger.getNAV(),      55_000_000_00);
        assertEq(ledger.lastNAV(),     55_000_000_00);
        assertGt(ledger.lastUpdated(), 0);
    }

    function test_updatePortfolio_emitsEvent() public {
        ledger.addERC20Asset(BOND, "BOND-GOV-6M", 350_000e18, 35_000_000_00, 15, 420);

        address[] memory addrs  = new address[](1);
        uint256[] memory bals   = new uint256[](1);
        uint256[] memory vals   = new uint256[](1);
        uint8[]   memory risks  = new uint8[](1);
        uint256[] memory yields = new uint256[](1);
        addrs[0] = BOND; bals[0] = 350_000e18; vals[0] = 36_000_000_00; risks[0] = 15; yields[0] = 420;

        vm.expectEmit(false, false, false, false);
        emit VaultLedger.PortfolioUpdated(0, 0);
        ledger.updatePortfolio(addrs, bals, vals, risks, yields);
    }

    function test_updatePortfolio_revertsOnUnknownAsset() public {
        address[] memory addrs  = new address[](1);
        uint256[] memory bals   = new uint256[](1);
        uint256[] memory vals   = new uint256[](1);
        uint8[]   memory risks  = new uint8[](1);
        uint256[] memory yields = new uint256[](1);
        addrs[0] = BOND;
        vm.expectRevert("unknown asset");
        ledger.updatePortfolio(addrs, bals, vals, risks, yields);
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

    function test_addERC721Asset_differentTokenIdsSameAddress() public {
        ledger.addERC721Asset(PICASSO, 1, "ART-PICASSO-01", 50_000_000_00, 20);
        ledger.addERC721Asset(PICASSO, 2, "ART-PICASSO-02", 30_000_000_00, 22);
        assertEq(ledger.getERC721Count(), 2);
    }

    // ─── updateERC721 ────────────────────────────────────────────────────────

    function test_updateERC721_certify() public {
        ledger.addERC721Asset(PICASSO, 1, "ART-PICASSO-01", 50_000_000_00, 20);
        ledger.updateERC721(PICASSO, 1, 55_000_000_00, true, 85, 18);

        bytes32 key = keccak256(abi.encodePacked(PICASSO, uint256(1)));
        (,, , uint256 val, bool cert, uint8 score, uint8 risk,) = ledger.erc721Assets(key);
        assertEq(val,   55_000_000_00);
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
        ledger.addERC20Asset(BOND,   "BOND-GOV-6M",   350_000e18, 35_000_000_00, 15, 420);
        ledger.addERC20Asset(STABLE, "STABLE-USDr",   200_000e6,  20_000_000_00,  0,   0);
        ledger.addERC721Asset(PICASSO, 1, "ART-PICASSO-01", 50_000_000_00, 20);
        ledger.addERC721Asset(WARHOL,  1, "ART-WARHOL-01",  25_000_000_00, 25);

        (VaultLedger.ERC20Asset[] memory fungible, VaultLedger.ERC721Asset[] memory nfts) =
            ledger.getVaultSnapshot();

        assertEq(fungible.length, 2);
        assertEq(nfts.length,     2);
        assertEq(fungible[0].symbol, "BOND-GOV-6M");
        assertEq(nfts[0].symbol,     "ART-PICASSO-01");
    }

    // ─── recordTrade / getTradeHistory ───────────────────────────────────────

    function test_recordTrade() public {
        ledger.addERC20Asset(BOND, "BOND-GOV-6M", 350_000e18, 35_000_000_00, 15, 420);
        uint256 navBefore = ledger.getNAV();
        ledger.recordTrade(VaultLedger.TradeAction.REBALANCE, "Yield rebalance: bonds +5%", navBefore, 3, false);
        assertEq(ledger.getTradeCount(), 1);
    }

    function test_recordTrade_storesFields() public {
        ledger.addERC20Asset(BOND, "BOND-GOV-6M", 350_000e18, 35_000_000_00, 15, 420);
        ledger.recordTrade(VaultLedger.TradeAction.CERTIFY, "Picasso certified", 0, 4, true);
        VaultLedger.TradeRecord[] memory history = ledger.getTradeHistory();
        assertEq(history.length,           1);
        assertEq(history[0].description,   "Picasso certified");
        assertEq(history[0].quorumVotes,   4);
        assertTrue(history[0].humanApproved);
        assertGt(history[0].timestamp,     0);
    }

    function test_recordTrade_emitsEvent() public {
        ledger.addERC20Asset(BOND, "BOND-GOV-6M", 350_000e18, 35_000_000_00, 15, 420);
        vm.expectEmit(true, false, false, false);
        emit VaultLedger.TradeRecorded(0, VaultLedger.TradeAction.REBALANCE, 0, false);
        ledger.recordTrade(VaultLedger.TradeAction.REBALANCE, "test", 0, 3, false);
    }

    function test_getTradeHistory_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        ledger.getTradeHistory();
    }

    function test_multipleTradeRecords() public {
        ledger.addERC20Asset(BOND, "BOND-GOV-6M", 350_000e18, 35_000_000_00, 15, 420);
        ledger.recordTrade(VaultLedger.TradeAction.REBALANCE, "Rebalance 1", 0, 3, false);
        ledger.recordTrade(VaultLedger.TradeAction.CERTIFY,   "Certify art", 0, 4, true);
        ledger.recordTrade(VaultLedger.TradeAction.ISSUE,     "Issue receipt", 0, 4, false);
        assertEq(ledger.getTradeCount(), 3);
        VaultLedger.TradeRecord[] memory h = ledger.getTradeHistory();
        assertEq(uint8(h[1].action), uint8(VaultLedger.TradeAction.CERTIFY));
    }

    // ─── allocation pct ──────────────────────────────────────────────────────

    function test_allocationPctRecomputed() public {
        // $350K + $200K + $200K = $750K. BOND = 46%, RECV = 26%, STABLE = 26%
        ledger.addERC20Asset(BOND,   "BOND-GOV-6M",   350_000e18, 35_000_000_00, 15, 420);
        ledger.addERC20Asset(RECV_A, "RECV-ACME-90D", 200_000e18, 20_000_000_00, 55, 1100);
        ledger.addERC20Asset(STABLE, "STABLE-USDr",   200_000e6,  20_000_000_00,  0,    0);

        (,,,, uint8 pct,,,) = ledger.erc20Assets(BOND);
        assertEq(pct, 46); // 35/75 * 100 = 46 (integer division)
    }
}
