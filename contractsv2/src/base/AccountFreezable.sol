// SPDX-License-Identifier: MIT

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

pragma solidity ^0.8.24;

/**
 * @title AccountFreezable
 * @author EVMAuth
 * @notice Provides account freezing functionality for access control
 * @dev Abstract contract implementing account-level restrictions. Frozen accounts should be
 * prevented from purchasing, transferring, or receiving tokens. Uses EIP-7201 storage pattern.
 */
abstract contract AccountFreezable is Initializable {
    /**
     * @notice Status constant for frozen accounts
     * @dev Emitted in events when an account is frozen
     */
    bytes32 public constant ACCOUNT_FROZEN_STATUS = keccak256("ACCOUNT_FROZEN_STATUS");

    /**
     * @notice Status constant for unfrozen accounts
     * @dev Emitted in events when an account is unfrozen
     */
    bytes32 public constant ACCOUNT_UNFROZEN_STATUS = keccak256("ACCOUNT_UNFROZEN_STATUS");

    /// @custom:storage-location erc7201:accountfreezable.storage.AccountFreezable
    struct AccountFreezableStorage {
        // Account => AccountStatus mapping (to track frozen accounts)
        mapping(address => bool) frozenAccounts;
        // Array of frozen accounts (to track all frozen accounts)
        address[] frozenList;
    }

    /**
     * @notice EIP-7201 storage slot for AccountFreezable state
     * @dev Computed as: keccak256(abi.encode(uint256(keccak256("accountfreezable.storage.AccountFreezable")) - 1))
     * & ~bytes32(uint256(0xff)). Prevents storage collisions in upgradeable contracts.
     */
    bytes32 private constant AccountFreezableStorageLocation =
        0xa095fe5a3c31691ae0832631cef3701285d36b2af1972f4c23463476b0353a00;

    /**
     * @notice Retrieves the storage struct for AccountFreezable
     * @dev Internal function using inline assembly for direct storage access
     * @return $ Storage pointer to AccountFreezableStorage struct
     */
    function _getAccountFreezableStorage() private pure returns (AccountFreezableStorage storage $) {
        assembly {
            $.slot := AccountFreezableStorageLocation
        }
    }

    /**
     * @notice Emitted when account status changes
     * @param account Address whose status changed
     * @param status New status (ACCOUNT_FROZEN_STATUS or ACCOUNT_UNFROZEN_STATUS)
     */
    event AccountStatusUpdated(address indexed account, bytes32 indexed status);

    /**
     * @notice Error for operations attempted by frozen accounts
     * @param account The frozen account address
     */
    error AccountFrozen(address account);

    /**
     * @notice Error for invalid address in access control operations
     * @param account The invalid address provided
     */
    error InvalidAddress(address account);

    /**
     * @notice Validates account is not frozen before proceeding
     * @dev Modifier reverting with AccountFrozen if account is frozen
     * @param account Address to check freeze status
     */
    modifier notFrozen(address account) {
        AccountFreezableStorage storage $ = _getAccountFreezableStorage();
        if ($.frozenAccounts[account]) revert AccountFrozen(account);
        _;
    }

    /**
     * @notice Internal initializer for AccountFreezable setup
     * @dev Currently empty as no initialization needed
     */
    function __AccountFreezable_init() internal onlyInitializing { }

    /**
     * @notice Unchained initializer for contract-specific storage
     * @dev Currently empty but reserved for future initialization
     */
    function __AccountFreezable_init_unchained() internal onlyInitializing { }

    /**
     * @notice Checks if an account is frozen
     * @dev Frozen accounts cannot perform token operations
     * @param account Address to check
     * @return True if account is frozen, false otherwise
     */
    function isFrozen(address account) external view virtual returns (bool) {
        AccountFreezableStorage storage $ = _getAccountFreezableStorage();
        return $.frozenAccounts[account];
    }

    /**
     * @notice Retrieves all currently frozen accounts
     * @dev Returns the complete frozen accounts list
     * @return Array of frozen account addresses
     */
    function frozenAccounts() external view virtual returns (address[] memory) {
        AccountFreezableStorage storage $ = _getAccountFreezableStorage();
        return $.frozenList;
    }

    /**
     * @notice Internal function to freeze an account
     * @dev Idempotent operation. Adds account to frozen list if not already frozen
     * @param account Address to freeze (cannot be zero address)
     * @custom:throws InvalidAddress When account is zero address
     * @custom:emits AccountStatusUpdated With ACCOUNT_FROZEN_STATUS
     */
    function _freezeAccount(address account) internal virtual {
        if (account == address(0)) revert InvalidAddress(account);

        AccountFreezableStorage storage $ = _getAccountFreezableStorage();

        if ($.frozenAccounts[account]) return; // Account is already frozen, do nothing

        $.frozenAccounts[account] = true;
        $.frozenList.push(account);

        emit AccountStatusUpdated(account, ACCOUNT_FROZEN_STATUS);
    }

    /**
     * @notice Internal function to unfreeze an account
     * @dev Idempotent operation. Removes account from frozen list if frozen
     * @param account Address to unfreeze
     * @custom:emits AccountStatusUpdated With ACCOUNT_UNFROZEN_STATUS
     */
    function _unfreezeAccount(address account) internal virtual {
        AccountFreezableStorage storage $ = _getAccountFreezableStorage();

        if (!$.frozenAccounts[account]) return; // Account is not frozen, do nothing

        $.frozenAccounts[account] = false;

        // Remove the account from the frozen list
        for (uint256 i = 0; i < $.frozenList.length; i++) {
            if ($.frozenList[i] == account) {
                $.frozenList[i] = $.frozenList[$.frozenList.length - 1]; // Replace with the last element
                $.frozenList.pop(); // Remove the last element
                break;
            }
        }

        emit AccountStatusUpdated(account, ACCOUNT_UNFROZEN_STATUS);
    }
}
