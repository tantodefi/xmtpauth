// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title EVMAuthGroupAccessV2
 * @dev Enhanced version with XMTP group integration and inbox ID storage
 */
contract EVMAuthGroupAccessV2 is ERC1155, Ownable, ReentrancyGuard {
  // Contract metadata
  address public factory;
  string public groupName;
  string public groupDescription;
  string public groupImageUrl;

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

  // Access tier configuration
  struct AccessTier {
    uint256 durationDays; // Duration in days
    uint256 priceWei; // Price in wei
    string name; // Tier name
    string description; // Tier description
    string imageHash; // IPFS hash for NFT image
    string metadataUri; // IPFS URI for NFT metadata
    bool isActive; // Whether this tier is active
    uint256 createdAt; // Creation timestamp
  }

  mapping(uint256 => AccessTier) public accessTiers;

  // Token expiry tracking
  mapping(address => mapping(uint256 => uint256)) public userTokenExpiry;

  // Purchase tracking
  struct PurchaseRecord {
    address user;
    string userInboxId;
    uint256 tokenId;
    uint256 purchasePrice;
    uint256 purchasedAt;
    uint256 expiresAt;
    bool isActive;
  }

  PurchaseRecord[] public purchaseHistory;
  mapping(address => uint256[]) public userPurchases;

  // Events
  event XMTPGroupsLinked(
    string salesGroupId,
    string premiumGroupId,
    address indexed botAddress,
    uint256 timestamp
  );

  event UserAccessGranted(
    address indexed user,
    string indexed userInboxId,
    uint256 indexed tokenId,
    uint256 expiresAt
  );

  event UserAccessRevoked(
    address indexed user,
    string indexed userInboxId,
    uint256 indexed tokenId,
    string reason
  );

  event AccessTierSetup(
    uint256 indexed tokenId,
    uint256 durationDays,
    uint256 priceWei,
    string name
  );

  event InboxIdStored(
    address indexed user,
    string indexed inboxId
  );

  constructor(
    address _factory,
    string memory _groupName,
    string memory _groupDescription,
    string memory _groupImageUrl,
    string memory _salesGroupId,
    string memory _premiumGroupId,
    address _botAddress,
    address _owner
  ) ERC1155("") Ownable() {
    factory = _factory;
    groupName = _groupName;
    groupDescription = _groupDescription;
    groupImageUrl = _groupImageUrl;

    // Initialize XMTP integration
    xmtpInfo = XMTPGroupInfo({
      salesGroupId: _salesGroupId,
      premiumGroupId: _premiumGroupId,
      botAddress: _botAddress,
      isActive: true,
      linkedAt: block.timestamp
    });

    // Transfer ownership to specified owner
    if (_owner != msg.sender) {
      _transferOwnership(_owner);
    }

    emit XMTPGroupsLinked(_salesGroupId, _premiumGroupId, _botAddress, block.timestamp);
  }

  /**
   * @dev Setup access tier configuration
   */
  function setupAccessTier(
    uint256 tokenId,
    uint256 durationDays,
    uint256 priceWei,
    string memory name,
    string memory description,
    string memory imageHash,
    string memory metadataUri
  ) external onlyOwner {
    require(durationDays > 0, "Duration must be positive");
    require(priceWei > 0, "Price must be positive");
    require(bytes(name).length > 0, "Name required");

    accessTiers[tokenId] = AccessTier({
      durationDays: durationDays,
      priceWei: priceWei,
      name: name,
      description: description,
      imageHash: imageHash,
      metadataUri: metadataUri,
      isActive: true,
      createdAt: block.timestamp
    });

    emit AccessTierSetup(tokenId, durationDays, priceWei, name);
  }

  /**
   * @dev Store user inbox ID mapping (callable by bot)
   */
  function storeUserInboxId(address user, string memory inboxId) external {
    require(msg.sender == xmtpInfo.botAddress || msg.sender == owner(), "Not authorized");
    require(bytes(inboxId).length > 0, "Invalid inbox ID");

    // Clear previous mapping if exists
    string memory oldInboxId = userInboxIds[user];
    if (bytes(oldInboxId).length > 0) {
      delete inboxToAddress[oldInboxId];
    }

    // Store new mapping
    userInboxIds[user] = inboxId;
    inboxToAddress[inboxId] = user;

    emit InboxIdStored(user, inboxId);
  }

  /**
   * @dev Purchase access token
   */
  function purchaseAccess(uint256 tokenId) external payable nonReentrant {
    AccessTier memory tier = accessTiers[tokenId];
    require(tier.isActive, "Access tier not active");
    require(msg.value >= tier.priceWei, "Insufficient payment");

    // Calculate expiry
    uint256 expiresAt = block.timestamp + (tier.durationDays * 1 days);

    // Mint token
    _mint(msg.sender, tokenId, 1, "");

    // Store expiry
    userTokenExpiry[msg.sender][tokenId] = expiresAt;

    // Record purchase
    string memory userInboxId = userInboxIds[msg.sender];
    purchaseHistory.push(PurchaseRecord({
      user: msg.sender,
        userInboxId: userInboxId,
        tokenId: tokenId,
      purchasePrice: msg.value,
        purchasedAt: block.timestamp,
        expiresAt: expiresAt,
        isActive: true
    }));

    userPurchases[msg.sender].push(purchaseHistory.length - 1);

    // Handle platform fees
    _handlePlatformFees(msg.value);

    // Handle refund for overpayment
    if (msg.value > tier.priceWei) {
      payable(msg.sender).transfer(msg.value - tier.priceWei);
    }

    emit UserAccessGranted(msg.sender, userInboxId, tokenId, expiresAt);
  }

  /**
   * @dev Check if user has valid access
   */
  function hasValidAccess(address user) external view returns (bool) {
    // Check all token types for valid access
    for (uint256 tokenId = 1; tokenId <= 10; tokenId++) { // Check first 10 token IDs
      if (accessTiers[tokenId].isActive && 
          balanceOf(user, tokenId) > 0 && 
          userTokenExpiry[user][tokenId] > block.timestamp) {
        return true;
      }
    }
    return false;
  }

  /**
   * @dev Check if inbox ID has valid access
   */
  function hasValidAccessByInboxId(string memory inboxId) external view returns (bool) {
    address user = inboxToAddress[inboxId];
    if (user == address(0)) return false;
    
    return this.hasValidAccess(user);
  }

  /**
   * @dev Revoke user access (admin function)
   */
  function revokeAccess(address user, uint256 tokenId, string memory reason) external onlyOwner {
    require(balanceOf(user, tokenId) > 0, "User has no tokens");

    // Burn the token
    _burn(user, tokenId, balanceOf(user, tokenId));

    // Clear expiry
    userTokenExpiry[user][tokenId] = 0;

    string memory userInboxId = userInboxIds[user];
    emit UserAccessRevoked(user, userInboxId, tokenId, reason);
  }

  /**
   * @dev Handle platform fees
   */
  function _handlePlatformFees(uint256 amount) internal {
    // Get fee configuration from factory
    (bool success, bytes memory data) = factory.call(
      abi.encodeWithSignature("feeBasisPoints()")
    );
    require(success, "Failed to get fee basis points");
    uint256 feeBasisPoints = abi.decode(data, (uint256));

    (success, data) = factory.call(
      abi.encodeWithSignature("feeRecipient()")
    );
    require(success, "Failed to get fee recipient");
    address feeRecipient = abi.decode(data, (address));

    if (feeBasisPoints > 0 && feeRecipient != address(0)) {
      uint256 fee = (amount * feeBasisPoints) / 10000;
      if (fee > 0) {
        payable(feeRecipient).transfer(fee);
      }
    }
  }

  /**
   * @dev Get user's purchase history
   */
  function getUserPurchases(address user) external view returns (uint256[] memory) {
    return userPurchases[user];
  }

  /**
   * @dev Get purchase record
   */
  function getPurchaseRecord(uint256 index) external view returns (PurchaseRecord memory) {
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

    emit XMTPGroupsLinked(_salesGroupId, _premiumGroupId, _botAddress, block.timestamp);
  }

  /**
   * @dev Withdraw contract balance (owner only)
   */
  function withdraw() external onlyOwner {
    uint256 balance = address(this).balance;
    require(balance > 0, "No balance to withdraw");
    
    payable(owner()).transfer(balance);
  }

  /**
   * @dev Emergency pause/unpause XMTP integration
   */
  function toggleXMTPIntegration() external onlyOwner {
    xmtpInfo.isActive = !xmtpInfo.isActive;
  }

  /**
   * @dev Override token URI for metadata
   */
  function uri(uint256 tokenId) public view override returns (string memory) {
    AccessTier memory tier = accessTiers[tokenId];
    if (bytes(tier.metadataUri).length > 0) {
      return tier.metadataUri;
    }
    return super.uri(tokenId);
  }

  /**
   * @dev Batch check multiple users' access
   */
  function batchCheckAccess(address[] memory users) external view returns (bool[] memory) {
    bool[] memory results = new bool[](users.length);
    for (uint256 i = 0; i < users.length; i++) {
      results[i] = this.hasValidAccess(users[i]);
    }
    return results;
  }

  /**
   * @dev Get all active access tiers
   */
  function getActiveTiers() external view returns (uint256[] memory) {
    uint256[] memory activeTiers = new uint256[](10); // Max 10 tiers for now
    uint256 count = 0;
    
    for (uint256 i = 1; i <= 10; i++) {
      if (accessTiers[i].isActive) {
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
}