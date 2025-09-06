// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IExtensionRegistry
 * @dev Interface for managing contract extensions
 */
interface IExtensionRegistry {
  // Events
  event ExtensionRegistered(
    bytes32 indexed extensionId,
    address indexed extension
  );
  event ExtensionRevoked(
    bytes32 indexed extensionId,
    address indexed extension
  );

  /**
   * @dev Register an extension contract
   * @param extensionId Unique identifier for the extension
   * @param extension Address of the extension contract
   */
  function registerExtension(bytes32 extensionId, address extension) external;

  /**
   * @dev Revoke an extension contract
   * @param extensionId Identifier of the extension to revoke
   */
  function revokeExtension(bytes32 extensionId) external;

  /**
   * @dev Check if an address is an authorized extension
   * @param extension The extension address to check
   * @return True if authorized, false otherwise
   */
  function isAuthorizedExtension(
    address extension
  ) external view returns (bool);

  /**
   * @dev Get extension address by ID
   * @param extensionId The extension ID to look up
   * @return The extension contract address
   */
  function getExtension(bytes32 extensionId) external view returns (address);

  /**
   * @dev Get all registered extension IDs
   * @return Array of registered extension IDs
   */
  function getRegisteredExtensions() external view returns (bytes32[] memory);

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
    returns (string memory name, string memory version, bool isActive);
}
