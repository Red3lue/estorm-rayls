// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockDEX} from "../src/MockDEX.sol";
import {MockERC20} from "./mocks/Mocks.sol";

contract MockDEXTest is Test {
    MockDEX    dex;
    MockERC20  tokenIn;
    MockERC20  tokenOut;

    address vault = makeAddr("vault");

    function setUp() public {
        dex      = new MockDEX();
        tokenIn  = new MockERC20("TKN-IN",  18);
        tokenOut = new MockERC20("TKN-OUT", 18);

        // Fund vault with tokenIn and DEX with tokenOut reserves
        tokenIn.mint(vault, 1_000e18);
        tokenOut.mint(address(dex), 500e18);
    }

    function test_swap_pullsAndSends() public {
        vm.prank(vault);
        tokenIn.approve(address(dex), 100e18);

        vm.prank(vault);
        dex.swap(address(tokenIn), 100e18, address(tokenOut), 50e18);

        assertEq(tokenIn.balanceOf(vault),        900e18); // vault lost 100 tokenIn
        assertEq(tokenOut.balanceOf(vault),        50e18);  // vault got 50 tokenOut
        assertEq(tokenIn.balanceOf(address(dex)),  100e18); // dex received tokenIn
        assertEq(tokenOut.balanceOf(address(dex)), 450e18); // dex sent tokenOut
    }

    function test_swap_emitsEvent() public {
        vm.prank(vault);
        tokenIn.approve(address(dex), 100e18);

        vm.prank(vault);
        vm.expectEmit(true, true, true, true);
        emit MockDEX.Swapped(address(tokenIn), 100e18, address(tokenOut), 50e18, vault);
        dex.swap(address(tokenIn), 100e18, address(tokenOut), 50e18);
    }

    function test_reserve_returnsBalance() public view {
        assertEq(dex.reserve(address(tokenOut)), 500e18);
    }

    function test_swap_revertsInsufficientReserve() public {
        vm.prank(vault);
        tokenIn.approve(address(dex), 100e18);

        vm.prank(vault);
        vm.expectRevert("insufficient DEX reserve");
        dex.swap(address(tokenIn), 100e18, address(tokenOut), 1_000e18); // ask for more than reserve
    }

    function test_swap_revertsZeroToken() public {
        vm.prank(vault);
        vm.expectRevert("zero token");
        dex.swap(address(0), 100e18, address(tokenOut), 50e18);
    }

    function test_swap_revertsZeroAmount() public {
        vm.prank(vault);
        vm.expectRevert("zero amount");
        dex.swap(address(tokenIn), 0, address(tokenOut), 50e18);
    }
}
