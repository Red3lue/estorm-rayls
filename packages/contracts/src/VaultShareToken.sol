// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title VaultShareToken
/// @notice ERC-20 vault share token on the Public Chain (Chain ID 7295799).
///         Investors buy shares for fungible portfolio exposure.
///
///         UNITS:
///           All monetary values use 18-decimal USDr precision (1e18 = $1.00).
///           NAV, share price, and msg.value are all in the same unit.
///
///         PRICING:
///           sharePrice = nav * 1e18 / totalSupply
///           NAV is updated by the AI agent each cycle via `updateNAV()`.
///
///         MINTING:
///           No initial supply. Shares minted on purchase via `buy()`.
///           Investor sends USDr (native token) → receives shares at current price.
///           Payment forwarded to `owner()` (agent teleports to Privacy Node).
///
///         OWNERSHIP:
///           Owner = AI agent wallet. Only owner can updateNAV.
contract VaultShareToken is ERC20, Ownable {

    /// @notice Net Asset Value in 18-decimal USDr (1e18 = $1.00).
    uint256 public nav;

    /// @notice Initial price per share in 18-decimal USDr. Used before first buy.
    uint256 public initialSharePrice;

    event NAVUpdated(uint256 oldNAV, uint256 newNAV, uint256 sharePrice, uint256 timestamp);
    event SharesPurchased(address indexed buyer, uint256 usdrPaid, uint256 sharesMinted, uint256 pricePerShare);

    /// @param _owner             AI agent wallet
    /// @param _initialNAV        Starting NAV in 18-decimal USDr (e.g. 900_000e18 = $900K)
    /// @param _initialSharePrice Price per share in 18-decimal USDr (e.g. 10e18 = $10)
    constructor(
        address _owner,
        uint256 _initialNAV,
        uint256 _initialSharePrice
    ) ERC20("Sovereign Vault Share", "SVS") Ownable(_owner) {
        require(_initialSharePrice > 0, "zero share price");
        nav = _initialNAV;
        initialSharePrice = _initialSharePrice;
    }

    // ─── NAV Management ──────────────────────────────────────────────────────

    function updateNAV(uint256 newNAV) external onlyOwner {
        uint256 oldNAV = nav;
        nav = newNAV;
        emit NAVUpdated(oldNAV, newNAV, getSharePrice(), block.timestamp);
    }

    // ─── Pricing ─────────────────────────────────────────────────────────────

    /// @notice Current price per share in 18-decimal USDr.
    function getSharePrice() public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return initialSharePrice;
        return (nav * 1e18) / supply;
    }

    // ─── Buy (Primary Market) ────────────────────────────────────────────────

    /// @notice Buy vault shares by sending USDr (native token, 18 decimals).
    ///         shares = msg.value * 1e18 / sharePrice
    function buy() external payable {
        require(msg.value > 0, "zero payment");
        uint256 price = getSharePrice();
        require(price > 0, "price is zero");

        uint256 shares = (msg.value * 1e18) / price;
        require(shares > 0, "payment too small");

        _mint(msg.sender, shares);

        (bool sent, ) = payable(owner()).call{value: msg.value}("");
        require(sent, "payment forward failed");

        emit SharesPurchased(msg.sender, msg.value, shares, price);
    }

    // ─── Read ────────────────────────────────────────────────────────────────

    function getNAV() external view returns (uint256) {
        return nav;
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
