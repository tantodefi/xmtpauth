// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IExtension
 * @dev Interface for XMTP Auth extensions
 * Extensions can receive notifications about token purchases and other events
 */
interface IExtension {
  /**
   * @dev Called after a successful token purchase
   * @param buyer Address of the token buyer
   * @param tokenId ID of the purchased token
   * @param amount Number of tokens purchased
   * @param totalPrice Total price paid (in wei or token units)
   * @param paymentToken Address of payment token (address(0) for ETH)
   */
  function onTokenPurchased(
    address buyer,
    uint256 tokenId,
    uint256 amount,
    uint256 totalPrice,
    address paymentToken
  ) external;

  /**
   * @dev Called after tokens are granted (not purchased)
   * @param recipient Address receiving the tokens
   * @param tokenId ID of the granted token
   * @param amount Number of tokens granted
   * @param grantedBy Address that granted the tokens
   */
  function onTokenGranted(
    address recipient,
    uint256 tokenId,
    uint256 amount,
    address grantedBy
  ) external;

  /**
   * @dev Called after tokens are revoked/burned
   * @param user Address losing the tokens
   * @param tokenId ID of the revoked token
   * @param amount Number of tokens revoked
   * @param reason Reason for revocation
   */
  function onTokenRevoked(
    address user,
    uint256 tokenId,
    uint256 amount,
    string memory reason
  ) external;

  /**
   * @dev Called when token configuration is updated
   * @param tokenId Token ID being updated
   * @param newPrice New price for the token
   * @param newURI New URI for the token
   */
  function onTokenConfigUpdated(
    uint256 tokenId,
    uint256 newPrice,
    string memory newURI
  ) external;

  /**
   * @dev Get extension information
   * @return name Extension name
   * @return version Extension version
   * @return isActive Whether the extension is currently active
   */
  function getExtensionInfo()
    external
    view
    returns (string memory name, string memory version, bool isActive);
}
