// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Minimal ERC-20 interface for escrow transfers.
interface IERC20Market {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

/// @title Marketplace
/// @notice Public Chain escrow marketplace for vault shares and receipt tokens.
///         The AI agent (owner) lists tokens; investors buy with USDr (native token).
///
///         ESCROW MODEL:
///           list()   — pulls tokens from owner into this contract (escrow)
///           buy()    — sends escrowed tokens to buyer, USDr to owner
///           delist() — returns escrowed tokens to owner
///
///         PAYMENT:
///           USDr is the native token on Rayls Public Chain.
///           buy() accepts msg.value (USDr) and forwards to owner().
///
///         Matches the Rayls hackathon starter Marketplace spec.
contract Marketplace is Ownable {

    // ─── Types ───────────────────────────────────────────────────────────────

    enum AssetType { ERC20, ERC721 }

    struct Listing {
        address   token;
        AssetType assetType;
        uint256   tokenId;   // ERC721 only (0 for ERC20)
        uint256   amount;    // ERC20 only (1 for ERC721)
        uint256   price;     // total price in USDr wei (18-decimal)
        bool      active;
        address   seller;    // who listed (receives payment)
    }

    // ─── Storage ─────────────────────────────────────────────────────────────

    Listing[] private _listings;
    uint256[] private _activeIds;

    // ─── Events ──────────────────────────────────────────────────────────────

    event Listed(uint256 indexed listingId, address indexed token, AssetType assetType, uint256 amount, uint256 price);
    event Bought(uint256 indexed listingId, address indexed buyer, uint256 price);
    event Delisted(uint256 indexed listingId);
    event PriceUpdated(uint256 indexed listingId, uint256 oldPrice, uint256 newPrice);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _owner) Ownable(_owner) {}

    // ─── List ────────────────────────────────────────────────────────────────

    /// @notice List tokens for sale. Pulls `amount` of `token` from msg.sender into escrow.
    ///         msg.sender must have approved this contract for `amount`.
    ///         Only owner (AI agent) can list.
    function list(
        address   token,
        AssetType assetType,
        uint256   tokenId,
        uint256   amount,
        uint256   price
    ) external onlyOwner returns (uint256 listingId) {
        require(token != address(0), "zero token");
        require(price > 0, "zero price");

        if (assetType == AssetType.ERC20) {
            require(amount > 0, "zero amount");
            require(
                IERC20Market(token).transferFrom(msg.sender, address(this), amount),
                "escrow deposit failed"
            );
        } else {
            // ERC721 support placeholder — not used in our demo
            revert("ERC721 listings not supported");
        }

        listingId = _listings.length;
        _listings.push(Listing({
            token:     token,
            assetType: assetType,
            tokenId:   tokenId,
            amount:    amount,
            price:     price,
            active:    true,
            seller:    msg.sender
        }));
        _activeIds.push(listingId);

        emit Listed(listingId, token, assetType, amount, price);
    }

    // ─── Buy ─────────────────────────────────────────────────────────────────

    /// @notice Buy a listing by sending USDr (native token) >= price.
    ///         Escrowed tokens go to buyer, USDr goes to seller (owner/agent).
    function buy(uint256 listingId) external payable {
        require(listingId < _listings.length, "invalid listing");
        Listing storage l = _listings[listingId];
        require(l.active, "not active");
        require(msg.value >= l.price, "insufficient payment");

        l.active = false;
        _removeActiveId(listingId);

        // Send escrowed tokens to buyer
        require(
            IERC20Market(l.token).transfer(msg.sender, l.amount),
            "token transfer failed"
        );

        // Forward USDr payment to seller
        (bool sent, ) = payable(l.seller).call{value: msg.value}("");
        require(sent, "payment forward failed");

        emit Bought(listingId, msg.sender, msg.value);
    }

    // ─── Delist ──────────────────────────────────────────────────────────────

    /// @notice Remove a listing and return escrowed tokens to seller. Owner only.
    function delist(uint256 listingId) external onlyOwner {
        require(listingId < _listings.length, "invalid listing");
        Listing storage l = _listings[listingId];
        require(l.active, "not active");

        l.active = false;
        _removeActiveId(listingId);

        // Return escrowed tokens to seller
        require(
            IERC20Market(l.token).transfer(l.seller, l.amount),
            "refund failed"
        );

        emit Delisted(listingId);
    }

    // ─── Update ──────────────────────────────────────────────────────────────

    /// @notice Update the price of an active listing. Owner only.
    function update(uint256 listingId, uint256 newPrice) external onlyOwner {
        require(listingId < _listings.length, "invalid listing");
        Listing storage l = _listings[listingId];
        require(l.active, "not active");
        require(newPrice > 0, "zero price");

        uint256 oldPrice = l.price;
        l.price = newPrice;

        emit PriceUpdated(listingId, oldPrice, newPrice);
    }

    // ─── Read ────────────────────────────────────────────────────────────────

    function getListing(uint256 listingId) external view returns (Listing memory) {
        require(listingId < _listings.length, "invalid listing");
        return _listings[listingId];
    }

    function getActiveListings() external view returns (uint256[] memory) {
        return _activeIds;
    }

    function getListingCount() external view returns (uint256) {
        return _listings.length;
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _removeActiveId(uint256 listingId) internal {
        for (uint256 i = 0; i < _activeIds.length; i++) {
            if (_activeIds[i] == listingId) {
                _activeIds[i] = _activeIds[_activeIds.length - 1];
                _activeIds.pop();
                return;
            }
        }
    }

    // Accept USDr
    receive() external payable {}
}
