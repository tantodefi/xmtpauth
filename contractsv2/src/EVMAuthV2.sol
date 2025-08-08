// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./base/EVMAuthExpiringERC1155.sol";

/**
 * @title EVMAuthV2
 * @dev Enhanced EVMAuth implementation with extensible architecture
 * Provides the core EVMAuth functionality as a base for extensions
 */
contract EVMAuthV2 is EVMAuthExpiringERC1155 {
  // Data structure for token metadata, including price and TTL
  struct TokenMetadata {
    uint256 id;
    bool active;
    bool burnable;
    bool transferable;
    uint256 price;
    uint256 ttl;
  }

  // Extension registry for plugin architecture
  mapping(bytes32 => address) public extensions;
  mapping(address => bool) public authorizedExtensions;

  // Events
  event TokenMetadataCreated(uint256 indexed id, TokenMetadata metadata);
  event TokenMetadataUpdated(
    uint256 indexed id,
    TokenMetadata oldMetadata,
    TokenMetadata newMetadata
  );
  event ExtensionRegistered(bytes32 indexed name, address indexed extension);
  event ExtensionRevoked(bytes32 indexed name, address indexed extension);

  /**
   * @dev Constructor
   * @param name Name of the EIP-712 signing domain
   * @param version Current major version of the EIP-712 signing domain
   * @param uri URI for ERC-1155 token metadata
   * @param delay Delay (in seconds) for transfer of contract ownership
   * @param owner Address of the contract owner
   */
  constructor(
    string memory name,
    string memory version,
    string memory uri,
    uint48 delay,
    address owner
  ) EVMAuthExpiringERC1155(name, version, uri, delay, owner) {}

  /**
   * @dev Register an extension contract
   * @param name The name identifier for the extension
   * @param extension The address of the extension contract
   */
  function registerExtension(bytes32 name, address extension) external {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Unauthorized admin");
    require(extension != address(0), "Invalid extension address");

    extensions[name] = extension;
    authorizedExtensions[extension] = true;

    emit ExtensionRegistered(name, extension);
  }

  /**
   * @dev Revoke an extension contract
   * @param name The name identifier for the extension
   */
  function revokeExtension(bytes32 name) external {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Unauthorized admin");

    address extension = extensions[name];
    require(extension != address(0), "Extension not found");

    delete extensions[name];
    authorizedExtensions[extension] = false;

    emit ExtensionRevoked(name, extension);
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
   * @dev Get the metadata of a token
   * @param id The ID of the token to check
   * @return The metadata of the token, including price and TTL
   */
  function metadataOf(uint256 id) public view returns (TokenMetadata memory) {
    // Retrieve the base token metadata
    BaseMetadata memory baseMetadata = baseMetadataOf(id);

    // Retrieve the price and TTL for the token
    uint256 price = priceOf(id);
    uint256 ttl = ttlOf(id);

    // Combine all metadata into a single structure
    TokenMetadata memory metadata = TokenMetadata({
      id: baseMetadata.id,
      active: baseMetadata.active,
      burnable: baseMetadata.burnable,
      transferable: baseMetadata.transferable,
      price: price,
      ttl: ttl
    });

    return metadata;
  }

  /**
   * @dev Get metadata for all tokens
   */
  function metadataOfAll() public view returns (TokenMetadata[] memory) {
    TokenMetadata[] memory result = new TokenMetadata[](nextTokenId);

    // Use *OfAll methods to efficiently collect metadata
    BaseMetadata[] memory baseMetadataArray = baseMetadataOfAll();
    uint256[] memory priceArray = priceOfAll();
    uint256[] memory ttlArray = ttlOfAll();

    // Combine all metadata into a single structure
    for (uint256 i = 0; i < nextTokenId; i++) {
      result[i] = TokenMetadata({
        id: baseMetadataArray[i].id,
        active: baseMetadataArray[i].active,
        burnable: baseMetadataArray[i].burnable,
        transferable: baseMetadataArray[i].transferable,
        price: priceArray[i],
        ttl: ttlArray[i]
      });
    }

    return result;
  }

  /**
   * @dev Get the metadata of a batch of tokens
   * @param ids The IDs of the tokens to check
   * @return result The metadata of the tokens, including price and TTL
   */
  function metadataOfBatch(
    uint256[] memory ids
  ) public view returns (TokenMetadata[] memory) {
    TokenMetadata[] memory result = new TokenMetadata[](ids.length);

    // Use *OfBatch methods to efficiently collect metadata
    BaseMetadata[] memory baseMetadataArray = baseMetadataOfBatch(ids);
    uint256[] memory priceArray = priceOfBatch(ids);
    uint256[] memory ttlArray = ttlOfBatch(ids);

    // Combine all metadata into a single structure
    for (uint256 i = 0; i < ids.length; i++) {
      result[i] = TokenMetadata({
        id: baseMetadataArray[i].id,
        active: baseMetadataArray[i].active,
        burnable: baseMetadataArray[i].burnable,
        transferable: baseMetadataArray[i].transferable,
        price: priceArray[i],
        ttl: ttlArray[i]
      });
    }

    return result;
  }

  /**
   * @dev Set comprehensive metadata for a token
   * @param id The ID of the token
   * @param _active Whether the token is active
   * @param _burnable Whether the token is burnable
   * @param _transferable Whether the token is transferable
   * @param _price The price of the token (0 if not for sale)
   * @param _ttl The time-to-live in seconds (0 for non-expiring)
   */
  function setMetadata(
    uint256 id,
    bool _active,
    bool _burnable,
    bool _transferable,
    uint256 _price,
    uint256 _ttl
  ) external {
    require(
      hasRole(TOKEN_MANAGER_ROLE, _msgSender()),
      "Unauthorized token manager"
    );

    // If the token ID already exists, capture its current state
    bool isUpdate = id < nextTokenId;
    TokenMetadata memory oldMetadata;
    if (isUpdate) {
      oldMetadata = metadataOf(id);
    }

    // Set base token metadata
    setBaseMetadata(id, _active, _burnable, _transferable);

    // Set token price (requires FINANCE_MANAGER_ROLE)
    if (hasRole(FINANCE_MANAGER_ROLE, _msgSender())) {
      setPriceOf(id, _price);
    }

    // Set token TTL (only if token is burnable)
    if (_burnable) {
      setTTL(id, _ttl);
    }

    // Emit event for token metadata creation or update
    TokenMetadata memory newMetadata = metadataOf(id);
    if (isUpdate) {
      emit TokenMetadataUpdated(id, oldMetadata, newMetadata);
    } else {
      emit TokenMetadataCreated(id, newMetadata);
    }
  }

  /**
   * @dev Sets a new URI for all token types, by relying on the token ID substitution mechanism
   * https://eips.ethereum.org/EIPS/eip-1155#metadata[defined in the ERC].
   *
   * By this mechanism, any occurrence of the `\{id\}` substring in either the URI or any of the values
   * in the JSON file at said URI will be replaced by clients with the token ID.
   *
   * For example, the `https://token-cdn-domain/\{id\}.json` URI would be interpreted by clients as
   * `https://token-cdn-domain/000000000000000000000000000000000000000000000000000000000004cce0.json`
   * for token ID 0x4cce0.
   * @param value The URI to set
   */
  function setURI(string memory value) external {
    require(
      hasRole(TOKEN_MANAGER_ROLE, _msgSender()),
      "Unauthorized token manager"
    );
    _setURI(value);
  }

  /**
   * @dev Extension-safe minting function
   * Can be called by authorized extensions
   */
  function extMint(
    address to,
    uint256 id,
    uint256 amount,
    bytes memory data
  ) external {
    require(
      hasRole(TOKEN_MINTER_ROLE, _msgSender()) ||
        authorizedExtensions[_msgSender()],
      "Unauthorized minter"
    );
    _mint(to, id, amount, data);
  }

  /**
   * @dev Extension-safe burning function
   * Can be called by authorized extensions
   */
  function extBurn(address from, uint256 id, uint256 amount) external {
    require(
      hasRole(TOKEN_BURNER_ROLE, _msgSender()) ||
        authorizedExtensions[_msgSender()],
      "Unauthorized burner"
    );
    _burn(from, id, amount);
  }

  /**
   * @dev Extension-safe metadata setting
   * Can be called by authorized extensions
   */
  function extSetMetadata(
    uint256 id,
    bool _active,
    bool _burnable,
    bool _transferable,
    uint256 _price,
    uint256 _ttl
  ) external {
    require(
      hasRole(TOKEN_MANAGER_ROLE, _msgSender()) ||
        authorizedExtensions[_msgSender()],
      "Unauthorized token manager"
    );

    // If the token ID already exists, capture its current state
    bool isUpdate = id < nextTokenId;
    TokenMetadata memory oldMetadata;
    if (isUpdate) {
      oldMetadata = metadataOf(id);
    }

    // Set base token metadata
    setBaseMetadata(id, _active, _burnable, _transferable);

    // Set token price
    setPriceOf(id, _price);

    // Set token TTL (only if token is burnable)
    if (_burnable) {
      setTTL(id, _ttl);
    }

    // Emit event for token metadata creation or update
    TokenMetadata memory newMetadata = metadataOf(id);
    if (isUpdate) {
      emit TokenMetadataUpdated(id, oldMetadata, newMetadata);
    } else {
      emit TokenMetadataCreated(id, newMetadata);
    }
  }

  /**
   * @dev Purchase tokens with extension hooks
   * Enhanced version of the base purchase function that notifies extensions
   */
  function purchaseWithHooks(
    address account,
    uint256 id,
    uint256 amount
  )
    external
    payable
    nonReentrant
    denyBlacklisted(account)
    denyBlacklistedSender
  {
    // If account is zero, use the sender's address
    if (account == address(0)) {
      account = _msgSender();
    }

    // Verify token is for sale and get metadata
    require(forSale(id), "Token not for sale");
    uint256 tokenPrice = priceOf(id);
    require(tokenPrice > 0, "Token has no price");

    // Calculate the total price
    uint256 totalPrice = tokenPrice * amount;
    require(msg.value >= totalPrice, "Insufficient payment");

    // Refund any excess payment
    uint256 refund = msg.value - totalPrice;
    if (refund > 0) {
      payable(_msgSender()).transfer(refund);
    }

    // Transfer the payment to the wallet
    payable(wallet).transfer(totalPrice);

    // Mint the purchased tokens to the buyer
    _mint(account, id, amount, "");

    // Notify extensions about the purchase
    _notifyExtensionsOfPurchase(account, id, amount, totalPrice);

    emit TokenPurchased(account, id, amount);
  }

  /**
   * @dev Notify all registered extensions about a token purchase
   */
  function _notifyExtensionsOfPurchase(
    address buyer,
    uint256 tokenId,
    uint256 amount,
    uint256 totalPrice
  ) internal {
    // Notify extensions using low-level calls to prevent revert if extension fails
    bytes memory callData = abi.encodeWithSignature(
      "onTokenPurchased(address,uint256,uint256,uint256)",
      buyer,
      tokenId,
      amount,
      totalPrice
    );

    // Call known extension types
    address megapotExtension = extensions[keccak256("MEGAPOT_EXTENSION")];
    if (megapotExtension != address(0)) {
      // Use low-level call to prevent revert if extension fails
      megapotExtension.call(callData);
      // Silently continue if extension call fails
    }

    address xmtpExtension = extensions[keccak256("XMTP_GROUP_EXTENSION")];
    if (xmtpExtension != address(0)) {
      xmtpExtension.call(callData);
      // Silently continue if extension call fails
    }
  }
}
