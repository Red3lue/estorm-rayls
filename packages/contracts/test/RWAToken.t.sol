// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {RWAToken} from "../src/RWAToken.sol";

contract RWATokenTest is Test {
    // Use address(1) for endpoint — constructor only stores it, no calls made
    // during construction or _mint (resourceId == bytes32(0) guard skips cross-chain)
    address constant MOCK_ENDPOINT  = address(1);
    address constant MOCK_RN        = address(0);
    address constant MOCK_GOV       = address(0);

    RWAToken bond;
    RWAToken stable;
    address owner = address(this);

    function setUp() public {
        bond = new RWAToken(
            "Government Bond 6M", "BOND-GOV-6M", 18,
            MOCK_ENDPOINT, MOCK_RN, MOCK_GOV,
            1_000_000
        );
        stable = new RWAToken(
            "Stable USDr", "STABLE-USDr", 6,
            MOCK_ENDPOINT, MOCK_RN, MOCK_GOV,
            500_000
        );
    }

    function test_nameAndSymbol() public view {
        assertEq(bond.name(),   "Government Bond 6M");
        assertEq(bond.symbol(), "BOND-GOV-6M");
        assertEq(stable.name(),   "Stable USDr");
        assertEq(stable.symbol(), "STABLE-USDr");
    }

    function test_decimals() public view {
        assertEq(bond.decimals(),   18);
        assertEq(stable.decimals(), 6);
    }

    function test_initialSupply() public view {
        assertEq(bond.totalSupply(),   1_000_000 * 10 ** 18);
        assertEq(stable.totalSupply(), 500_000   * 10 ** 6);
    }

    function test_initialSupplyMintedToDeployer() public view {
        assertEq(bond.balanceOf(owner),   bond.totalSupply());
        assertEq(stable.balanceOf(owner), stable.totalSupply());
    }

    function test_ownerIsDeployer() public view {
        assertEq(bond.owner(),   owner);
        assertEq(stable.owner(), owner);
    }

    function test_transfer() public {
        address alice = makeAddr("alice");
        uint256 amount = 1000 * 10 ** 18;
        bond.transfer(alice, amount);
        assertEq(bond.balanceOf(alice), amount);
        assertEq(bond.balanceOf(owner), bond.totalSupply() - amount);
    }
}
