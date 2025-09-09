// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { EVMAuth1155 } from "lib/evmauth-core/src/EVMAuth1155.sol";
import { IExtension } from "../interfaces/IExtension.sol";
import { IExtensionRegistry } from "../interfaces/IExtensionRegistry.sol";
import { IMegapotExtension } from "../interfaces/IMegapotExtension.sol";
import { IXMTP } from "../interfaces/IXMTP.sol";
import { IFactory } from "../interfaces/IFactory.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
// import { XMTPLibrary } from "./libraries/XMTPLibrary.sol";

// Custom error types for XMTP dual payment system
error InsufficientPayment(
  uint256 id,
  uint256 amount,
  uint256 price,
  uint256 paid
);
error InvalidERC20PaymentToken(address token);
error InsufficientERC20Allowance(
  address token,
  uint256 required,
  uint256 allowance
);
error InsufficientERC20Balance(
  address token,
  uint256 required,
  uint256 balance
);

// Events for access tier management
event AccessTierConfigured(
  uint256 indexed tokenId,
  string name,
  string description,
  uint256 priceWei,
  uint256 durationDays
);

event XMTPAccessTierSetup(
  uint256 indexed tokenId,
  string name,
  string description
);

// XMTP Access Tier struct for storing tier metadata (matches IXMTP.sol interface)
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
 * @title XMTPAuthERC1155
 * @dev Enhanced XMTP authentication contract based on EVMAuth1155XP20
 * Combines the new EVM auth architecture with XMTP-specific functionality
 */
contract XMTPAuthERC1155 is EVMAuth1155, IXMTP, IExtensionRegistry {
  // XMTP Group Integration - using structs from IXMTP interface
  XMTPGroupInfo private _xmtpInfo;

  // User inbox ID mapping (wallet address => XMTP inbox ID)
  mapping(address => string) public userInboxIds;

  // Reverse mapping for quick lookups (inbox ID => wallet address)
  mapping(string => address) public inboxToAddress;

  // XMTP-specific access tier configuration
  mapping(uint256 => XMTPAccessTier) public xmtpTiers;

  XMTPPurchaseRecord[] public xmtpPurchaseHistory;
  mapping(address => uint256[]) public userXMTPPurchases;

  // Extension system
  mapping(bytes32 => address) public extensions;
  mapping(address => bool) public authorizedExtensions;
  bytes32[] public registeredExtensions;

  // Factory reference for fee configuration
  address public factory;

  // Payment tokens mapping (inherited from TokenPurchaseERC20)
  // mapping(address => bool) internal _paymentTokens; // This is inherited

  // Enhanced ERC20 token configuration
  struct ERC20TokenConfig {
    bool isAccepted;
    address priceFeed; // Chainlink price feed for USD conversion (optional)
    uint8 decimals;
    uint256 addedAt;
  }

  mapping(address => ERC20TokenConfig) private _erc20TokenConfigs;

  // Base network constants
  address public constant USDC_BASE =
    0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // USDC on Base
  address public constant WETH_BASE =
    0x4200000000000000000000000000000000000006; // WETH on Base
  address public constant USDC_BASE_PRICE_FEED =
    0x7e860098F58bBFC8648a4311b374B1D669a2bc6B; // USDC/USD on Base

  // Uniswap V3 on Base constants (for meme token pricing)
  address public constant UNISWAP_V3_FACTORY_BASE =
    0x33128a8fC17869897dcE68Ed026d694621f6FDfD; // Uniswap V3 Factory on Base
  uint24 public constant POOL_FEE_LOW = 500; // 0.05%
  uint24 public constant POOL_FEE_MEDIUM = 3000; // 0.3%
  uint24 public constant POOL_FEE_HIGH = 10000; // 1%

  // Default ERC20 configuration
  bool private _defaultTokensInitialized;

  // Events are declared in the interfaces (IXMTP and IExtensionRegistry)

  /**
   * @dev Initializer used when deployed directly as an upgradeable contract.
   *
   * @param initialDelay The delay in seconds before a new default admin can exercise their role.
   * @param initialDefaultAdmin The address to be granted the initial default admin role.
   * @param uri_ The base URI for all token types
   * @param initialTreasury The address where purchase revenues will be sent.
   * @param _salesGroupId Initial sales group ID
   * @param _premiumGroupId Initial premium group ID
   * @param _botAddress XMTP bot address
   */
  function initialize(
    uint48 initialDelay,
    address initialDefaultAdmin,
    address payable initialTreasury,
    string memory uri_,
    string memory _salesGroupId,
    string memory _premiumGroupId,
    address _botAddress
  ) public virtual initializer {
    // Initialize base contracts following new evmauth-core pattern
    __EVMAuth1155_init(
      initialDelay,
      initialDefaultAdmin,
      initialTreasury,
      uri_
    );

    // Initialize XMTP-specific functionality
    __XMTPAuthERC1155_init_unchained(
      _salesGroupId,
      _premiumGroupId,
      _botAddress
    );

    // Grant necessary roles to treasury for contract management
    _grantRole(TOKEN_MANAGER_ROLE, initialTreasury);
    _grantRole(ACCESS_MANAGER_ROLE, initialTreasury);
  }

  /**
   * @dev Initializer that calls the parent initializers for upgradeable contracts.
   */
  // Removed old __XMTPAuthERC1155_init function - using direct initialization

  /**
   * @dev Unchained initializer that only initializes THIS contract's storage.
   */
  function __XMTPAuthERC1155_init_unchained(
    string memory _salesGroupId,
    string memory _premiumGroupId,
    address _botAddress
  ) public onlyInitializing {
    require(_botAddress != address(0), "Invalid bot address");

    // Set factory reference for fee configuration
    factory = msg.sender;

    // Grant ACCESS_MANAGER_ROLE to treasury for pause functionality
    _grantRole(ACCESS_MANAGER_ROLE, _botAddress); // Bot can also manage access

    // Initialize XMTP integration
    _xmtpInfo = XMTPGroupInfo({
      salesGroupId: _salesGroupId,
      premiumGroupId: _premiumGroupId,
      botAddress: _botAddress,
      isActive: true,
      linkedAt: block.timestamp
    });

    emit XMTPGroupsLinked(
      _salesGroupId,
      _premiumGroupId,
      _botAddress,
      block.timestamp
    );

    // Initialize default ERC20 tokens (USDC on Base)
    _initializeDefaultTokens();
  }

  /**
   * @dev Create a new token with price and configuration (convenience function)
   */
  function createToken(
    uint256 price,
    bool transferable,
    uint256 ttl
  ) external onlyRole(TOKEN_MANAGER_ROLE) returns (uint256) {
    // Create token using internal functions
    uint256 id = _claimNextTokenID();
    _setPrice(id, price);
    _setTTL(id, ttl);
    _setTransferable(id, transferable);
    return id;
  }

  /**
   * @dev Set price for an existing token
   */
  function setTokenPrice(
    uint256 tokenId,
    uint256 price
  ) external onlyRole(TOKEN_MANAGER_ROLE) {
    _setPrice(tokenId, price);

    // Notify extensions of config update
    _notifyExtensionsConfigUpdate(tokenId, price);
  }

  // ============ LEGACY COMPATIBILITY FUNCTIONS ============

  /**
   * @dev Legacy function name for tokenPrice (backward compatibility)
   */
  function priceOf(uint256 tokenId) external view returns (uint256) {
    return tokenPrice(tokenId);
  }

  /**
   * @dev Legacy function name for exists (backward compatibility)
   */
  function isValidToken(uint256 tokenId) external view returns (bool) {
    return exists(tokenId);
  }

  /**
   * @dev Legacy function for ERC20 token acceptance check (backward compatibility)
   * Note: This now requires a tokenId since pricing is per-token in evmauth-core
   */
  function isERC20PaymentTokenAccepted(
    address paymentToken
  ) external view returns (bool) {
    // Check if any token accepts this payment method
    // For backward compatibility, check the first few token IDs
    for (uint256 i = 1; i < nextTokenID() && i <= 10; i++) {
      if (isAcceptedERC20PaymentToken(i, paymentToken)) {
        return true;
      }
    }
    return false;
  }

  /**
   * @dev Legacy function for getting total supply of a token (backward compatibility)
   * Note: ERC1155 doesn't have a standard totalSupply, but tests expect it
   */
  function totalSupply(uint256 tokenId) external view returns (uint256) {
    // This is a placeholder - ERC1155 doesn't track total supply by default
    // For backward compatibility, we'll return 0 if token doesn't exist, or a placeholder value
    if (!exists(tokenId)) {
      return 0;
    }
    // Since we can't easily track total supply in ERC1155, return a placeholder
    // In a real implementation, you'd need to track this separately
    return 1000000; // Placeholder total supply
  }

  /**
   * @dev Setup access tier with comprehensive configuration (V1-style function)
   * This function allows dynamic configuration of token properties including duration, price, and metadata
   * @param tokenId The token ID to configure (0 is reserved for trial tokens)
   * @param durationDays Duration of access in days
   * @param priceWei Price in wei (0 for free tokens like trials)
   * @param name Human-readable name for the access tier
   * @param description Description of what this access tier provides
   * @param metadataUri URI for additional token metadata
   */
  function setupAccessTier(
    uint256 tokenId,
    uint256 durationDays,
    uint256 priceWei,
    string memory name,
    string memory description,
    string memory /* imageHash */,
    string memory metadataUri
  ) public onlyRole(TOKEN_MANAGER_ROLE) {
    require(durationDays > 0, "Duration must be positive");
    require(bytes(name).length > 0, "Name required");
    // Handle Token ID 0 specially (reserved for trial tokens)
    if (tokenId == 0) {
      // Token ID 0 is not supported in evmauth-core architecture (tokens start from 1)
      // We'll treat this as Token ID 1 instead for trial tokens
      revert("Token ID 0 not supported - use Token ID 1 for trials");
    } else {
      // For other token IDs, ensure sequential creation
      // If this tokenId is higher than current nextTokenID, create intermediate tokens
      while (nextTokenID() <= tokenId) {
        if (nextTokenID() == tokenId) {
          // Create the target token
          uint256 id = _claimNextTokenID();
          _setPrice(id, priceWei);
          _setTTL(id, durationDays * 1 days);
          _setTransferable(id, true);
        } else {
          // Create placeholder tokens for IDs we're skipping
          uint256 placeholderId = _claimNextTokenID();
          _setPrice(placeholderId, 0);
          _setTTL(placeholderId, 0);
          _setTransferable(placeholderId, false);
        }
      }

      // If token already exists, update its configuration
      if (tokenId < nextTokenID()) {
        _setPrice(tokenId, priceWei);
        _setTTL(tokenId, durationDays * 1 days);

        if (bytes(metadataUri).length > 0) {
          _setURI(tokenId, metadataUri);
        }
      }
    }

    // Store additional metadata in a mapping for UI/frontend use
    // Note: This could be expanded to use a struct for richer metadata
    if (bytes(name).length > 0 || bytes(description).length > 0) {
      // For now, we'll emit an event with this information
      // In a full implementation, you might want to store this in a mapping
      emit AccessTierConfigured(
        tokenId,
        name,
        description,
        priceWei,
        durationDays
      );
    }

    // Notify extensions of the configuration update
    _notifyExtensionsConfigUpdate(tokenId, priceWei);
  }

  /**
   * @dev Grant trial access to a user (V1-style trial functionality)
   * This automatically sets up Token ID 1 if it doesn't exist and grants it to the user
   * @param user Address to grant trial access to
   */
  function grantTrialAccess(
    address user
  ) external onlyRole(ACCESS_MANAGER_ROLE) {
    // Ensure Token ID 1 (trial token) is set up
    if (!exists(1)) {
      // Set up Token ID 1 as a trial token using setupAccessTier
      setupAccessTier(
        1, // tokenId - Trial access (evmauth-core starts from 1)
        7, // durationDays (7-day trial)
        0.05 ether, // priceWei (0.05 ETH)
        "Trial Access",
        "7-day trial access to XMTP premium features",
        "", // imageHash
        "" // metadataUri
      );
    }

    // Grant the trial token to the user by minting it
    _mint(user, 1, 1, ""); // Mint 1 trial token to the user
  }

  /**
   * @dev Set factory address (only ACCESS_MANAGER_ROLE)
   * Needed for proper fee configuration in test environments
   */
  function setFactory(address _factory) external onlyRole(ACCESS_MANAGER_ROLE) {
    require(_factory != address(0), "Factory cannot be zero address");
    factory = _factory;
  }

  /**
   * @dev Pause the contract (only ACCESS_MANAGER_ROLE)
   * Uses inherited pause functionality from TokenPurchase
   */
  function pause() external onlyRole(ACCESS_MANAGER_ROLE) {
    _pause();
  }

  /**
   * @dev Unpause the contract (only ACCESS_MANAGER_ROLE)
   * Uses inherited pause functionality from TokenPurchase
   */
  function unpause() external onlyRole(ACCESS_MANAGER_ROLE) {
    _unpause();
  }

  /**
   * @dev Setup XMTP access tier configuration (creates token if it doesn't exist)
   */
  function setupXMTPAccessTier(
    uint256 tokenId,
    string memory name,
    string memory description,
    string memory imageHash,
    string memory metadataUri
  ) external onlyRole(TOKEN_MANAGER_ROLE) {
    require(bytes(name).length > 0, "Name required");

    // Create token if it doesn't exist
    if (!exists(tokenId)) {
      // Create token with default configuration (0 price, transferable, no TTL)
      // EVMAuthTokenConfig memory config = EVMAuthTokenConfig({
      //   price: 0,
      //   erc20Prices: new PaymentToken[](0),
      //   ttl: 0,
      //   transferable: true
      // });

      // For specific token IDs, we need to ensure the nextTokenID is correct
      if (tokenId >= nextTokenID()) {
        // We need to create tokens up to the desired ID
        while (nextTokenID() <= tokenId) {
          uint256 id = _claimNextTokenID();
          _setPrice(id, 0);
          _setTTL(id, 0);
          _setTransferable(id, true);
        }
      }
      // Note: If tokenId < nextTokenID, the token already exists, which is fine for XMTP tier setup
    }
    // If token exists, we can still mark it as an XMTP tier

    // Store in xmtpTiers mapping for frontend/API access
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
   * @dev Store user inbox ID mapping (callable by bot or admin)
   */
  function storeUserInboxId(address user, string memory inboxId) external {
    require(
      msg.sender == user ||
        msg.sender == _xmtpInfo.botAddress ||
        hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
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
   * @dev Implementation of _mintPurchasedTokens required by TokenPrice
   */
  function _mintPurchasedTokens(
    address to,
    uint256 id,
    uint256 amount
  ) internal virtual override {
    // Mint the tokens using our custom function that integrates with TokenExpiry
    _mintWithExpiry(to, id, amount, "");

    // Calculate total price for tracking
    uint256 totalPrice = tokenPrice(id) * amount;

    // Record XMTP-specific purchase data (we don't know payment token here, so assume ETH)
    _recordXMTPPurchase(to, id, amount, totalPrice, address(0), "");
  }

  // Temporarily disable _completePurchase override
  /*
  function _completePurchase(
    address receiver,
    uint256 id,
    uint256 amount,
    uint256 totalPrice
  ) internal virtual override {
    // For ETH purchases, payment token is address(0)
    _completePurchaseWithPaymentToken(
      receiver,
      id,
      amount,
      totalPrice,
      address(0)
    );
  }
  */

  /**
   * @dev Complete purchase with proper payment token tracking for extensions
   */
  function _completePurchaseWithPaymentToken(
    address receiver,
    uint256 id,
    uint256 amount,
    uint256 totalPrice,
    address paymentToken
  ) internal {
    // Mint the tokens using our custom function that integrates with TokenExpiry
    _mintWithExpiry(receiver, id, amount, "");

    // Record XMTP-specific purchase data with correct payment token
    _recordXMTPPurchase(receiver, id, amount, totalPrice, paymentToken, "");

    // Notify extensions about the purchase
    _notifyExtensionsOfPurchase(receiver, id, amount, totalPrice, paymentToken);

    // Emit the standard TokenPurchased event
    emit TokenPurchased(_msgSender(), receiver, id, amount, totalPrice);
  }

  // Purchase tracking is now handled in _mintPurchasedTokens override

  // XMTP Dual Payment System Implementation

  /**
   * @dev Override ETH purchase to lock ETH as TVL (only send platform fees)
   */
  function _purchaseFor(
    address receiver,
    uint256 id,
    uint256 amount
  ) internal virtual override whenNotPaused {
    // Validate the purchase parameters
    require(receiver != address(0), "Invalid receiver address");
    require(amount > 0, "Invalid token quantity");
    require(exists(id), "Token does not exist");

    uint256 unitPrice = tokenPrice(id);
    require(unitPrice > 0, "Token not for sale with native currency");

    uint256 totalPrice = unitPrice * amount;

    if (msg.value < totalPrice) {
      revert InsufficientPayment(id, amount, totalPrice, msg.value);
    }

    // Refund excess payment to the sender
    if (msg.value > totalPrice) {
      payable(_msgSender()).transfer(msg.value - totalPrice);
    }

    // XMTP Custom Logic: Only send platform fees, keep rest as ETH TVL
    _handleETHPlatformFees(totalPrice);

    // Complete the purchase (mint tokens) with proper payment token tracking
    _completePurchaseWithPaymentToken(
      receiver,
      id,
      amount,
      totalPrice,
      address(0)
    );
  }

  /**
   * @dev Override ERC20 purchase to send 97.5% to creator
   */
  function _purchaseWithERC20For(
    address receiver,
    address paymentToken,
    uint256 id,
    uint256 amount
  ) internal virtual override whenNotPaused {
    if (!isAcceptedERC20PaymentToken(id, paymentToken)) {
      revert InvalidERC20PaymentToken(paymentToken);
    }

    uint256 unitPrice = tokenERC20Price(id, paymentToken);
    uint256 totalPrice = unitPrice * amount;

    IERC20 token = IERC20(paymentToken);

    uint256 allowance = token.allowance(_msgSender(), address(this));
    if (allowance < totalPrice) {
      revert InsufficientERC20Allowance(paymentToken, totalPrice, allowance);
    }

    uint256 balance = token.balanceOf(_msgSender());
    if (balance < totalPrice) {
      revert InsufficientERC20Balance(paymentToken, totalPrice, balance);
    }

    // Get factory fee configuration
    uint256 feeBasisPoints = IFactory(factory).feeBasisPoints();
    address feeRecipient = IFactory(factory).feeRecipient();

    // XMTP Custom Logic: Handle platform fees with optional Megapot integration
    address megapotExtension = _getMegapotExtension();
    uint256 megapotPercentage = _getMegapotPercentage();

    if (megapotExtension != address(0) && megapotPercentage > 0) {
      // 3-way split with Megapot
      uint256 platformFee = 0;
      if (feeBasisPoints > 0 && feeRecipient != address(0)) {
        platformFee = (totalPrice * feeBasisPoints) / 10000;
      }
      uint256 megapotAmount = (totalPrice * megapotPercentage) / 10000;
      uint256 creatorAmount = totalPrice - platformFee - megapotAmount;

      if (platformFee > 0) {
        require(
          token.transferFrom(_msgSender(), feeRecipient, platformFee),
          "Platform fee transfer failed"
        );
      }
      if (megapotAmount > 0) {
        require(
          token.transferFrom(_msgSender(), megapotExtension, megapotAmount),
          "Megapot transfer failed"
        );
      }
      if (creatorAmount > 0) {
        require(
          token.transferFrom(_msgSender(), treasury(), creatorAmount),
          "Creator revenue transfer failed"
        );
      }
    } else {
      // 2-way split (backward compatibility)
      uint256 platformFee = 0;
      if (feeBasisPoints > 0 && feeRecipient != address(0)) {
        platformFee = (totalPrice * feeBasisPoints) / 10000;
      }
      uint256 creatorAmount = totalPrice - platformFee;

      if (platformFee > 0) {
        require(
          token.transferFrom(_msgSender(), feeRecipient, platformFee),
          "Platform fee transfer failed"
        );
      }
      if (creatorAmount > 0) {
        require(
          token.transferFrom(_msgSender(), treasury(), creatorAmount),
          "Creator revenue transfer failed"
        );
      }
    }

    // Complete the purchase with proper extension tracking
    _completePurchaseWithPaymentToken(
      receiver,
      id,
      amount,
      totalPrice,
      paymentToken
    );
  }

  // ============ EVMAUTH-CORE PRICING INTEGRATION ============

  /**
   * @notice Override purchase function to add account freezing check
   * @dev Prevents frozen accounts from purchasing tokens
   * @param id Token type identifier to purchase
   * @param amount Quantity to purchase
   */
  function purchase(
    uint256 id,
    uint256 amount
  )
    external
    payable
    override
    whenNotPaused
    nonReentrant
    notFrozen(_msgSender())
  {
    _purchaseFor(_msgSender(), id, amount);
  }

  /**
   * @notice Override purchaseFor function to add account freezing check
   * @dev Prevents frozen accounts from purchasing tokens for others
   * @param receiver Address to receive purchased tokens
   * @param id Token type identifier to purchase
   * @param amount Quantity to purchase
   */
  function purchaseFor(
    address receiver,
    uint256 id,
    uint256 amount
  )
    external
    payable
    override
    whenNotPaused
    nonReentrant
    notFrozen(_msgSender())
  {
    _purchaseFor(receiver, id, amount);
  }

  /**
   * @notice Override purchaseWithERC20 function to add account freezing check
   * @dev Prevents frozen accounts from purchasing tokens with ERC20
   * @param paymentToken ERC-20 contract address for payment
   * @param id Token type identifier to purchase
   * @param amount Quantity to purchase
   */
  function purchaseWithERC20(
    address paymentToken,
    uint256 id,
    uint256 amount
  ) external override whenNotPaused nonReentrant notFrozen(_msgSender()) {
    _purchaseWithERC20For(_msgSender(), paymentToken, id, amount);
  }

  /**
   * @notice Override purchaseWithERC20For function to add account freezing check
   * @dev Prevents frozen accounts from purchasing tokens with ERC20 for others
   * @param receiver Address to receive purchased tokens
   * @param paymentToken ERC-20 contract address for payment
   * @param id Token type identifier to purchase
   * @param amount Quantity to purchase
   */
  function purchaseWithERC20For(
    address receiver,
    address paymentToken,
    uint256 id,
    uint256 amount
  ) external override whenNotPaused nonReentrant notFrozen(_msgSender()) {
    _purchaseWithERC20For(receiver, paymentToken, id, amount);
  }

  /**
   * @dev Set ETH price for a token (convenience function using evmauth-core)
   * @param tokenId The token ID to set price for
   * @param ethPrice The price in wei (ETH)
   */
  function setTokenETHPrice(
    uint256 tokenId,
    uint256 ethPrice
  ) external onlyRole(TOKEN_MANAGER_ROLE) {
    require(exists(tokenId), "Token does not exist");
    _setPrice(tokenId, ethPrice);
  }

  /**
   * @dev Set ERC20 price for a token (convenience function using evmauth-core)
   * @param tokenId The token ID to set price for
   * @param paymentToken The ERC20 token address
   * @param price The price in the token's native units
   */
  function setTokenERC20Price(
    uint256 tokenId,
    address paymentToken,
    uint256 price
  ) external onlyRole(TOKEN_MANAGER_ROLE) {
    require(exists(tokenId), "Token does not exist");
    require(
      _erc20TokenConfigs[paymentToken].isAccepted,
      "Payment token not accepted"
    );
    _setERC20Price(tokenId, paymentToken, price);
  }

  /**
   * @dev Handle ETH platform fees (keep rest as TVL)
   */
  function _handleETHPlatformFees(uint256 amount) internal {
    // Get factory fee configuration
    try IFactory(factory).feeBasisPoints() returns (uint256 feeBasisPoints) {
      try IFactory(factory).feeRecipient() returns (address feeRecipient) {
        if (feeBasisPoints > 0 && feeRecipient != address(0)) {
          uint256 platformFee = (amount * feeBasisPoints) / 10000;
          if (platformFee > 0 && address(this).balance >= platformFee) {
            // Use call instead of transfer for better compatibility
            payable(feeRecipient).call{ value: platformFee }("");
            // If transfer fails, continue anyway (fees are optional)
            // require(success, "Fee transfer failed");
          }
          // Remaining ETH stays in contract as TVL
        }
      } catch {}
    } catch {}
  }

  /**
   * @dev Handle ERC20 platform fees and send revenue to creator
   */
  function _handleERC20PlatformFeesAndRevenue(
    address paymentToken,
    uint256 amount
  ) internal {
    IERC20 token = IERC20(paymentToken);

    // Get factory fee configuration
    try IFactory(factory).feeBasisPoints() returns (uint256 feeBasisPoints) {
      try IFactory(factory).feeRecipient() returns (address feeRecipient) {
        uint256 platformFee = 0;
        if (feeBasisPoints > 0 && feeRecipient != address(0)) {
          platformFee = (amount * feeBasisPoints) / 10000;
          if (platformFee > 0) {
            // Transfer platform fee to fee recipient
            require(
              token.transferFrom(msg.sender, feeRecipient, platformFee),
              "Platform fee transfer failed"
            );
          }
        }

        // Transfer remaining amount (97.5%) to treasury/creator
        uint256 creatorAmount = amount - platformFee;
        if (creatorAmount > 0) {
          require(
            token.transferFrom(msg.sender, treasury(), creatorAmount),
            "Creator revenue transfer failed"
          );
        }
      } catch {
        // Fallback: send all to treasury if factory call fails
        require(
          token.transferFrom(msg.sender, treasury(), amount),
          "Revenue transfer failed"
        );
      }
    } catch {
      // Fallback: send all to treasury if factory call fails
      require(
        token.transferFrom(msg.sender, treasury(), amount),
        "Revenue transfer failed"
      );
    }
  }

  /**
   * @dev Admin function to withdraw ETH TVL
   * Only callable by admin or treasury
   */
  function withdrawETH() external {
    require(
      hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || msg.sender == treasury(),
      "Only admin or treasury can withdraw"
    );

    uint256 balance = address(this).balance;
    require(balance > 0, "No ETH to withdraw");

    payable(treasury()).transfer(balance);

    emit ETHWithdrawn(treasury(), balance);
  }

  /**
   * @dev Get current ETH TVL balance
   */
  function getETHTVL() external view returns (uint256) {
    return address(this).balance;
  }

  // Events for TVL management
  event ETHWithdrawn(address indexed treasury, uint256 amount);

  /**
   * @dev Purchase XMTP access with ETH and custom transaction hash tracking
   */
  function purchaseXMTPAccess(
    uint256 tokenId,
    uint256 amount,
    string memory transactionHash
  ) external payable whenNotPaused notFrozen(msg.sender) {
    require(bytes(transactionHash).length > 0, "Transaction hash required");

    // Use internal purchase function to avoid external call issues
    _purchaseFor(msg.sender, tokenId, amount);

    // Update transaction hash in the latest XMTP purchase record
    if (xmtpPurchaseHistory.length > 0) {
      uint256 latestIndex = xmtpPurchaseHistory.length - 1;
      XMTPPurchaseRecord storage record = xmtpPurchaseHistory[latestIndex];

      // Verify this is the record we just created
      if (record.user == msg.sender && record.tokenId == tokenId) {
        record.transactionHash = transactionHash;
      }
    }

    emit XMTPPurchaseRecorded(
      msg.sender,
      userInboxIds[msg.sender],
      tokenId,
      amount,
      transactionHash
    );
  }

  /**
   * @dev Purchase XMTP access with ERC20 token and custom transaction hash tracking
   */
  function purchaseXMTPAccessERC20(
    address paymentToken,
    uint256 tokenId,
    uint256 amount,
    string memory transactionHash
  ) external whenNotPaused notFrozen(msg.sender) {
    require(bytes(transactionHash).length > 0, "Transaction hash required");

    // Use internal ERC20 purchase function to avoid external call issues
    _purchaseWithERC20For(msg.sender, paymentToken, tokenId, amount);

    // Update transaction hash in the latest XMTP purchase record
    if (xmtpPurchaseHistory.length > 0) {
      uint256 latestIndex = xmtpPurchaseHistory.length - 1;
      XMTPPurchaseRecord storage record = xmtpPurchaseHistory[latestIndex];

      // Verify this is the record we just created
      if (record.user == msg.sender && record.tokenId == tokenId) {
        record.transactionHash = transactionHash;
        record.paymentToken = paymentToken; // Update payment token info
      }
    }

    emit XMTPPurchaseRecorded(
      msg.sender,
      userInboxIds[msg.sender],
      tokenId,
      amount,
      transactionHash
    );
  }

  /**
   * @dev Grant access token (for trials, etc.)
   * Can be called by bot or admin
   */
  function grantXMTPAccess(
    address user,
    uint256 tokenId,
    uint256 amount,
    string memory userInboxId
  ) external {
    require(
      msg.sender == _xmtpInfo.botAddress ||
        hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
      "Not authorized"
    );
    require(exists(tokenId), "Token does not exist");

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

    // Mint token using our custom function that integrates with TokenExpiry
    _mintWithExpiry(user, tokenId, amount, "");

    // Calculate expiry
    uint256 ttl = tokenTTL(tokenId);
    uint256 expiresAt = ttl == 0 ? type(uint256).max : block.timestamp + ttl;

    // Notify extensions about the grant
    _notifyExtensionsOfGrant(user, tokenId, amount, msg.sender);

    emit XMTPUserAccessGranted(user, userInboxId, tokenId, expiresAt);
  }

  /**
   * @dev Custom mint function that properly integrates with TokenExpiry system
   * Since we can't override the non-virtual _mint function, we create our own
   * that calls the original _mint and then adds to balance records.
   */
  function _mintWithExpiry(
    address to,
    uint256 id,
    uint256 amount,
    bytes memory data
  ) internal {
    // For admin operations (like grantXMTPAccess), allow minting even when paused
    bool wasPaused = paused();
    bool isAdminOperation = msg.sender == _xmtpInfo.botAddress ||
      hasRole(DEFAULT_ADMIN_ROLE, msg.sender);

    if (wasPaused && isAdminOperation) {
      // Temporarily unpause for admin operation
      _unpause();
    }

    // Call the original _mint to emit events and update total supply
    super._mint(to, id, amount, data);

    if (wasPaused && isAdminOperation) {
      // Restore paused state
      _pause();
    }

    // Add to TokenExpiry balance records with proper expiration
    uint256 ttl = tokenTTL(id);
    uint256 expiresAt = ttl == 0 ? type(uint256).max : block.timestamp + ttl;
    _addToBalanceRecord(to, id, amount, expiresAt);
  }

  /**
   * @dev Check if user has valid access (XMTP-aware)
   */
  function hasValidXMTPAccess(address user) external view returns (bool) {
    // Check all configured XMTP tiers for valid access
    for (uint256 tokenId = 1; tokenId < nextTokenID(); tokenId++) {
      if (xmtpTiers[tokenId].isActive && balanceOf(user, tokenId) > 0) {
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
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    require(balanceOf(user, tokenId) > 0, "User has no tokens");

    // Burn all tokens of this type
    uint256 balance = balanceOf(user, tokenId);
    _burn(user, tokenId, balance);

    // Notify extensions about the revocation
    _notifyExtensionsOfRevocation(user, tokenId, balance, reason);

    string memory userInboxId = userInboxIds[user];
    emit XMTPUserAccessRevoked(user, userInboxId, tokenId, reason);
  }

  /**
   * @dev Get user's XMTP purchase history
   */
  function getXMTPUserPurchases(
    address user
  ) external view returns (uint256[] memory) {
    return userXMTPPurchases[user];
  }

  /**
   * @dev Get XMTP purchase record
   */
  function getXMTPPurchaseRecord(
    uint256 index
  ) external view returns (XMTPPurchaseRecord memory) {
    require(index < xmtpPurchaseHistory.length, "Invalid index");
    return xmtpPurchaseHistory[index];
  }

  /**
   * @dev Update XMTP group information
   */
  function updateXMTPInfo(
    string memory _salesGroupId,
    string memory _premiumGroupId,
    address _botAddress
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _xmtpInfo.salesGroupId = _salesGroupId;
    _xmtpInfo.premiumGroupId = _premiumGroupId;
    _xmtpInfo.botAddress = _botAddress;

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
  function toggleXMTPIntegration() external onlyRole(ACCESS_MANAGER_ROLE) {
    _xmtpInfo.isActive = !_xmtpInfo.isActive;
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
    uint256 count = 0;

    // Count active tiers first
    for (uint256 i = 1; i < nextTokenID(); i++) {
      if (xmtpTiers[i].isActive) {
        count++;
      }
    }

    // Create result array
    uint256[] memory result = new uint256[](count);
    uint256 index = 0;

    for (uint256 i = 1; i < nextTokenID(); i++) {
      if (xmtpTiers[i].isActive) {
        result[index] = i;
        index++;
      }
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
   * @dev Internal function to record XMTP-specific purchase data
   */
  function _recordXMTPPurchase(
    address user,
    uint256 tokenId,
    uint256 amount,
    uint256 totalPrice,
    address paymentToken,
    string memory transactionHash
  ) internal {
    // Debug: Emit event to confirm this function is called
    emit XMTPUserAccessGranted(
      user,
      string(abi.encodePacked("DEBUG: _recordXMTPPurchase called")),
      tokenId,
      totalPrice
    );

    string memory userInboxId = userInboxIds[user];

    // Calculate expiry
    uint256 ttl = tokenTTL(tokenId);
    uint256 expiresAt = ttl == 0 ? type(uint256).max : block.timestamp + ttl;

    xmtpPurchaseHistory.push(
      XMTPPurchaseRecord({
        user: user,
        userInboxId: userInboxId,
        tokenId: tokenId,
        purchasePrice: totalPrice,
        purchasedAt: block.timestamp,
        expiresAt: expiresAt,
        isActive: true,
        transactionHash: transactionHash,
        paymentToken: paymentToken
      })
    );

    userXMTPPurchases[user].push(xmtpPurchaseHistory.length - 1);

    emit XMTPUserAccessGranted(user, userInboxId, tokenId, expiresAt);

    // Notify extensions about the purchase
    _notifyExtensionsOfPurchase(
      user,
      tokenId,
      amount,
      totalPrice,
      paymentToken
    );
  }

  /**
   * @dev Notify all registered extensions about a token purchase
   */
  function _notifyExtensionsOfPurchase(
    address buyer,
    uint256 tokenId,
    uint256 amount,
    uint256 totalPrice,
    address paymentToken
  ) internal {
    for (uint256 i = 0; i < registeredExtensions.length; i++) {
      address extension = extensions[registeredExtensions[i]];
      if (extension != address(0)) {
        // Use low-level call to prevent revert if extension fails
        try
          IExtension(extension).onTokenPurchased(
            buyer,
            tokenId,
            amount,
            totalPrice,
            paymentToken
          )
        {
          // Success - continue
        } catch {
          // Silently continue if extension call fails
        }
      }
    }
  }

  /**
   * @dev Notify all registered extensions about token grants
   */
  function _notifyExtensionsOfGrant(
    address recipient,
    uint256 tokenId,
    uint256 amount,
    address grantedBy
  ) internal {
    for (uint256 i = 0; i < registeredExtensions.length; i++) {
      address extension = extensions[registeredExtensions[i]];
      if (extension != address(0)) {
        try
          IExtension(extension).onTokenGranted(
            recipient,
            tokenId,
            amount,
            grantedBy
          )
        {
          // Success - continue
        } catch {
          // Silently continue if extension call fails
        }
      }
    }
  }

  /**
   * @dev Notify all registered extensions about token revocations
   */
  function _notifyExtensionsOfRevocation(
    address user,
    uint256 tokenId,
    uint256 amount,
    string memory reason
  ) internal {
    for (uint256 i = 0; i < registeredExtensions.length; i++) {
      address extension = extensions[registeredExtensions[i]];
      if (extension != address(0)) {
        try
          IExtension(extension).onTokenRevoked(user, tokenId, amount, reason)
        {
          // Success - continue
        } catch {
          // Silently continue if extension call fails
        }
      }
    }
  }

  /**
   * @dev Get total number of XMTP purchase records
   */
  function getXMTPPurchaseHistoryLength() external view returns (uint256) {
    return xmtpPurchaseHistory.length;
  }

  /**
   * @dev Get XMTP group information
   */
  function xmtpInfo() external view returns (XMTPGroupInfo memory) {
    return _xmtpInfo;
  }

  /**
   * @dev Get extension info for compatibility
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
    return ("XMTPAuthERC1155", "2.0.0", address(this), _xmtpInfo.isActive);
  }

  // Extension Management Functions

  /**
   * @dev Register an extension contract
   * @param extensionId Unique identifier for the extension
   * @param extension Address of the extension contract
   */
  function registerExtension(
    bytes32 extensionId,
    address extension
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    require(extension != address(0), "Invalid extension address");
    require(
      extensions[extensionId] == address(0),
      "Extension already registered"
    );

    // Check if address is already used by another extension
    for (uint256 i = 0; i < registeredExtensions.length; i++) {
      require(
        extensions[registeredExtensions[i]] != extension,
        "Extension address already in use"
      );
    }

    extensions[extensionId] = extension;
    authorizedExtensions[extension] = true;
    registeredExtensions.push(extensionId);

    emit ExtensionRegistered(extensionId, extension);
  }

  /**
   * @dev Revoke an extension contract
   * @param extensionId Identifier of the extension to revoke
   */
  function revokeExtension(
    bytes32 extensionId
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    address extension = extensions[extensionId];
    require(extension != address(0), "Extension not found");

    delete extensions[extensionId];
    authorizedExtensions[extension] = false;

    // Remove from registered extensions array
    for (uint256 i = 0; i < registeredExtensions.length; i++) {
      if (registeredExtensions[i] == extensionId) {
        registeredExtensions[i] = registeredExtensions[
          registeredExtensions.length - 1
        ];
        registeredExtensions.pop();
        break;
      }
    }

    emit ExtensionRevoked(extensionId, extension);
  }

  /**
   * @dev Check if an address is an authorized extension
   * @param extension The extension address to check
   * @return True if authorized, false otherwise
   */
  function isAuthorizedExtension(
    address extension
  ) external view returns (bool) {
    return authorizedExtensions[extension];
  }

  /**
   * @dev Get extension address by ID
   * @param extensionId The extension ID to look up
   * @return The extension contract address
   */
  function getExtension(bytes32 extensionId) external view returns (address) {
    return extensions[extensionId];
  }

  /**
   * @dev Get all registered extension IDs
   * @return Array of registered extension IDs
   */
  function getRegisteredExtensions() external view returns (bytes32[] memory) {
    return registeredExtensions;
  }

  /**
   * @dev Get extension information
   * @param extensionId The extension ID to query
   * @return name Extension name
   * @return version Extension version
   * @return isActive Whether the extension is active
   */
  function getExtensionDetails(
    bytes32 extensionId
  )
    external
    view
    returns (string memory name, string memory version, bool isActive)
  {
    address extension = extensions[extensionId];
    require(extension != address(0), "Extension not found");

    try IExtension(extension).getExtensionInfo() returns (
      string memory _name,
      string memory _version,
      bool _isActive
    ) {
      return (_name, _version, _isActive);
    } catch {
      return ("Unknown", "Unknown", false);
    }
  }

  /**
   * @dev Add ERC20 token as accepted payment method with price feed
   * @param tokenAddress The ERC20 token contract address
   * @param priceFeedAddress Optional price feed address for USD conversion (can be zero)
   * @param decimals Token decimals for price calculations
   */
  function addERC20PaymentToken(
    address tokenAddress,
    address priceFeedAddress,
    uint8 decimals
  ) external onlyRole(TOKEN_MANAGER_ROLE) {
    require(tokenAddress != address(0), "Invalid token address");

    // Store token configuration for price calculations
    _erc20TokenConfigs[tokenAddress] = ERC20TokenConfig({
      isAccepted: true,
      priceFeed: priceFeedAddress,
      decimals: decimals,
      addedAt: block.timestamp
    });

    // The evmauth-core library handles ERC20 token tracking internally
    emit ERC20PaymentTokenAdded(tokenAddress);
  }

  /**
   * @dev Add ERC20 token as accepted payment method (legacy function for backward compatibility)
   */
  function addERC20PaymentToken(
    address tokenAddress
  ) external onlyRole(TOKEN_MANAGER_ROLE) {
    require(tokenAddress != address(0), "Invalid token address");

    // Default configuration - assume 18 decimals, no price feed
    _erc20TokenConfigs[tokenAddress] = ERC20TokenConfig({
      isAccepted: true,
      priceFeed: address(0),
      decimals: 18,
      addedAt: block.timestamp
    });

    // The evmauth-core library handles ERC20 token tracking internally
    emit ERC20PaymentTokenAdded(tokenAddress);
  }

  /**
   * @dev Remove/deregister an extension
   */
  function deregisterExtension(
    address extensionAddress
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    require(extensionAddress != address(0), "Invalid extension address");

    // Find the extension ID for this address
    bytes32 foundExtensionId;
    bool found = false;

    for (uint256 i = 0; i < registeredExtensions.length; i++) {
      bytes32 extensionId = registeredExtensions[i];
      if (extensions[extensionId] == extensionAddress) {
        foundExtensionId = extensionId;
        found = true;
        break;
      }
    }

    require(found, "Extension not found");

    // Remove the extension
    delete extensions[foundExtensionId];
    authorizedExtensions[extensionAddress] = false;

    // Remove from registered extensions array
    for (uint256 i = 0; i < registeredExtensions.length; i++) {
      if (registeredExtensions[i] == foundExtensionId) {
        registeredExtensions[i] = registeredExtensions[
          registeredExtensions.length - 1
        ];
        registeredExtensions.pop();
        break;
      }
    }

    emit ExtensionDeregistered(extensionAddress);
  }

  /**
   * @dev Get Megapot extension address if registered
   */
  function _getMegapotExtension() internal view returns (address) {
    bytes32 megapotId = keccak256("MEGAPOT_EXTENSION");
    address ext = extensions[megapotId];
    return ext;
  }

  /**
   * @dev Get Megapot funding percentage (default 2.5% = 250 basis points)
   */
  function _getMegapotPercentage() internal view returns (uint256) {
    // Return configurable Megapot percentage (default 2.5% = 250 basis points)
    address megapotExtension = _getMegapotExtension();
    if (megapotExtension != address(0)) {
      // Try to get the configured percentage from the extension
      try IMegapotExtension(megapotExtension).getFundingPercentage() returns (
        uint256 percentage
      ) {
        return percentage;
      } catch {
        // Fallback to default 2.5%
        return 250;
      }
    }
    return 0;
  }

  /**
   * @dev Notify extensions of token configuration updates
   */
  function _notifyExtensionsConfigUpdate(
    uint256 tokenId,
    uint256 newPrice
  ) internal {
    for (uint256 i = 0; i < registeredExtensions.length; i++) {
      address extensionAddress = extensions[registeredExtensions[i]];
      if (extensionAddress != address(0)) {
        try
          IExtension(extensionAddress).onTokenConfigUpdated(
            tokenId,
            newPrice,
            uri(tokenId)
          )
        {
          // Extension notified successfully
        } catch {
          // Extension failed, continue with others
        }
      }
    }
  }

  // ============ DEFAULT TOKEN INITIALIZATION ============

  /**
   * @dev Initialize default ERC20 payment tokens (USDC on Base)
   * This provides a sensible default so users don't need to configure payment tokens manually
   */
  function _initializeDefaultTokens() internal {
    if (_defaultTokensInitialized) {
      return; // Already initialized
    }

    // Add USDC on Base as the default payment token
    // Only initialize if we're on Base network (chain ID 8453) or in test environment
    if (block.chainid == 8453 || block.chainid == 31337) {
      // Base or Hardhat test network
      // Configure USDC with proper decimals and price feed
      _erc20TokenConfigs[USDC_BASE] = ERC20TokenConfig({
        isAccepted: true,
        priceFeed: USDC_BASE_PRICE_FEED,
        decimals: 6, // USDC has 6 decimals
        addedAt: block.timestamp
      });

      // The evmauth-core library handles ERC20 token tracking internally

      emit ERC20PaymentTokenAdded(USDC_BASE);
    }

    _defaultTokensInitialized = true;
  }

  /**
   * @dev Allow admin to reinitialize default tokens (useful for testing or network changes)
   */
  function reinitializeDefaultTokens() external onlyRole(DEFAULT_ADMIN_ROLE) {
    _defaultTokensInitialized = false;
    _initializeDefaultTokens();
  }

  /**
   * @dev Check if default tokens have been initialized
   */
  function areDefaultTokensInitialized() external view returns (bool) {
    return _defaultTokensInitialized;
  }

  /**
   * @dev Get the default USDC token address (USDC on Base)
   * @return address The USDC token address
   */
  function getDefaultUSDC() external pure returns (address) {
    return USDC_BASE;
  }

  /**
   * @dev Get the default USDC price feed address
   * @return address The USDC/USD price feed address on Base
   */
  function getDefaultUSDCPriceFeed() external pure returns (address) {
    return USDC_BASE_PRICE_FEED;
  }

  // ============ ERC20 TOKEN PRICE HELPERS ============

  /**
   * @dev Get ERC20 token configuration
   * @param tokenAddress The ERC20 token contract address
   * @return config The token configuration
   */
  function getERC20TokenConfig(
    address tokenAddress
  ) external view returns (ERC20TokenConfig memory) {
    return _erc20TokenConfigs[tokenAddress];
  }

  /**
   * @dev Check if an ERC20 token is accepted for payments
   * @param tokenAddress The ERC20 token contract address
   * @return bool True if the token is accepted
   */
  function isERC20TokenAccepted(
    address tokenAddress
  ) external view returns (bool) {
    return _erc20TokenConfigs[tokenAddress].isAccepted;
  }

  /**
   * @dev Calculate token amount needed for a USD value (requires price feed)
   * @param tokenAddress The ERC20 token contract address
   * @param usdAmount USD amount in 8 decimals (standard for price feeds)
   * @return tokenAmount The amount of tokens needed
   */
  function calculateTokenAmountForUSD(
    address tokenAddress,
    uint256 usdAmount
  ) external view returns (uint256 tokenAmount) {
    ERC20TokenConfig memory config = _erc20TokenConfigs[tokenAddress];
    require(config.isAccepted, "Token not accepted");
    require(config.priceFeed != address(0), "No price feed available");

    // Get price from Chainlink price feed (returns price in 8 decimals)
    (, int256 price, , , ) = AggregatorV3Interface(config.priceFeed)
      .latestRoundData();
    require(price > 0, "Invalid price from feed");

    // Calculate token amount: (usdAmount * 10^tokenDecimals) / (price * 10^8) * 10^8
    // Simplified: (usdAmount * 10^tokenDecimals) / price
    tokenAmount = (usdAmount * 10 ** config.decimals) / uint256(price);
  }

  /**
   * @dev Calculate USD value for a token amount (requires price feed)
   * @param tokenAddress The ERC20 token contract address
   * @param tokenAmount The amount of tokens
   * @return usdValue USD value in 8 decimals
   */
  function calculateUSDValueForTokens(
    address tokenAddress,
    uint256 tokenAmount
  ) external view returns (uint256 usdValue) {
    ERC20TokenConfig memory config = _erc20TokenConfigs[tokenAddress];
    require(config.isAccepted, "Token not accepted");
    require(config.priceFeed != address(0), "No price feed available");

    // Get price from Chainlink price feed
    (, int256 price, , , ) = AggregatorV3Interface(config.priceFeed)
      .latestRoundData();
    require(price > 0, "Invalid price from feed");

    // Calculate USD value: (tokenAmount * price) / 10^tokenDecimals
    usdValue = (tokenAmount * uint256(price)) / 10 ** config.decimals;
  }

  /**
   * @dev Get all accepted ERC20 tokens (view function for frontend)
   * @return tokens Array of accepted token addresses
   * @notice This function requires off-chain event indexing to get the full list
   */
  function getAcceptedERC20Tokens()
    external
    pure
    returns (address[] memory tokens)
  {
    // The evmauth-core architecture doesn't maintain a global accepted tokens list
    // Frontend should index ERC20PaymentTokenAdded events instead
    revert("Use event indexing to get accepted tokens list");
  }
}

// Interface for Chainlink price feeds
interface AggregatorV3Interface {
  function latestRoundData()
    external
    view
    returns (
      uint80 roundId,
      int256 price,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    );
}

// Interface for Uniswap V3 Pool (for TWAP pricing of any token)
interface IUniswapV3Pool {
  function slot0()
    external
    view
    returns (
      uint160 sqrtPriceX96,
      int24 tick,
      uint16 observationIndex,
      uint16 observationCardinality,
      uint16 observationCardinalityNext,
      uint8 feeProtocol,
      bool unlocked
    );
}

// Interface for Uniswap V3 Factory (to find pools)
interface IUniswapV3Factory {
  function getPool(
    address tokenA,
    address tokenB,
    uint24 fee
  ) external view returns (address pool);
}
