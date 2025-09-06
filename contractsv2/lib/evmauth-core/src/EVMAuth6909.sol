// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { EVMAuth } from "src/base/EVMAuth.sol";
import { TokenEphemeral } from "src/base/TokenEphemeral.sol";
import { TokenPurchasable } from "src/base/TokenPurchasable.sol";
import { AccessControlDefaultAdminRulesUpgradeable } from
    "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol";
import { ERC6909Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC6909/draft-ERC6909Upgradeable.sol";
import { ERC6909ContentURIUpgradeable } from
    "@openzeppelin/contracts-upgradeable/token/ERC6909/extensions/draft-ERC6909ContentURIUpgradeable.sol";
import { ERC6909MetadataUpgradeable } from
    "@openzeppelin/contracts-upgradeable/token/ERC6909/extensions/draft-ERC6909MetadataUpgradeable.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IERC6909 } from "@openzeppelin/contracts/interfaces/draft-IERC6909.sol";

/**
 * @title EVMAuth6909
 * @author EVMAuth
 * @notice Multi-token authentication contract implementing ERC-6909 with time-based access control
 * @dev Extends ERC-6909 with authorization features including time-to-live tokens, role-based access,
 * and configurable purchasing mechanisms. Implements UUPS upgradeable pattern for future enhancements.
 */
contract EVMAuth6909 is ERC6909MetadataUpgradeable, ERC6909ContentURIUpgradeable, EVMAuth {
    /**
     * @notice Initializes the EVMAuth6909 contract with admin and treasury configuration
     * @dev Initializer used when deployed directly as an upgradeable contract
     * @param initialDelay Delay in seconds before a new default admin can exercise their role
     * @param initialDefaultAdmin Address to be granted the initial default admin role
     * @param initialTreasury Address where purchase revenues will be sent
     * @param uri_ Contract URI per EIP-6909 content URI extension
     */
    function initialize(
        uint48 initialDelay,
        address initialDefaultAdmin,
        address payable initialTreasury,
        string memory uri_
    ) public virtual initializer {
        __EVMAuth6909_init(initialDelay, initialDefaultAdmin, initialTreasury, uri_);
    }

    /**
     * @notice Internal initializer that sets up all parent contracts
     * @dev Calls parent initializers in correct order for upgradeable contracts
     * @param initialDelay Delay in seconds before a new default admin can exercise their role
     * @param initialDefaultAdmin Address to be granted the initial default admin role
     * @param initialTreasury Address where purchase revenues will be sent
     * @param uri_ Contract URI per EIP-6909 content URI extension
     */
    function __EVMAuth6909_init(
        uint48 initialDelay,
        address initialDefaultAdmin,
        address payable initialTreasury,
        string memory uri_
    ) internal onlyInitializing {
        __EVMAuth_init(initialDelay, initialDefaultAdmin, initialTreasury);
        __EVMAuth6909_init_unchained(uri_);
    }

    /**
     * @notice Unchained initializer for contract-specific storage
     * @dev Sets the contract URI for ERC-6909 content URI support
     * @param uri_ Contract URI per EIP-6909 content URI extension
     */
    function __EVMAuth6909_init_unchained(string memory uri_) internal onlyInitializing {
        _setContractURI(uri_);
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC6909Upgradeable, AccessControlDefaultAdminRulesUpgradeable, IERC165)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @inheritdoc TokenEphemeral
    function balanceOf(address account, uint256 id)
        public
        view
        virtual
        override(ERC6909Upgradeable, IERC6909, TokenEphemeral)
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
     */
    function mint(address to, uint256 id, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, id, amount);
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
     * @notice Updates the contract-level metadata URI
     * @dev Restricted to addresses with TOKEN_MANAGER_ROLE
     * @param contractURI New contract metadata URI
     */
    function setContractURI(string memory contractURI) external virtual onlyRole(TOKEN_MANAGER_ROLE) {
        _setContractURI(contractURI);
    }

    /**
     * @notice Updates the metadata URI for a specific token type
     * @dev Restricted to addresses with TOKEN_MANAGER_ROLE
     * @param id Token type identifier to update
     * @param contentURI New metadata URI for this token type
     */
    function setTokenURI(uint256 id, string memory contentURI) external virtual onlyRole(TOKEN_MANAGER_ROLE) {
        _setTokenURI(id, contentURI);
    }

    /**
     * @notice Updates the on-chain metadata for a specific token type
     * @dev Restricted to addresses with TOKEN_MANAGER_ROLE. Sets name, symbol, and decimals
     * @param id Token type identifier to update
     * @param name Display name for the token type
     * @param symbol Trading symbol for the token type
     * @param decimals Number of decimal places for token amounts
     */
    function setTokenMetadata(uint256 id, string memory name, string memory symbol, uint8 decimals)
        external
        virtual
        onlyRole(TOKEN_MANAGER_ROLE)
    {
        _setName(id, name);
        _setSymbol(id, symbol);
        _setDecimals(id, decimals);
    }

    /// @inheritdoc TokenPurchasable
    function _mintPurchasedTokens(address to, uint256 id, uint256 amount) internal virtual override {
        _mint(to, id, amount);
    }

    /**
     * @notice Internal function handling token transfers, mints, and burns
     * @dev Enforces pause state and validates transfers. No receiver callbacks in ERC-6909
     * @param from Source address (zero address for minting)
     * @param to Destination address (zero address for burning)
     * @param id Token type identifier
     * @param amount Quantity to transfer
     * @custom:throws InvalidSelfTransfer When from equals to
     * @custom:throws InvalidZeroValueTransfer When amount is zero
     */
    function _update(address from, address to, uint256 id, uint256 amount) internal virtual override whenNotPaused {
        // Check if the sender and receiver are the same
        if (from == to) {
            revert InvalidSelfTransfer(from);
        }

        // Check if the amount is zero
        if (amount == 0) {
            revert InvalidZeroValueTransfer();
        }

        super._update(from, to, id, amount);
    }
}
