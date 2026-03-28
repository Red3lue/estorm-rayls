// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20Swap {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

/// @title MockDEX
/// @notice Hackathon mock of a DEX. No AMM math — just holds pre-funded reserves
///         and fulfills exact swap requests.
///
///         Flow:
///           1. Deployer funds MockDEX with reserve tokens (transfer after minting)
///           2. VaultLedger calls `IERC20(tokenIn).approve(dex, amountIn)`
///           3. VaultLedger calls `MockDEX.swap(tokenIn, amountIn, tokenOut, amountOut)`
///           4. MockDEX pulls tokenIn from VaultLedger, sends tokenOut back
///
///         In production replace with a real DEX router (Uniswap, Curve, etc.)
contract MockDEX {
    event Swapped(
        address indexed tokenIn,
        uint256 amountIn,
        address indexed tokenOut,
        uint256 amountOut,
        address indexed vault
    );

    /// @notice Execute a swap.
    /// @param tokenIn   Token the vault is selling (must have approved this contract)
    /// @param amountIn  Raw amount of tokenIn to pull from caller
    /// @param tokenOut  Token the vault wants to receive
    /// @param amountOut Raw amount of tokenOut to send to caller
    function swap(
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOut
    ) external {
        require(tokenIn  != address(0) && tokenOut != address(0), "zero token");
        require(amountIn  > 0 && amountOut > 0, "zero amount");
        require(
            IERC20Swap(tokenOut).balanceOf(address(this)) >= amountOut,
            "insufficient DEX reserve"
        );

        // Pull tokenIn from vault (vault must have called approve before this)
        require(
            IERC20Swap(tokenIn).transferFrom(msg.sender, address(this), amountIn),
            "transferFrom failed"
        );

        // Send tokenOut to vault
        require(
            IERC20Swap(tokenOut).transfer(msg.sender, amountOut),
            "transfer failed"
        );

        emit Swapped(tokenIn, amountIn, tokenOut, amountOut, msg.sender);
    }

    /// @notice View DEX reserve for a token (for off-chain monitoring).
    function reserve(address token) external view returns (uint256) {
        return IERC20Swap(token).balanceOf(address(this));
    }
}
