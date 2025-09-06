// SPDX-License-Identifier: MIT

import { TokenAccessControl } from "src/base/TokenAccessControl.sol";
import { TokenEnumerable } from "src/base/TokenEnumerable.sol";
import { TokenEphemeral } from "src/base/TokenEphemeral.sol";
import { TokenPurchasable } from "src/base/TokenPurchasable.sol";
import { TokenTransferable } from "src/base/TokenTransferable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

pragma solidity ^0.8.24;

/**
 * @title EVMAuth
 * @author EVMAuth
 * @notice Core abstract contract for EVM-based authentication tokens
 * @dev Combines access control, sequential token IDs, token expiry, direct purchasing, and token transfer
 * restriction into a unified token management system. Implements UUPS upgradeable pattern.
 */
abstract contract EVMAuth is
    TokenAccessControl,
    TokenEnumerable,
    TokenEphemeral,
    TokenPurchasable,
    TokenTransferable,
    UUPSUpgradeable
{
    /**
     * @notice Configuration parameters for a token type
     * @param price Native currency price for purchasing this token
     * @param erc20Prices Array of accepted ERC-20 tokens and their prices
     * @param ttl Time-to-live in seconds (0 for permanent tokens)
     * @param transferable Whether token can be transferred between accounts
     */
    struct EVMAuthTokenConfig {
        uint256 price;
        PaymentToken[] erc20Prices;
        uint256 ttl;
        bool transferable;
    }

    /**
     * @notice Complete token type information including ID and configuration
     * @param id Unique identifier for the token type
     * @param config Full configuration settings for the token
     */
    struct EVMAuthToken {
        uint256 id;
        EVMAuthTokenConfig config;
    }

    /**
     * @notice Emitted when a token type is created or reconfigured
     * @param id Token type identifier
     * @param config New configuration settings
     */
    event EVMAuthTokenConfigured(uint256 indexed id, EVMAuthTokenConfig config);

    /**
     * @notice Error for self-transfer attempts
     * @param sender Address attempting self-transfer
     */
    error InvalidSelfTransfer(address sender);

    /**
     * @notice Error for zero-amount transfer attempts
     */
    error InvalidZeroValueTransfer();

    /**
     * @notice Internal initializer for EVMAuth contract setup
     * @dev Initializes all parent contracts in correct order
     * @param initialDelay Security delay for admin role transfers
     * @param initialDefaultAdmin Initial admin address
     * @param initialTreasury Treasury address for revenue collection
     */
    function __EVMAuth_init(uint48 initialDelay, address initialDefaultAdmin, address payable initialTreasury)
        internal
        onlyInitializing
    {
        __TokenAccessControl_init(initialDelay, initialDefaultAdmin);
        __TokenEnumerable_init();
        __TokenPurchasable_init(initialTreasury);
        __EVMAuth_init_unchained();
    }

    /**
     * @notice Unchained initializer for contract-specific storage
     * @dev Currently empty but reserved for future EVMAuth-specific initialization
     */
    function __EVMAuth_init_unchained() internal onlyInitializing { }

    /**
     * @notice Retrieves complete configuration for a token type
     * @dev Aggregates settings from all parent contracts
     * @param id Token type identifier
     * @return Complete token configuration with ID
     */
    function tokenConfig(uint256 id) public view virtual tokenExists(id) returns (EVMAuthToken memory) {
        return EVMAuthToken({
            id: id,
            config: EVMAuthTokenConfig({
                price: tokenPrice(id),
                erc20Prices: tokenERC20Prices(id),
                ttl: tokenTTL(id),
                transferable: isTransferable(id)
            })
        });
    }

    /**
     * @notice Batch retrieves configurations for multiple token types
     * @dev Gas-efficient bulk configuration query
     * @param ids Array of token type identifiers
     * @return configs Array of complete token configurations
     */
    function tokenConfigs(uint256[] calldata ids) external view virtual returns (EVMAuthToken[] memory configs) {
        configs = new EVMAuthToken[](ids.length);
        if (ids.length == 0) {
            return configs;
        }

        for (uint256 i = 0; i < ids.length; i++) {
            configs[i] = tokenConfig(ids[i]);
        }

        return configs;
    }

    /**
     * @notice Gets native currency price for a token type
     * @dev Overrides TokenPurchasable with existence check
     * @param id Token type identifier
     * @return Native currency price (wei for ETH chains)
     */
    function tokenPrice(uint256 id) public view virtual override tokenExists(id) returns (uint256) {
        return TokenPurchasable.tokenPrice(id);
    }

    /**
     * @notice Gets price in specific ERC-20 token
     * @dev Returns 0 if token not accepted as payment
     * @param id Token type identifier
     * @param token ERC-20 contract address
     * @return Price in ERC-20 token units
     */
    function tokenERC20Price(uint256 id, address token)
        public
        view
        virtual
        override
        tokenExists(id)
        returns (uint256)
    {
        return TokenPurchasable.tokenERC20Price(id, token);
    }

    /**
     * @notice Gets all accepted ERC-20 payment options
     * @dev Returns array of payment token addresses and prices
     * @param id Token type identifier
     * @return Array of PaymentToken structs
     */
    function tokenERC20Prices(uint256 id)
        public
        view
        virtual
        override
        tokenExists(id)
        returns (PaymentToken[] memory)
    {
        return TokenPurchasable.tokenERC20Prices(id);
    }

    /**
     * @notice Gets time-to-live for a token type
     * @dev 0 indicates permanent tokens
     * @param id Token type identifier
     * @return TTL in seconds
     */
    function tokenTTL(uint256 id) public view virtual override tokenExists(id) returns (uint256) {
        return TokenEphemeral.tokenTTL(id);
    }

    /**
     * @notice Checks if token type allows transfers
     * @dev Non-transferable tokens are soulbound to original recipient
     * @param id Token type identifier
     * @return True if transferable, false if soulbound
     */
    function isTransferable(uint256 id) public view virtual override tokenExists(id) returns (bool) {
        return TokenTransferable.isTransferable(id);
    }

    /**
     * @notice Creates a new token type with specified configuration
     * @dev Restricted to TOKEN_MANAGER_ROLE. Claims next sequential ID
     * @param config Complete configuration for the new token type
     * @return id Newly created token type identifier
     * @custom:emits EVMAuthTokenConfigured
     */
    function createToken(EVMAuthTokenConfig calldata config)
        external
        virtual
        onlyRole(TOKEN_MANAGER_ROLE)
        returns (uint256 id)
    {
        return _createToken(config);
    }

    /**
     * @notice Updates complete configuration for an existing token type
     * @dev Restricted to TOKEN_MANAGER_ROLE. Token must exist
     * @param id Token type identifier to update
     * @param config New complete configuration
     * @custom:emits EVMAuthTokenConfigured
     */
    function updateToken(uint256 id, EVMAuthTokenConfig calldata config)
        external
        virtual
        onlyRole(TOKEN_MANAGER_ROLE)
    {
        _updateToken(id, config);
    }

    /**
     * @notice Updates native currency price for a token type
     * @dev Restricted to TOKEN_MANAGER_ROLE. Token must exist
     * @param id Token type identifier
     * @param price New price in native currency
     * @custom:emits EVMAuthTokenConfigured
     */
    function setPrice(uint256 id, uint256 price) external virtual onlyRole(TOKEN_MANAGER_ROLE) {
        _setPrice(id, price);

        emit EVMAuthTokenConfigured(
            id,
            EVMAuthTokenConfig({
                price: price,
                erc20Prices: tokenERC20Prices(id),
                ttl: tokenTTL(id),
                transferable: isTransferable(id)
            })
        );
    }

    /**
     * @notice Sets price for a specific ERC-20 payment token
     * @dev Restricted to TOKEN_MANAGER_ROLE. Token must exist
     * @param id Token type identifier
     * @param token ERC-20 contract address
     * @param price Price in ERC-20 token units (0 to disable)
     * @custom:emits EVMAuthTokenConfigured
     */
    function setERC20Price(uint256 id, address token, uint256 price) external virtual onlyRole(TOKEN_MANAGER_ROLE) {
        _setERC20Price(id, token, price);

        emit EVMAuthTokenConfigured(
            id,
            EVMAuthTokenConfig({
                price: tokenPrice(id),
                erc20Prices: tokenERC20Prices(id),
                ttl: tokenTTL(id),
                transferable: isTransferable(id)
            })
        );
    }

    /**
     * @notice Updates all ERC-20 payment options for a token type
     * @dev Restricted to TOKEN_MANAGER_ROLE. Replaces existing ERC-20 prices
     * @param id Token type identifier
     * @param prices Array of PaymentToken structs with addresses and prices
     * @custom:emits EVMAuthTokenConfigured
     */
    function setERC20Prices(uint256 id, PaymentToken[] calldata prices) external virtual onlyRole(TOKEN_MANAGER_ROLE) {
        _setERC20Prices(id, prices);

        emit EVMAuthTokenConfigured(
            id,
            EVMAuthTokenConfig({
                price: tokenPrice(id),
                erc20Prices: tokenERC20Prices(id),
                ttl: tokenTTL(id),
                transferable: isTransferable(id)
            })
        );
    }

    /**
     * @notice Updates time-to-live for a token type
     * @dev Restricted to TOKEN_MANAGER_ROLE. Does not affect existing tokens
     * @param id Token type identifier
     * @param ttl New TTL in seconds (0 for permanent)
     * @custom:emits EVMAuthTokenConfigured
     */
    function setTTL(uint256 id, uint256 ttl) external virtual onlyRole(TOKEN_MANAGER_ROLE) {
        _setTTL(id, ttl);

        emit EVMAuthTokenConfigured(
            id,
            EVMAuthTokenConfig({
                price: tokenPrice(id),
                erc20Prices: tokenERC20Prices(id),
                ttl: ttl,
                transferable: isTransferable(id)
            })
        );
    }

    /**
     * @notice Updates transferability for a token type
     * @dev Restricted to TOKEN_MANAGER_ROLE. Affects all tokens of this type
     * @param id Token type identifier
     * @param transferable True for transferable, false for soulbound
     * @custom:emits EVMAuthTokenConfigured
     */
    function setTransferable(uint256 id, bool transferable) external virtual onlyRole(TOKEN_MANAGER_ROLE) {
        _setTransferable(id, transferable);

        emit EVMAuthTokenConfigured(
            id,
            EVMAuthTokenConfig({
                price: tokenPrice(id),
                erc20Prices: tokenERC20Prices(id),
                ttl: tokenTTL(id),
                transferable: transferable
            })
        );
    }

    /**
     * @notice Internal function to create a new token type
     * @dev Claims next sequential ID and applies configuration
     * @param config Complete configuration for new token type
     * @return id Newly created token type identifier
     * @custom:emits EVMAuthTokenConfigured
     */
    function _createToken(EVMAuthTokenConfig calldata config) internal virtual returns (uint256 id) {
        id = _claimNextTokenID();

        _setPrice(id, config.price);
        _setERC20Prices(id, config.erc20Prices);
        _setTTL(id, config.ttl);
        _setTransferable(id, config.transferable);

        emit EVMAuthTokenConfigured(id, config);

        return id;
    }

    /**
     * @notice Internal function to update token configuration
     * @dev Updates all configuration parameters atomically
     * @param id Token type identifier (must exist)
     * @param config New complete configuration
     * @custom:emits EVMAuthTokenConfigured
     */
    function _updateToken(uint256 id, EVMAuthTokenConfig calldata config) internal virtual tokenExists(id) {
        _setPrice(id, config.price);
        _setERC20Prices(id, config.erc20Prices);
        _setTTL(id, config.ttl);
        _setTransferable(id, config.transferable);

        emit EVMAuthTokenConfigured(id, config);
    }

    /// @inheritdoc TokenPurchasable
    function _setPrice(uint256 id, uint256 price) internal virtual override tokenExists(id) {
        TokenPurchasable._setPrice(id, price);
    }

    /// @inheritdoc TokenPurchasable
    function _setERC20Price(uint256 id, address token, uint256 price) internal virtual override tokenExists(id) {
        TokenPurchasable._setERC20Price(id, token, price);
    }

    /// @inheritdoc TokenPurchasable
    function _setERC20Prices(uint256 id, PaymentToken[] calldata prices) internal virtual override tokenExists(id) {
        TokenPurchasable._setERC20Prices(id, prices);
    }

    /// @inheritdoc TokenEphemeral
    function _setTTL(uint256 id, uint256 ttl) internal virtual override tokenExists(id) {
        TokenEphemeral._setTTL(id, ttl);
    }

    /// @inheritdoc TokenTransferable
    function _setTransferable(uint256 id, bool transferable) internal virtual override tokenExists(id) {
        super._setTransferable(id, transferable);
    }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(UPGRADE_MANAGER_ROLE) {
        // This will revert if the caller is not authorized.
    }
}
