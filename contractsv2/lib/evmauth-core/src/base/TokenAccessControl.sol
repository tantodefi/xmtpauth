// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { AccountFreezable } from "src/base/AccountFreezable.sol";
import { AccessControlDefaultAdminRulesUpgradeable } from
    "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title TokenAccessControl
 * @author EVMAuth
 * @notice Provides comprehensive role-based access control for token management
 * @dev Abstract contract implementing six distinct roles for granular permission control:
 * upgrade management, access management, token management, minting, burning, and treasury operations.
 * Includes account freezing via AccountFreezable and contract pausing via PausableUpgradeable.
 */
abstract contract TokenAccessControl is
    AccessControlDefaultAdminRulesUpgradeable,
    AccountFreezable,
    PausableUpgradeable
{
    /**
     * @notice Role identifier for contract upgrade permissions
     * @dev Required for UUPS upgrade authorization
     */
    bytes32 public constant UPGRADE_MANAGER_ROLE = keccak256("UPGRADE_MANAGER_ROLE");

    /**
     * @notice Role identifier for access control management
     * @dev Permits pausing/unpausing contract and freezing/unfreezing accounts
     */
    bytes32 public constant ACCESS_MANAGER_ROLE = keccak256("ACCESS_MANAGER_ROLE");

    /**
     * @notice Role identifier for token configuration management
     * @dev Permits modifying token settings, metadata, and URIs
     */
    bytes32 public constant TOKEN_MANAGER_ROLE = keccak256("TOKEN_MANAGER_ROLE");

    /**
     * @notice Role identifier for token minting permissions
     * @dev Required to create new tokens
     */
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /**
     * @notice Role identifier for token burning permissions
     * @dev Required to destroy existing tokens
     */
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    /**
     * @notice Role identifier for treasury management
     * @dev Permits modifying the treasury address for revenue collection
     */
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");

    /**
     * @notice Internal initializer for access control setup
     * @dev Initializes AccessControlDefaultAdminRules with security delay
     * @param initialDelay Seconds before new admin can exercise role (security delay)
     * @param initialDefaultAdmin Address receiving initial admin role
     */
    function __TokenAccessControl_init(uint48 initialDelay, address initialDefaultAdmin) internal onlyInitializing {
        __AccessControlDefaultAdminRules_init(initialDelay, initialDefaultAdmin);
        __TokenAccessControl_init_unchained();
    }

    /**
     * @notice Unchained initializer for contract-specific storage
     * @dev Currently empty but reserved for future TokenAccessControl-specific initialization
     */
    function __TokenAccessControl_init_unchained() internal onlyInitializing { }

    /**
     * @notice Freezes an account, blocking all token operations
     * @dev Restricted to ACCESS_MANAGER_ROLE. Idempotent operation
     * @param account Address to freeze (cannot be zero address)
     * @custom:throws InvalidAddress When account is zero address
     * @custom:emits AccountStatusUpdate With ACCOUNT_FROZEN_STATUS
     */
    function freezeAccount(address account) external onlyRole(ACCESS_MANAGER_ROLE) {
        _freezeAccount(account);
    }

    /**
     * @notice Unfreezes an account, restoring all token operations
     * @dev Restricted to ACCESS_MANAGER_ROLE. Idempotent operation
     * @param account Address to unfreeze
     * @custom:emits AccountStatusUpdate With ACCOUNT_UNFROZEN_STATUS
     */
    function unfreezeAccount(address account) external onlyRole(ACCESS_MANAGER_ROLE) {
        _unfreezeAccount(account);
    }
}
