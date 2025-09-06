// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../interfaces/IExtension.sol";

/**
 * @title FailingExtension
 * @dev Extension that always fails - for testing error handling
 */
contract FailingExtension is IExtension {
  function onTokenPurchased(
    address,
    uint256,
    uint256,
    uint256,
    address
  ) external pure override {
    revert("Extension purchase failure");
  }

  function onTokenGranted(
    address,
    uint256,
    uint256,
    address
  ) external pure override {
    revert("Extension grant failure");
  }

  function onTokenRevoked(
    address,
    uint256,
    uint256,
    string memory
  ) external pure override {
    revert("Extension revoke failure");
  }

  function onTokenConfigUpdated(
    uint256,
    uint256,
    string memory
  ) external pure override {
    revert("Extension config update failure");
  }

  function getExtensionInfo()
    external
    pure
    override
    returns (string memory, string memory, bool)
  {
    return ("FailingExtension", "1.0.0", true);
  }
}
