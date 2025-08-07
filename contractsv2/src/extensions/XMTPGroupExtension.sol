// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../EVMAuthV2.sol";

/**
 * @title XMTPGroupExtension
 * @dev Extension contract that adds XMTP group integration functionality to EVMAuth
 * This contract acts as a plugin that can be attached to any EVMAuthV2 contract
 */
contract XMTPGroupExtension is Ownable, ReentrancyGuard {
  // Core EVMAuth contract this extension is attached to
  EVMAuthV2 public immutable evmAuth;

  // XMTP Group Integration
  struct XMTPGroupInfo {
    string salesGroupId; // Public sales group conversation ID
    string premiumGroupId; // Private premium group conversation ID
    address botAddress; // XMTP bot wallet address
    bool isActive; // Whether XMTP integration is active
    uint256 linkedAt; // Timestamp when groups were linked
  }

  XMTPGroupInfo public xmtpInfo;

  // User inbox ID mapping (wallet address => XMTP inbox ID)
  mapping(address => string) public userInboxIds;

  // Reverse mapping for quick lookups (inbox ID => wallet address)
  mapping(string => address) public inboxToAddress;

  // Access tier configuration specific to XMTP integration
  struct XMTPAccessTier {
    uint256 tokenId; // Corresponding token ID in the base contract
    string name; // Tier name
    string description; // Tier description
    string imageHash; // IPFS hash for NFT image
    string metadataUri; // IPFS URI for NFT metadata
    bool isActive; // Whether this tier is active
    uint256 createdAt; // Creation timestamp
  }

  mapping(uint256 => XMTPAccessTier) public xmtpTiers;

  // Purchase tracking with XMTP-specific data
  struct XMTPPurchaseRecord {
    address user;
    string userInboxId;
    uint256 tokenId;
    uint256 purchasePrice;
    uint256 purchasedAt;
    uint256 expiresAt;
    bool isActive;
    string transactionHash; // For tracking purposes
  }

  XMTPPurchaseRecord[] public purchaseHistory;
  mapping(address => uint256[]) public userPurchases;

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

  /**
   * @dev Constructor
   * @param _evmAuth Address of the EVMAuthV2 contract to extend
   * @param _salesGroupId Initial sales group ID
   * @param _premiumGroupId Initial premium group ID
   * @param _botAddress XMTP bot address
   * @param _owner Owner of this extension contract
   */
  constructor(
    address _evmAuth,
    string memory _salesGroupId,
    string memory _premiumGroupId,
    address _botAddress,
    address _owner
  ) Ownable(_owner) {
    require(_evmAuth != address(0), "Invalid EVMAuth address");
    require(_botAddress != address(0), "Invalid bot address");

    evmAuth = EVMAuthV2(_evmAuth);

    // Initialize XMTP integration
    xmtpInfo = XMTPGroupInfo({
      salesGroupId: _salesGroupId,
      premiumGroupId: _premiumGroupId,
      botAddress: _botAddress,
      isActive: true,
      linkedAt: block.timestamp
    });

    // Ownership is already set in constructor

    emit XMTPGroupsLinked(
      _salesGroupId,
      _premiumGroupId,
      _botAddress,
      block.timestamp
    );
  }

  /**
   * @dev Setup XMTP access tier configuration
   */
  function setupXMTPAccessTier(
    uint256 tokenId,
    string memory name,
    string memory description,
    string memory imageHash,
    string memory metadataUri
  ) external onlyOwner {
    require(bytes(name).length > 0, "Name required");

    xmtpTiers[tokenId] = XMTPAccessTier({
      tokenId: tokenId,
      name: name,
      description: description,
      imageHash: imageHash,
      metadataUri: metadataUri,
      isActive: true,
      createdAt: block.timestamp
    });

    emit XMTPAccessTierSetup(tokenId, name, description);
  }

  /**
   * @dev Store user inbox ID mapping (callable by bot or owner)
   */
  function storeUserInboxId(address user, string memory inboxId) external {
    require(
      msg.sender == xmtpInfo.botAddress || msg.sender == owner(),
      "Not authorized"
    );
    require(bytes(inboxId).length > 0, "Invalid inbox ID");

    // Clear previous mapping if exists
    string memory oldInboxId = userInboxIds[user];
    if (bytes(oldInboxId).length > 0) {
      delete inboxToAddress[oldInboxId];
    }

    // Store new mapping
    userInboxIds[user] = inboxId;
    inboxToAddress[inboxId] = user;

    emit XMTPInboxIdStored(user, inboxId);
  }

  /**
   * @dev Purchase access token with XMTP integration
   * This function extends the base purchase functionality
   */
  function purchaseXMTPAccess(
    uint256 tokenId,
    string memory transactionHash
  ) external payable nonReentrant {
    // Verify the token exists and get its metadata
    EVMAuthV2.TokenMetadata memory tokenMetadata = evmAuth.metadataOf(tokenId);
    require(tokenMetadata.active, "Access tier not active");
    require(msg.value >= tokenMetadata.price, "Insufficient payment");

    // Calculate expiry
    uint256 expiresAt = tokenMetadata.ttl == 0
      ? type(uint256).max
      : block.timestamp + tokenMetadata.ttl;

    // Mint token through the base contract
    evmAuth.extMint(msg.sender, tokenId, 1, "");

    // Record XMTP-specific purchase data
    string memory userInboxId = userInboxIds[msg.sender];
    purchaseHistory.push(
      XMTPPurchaseRecord({
        user: msg.sender,
        userInboxId: userInboxId,
        tokenId: tokenId,
        purchasePrice: msg.value,
        purchasedAt: block.timestamp,
        expiresAt: expiresAt,
        isActive: true,
        transactionHash: transactionHash
      })
    );

    userPurchases[msg.sender].push(purchaseHistory.length - 1);

    // Handle refund for overpayment
    if (msg.value > tokenMetadata.price) {
      payable(msg.sender).transfer(msg.value - tokenMetadata.price);
    }

    emit XMTPUserAccessGranted(msg.sender, userInboxId, tokenId, expiresAt);
    emit XMTPPurchaseRecorded(
      msg.sender,
      userInboxId,
      tokenId,
      1,
      transactionHash
    );
  }

  /**
   * @dev Grant access token (for trials, etc.)
   * Can be called by bot or owner
   */
  function grantXMTPAccess(
    address user,
    uint256 tokenId,
    string memory userInboxId
  ) external {
    require(
      msg.sender == xmtpInfo.botAddress || msg.sender == owner(),
      "Not authorized"
    );

    // Get token metadata to calculate expiry
    EVMAuthV2.TokenMetadata memory tokenMetadata = evmAuth.metadataOf(tokenId);
    require(tokenMetadata.active, "Access tier not active");

    // Calculate expiry
    uint256 expiresAt = tokenMetadata.ttl == 0
      ? type(uint256).max
      : block.timestamp + tokenMetadata.ttl;

    // Store inbox ID if provided
    if (bytes(userInboxId).length > 0) {
      // Clear previous mapping if exists
      string memory oldInboxId = userInboxIds[user];
      if (bytes(oldInboxId).length > 0) {
        delete inboxToAddress[oldInboxId];
      }

      // Store new mapping
      userInboxIds[user] = userInboxId;
      inboxToAddress[userInboxId] = user;

      emit XMTPInboxIdStored(user, userInboxId);
    }

    // Mint token through the base contract
    evmAuth.extMint(user, tokenId, 1, "");

    emit XMTPUserAccessGranted(user, userInboxId, tokenId, expiresAt);
  }

  /**
   * @dev Check if user has valid access (XMTP-aware)
   */
  function hasValidXMTPAccess(address user) external view returns (bool) {
    // Check all configured XMTP tiers for valid access
    for (uint256 tokenId = 1; tokenId <= 10; tokenId++) {
      // Check first 10 token IDs
      if (xmtpTiers[tokenId].isActive && evmAuth.balanceOf(user, tokenId) > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * @dev Check if inbox ID has valid access
   */
  function hasValidAccessByInboxId(
    string memory inboxId
  ) external view returns (bool) {
    address user = inboxToAddress[inboxId];
    if (user == address(0)) return false;

    return this.hasValidXMTPAccess(user);
  }

  /**
   * @dev Revoke user access (admin function)
   */
  function revokeXMTPAccess(
    address user,
    uint256 tokenId,
    string memory reason
  ) external onlyOwner {
    require(evmAuth.balanceOf(user, tokenId) > 0, "User has no tokens");

    // Burn the token through the base contract
    uint256 balance = evmAuth.balanceOf(user, tokenId);
    evmAuth.extBurn(user, tokenId, balance);

    string memory userInboxId = userInboxIds[user];
    emit XMTPUserAccessRevoked(user, userInboxId, tokenId, reason);
  }

  /**
   * @dev Get user's XMTP purchase history
   */
  function getXMTPUserPurchases(
    address user
  ) external view returns (uint256[] memory) {
    return userPurchases[user];
  }

  /**
   * @dev Get XMTP purchase record
   */
  function getXMTPPurchaseRecord(
    uint256 index
  ) external view returns (XMTPPurchaseRecord memory) {
    require(index < purchaseHistory.length, "Invalid index");
    return purchaseHistory[index];
  }

  /**
   * @dev Update XMTP group information
   */
  function updateXMTPInfo(
    string memory _salesGroupId,
    string memory _premiumGroupId,
    address _botAddress
  ) external onlyOwner {
    xmtpInfo.salesGroupId = _salesGroupId;
    xmtpInfo.premiumGroupId = _premiumGroupId;
    xmtpInfo.botAddress = _botAddress;

    emit XMTPGroupsLinked(
      _salesGroupId,
      _premiumGroupId,
      _botAddress,
      block.timestamp
    );
  }

  /**
   * @dev Emergency pause/unpause XMTP integration
   */
  function toggleXMTPIntegration() external onlyOwner {
    xmtpInfo.isActive = !xmtpInfo.isActive;
  }

  /**
   * @dev Batch check multiple users' XMTP access
   */
  function batchCheckXMTPAccess(
    address[] memory users
  ) external view returns (bool[] memory) {
    bool[] memory results = new bool[](users.length);
    for (uint256 i = 0; i < users.length; i++) {
      results[i] = this.hasValidXMTPAccess(users[i]);
    }
    return results;
  }

  /**
   * @dev Get all active XMTP tiers
   */
  function getActiveXMTPTiers() external view returns (uint256[] memory) {
    uint256[] memory activeTiers = new uint256[](10); // Max 10 tiers for now
    uint256 count = 0;

    for (uint256 i = 1; i <= 10; i++) {
      if (xmtpTiers[i].isActive) {
        activeTiers[count] = i;
        count++;
      }
    }

    // Resize array to actual count
    uint256[] memory result = new uint256[](count);
    for (uint256 i = 0; i < count; i++) {
      result[i] = activeTiers[i];
    }

    return result;
  }

  /**
   * @dev Get XMTP tier details
   */
  function getXMTPTier(
    uint256 tokenId
  ) external view returns (XMTPAccessTier memory) {
    return xmtpTiers[tokenId];
  }

  /**
   * @dev Withdraw contract balance (owner only)
   * Forwards to the base contract's wallet
   */
  function withdraw() external onlyOwner {
    uint256 balance = address(this).balance;
    require(balance > 0, "No balance to withdraw");

    // Transfer to the base contract's wallet
    address wallet = evmAuth.wallet();
    payable(wallet).transfer(balance);
  }

  /**
   * @dev Get extension info for the base contract
   */
  function getExtensionInfo()
    external
    view
    returns (
      string memory name,
      string memory version,
      address baseContract,
      bool isActive
    )
  {
    return ("XMTPGroupExtension", "1.0.0", address(evmAuth), xmtpInfo.isActive);
  }
}
