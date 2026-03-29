// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {VaultShareToken} from "../src/VaultShareToken.sol";

contract VaultShareTokenTest is Test {
    VaultShareToken token;
    address owner = address(this);
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    // All monetary values in 18-decimal USDr (1e18 = $1.00)
    // NAV starts at 0 — grows as investors buy and agent deploys capital
    uint256 constant INITIAL_NAV   = 0;
    uint256 constant INITIAL_PRICE = 10e18; // $10.00 per share

    function setUp() public {
        token = new VaultShareToken(owner, INITIAL_NAV, INITIAL_PRICE);
        vm.deal(alice, 10_000e18);
        vm.deal(bob,   10_000e18);
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    function test_constructor_setsOwner() public view {
        assertEq(token.owner(), owner);
    }

    function test_constructor_setsNAV() public view {
        assertEq(token.getNAV(), INITIAL_NAV);
    }

    function test_constructor_noInitialSupply() public view {
        assertEq(token.totalSupply(), 0);
    }

    function test_constructor_setsName() public view {
        assertEq(token.name(), "Sovereign Vault Share");
        assertEq(token.symbol(), "SVS");
    }

    function test_constructor_zeroPrice_reverts() public {
        vm.expectRevert("zero share price");
        new VaultShareToken(owner, 0, 0);
    }

    // ─── getSharePrice ───────────────────────────────────────────────────────

    function test_getSharePrice_noSupply_returnsInitial() public view {
        assertEq(token.getSharePrice(), INITIAL_PRICE);
    }

    function test_getSharePrice_afterBuyAndNAVUpdate() public {
        // Alice buys $100 → 10 shares at $10
        vm.prank(alice);
        token.buy{value: 100e18}();
        assertEq(token.totalSupply(), 10e18);

        // Agent deploys the $100 into vault, updates NAV
        token.updateNAV(100e18);

        // price = 100e18 * 1e18 / 10e18 = 10e18 ($10)
        assertEq(token.getSharePrice(), 10e18);
    }

    // ─── updateNAV ───────────────────────────────────────────────────────────

    function test_updateNAV_changesNAV() public {
        token.updateNAV(500_000e18);
        assertEq(token.getNAV(), 500_000e18);
    }

    function test_updateNAV_emitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit VaultShareToken.NAVUpdated(INITIAL_NAV, 500_000e18, token.getSharePrice(), block.timestamp);
        token.updateNAV(500_000e18);
    }

    function test_updateNAV_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.updateNAV(500_000e18);
    }

    function test_updateNAV_changesSharePrice() public {
        // Alice buys $1000 → 100 shares
        vm.prank(alice);
        token.buy{value: 1000e18}();
        token.updateNAV(1000e18);

        uint256 priceBefore = token.getSharePrice(); // $10

        // Vault assets appreciate 10%
        token.updateNAV(1100e18);

        uint256 priceAfter = token.getSharePrice(); // $11
        assertGt(priceAfter, priceBefore);
        assertEq(priceAfter, 11e18);
    }

    // ─── buy ─────────────────────────────────────────────────────────────────

    function test_buy_mintsShares() public {
        // $100 at $10/share = 10 shares
        vm.prank(alice);
        token.buy{value: 100e18}();
        assertEq(token.balanceOf(alice), 10e18);
    }

    function test_buy_zeroPayment_reverts() public {
        vm.prank(alice);
        vm.expectRevert("zero payment");
        token.buy{value: 0}();
    }

    function test_buy_forwardsPaymentToOwner() public {
        uint256 ownerBefore = owner.balance;
        vm.prank(alice);
        token.buy{value: 200e18}();
        assertEq(owner.balance, ownerBefore + 200e18);
    }

    function test_buy_emitsEvent() public {
        uint256 price = token.getSharePrice();
        uint256 expectedShares = (100e18 * 1e18) / price;
        vm.expectEmit(true, false, false, true);
        emit VaultShareToken.SharesPurchased(alice, 100e18, expectedShares, price);
        vm.prank(alice);
        token.buy{value: 100e18}();
    }

    function test_buy_multipleBuyers_samePrice() public {
        // Alice buys $100 → 10 shares
        vm.prank(alice);
        token.buy{value: 100e18}();

        // Agent updates NAV to reflect new capital
        token.updateNAV(100e18);

        // Bob buys $200 at same price ($10) → 20 shares
        vm.prank(bob);
        token.buy{value: 200e18}();

        assertEq(token.balanceOf(alice), 10e18);
        assertEq(token.balanceOf(bob), 20e18);
    }

    // ─── ERC-20 Standard ─────────────────────────────────────────────────────

    function test_transfer() public {
        vm.prank(alice);
        token.buy{value: 100e18}();

        uint256 shares = token.balanceOf(alice);
        vm.prank(alice);
        token.transfer(bob, shares / 2);

        assertEq(token.balanceOf(bob), shares / 2);
        assertEq(token.balanceOf(alice), shares - shares / 2);
    }

    function test_approve_and_transferFrom() public {
        vm.prank(alice);
        token.buy{value: 100e18}();

        uint256 shares = token.balanceOf(alice);
        vm.prank(alice);
        token.approve(bob, shares);

        vm.prank(bob);
        token.transferFrom(alice, bob, shares);
        assertEq(token.balanceOf(bob), shares);
    }

    function test_decimals() public view {
        assertEq(token.decimals(), 18);
    }

    // ─── Price after NAV change ──────────────────────────────────────────────

    function test_secondBuyer_paysMoreAfterNAVIncrease() public {
        // Alice buys $1000 at $10 → 100 shares
        vm.prank(alice);
        token.buy{value: 1000e18}();

        // Agent updates NAV to $1000 (capital deployed) then vault grows 50%
        token.updateNAV(1500e18);
        // price = 1500e18 * 1e18 / 100e18 = 15e18 ($15/share)

        // Bob buys $1000 at $15 → ~66.67 shares
        vm.prank(bob);
        token.buy{value: 1000e18}();

        assertLt(token.balanceOf(bob), token.balanceOf(alice));
        // Bob gets 1000/15 ≈ 66.67 shares
        assertApproxEqRel(token.balanceOf(bob), 66_666666666666666666, 1e15);
    }

    // ─── Full lifecycle ──────────────────────────────────────────────────────

    function test_fullLifecycle() public {
        // 1. Alice buys $1000 → 100 shares at $10
        vm.prank(alice);
        token.buy{value: 1000e18}();
        assertEq(token.balanceOf(alice), 100e18);

        // 2. Agent deploys capital, updates NAV
        token.updateNAV(1000e18);
        assertEq(token.getSharePrice(), 10e18);

        // 3. Vault earns 20% return
        token.updateNAV(1200e18);
        assertEq(token.getSharePrice(), 12e18);

        // 4. Bob buys $600 at $12 → 50 shares
        vm.prank(bob);
        token.buy{value: 600e18}();
        assertEq(token.balanceOf(bob), 50e18);

        // 5. Total: 150 shares, NAV should be updated to 1200+600=1800
        token.updateNAV(1800e18);
        assertEq(token.getSharePrice(), 12e18); // still $12

        // 6. Alice's $1000 investment now worth $1200 (100 shares * $12)
        uint256 aliceValue = (token.balanceOf(alice) * token.getSharePrice()) / 1e18;
        assertEq(aliceValue, 1200e18);
    }

    // ─── Receive ETH (for payment forwarding) ───────────────────────────────

    receive() external payable {}
}
