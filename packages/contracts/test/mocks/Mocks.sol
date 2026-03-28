// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Minimal ERC-20 mock for tests. Supports balanceOf, mint, approve, transfer, transferFrom.
contract MockERC20 {
    string  public  symbol;
    uint8   private _dec;
    mapping(address => uint256) private _bal;
    mapping(address => mapping(address => uint256)) private _allow;

    constructor(string memory sym, uint8 dec_) { symbol = sym; _dec = dec_; }

    function decimals() external view returns (uint8)              { return _dec; }
    function balanceOf(address a) external view returns (uint256)  { return _bal[a]; }
    function mint(address to, uint256 amt) external                { _bal[to] += amt; }
    function burn(address from, uint256 amt) external              { _bal[from] -= amt; }

    function approve(address spender, uint256 amt) external returns (bool) {
        _allow[msg.sender][spender] = amt;
        return true;
    }
    function transferFrom(address from, address to, uint256 amt) external returns (bool) {
        require(_allow[from][msg.sender] >= amt, "allowance");
        _allow[from][msg.sender] -= amt;
        _bal[from] -= amt;
        _bal[to]   += amt;
        return true;
    }
    function transfer(address to, uint256 amt) external returns (bool) {
        _bal[msg.sender] -= amt;
        _bal[to] += amt;
        return true;
    }
}

