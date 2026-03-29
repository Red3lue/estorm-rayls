// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DvPExchange} from "../src/DvPExchange.sol";
import {MockERC20} from "./mocks/Mocks.sol";

contract DvPExchangeTest is Test {

    DvPExchange dvp;
    MockERC20   tokenA; // creator sells
    MockERC20   tokenB; // creator wants

    address vault       = address(this);
    address counterparty = makeAddr("counterparty");
    address alice        = makeAddr("alice");

    uint256 constant AMOUNT_A = 100e18;
    uint256 constant AMOUNT_B = 200e18;
    uint256 expiration;

    function setUp() public {
        dvp    = new DvPExchange();
        tokenA = new MockERC20("TokenA", 18);
        tokenB = new MockERC20("TokenB", 18);

        expiration = block.timestamp + 1 hours;

        // Fund participants
        tokenA.mint(vault,        500e18);
        tokenB.mint(counterparty, 500e18);

        // Approve DvP
        tokenA.approve(address(dvp), type(uint256).max);
        vm.prank(counterparty);
        tokenB.approve(address(dvp), type(uint256).max);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _creatorAsset() internal view returns (DvPExchange.Asset memory) {
        return DvPExchange.Asset({ assetType: DvPExchange.AssetType.ERC20, tokenAddress: address(tokenA), amount: AMOUNT_A, tokenId: 0 });
    }

    function _counterpartyAsset() internal view returns (DvPExchange.Asset memory) {
        return DvPExchange.Asset({ assetType: DvPExchange.AssetType.ERC20, tokenAddress: address(tokenB), amount: AMOUNT_B, tokenId: 0 });
    }

    function _create() internal returns (uint256) {
        return dvp.createExchange(
            vault, _creatorAsset(), vault, counterparty, _counterpartyAsset(), expiration
        );
    }

    // ─── createExchange ──────────────────────────────────────────────────────

    function test_createExchange_escrrowsTokens() public {
        uint256 balBefore = tokenA.balanceOf(vault);
        _create();
        assertEq(tokenA.balanceOf(vault), balBefore - AMOUNT_A);
        assertEq(tokenA.balanceOf(address(dvp)), AMOUNT_A);
    }

    function test_createExchange_returnsId() public {
        uint256 id0 = _create();
        assertEq(id0, 0);
        tokenA.mint(vault, AMOUNT_A);
        uint256 id1 = dvp.createExchange(
            vault, _creatorAsset(), vault, counterparty, _counterpartyAsset(), expiration
        );
        assertEq(id1, 1);
    }

    function test_createExchange_storesExchange() public {
        uint256 id = _create();
        DvPExchange.Exchange memory ex = dvp.getExchange(id);
        assertEq(ex.creator, vault);
        assertEq(ex.creatorBeneficiary, vault);
        assertEq(ex.counterparty, counterparty);
        assertEq(ex.creatorAsset.amount, AMOUNT_A);
        assertEq(ex.counterpartyAsset.amount, AMOUNT_B);
        assertEq(uint8(ex.status), uint8(DvPExchange.ExchangeStatus.INITIALIZED));
    }

    function test_createExchange_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit DvPExchange.ExchangeCreated(
            0, vault, address(tokenA), AMOUNT_A, address(tokenB), AMOUNT_B, counterparty, expiration
        );
        _create();
    }

    function test_createExchange_zeroCreatorAmount_reverts() public {
        DvPExchange.Asset memory bad = DvPExchange.Asset({ assetType: DvPExchange.AssetType.ERC20, tokenAddress: address(tokenA), amount: 0, tokenId: 0 });
        vm.expectRevert("zero creator amount");
        dvp.createExchange(vault, bad, vault, counterparty, _counterpartyAsset(), expiration);
    }

    function test_createExchange_alreadyExpired_reverts() public {
        vm.expectRevert("already expired");
        dvp.createExchange(vault, _creatorAsset(), vault, counterparty, _counterpartyAsset(), block.timestamp);
    }

    // ─── executeExchange ─────────────────────────────────────────────────────

    function test_executeExchange_atomicSettlement() public {
        uint256 id = _create();

        uint256 vaultBBefore        = tokenB.balanceOf(vault);
        uint256 counterpartyABefore = tokenA.balanceOf(counterparty);

        vm.prank(counterparty);
        dvp.executeExchange(id);

        // Vault receives counterparty's tokenB
        assertEq(tokenB.balanceOf(vault), vaultBBefore + AMOUNT_B);
        // Counterparty receives vault's tokenA
        assertEq(tokenA.balanceOf(counterparty), counterpartyABefore + AMOUNT_A);
        // DvP escrow is empty
        assertEq(tokenA.balanceOf(address(dvp)), 0);
    }

    function test_executeExchange_statusExecuted() public {
        uint256 id = _create();
        vm.prank(counterparty);
        dvp.executeExchange(id);

        DvPExchange.Exchange memory ex = dvp.getExchange(id);
        assertEq(uint8(ex.status), uint8(DvPExchange.ExchangeStatus.EXECUTED));
    }

    function test_executeExchange_emitsEvent() public {
        uint256 id = _create();
        vm.expectEmit(true, true, false, false);
        emit DvPExchange.ExchangeExecuted(id, counterparty);
        vm.prank(counterparty);
        dvp.executeExchange(id);
    }

    function test_executeExchange_wrongCounterparty_reverts() public {
        uint256 id = _create();
        vm.prank(alice);
        vm.expectRevert("not authorized counterparty");
        dvp.executeExchange(id);
    }

    function test_executeExchange_expired_reverts() public {
        uint256 id = _create();
        vm.warp(expiration + 1);
        vm.prank(counterparty);
        vm.expectRevert("exchange expired");
        dvp.executeExchange(id);
    }

    function test_executeExchange_doubleExec_reverts() public {
        uint256 id = _create();
        vm.prank(counterparty);
        dvp.executeExchange(id);

        vm.prank(counterparty);
        vm.expectRevert("not initialized");
        dvp.executeExchange(id);
    }

    function test_executeExchange_anyoneIfZeroCounterparty() public {
        uint256 id = dvp.createExchange(
            vault, _creatorAsset(), vault,
            address(0), // anyone can execute
            _counterpartyAsset(),
            expiration
        );

        tokenB.mint(alice, AMOUNT_B);
        vm.prank(alice);
        tokenB.approve(address(dvp), AMOUNT_B);
        vm.prank(alice);
        dvp.executeExchange(id);

        assertEq(tokenA.balanceOf(alice), AMOUNT_A);
    }

    // ─── cancelExchange ──────────────────────────────────────────────────────

    function test_cancelExchange_refundsCreator() public {
        uint256 id = _create();
        uint256 balBefore = tokenA.balanceOf(vault);

        vm.warp(expiration + 1);
        dvp.cancelExchange(id);

        assertEq(tokenA.balanceOf(vault), balBefore + AMOUNT_A);
        assertEq(tokenA.balanceOf(address(dvp)), 0);
    }

    function test_cancelExchange_statusExpired() public {
        uint256 id = _create();
        vm.warp(expiration + 1);
        dvp.cancelExchange(id);
        DvPExchange.Exchange memory ex = dvp.getExchange(id);
        assertEq(uint8(ex.status), uint8(DvPExchange.ExchangeStatus.EXPIRED));
    }

    function test_cancelExchange_notYetExpired_reverts() public {
        uint256 id = _create();
        vm.expectRevert("not expired yet");
        dvp.cancelExchange(id);
    }

    function test_cancelExchange_emitsEvent() public {
        uint256 id = _create();
        vm.warp(expiration + 1);
        vm.expectEmit(true, false, false, false);
        emit DvPExchange.ExchangeCancelled(id);
        dvp.cancelExchange(id);
    }
}
