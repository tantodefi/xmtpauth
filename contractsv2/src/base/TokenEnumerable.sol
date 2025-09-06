// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

/**
 * @title TokenEnumerable
 * @author EVMAuth
 * @notice Manages sequential token ID generation and existence tracking
 * @dev Abstract contract providing auto-incrementing sequential token IDs starting at 1.
 * Uses EIP-7201 storage pattern for upgrade safety.
 */
abstract contract TokenEnumerable is ContextUpgradeable {
    /// @custom:storage-location erc7201:tokenenumerable.storage.TokenEnumerable
    struct TokenEnumerableStorage {
        /**
         * @notice Next available token ID for assignment
         * @dev Auto-increments when new tokens are created
         */
        uint256 nextTokenID;
    }

    /**
     * @notice EIP-7201 storage slot for TokenEnumerable state
     * @dev Computed as: keccak256(abi.encode(uint256(keccak256("tokenenumerable.storage.TokenEnumerable")) - 1))
     * & ~bytes32(uint256(0xff)). Prevents storage collisions in upgradeable contracts.
     */
    bytes32 private constant TokenEnumerableStorageLocation =
        0x591f2d2df77efc80b9969dfd51dd4fc103fe490745902503f7c21df07a35d600;

    /**
     * @notice Retrieves the storage struct for TokenEnumerable
     * @dev Internal function using inline assembly for direct storage access
     * @return $ Storage pointer to TokenEnumerableStorage struct
     */
    function _getTokenEnumerableStorage() private pure returns (TokenEnumerableStorage storage $) {
        assembly {
            $.slot := TokenEnumerableStorageLocation
        }
    }

    /**
     * @notice Error thrown for operations on non-existent token IDs
     * @param id The invalid token ID
     */
    error InvalidTokenID(uint256 id);

    /**
     * @notice Validates that a token ID exists before proceeding
     * @dev Modifier reverting with InvalidTokenID if token doesn't exist
     * @param id Token ID to validate
     */
    modifier tokenExists(uint256 id) {
        if (!exists(id)) {
            revert InvalidTokenID(id);
        }
        _;
    }

    /**
     * @notice Validates that all token IDs in array exist
     * @dev Modifier reverting with InvalidTokenID if any token doesn't exist
     * @param ids Array of token IDs to validate
     */
    modifier allTokensExist(uint256[] memory ids) {
        for (uint256 i = 0; i < ids.length; i++) {
            if (!exists(ids[i])) {
                revert InvalidTokenID(ids[i]);
            }
        }
        _;
    }

    /**
     * @notice Internal initializer for TokenEnumerable setup
     * @dev Initializes Context and sets up token enumeration
     */
    function __TokenEnumerable_init() internal onlyInitializing {
        __Context_init();
        __TokenEnumerable_init_unchained();
    }

    /**
     * @notice Unchained initializer for contract-specific storage
     * @dev Sets initial nextTokenID to 1 (tokens start from ID 1, not 0)
     */
    function __TokenEnumerable_init_unchained() internal onlyInitializing {
        TokenEnumerableStorage storage $ = _getTokenEnumerableStorage();
        $.nextTokenID = 1; // Start token IDs at 1
    }

    /**
     * @notice Gets the next available token ID
     * @dev Public view function for upcoming token ID
     * @return Next sequential token ID to be assigned
     */
    function nextTokenID() public view returns (uint256) {
        TokenEnumerableStorage storage $ = _getTokenEnumerableStorage();
        return $.nextTokenID;
    }

    /**
     * @notice Checks if a token ID has been created
     * @dev Token exists if ID is between 1 and nextTokenID (exclusive)
     * @param id Token ID to check
     * @return True if token has been created, false otherwise
     */
    function exists(uint256 id) public view virtual returns (bool) {
        TokenEnumerableStorage storage $ = _getTokenEnumerableStorage();
        return id > 0 && id < $.nextTokenID;
    }

    /**
     * @notice Claims and returns the next sequential token ID
     * @dev Internal function that auto-increments nextTokenID after claiming
     * @return id Newly claimed token ID
     */
    function _claimNextTokenID() internal virtual returns (uint256 id) {
        TokenEnumerableStorage storage $ = _getTokenEnumerableStorage();
        id = $.nextTokenID;
        $.nextTokenID++;
        return id;
    }
}
