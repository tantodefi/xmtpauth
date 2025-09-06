// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../interfaces/IExtension.sol";

/**
 * @title MockExtension
 * @dev Mock extension for testing purposes
 */
contract MockExtension is IExtension {
  struct PurchaseNotification {
    address buyer;
    uint256 tokenId;
    uint256 amount;
    uint256 totalPrice;
    address paymentToken;
  }

  struct GrantNotification {
    address recipient;
    uint256 tokenId;
    uint256 amount;
    address grantedBy;
  }

  struct RevokeNotification {
    address user;
    uint256 tokenId;
    uint256 amount;
    string reason;
  }

  uint256 public purchaseNotificationCount;
  uint256 public grantNotificationCount;
  uint256 public revokeNotificationCount;

  PurchaseNotification public lastPurchaseNotification;
  GrantNotification public lastGrantNotification;
  RevokeNotification public lastRevokeNotification;

  mapping(address => uint256) public userInteractions;

  // Hook call tracking
  bool public onTokenPurchasedCalled = false;
  bool public onTokensMintedCalled = false;
  bool public onTokenConfigUpdatedCalled = false;

  event MockPurchaseProcessed(
    address indexed buyer,
    uint256 indexed tokenId,
    uint256 amount
  );
  event MockGrantProcessed(
    address indexed recipient,
    uint256 indexed tokenId,
    uint256 amount
  );
  event MockRevokeProcessed(
    address indexed user,
    uint256 indexed tokenId,
    uint256 amount
  );

  function onTokenPurchased(
    address buyer,
    uint256 tokenId,
    uint256 amount,
    uint256 totalPrice,
    address paymentToken
  ) external override {
    purchaseNotificationCount++;
    userInteractions[buyer] += amount;
    onTokenPurchasedCalled = true;

    lastPurchaseNotification = PurchaseNotification({
      buyer: buyer,
      tokenId: tokenId,
      amount: amount,
      totalPrice: totalPrice,
      paymentToken: paymentToken
    });

    emit MockPurchaseProcessed(buyer, tokenId, amount);
  }

  function onTokenGranted(
    address recipient,
    uint256 tokenId,
    uint256 amount,
    address grantedBy
  ) external override {
    grantNotificationCount++;
    userInteractions[recipient] += amount;
    onTokensMintedCalled = true;

    lastGrantNotification = GrantNotification({
      recipient: recipient,
      tokenId: tokenId,
      amount: amount,
      grantedBy: grantedBy
    });

    emit MockGrantProcessed(recipient, tokenId, amount);
  }

  function onTokenRevoked(
    address user,
    uint256 tokenId,
    uint256 amount,
    string memory reason
  ) external override {
    revokeNotificationCount++;

    lastRevokeNotification = RevokeNotification({
      user: user,
      tokenId: tokenId,
      amount: amount,
      reason: reason
    });

    emit MockRevokeProcessed(user, tokenId, amount);
  }

  function onTokenConfigUpdated(
    uint256 tokenId,
    uint256 newPrice,
    string memory newURI
  ) external {
    onTokenConfigUpdatedCalled = true;
    // Mock implementation - just set the flag
  }

  function getExtensionInfo()
    external
    pure
    override
    returns (string memory name, string memory version, bool isActive)
  {
    return ("MockExtension", "1.0.0", true);
  }

  // Helper functions for testing
  function reset() external {
    purchaseNotificationCount = 0;
    grantNotificationCount = 0;
    revokeNotificationCount = 0;
    onTokenPurchasedCalled = false;
    onTokensMintedCalled = false;
    onTokenConfigUpdatedCalled = false;
  }

  function getUserInteractions(address user) external view returns (uint256) {
    return userInteractions[user];
  }
}
