// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IXMTP
 * @dev Interface for XMTP-related functionality
 */
interface IXMTP {
  /**
   * @dev XMTP Group Information
   */
  struct XMTPGroupInfo {
    string salesGroupId;
    string premiumGroupId;
    address botAddress;
    bool isActive;
    uint256 linkedAt;
  }

  /**
   * @dev XMTP Access Tier Information
   */
  struct XMTPAccessTier {
    uint256 tokenId;
    string name;
    string description;
    string imageHash;
    string metadataUri;
    bool isActive;
    uint256 createdAt;
  }

  /**
   * @dev XMTP Purchase Record
   */
  struct XMTPPurchaseRecord {
    address user;
    string userInboxId;
    uint256 tokenId;
    uint256 purchasePrice;
    uint256 purchasedAt;
    uint256 expiresAt;
    bool isActive;
    string transactionHash;
    address paymentToken;
  }

  // Events
  event XMTPGroupsLinked(
    string salesGroupId,
    string premiumGroupId,
    address indexed botAddress,
    uint256 timestamp
  );

  event XMTPUserAccessGranted(
    address indexed user,
    string indexed userInboxId,
    uint256 indexed tokenId,
    uint256 expiresAt
  );

  event ERC20PaymentTokenAdded(address indexed tokenAddress);

  event ExtensionDeregistered(address indexed extensionAddress);

  event XMTPUserAccessRevoked(
    address indexed user,
    string indexed userInboxId,
    uint256 indexed tokenId,
    string reason
  );

  event XMTPAccessTierSetup(
    uint256 indexed tokenId,
    string name,
    string description
  );

  event XMTPInboxIdStored(address indexed user, string indexed inboxId);

  event XMTPPurchaseRecorded(
    address indexed user,
    string indexed userInboxId,
    uint256 indexed tokenId,
    uint256 amount,
    string transactionHash
  );

  // Core XMTP Functions
  function setupXMTPAccessTier(
    uint256 tokenId,
    string memory name,
    string memory description,
    string memory imageHash,
    string memory metadataUri
  ) external;

  function storeUserInboxId(address user, string memory inboxId) external;

  function grantXMTPAccess(
    address user,
    uint256 tokenId,
    uint256 amount,
    string memory userInboxId
  ) external;

  function revokeXMTPAccess(
    address user,
    uint256 tokenId,
    string memory reason
  ) external;

  function hasValidXMTPAccess(address user) external view returns (bool);

  function hasValidAccessByInboxId(
    string memory inboxId
  ) external view returns (bool);

  function updateXMTPInfo(
    string memory _salesGroupId,
    string memory _premiumGroupId,
    address _botAddress
  ) external;

  function toggleXMTPIntegration() external;

  // View Functions
  function xmtpInfo() external view returns (XMTPGroupInfo memory);

  function userInboxIds(address user) external view returns (string memory);

  function inboxToAddress(
    string memory inboxId
  ) external view returns (address);

  function getXMTPTier(
    uint256 tokenId
  ) external view returns (XMTPAccessTier memory);

  function getActiveXMTPTiers() external view returns (uint256[] memory);

  function getXMTPUserPurchases(
    address user
  ) external view returns (uint256[] memory);

  function getXMTPPurchaseRecord(
    uint256 index
  ) external view returns (XMTPPurchaseRecord memory);

  function getXMTPPurchaseHistoryLength() external view returns (uint256);

  function batchCheckXMTPAccess(
    address[] memory users
  ) external view returns (bool[] memory);
}
