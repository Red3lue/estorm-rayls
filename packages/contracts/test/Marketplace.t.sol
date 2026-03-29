// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Marketplace} from "../src/Marketplace.sol";
import {MockERC20} from "./mocks/Mocks.sol";

contract MarketplaceTest is Test {
    Marketplace market;
    MockERC20   vaultShares;   // simulates VaultShareToken (SVS)
    MockERC20   receiptToken;  // simulates ReceiptToken (rPICASSO)

    address owner    = address(this);
    address investor = address(0xBEEF);
    address investor2 = address(0xCAFE);

    function setUp() public {
        market = new Marketplace(owner);

        vaultShares  = new MockERC20("SVS", 18);
        receiptToken = new MockERC20("rPICASSO", 18);

        // Owner holds tokens to list
        vaultShares.mint(owner, 1000e18);
        receiptToken.mint(owner, 5000e18);

        // Approve marketplace for escrow
        vaultShares.approve(address(market), type(uint256).max);
        receiptToken.approve(address(market), type(uint256).max);

        // Fund investors with USDr
        vm.deal(investor, 1000e18);
        vm.deal(investor2, 1000e18);
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    function test_constructor_setsOwner() public view {
        assertEq(market.owner(), owner);
    }

    function test_constructor_noListings() public view {
        assertEq(market.getListingCount(), 0);
        assertEq(market.getActiveListings().length, 0);
    }

    // ─── list ────────────────────────────────────────────────────────────────

    function test_list_vaultShares() public {
        uint256 id = market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 10e18);
        assertEq(id, 0);

        Marketplace.Listing memory l = market.getListing(0);
        assertEq(l.token, address(vaultShares));
        assertEq(l.amount, 100e18);
        assertEq(l.price, 10e18);
        assertTrue(l.active);
        assertEq(l.seller, owner);
    }

    function test_list_receiptToken() public {
        uint256 id = market.list(address(receiptToken), Marketplace.AssetType.ERC20, 0, 2000e18, 100e18);
        assertEq(id, 0);

        Marketplace.Listing memory l = market.getListing(0);
        assertEq(l.token, address(receiptToken));
        assertEq(l.amount, 2000e18);
    }

    function test_list_escrowsTokens() public {
        uint256 before = vaultShares.balanceOf(owner);
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 10e18);
        assertEq(vaultShares.balanceOf(owner), before - 100e18);
        assertEq(vaultShares.balanceOf(address(market)), 100e18);
    }

    function test_list_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit Marketplace.Listed(0, address(vaultShares), Marketplace.AssetType.ERC20, 100e18, 10e18);
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 10e18);
    }

    function test_list_onlyOwner() public {
        vm.prank(investor);
        vm.expectRevert();
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 10e18);
    }

    function test_list_zeroToken_reverts() public {
        vm.expectRevert("zero token");
        market.list(address(0), Marketplace.AssetType.ERC20, 0, 100e18, 10e18);
    }

    function test_list_zeroPrice_reverts() public {
        vm.expectRevert("zero price");
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 0);
    }

    function test_list_zeroAmount_reverts() public {
        vm.expectRevert("zero amount");
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 0, 10e18);
    }

    function test_list_multipleListings() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 10e18);
        market.list(address(receiptToken), Marketplace.AssetType.ERC20, 0, 500e18, 25e18);

        assertEq(market.getListingCount(), 2);
        uint256[] memory active = market.getActiveListings();
        assertEq(active.length, 2);
        assertEq(active[0], 0);
        assertEq(active[1], 1);
    }

    // ─── buy ─────────────────────────────────────────────────────────────────

    function test_buy_sendsTokensToBuyer() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);

        vm.prank(investor);
        market.buy{value: 50e18}(0);

        assertEq(vaultShares.balanceOf(investor), 100e18);
    }

    function test_buy_sendsPaymentToSeller() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);

        uint256 ownerBefore = owner.balance;
        vm.prank(investor);
        market.buy{value: 50e18}(0);

        assertEq(owner.balance, ownerBefore + 50e18);
    }

    function test_buy_deactivatesListing() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);

        vm.prank(investor);
        market.buy{value: 50e18}(0);

        Marketplace.Listing memory l = market.getListing(0);
        assertFalse(l.active);
        assertEq(market.getActiveListings().length, 0);
    }

    function test_buy_emitsEvent() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);

        vm.expectEmit(true, true, false, true);
        emit Marketplace.Bought(0, investor, 50e18);
        vm.prank(investor);
        market.buy{value: 50e18}(0);
    }

    function test_buy_insufficientPayment_reverts() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);

        vm.prank(investor);
        vm.expectRevert("insufficient payment");
        market.buy{value: 49e18}(0);
    }

    function test_buy_inactiveListing_reverts() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);
        market.delist(0);

        vm.prank(investor);
        vm.expectRevert("not active");
        market.buy{value: 50e18}(0);
    }

    function test_buy_invalidListing_reverts() public {
        vm.prank(investor);
        vm.expectRevert("invalid listing");
        market.buy{value: 50e18}(999);
    }

    function test_buy_overpayAccepted() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);

        uint256 ownerBefore = owner.balance;
        vm.prank(investor);
        market.buy{value: 75e18}(0);

        // Full overpayment goes to seller
        assertEq(owner.balance, ownerBefore + 75e18);
        assertEq(vaultShares.balanceOf(investor), 100e18);
    }

    // ─── delist ──────────────────────────────────────────────────────────────

    function test_delist_returnsTokensToSeller() public {
        uint256 before = vaultShares.balanceOf(owner);
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);
        assertEq(vaultShares.balanceOf(owner), before - 100e18);

        market.delist(0);
        assertEq(vaultShares.balanceOf(owner), before);
    }

    function test_delist_deactivatesListing() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);
        market.delist(0);

        assertFalse(market.getListing(0).active);
        assertEq(market.getActiveListings().length, 0);
    }

    function test_delist_emitsEvent() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);

        vm.expectEmit(true, false, false, true);
        emit Marketplace.Delisted(0);
        market.delist(0);
    }

    function test_delist_onlyOwner() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);

        vm.prank(investor);
        vm.expectRevert();
        market.delist(0);
    }

    function test_delist_alreadyInactive_reverts() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);
        market.delist(0);

        vm.expectRevert("not active");
        market.delist(0);
    }

    // ─── update ──────────────────────────────────────────────────────────────

    function test_update_changesPrice() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);
        market.update(0, 75e18);

        assertEq(market.getListing(0).price, 75e18);
    }

    function test_update_emitsEvent() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);

        vm.expectEmit(true, false, false, true);
        emit Marketplace.PriceUpdated(0, 50e18, 75e18);
        market.update(0, 75e18);
    }

    function test_update_onlyOwner() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);

        vm.prank(investor);
        vm.expectRevert();
        market.update(0, 75e18);
    }

    function test_update_zeroPrice_reverts() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);

        vm.expectRevert("zero price");
        market.update(0, 0);
    }

    // ─── getActiveListings ───────────────────────────────────────────────────

    function test_getActiveListings_updatesOnBuyAndDelist() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);
        market.list(address(receiptToken), Marketplace.AssetType.ERC20, 0, 500e18, 25e18);
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 200e18, 100e18);

        assertEq(market.getActiveListings().length, 3);

        // Buy listing 1
        vm.prank(investor);
        market.buy{value: 25e18}(1);
        assertEq(market.getActiveListings().length, 2);

        // Delist listing 0
        market.delist(0);
        assertEq(market.getActiveListings().length, 1);

        // Only listing 2 remains
        uint256[] memory active = market.getActiveListings();
        assertEq(active[0], 2);
    }

    // ─── Both token types ────────────────────────────────────────────────────

    function test_bothTokenTypes_listed() public {
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 100e18, 50e18);
        market.list(address(receiptToken), Marketplace.AssetType.ERC20, 0, 1000e18, 50e18);

        // Investor buys vault shares
        vm.prank(investor);
        market.buy{value: 50e18}(0);
        assertEq(vaultShares.balanceOf(investor), 100e18);

        // Investor2 buys receipt tokens
        vm.prank(investor2);
        market.buy{value: 50e18}(1);
        assertEq(receiptToken.balanceOf(investor2), 1000e18);
    }

    // ─── Full lifecycle ──────────────────────────────────────────────────────

    function test_fullLifecycle() public {
        // 1. Agent lists vault shares: 500 SVS at $50 total
        market.list(address(vaultShares), Marketplace.AssetType.ERC20, 0, 500e18, 50e18);

        // 2. Agent lists receipt tokens: 2000 rPICASSO at $100 total
        market.list(address(receiptToken), Marketplace.AssetType.ERC20, 0, 2000e18, 100e18);

        assertEq(market.getActiveListings().length, 2);

        // 3. Investor buys vault shares
        vm.prank(investor);
        market.buy{value: 50e18}(0);
        assertEq(vaultShares.balanceOf(investor), 500e18);

        // 4. Risk event — agent delists receipt tokens
        market.delist(1);
        assertEq(market.getActiveListings().length, 0);
        // Receipts returned to owner
        assertEq(receiptToken.balanceOf(owner), 5000e18);

        // 5. Agent relists at updated price
        receiptToken.approve(address(market), type(uint256).max);
        market.list(address(receiptToken), Marketplace.AssetType.ERC20, 0, 2000e18, 80e18);
        assertEq(market.getActiveListings().length, 1);
    }

    // Accept USDr for payment forwarding
    receive() external payable {}
}
