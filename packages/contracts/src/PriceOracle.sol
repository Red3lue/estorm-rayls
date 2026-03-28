// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PriceOracle
/// @notice Manager-controlled price feed for the Sovereign Vault.
///         Stores token prices in USD cents per *whole* token.
///         e.g. 1 BOND worth $1 000 → price = 100_000 (cents)
///         Only the manager (owner) can set prices — the AI agent CANNOT.
contract PriceOracle is Ownable {
    /// @dev token → price in USD cents per 1 whole token (10^decimals raw units)
    mapping(address => uint256) private _prices;

    event PriceSet(address indexed token, uint256 priceUSDCents);

    constructor(address _manager) Ownable(_manager) {}

    /// @notice Set or update the price for a token.
    /// @param token         ERC-20 token address
    /// @param priceUSDCents Price in USD cents per 1 whole token
    ///                      e.g. $1 000.00 → 100_000
    function setPrice(address token, uint256 priceUSDCents) external onlyOwner {
        require(token != address(0), "zero token");
        _prices[token] = priceUSDCents;
        emit PriceSet(token, priceUSDCents);
    }

    /// @notice Returns the stored price for a token (0 if not set).
    function getPrice(address token) external view returns (uint256) {
        return _prices[token];
    }
}
