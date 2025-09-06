// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../interfaces/IExtension.sol";

/**
 * @title MockFailingExtension
 * @dev Extension that always fails for testing error handling
 */
contract MockFailingExtension is IExtension {
  function onTokenPurchased(
    address,
    uint256,
    uint256,
    uint256,
    address
  ) external pure override {
    revert("Extension intentionally failed");
  }

  function onTokenGranted(
    address,
    uint256,
    uint256,
    address
  ) external pure override {
    revert("Extension intentionally failed");
  }

  function onTokenRevoked(
    address,
    uint256,
    uint256,
    string memory
  ) external pure override {
    revert("Extension intentionally failed");
  }

  function onTokenConfigUpdated(
    uint256,
    uint256,
    string memory
  ) external pure override {
    revert("Extension intentionally failed");
  }

  function getExtensionInfo()
    external
    pure
    override
    returns (string memory name, string memory version, bool isActive)
  {
    return ("FailingExtension", "1.0.0", true);
  }
}
