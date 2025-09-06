// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

/**
 * @title TokenTransferable
 * @author EVMAuth
 * @notice Manages token transferability settings for soulbound functionality
 * @dev Abstract contract enabling tokens to be marked as non-transferable (i.e. "soulbound").
 * Uses EIP-7201 storage pattern for upgrade safety.
 */
abstract contract TokenTransferable is ContextUpgradeable {
    /// @custom:storage-location erc7201:tokentransferable.storage.TokenTransferable
    struct TokenTransferableStorage {
        /**
         * @notice Transferability flag per token type
         * @dev true = transferable, false = soulbound
         */
        mapping(uint256 => bool) transferable;
    }

    /**
     * @notice EIP-7201 storage slot for TokenTransferable state
     * @dev Computed as: keccak256(abi.encode(uint256(keccak256("tokentransferable.storage.TokenTransferable")) - 1))
     * & ~bytes32(uint256(0xff)). Prevents storage collisions in upgradeable contracts.
     */
    bytes32 private constant TokenTransferableStorageLocation =
        0xdaa3d1cf82c71b982a9e24ff7dadd71a10e8c3e82a219c0e60ca5c6b8e617700;

    /**
     * @notice Retrieves the storage struct for TokenTransferable
     * @dev Internal function using inline assembly for direct storage access
     * @return $ Storage pointer to TokenTransferableStorage struct
     */
    function _getTokenTransferableStorage() private pure returns (TokenTransferableStorage storage $) {
        assembly {
            $.slot := TokenTransferableStorageLocation
        }
    }

    /**
     * @notice Error for transfer attempts on soulbound tokens
     * @param id Token type identifier that is non-transferable
     */
    error TokenIsNonTransferable(uint256 id);

    /**
     * @notice Validates single token transferability
     * @dev Modifier allowing mints/burns but blocking transfers of soulbound tokens.
     * Apply to single-token transfer functions like ERC6909's _update
     * @param from Source address (zero for mints)
     * @param to Destination address (zero for burns)
     * @param id Token type identifier to check
     * @custom:throws TokenIsNonTransferable When attempting to transfer soulbound token
     */
    modifier tokenTransferable(address from, address to, uint256 id) {
        TokenTransferableStorage storage $ = _getTokenTransferableStorage();
        if (from != address(0) && to != address(0) && $.transferable[id] == false) {
            revert TokenIsNonTransferable(id);
        }
        _;
    }

    /**
     * @notice Validates batch token transferability
     * @dev Modifier allowing mints/burns but blocking transfers of soulbound tokens.
     * Apply to batch transfer functions like ERC1155's _update
     * @param from Source address (zero for mints)
     * @param to Destination address (zero for burns)
     * @param ids Array of token type identifiers to check
     * @custom:throws TokenIsNonTransferable When any token in batch is soulbound
     */
    modifier allTokensTransferable(address from, address to, uint256[] memory ids) {
        if (from != address(0) && to != address(0)) {
            TokenTransferableStorage storage $ = _getTokenTransferableStorage();
            for (uint256 i = 0; i < ids.length; i++) {
                if ($.transferable[ids[i]] == false) {
                    revert TokenIsNonTransferable(ids[i]);
                }
            }
        }
        _;
    }

    /**
     * @notice Internal initializer for TokenTransferable setup
     * @dev Currently empty as no initialization needed
     */
    function __TokenTransferable_init() internal onlyInitializing { }

    /**
     * @notice Unchained initializer for contract-specific storage
     * @dev Currently empty but reserved for future initialization
     */
    function __TokenTransferable_init_unchained() internal onlyInitializing { }

    /**
     * @notice Checks if token type allows transfers
     * @dev Returns transferability status
     * @param id Token type identifier
     * @return True if transferable, false if soulbound
     */
    function isTransferable(uint256 id) public view virtual returns (bool) {
        TokenTransferableStorage storage $ = _getTokenTransferableStorage();
        return $.transferable[id];
    }

    /**
     * @notice Internal function to configure token transferability
     * @dev Sets whether token type is transferable or soulbound
     * @param id Token type identifier
     * @param transferable True for transferable, false for soulbound
     */
    function _setTransferable(uint256 id, bool transferable) internal virtual {
        TokenTransferableStorage storage $ = _getTokenTransferableStorage();
        $.transferable[id] = transferable;
    }
}
