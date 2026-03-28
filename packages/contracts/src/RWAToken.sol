// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {RaylsErc20Handler} from "rayls-protocol-sdk/tokens/RaylsErc20Handler.sol";

/// @title RWAToken
/// @notice Generic ERC-20 RWA token for the Sovereign Vault Protocol.
///         Deployed once per asset class (bonds, receivables, stablecoins).
contract RWAToken is RaylsErc20Handler {
    uint8 private immutable _decimals;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 decimals_,
        address _endpoint,
        address _raylsNodeEndpoint,
        address _userGovernance,
        uint256 _initialSupply
    )
        RaylsErc20Handler(
            _name,
            _symbol,
            _endpoint,
            _raylsNodeEndpoint,
            _userGovernance,
            msg.sender,
            false
        )
    {
        _decimals = decimals_;
        // Use _mint (not mint) before resourceId is assigned
        _mint(msg.sender, _initialSupply * 10 ** decimals_);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
