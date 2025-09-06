// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { EVMAuth } from "src/base/EVMAuth.sol";
import { TokenEphemeral } from "src/base/TokenEphemeral.sol";
import { TokenPurchasable } from "src/base/TokenPurchasable.sol";
import { AccessControlDefaultAdminRulesUpgradeable } from
    "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol";
import { ERC1155Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import { ERC1155URIStorageUpgradeable } from
    "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155URIStorageUpgradeable.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title EVMAuth1155
 * @author EVMAuth
 * @notice Multi-token authentication contract implementing ERC-1155 with time-based access control
 * @dev Extends ERC-1155 with authorization features including time-to-live tokens, role-based access,
 * and configurable purchasing mechanisms. Implements UUPS upgradeable pattern for future enhancements.
 */
contract EVMAuth1155 is ERC1155URIStorageUpgradeable, EVMAuth {
    /**
     * @notice Initializes the EVMAuth1155 contract with admin and treasury configuration
     * @dev Initializer used when deployed directly as an upgradeable contract
     * @param initialDelay Delay in seconds before a new default admin can exercise their role
     * @param initialDefaultAdmin Address to be granted the initial default admin role
     * @param initialTreasury Address where purchase revenues will be sent
     * @param uri_ Base URI for all token types per EIP-1155 metadata standard
     */
    function initialize(
        uint48 initialDelay,
        address initialDefaultAdmin,
        address payable initialTreasury,
        string memory uri_
    ) public virtual initializer {
        __EVMAuth1155_init(initialDelay, initialDefaultAdmin, initialTreasury, uri_);
    }

    /**
     * @notice Internal initializer that sets up all parent contracts
     * @dev Calls parent initializers in correct order for upgradeable contracts
     * @param initialDelay Delay in seconds before a new default admin can exercise their role
     * @param initialDefaultAdmin Address to be granted the initial default admin role
     * @param initialTreasury Address where purchase revenues will be sent
     * @param uri_ Base URI for all token types per EIP-1155 metadata standard
     */
    function __EVMAuth1155_init(
        uint48 initialDelay,
        address initialDefaultAdmin,
        address payable initialTreasury,
        string memory uri_
    ) internal onlyInitializing {
        __ERC1155_init(uri_);
        __ERC1155URIStorage_init();
        __EVMAuth_init(initialDelay, initialDefaultAdmin, initialTreasury);
        __EVMAuth1155_init_unchained();
    }

    /**
     * @notice Unchained initializer for contract-specific storage
     * @dev Currently empty but reserved for future EVMAuth1155-specific initialization
     */
    function __EVMAuth1155_init_unchained() internal onlyInitializing { }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC1155Upgradeable, AccessControlDefaultAdminRulesUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @inheritdoc ERC1155URIStorageUpgradeable
    function uri(uint256 tokenId) public view virtual override returns (string memory) {
        return ERC1155URIStorageUpgradeable.uri(tokenId);
    }

    /// @inheritdoc TokenEphemeral
    function balanceOf(address account, uint256 id)
        public
        view
        virtual
        override(ERC1155Upgradeable, TokenEphemeral)
        returns (uint256)
    {
        return TokenEphemeral.balanceOf(account, id);
    }

    /**
     * @notice Mints new tokens of a specific type to an account
     * @dev Restricted to addresses with MINTER_ROLE
     * @param to Recipient address for minted tokens
     * @param id Token type identifier to mint
     * @param amount Quantity of tokens to mint
     * @param data Additional data passed to receiver contract if applicable
     */
    function mint(address to, uint256 id, uint256 amount, bytes memory data) external onlyRole(MINTER_ROLE) {
        _mint(to, id, amount, data);
    }

    /**
     * @notice Batch mints multiple token types to a single account
     * @dev Restricted to addresses with MINTER_ROLE. Arrays must have matching lengths
     * @param to Recipient address for minted tokens
     * @param ids Array of token type identifiers to mint
     * @param amounts Array of quantities to mint for each token type
     * @param data Additional data passed to receiver contract if applicable
     */
    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data)
        external
        onlyRole(MINTER_ROLE)
    {
        _mintBatch(to, ids, amounts, data);
    }

    /**
     * @notice Burns tokens of a specific type from an account
     * @dev Restricted to addresses with BURNER_ROLE
     * @param from Address to burn tokens from
     * @param id Token type identifier to burn
     * @param amount Quantity of tokens to burn
     */
    function burn(address from, uint256 id, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, id, amount);
    }

    /**
     * @notice Batch burns multiple token types from a single account
     * @dev Restricted to addresses with BURNER_ROLE. Arrays must have matching lengths
     * @param from Address to burn tokens from
     * @param ids Array of token type identifiers to burn
     * @param amounts Array of quantities to burn for each token type
     */
    function burnBatch(address from, uint256[] memory ids, uint256[] memory amounts) external onlyRole(BURNER_ROLE) {
        _burnBatch(from, ids, amounts);
    }

    /**
     * @notice Updates the base URI for all token metadata
     * @dev Restricted to addresses with TOKEN_MANAGER_ROLE
     * @param baseURI New base URI for token metadata
     */
    function setBaseURI(string memory baseURI) external virtual onlyRole(TOKEN_MANAGER_ROLE) {
        _setBaseURI(baseURI);
    }

    /**
     * @notice Updates the metadata URI for a specific token type
     * @dev Restricted to addresses with TOKEN_MANAGER_ROLE. Overrides base URI for this token
     * @param id Token type identifier to update
     * @param tokenURI New metadata URI for this token type
     */
    function setTokenURI(uint256 id, string memory tokenURI) external virtual onlyRole(TOKEN_MANAGER_ROLE) {
        _setURI(id, tokenURI);
    }

    /// @inheritdoc TokenPurchasable
    function _mintPurchasedTokens(address to, uint256 id, uint256 amount) internal virtual override {
        _mint(to, id, amount, "");
    }

    /**
     * @notice Internal function handling token transfers, mints, and burns
     * @dev Enforces pause state, token existence, and transferability rules.
     * Recipient contracts must implement IERC1155Receiver.
     * @param from Source address (zero address for minting)
     * @param to Destination address (zero address for burning)
     * @param ids Array of token type identifiers
     * @param values Array of quantities to transfer
     * @custom:throws InvalidSelfTransfer When from equals to
     * @custom:throws InvalidZeroValueTransfer When any value is zero
     */
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        virtual
        override
        whenNotPaused
        allTokensExist(ids)
        allTokensTransferable(from, to, ids)
    {
        // Check if the sender and receiver are the same
        if (from == to) {
            revert InvalidSelfTransfer(from);
        }

        // Check if any values are zero
        for (uint256 i = 0; i < values.length; ++i) {
            if (values[i] == 0) {
                revert InvalidZeroValueTransfer();
            }
        }

        super._update(from, to, ids, values);
    }
}
