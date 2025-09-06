// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import { ReentrancyGuardTransientUpgradeable } from
    "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title TokenPurchasable
 * @author EVMAuth
 * @notice Enables token purchases with native and ERC-20 currency support
 * @dev Abstract contract implementing multi-currency purchasing with reentrancy protection.
 * Each token type can be configured with independent pricing in native currency and/or multiple
 * ERC-20 tokens. Uses EIP-7201 storage pattern for upgrade safety.
 */
abstract contract TokenPurchasable is PausableUpgradeable, ReentrancyGuardTransientUpgradeable {
    // Import SafeERC20 to revert if a transfer returns false
    using SafeERC20 for IERC20;

    /**
     * @notice Payment option with token address and price
     * @param token ERC-20 contract address
     * @param price Cost in token units
     */
    struct PaymentToken {
        address token;
        uint256 price;
    }

    /// @custom:storage-location erc7201:tokenpurchasable.storage.TokenPurchasable
    struct TokenPurchasableStorage {
        /**
         * @notice Treasury address for revenue collection
         * @dev Receives all purchase payments
         */
        address payable treasury;
        /**
         * @notice Native currency pricing per token type
         * @dev Price of 0 disables native currency purchases
         */
        mapping(uint256 => uint256) nativePrices;
        /**
         * @notice ERC-20 pricing per token type and payment token
         * @dev Nested mapping: tokenId -> ERC20 address -> price (0 = disabled)
         */
        mapping(uint256 => mapping(address => uint256)) erc20Prices;
        /**
         * @notice List of accepted ERC-20 tokens per token type
         * @dev Used for enumerating payment options
         */
        mapping(uint256 => address[]) erc20TokensAccepted;
    }

    /**
     * @notice EIP-7201 storage slot for TokenPurchasable state
     * @dev Computed as: keccak256(abi.encode(uint256(keccak256("tokenpurchasable.storage.TokenPurchasable")) - 1))
     * & ~bytes32(uint256(0xff)). Prevents storage collisions in upgradeable contracts.
     */
    bytes32 private constant TokenPurchasableStorageLocation =
        0x54c84cf2875b53587e3bd1a41cdb4ae126fe9184d0b1bd9183d4f9005d2ff600;

    /**
     * @notice Retrieves the storage struct for TokenPurchasable
     * @dev Internal function using inline assembly for direct storage access
     * @return $ Storage pointer to TokenPurchasableStorage struct
     */
    function _getTokenPurchasableStorage() private pure returns (TokenPurchasableStorage storage $) {
        assembly {
            $.slot := TokenPurchasableStorageLocation
        }
    }

    /**
     * @notice Emitted when tokens are purchased
     * @param caller Address initiating the purchase
     * @param receiver Address receiving the tokens
     * @param id Token type identifier
     * @param amount Quantity purchased
     * @param price Total payment amount
     */
    event TokenPurchased(address caller, address indexed receiver, uint256 indexed id, uint256 amount, uint256 price);

    /**
     * @notice Emitted when treasury address changes
     * @param caller Address making the change
     * @param account New treasury address
     */
    event TreasuryUpdated(address caller, address indexed account);

    /**
     * @notice Emitted when native currency price is updated
     * @param id Token type identifier
     * @param price New price in native currency
     */
    event NativePriceSet(uint256 indexed id, uint256 price);

    /**
     * @notice Emitted when ERC-20 price is updated
     * @param id Token type identifier
     * @param token ERC-20 contract address
     * @param price New price in token units
     */
    event ERC20PriceSet(uint256 indexed id, address indexed token, uint256 price);

    /**
     * @notice Error for insufficient ERC-20 approval
     * @param token ERC-20 contract address
     * @param required Amount needed
     * @param allowance Current approval amount
     */
    error InsufficientERC20Allowance(address token, uint256 required, uint256 allowance);

    /**
     * @notice Error for insufficient ERC-20 balance
     * @param token ERC-20 contract address
     * @param required Amount needed
     * @param balance Current balance
     */
    error InsufficientERC20Balance(address token, uint256 required, uint256 balance);

    /**
     * @notice Error for underpayment during purchase
     * @param id Token type identifier
     * @param amount Quantity attempted to purchase
     * @param price Total price required
     * @param paid Amount actually paid
     */
    error InsufficientPayment(uint256 id, uint256 amount, uint256 price, uint256 paid);

    /**
     * @notice Error for unaccepted ERC-20 payment token
     * @param token ERC-20 contract address
     */
    error InvalidERC20PaymentToken(address token);

    /**
     * @notice Error for invalid purchase quantity
     * @param amount The invalid amount specified
     */
    error InvalidTokenQuantity(uint256 amount);

    /**
     * @notice Error for invalid recipient address
     * @param receiver The invalid address specified
     */
    error InvalidReceiverAddress(address receiver);

    /**
     * @notice Error for invalid treasury address
     * @param treasury The invalid address specified
     */
    error InvalidTreasuryAddress(address treasury);

    /**
     * @notice Error when token cannot be purchased with native currency
     * @param id Token type identifier
     */
    error TokenNotForSaleWithNativeCurrency(uint256 id);

    /**
     * @notice Error when token cannot be purchased with specific ERC-20
     * @param id Token type identifier
     * @param token ERC-20 contract address
     */
    error TokenNotForSaleWithERC20(uint256 id, address token);

    /**
     * @notice Internal initializer for TokenPurchasable setup
     * @dev Sets initial treasury address
     * @param initialTreasury Address to receive purchase revenues
     */
    function __TokenPurchasable_init(address payable initialTreasury) internal onlyInitializing {
        __TokenPurchasable_init_unchained(initialTreasury);
    }

    /**
     * @notice Unchained initializer for contract-specific storage
     * @dev Validates and sets treasury address
     * @param initialTreasury Address to receive purchase revenues
     */
    function __TokenPurchasable_init_unchained(address payable initialTreasury) internal onlyInitializing {
        _setTreasury(initialTreasury);
    }

    /**
     * @notice Gets native currency price for a token type
     * @dev Reverts if price is 0 (not for sale)
     * @param id Token type identifier
     * @return price Native currency price
     * @custom:throws TokenNotForSaleWithNativeCurrency When price is 0
     */
    function tokenPrice(uint256 id) public view virtual returns (uint256 price) {
        TokenPurchasableStorage storage $ = _getTokenPurchasableStorage();
        price = $.nativePrices[id];

        if (price == 0) {
            revert TokenNotForSaleWithNativeCurrency(id);
        }

        return price;
    }

    /**
     * @notice Gets price in specific ERC-20 token
     * @dev Reverts if token not accepted (price is 0)
     * @param id Token type identifier
     * @param paymentToken ERC-20 contract address
     * @return price Price in ERC-20 token units
     * @custom:throws TokenNotForSaleWithERC20 When token not accepted
     */
    function tokenERC20Price(uint256 id, address paymentToken) public view virtual returns (uint256 price) {
        TokenPurchasableStorage storage $ = _getTokenPurchasableStorage();
        price = $.erc20Prices[id][paymentToken];

        if (price == 0) {
            revert TokenNotForSaleWithERC20(id, paymentToken);
        }

        return price;
    }

    /**
     * @notice Gets all accepted ERC-20 payment options
     * @dev Returns array of payment tokens and their prices
     * @param id Token type identifier
     * @return prices Array of PaymentToken structs
     */
    function tokenERC20Prices(uint256 id) public view virtual returns (PaymentToken[] memory prices) {
        TokenPurchasableStorage storage $ = _getTokenPurchasableStorage();
        address[] storage acceptedTokens = $.erc20TokensAccepted[id];
        prices = new PaymentToken[](acceptedTokens.length);

        for (uint256 i = 0; i < acceptedTokens.length; i++) {
            address token = acceptedTokens[i];
            uint256 price = $.erc20Prices[id][token];
            prices[i] = PaymentToken(token, price);
        }
    }

    /**
     * @notice Checks if ERC-20 token is accepted for payment
     * @dev Returns true if price > 0
     * @param id Token type identifier
     * @param paymentToken ERC-20 contract address to check
     * @return True if accepted, false otherwise
     */
    function isAcceptedERC20PaymentToken(uint256 id, address paymentToken) public view virtual returns (bool) {
        TokenPurchasableStorage storage $ = _getTokenPurchasableStorage();
        return $.erc20Prices[id][paymentToken] > 0;
    }

    /**
     * @notice Gets current treasury address
     * @dev All purchase revenues are sent to this address
     * @return Treasury address
     */
    function treasury() public view virtual returns (address) {
        TokenPurchasableStorage storage $ = _getTokenPurchasableStorage();
        return $.treasury;
    }

    /**
     * @notice Purchase tokens for caller using native currency
     * @dev Requires exact or excess payment. Excess is refunded
     * @param id Token type identifier to purchase
     * @param amount Quantity to purchase
     * @custom:emits TokenPurchased
     */
    function purchase(uint256 id, uint256 amount) external payable virtual whenNotPaused nonReentrant {
        _purchaseFor(_msgSender(), id, amount);
    }

    /**
     * @notice Purchase tokens for specified recipient using native currency
     * @dev Caller pays, receiver gets tokens. Excess payment refunded to caller
     * @param receiver Address to receive purchased tokens
     * @param id Token type identifier to purchase
     * @param amount Quantity to purchase
     */
    function purchaseFor(address receiver, uint256 id, uint256 amount)
        external
        payable
        virtual
        whenNotPaused
        nonReentrant
    {
        _purchaseFor(receiver, id, amount);
    }

    /**
     * @notice Purchase tokens for caller using ERC-20 payment
     * @dev Requires sufficient balance and approval
     * @param paymentToken ERC-20 contract address for payment
     * @param id Token type identifier to purchase
     * @param amount Quantity to purchase
     */
    function purchaseWithERC20(address paymentToken, uint256 id, uint256 amount)
        external
        virtual
        whenNotPaused
        nonReentrant
    {
        _purchaseWithERC20For(_msgSender(), paymentToken, id, amount);
    }

    /**
     * @notice Purchase tokens for specified recipient using ERC-20 payment
     * @dev Caller pays with ERC-20, receiver gets tokens
     * @param receiver Address to receive purchased tokens
     * @param paymentToken ERC-20 contract address for payment
     * @param id Token type identifier to purchase
     * @param amount Quantity to purchase
     */
    function purchaseWithERC20For(address receiver, address paymentToken, uint256 id, uint256 amount)
        external
        virtual
        whenNotPaused
        nonReentrant
    {
        _purchaseWithERC20For(receiver, paymentToken, id, amount);
    }

    /**
     * @notice Internal native currency purchase handler
     * @dev Validates, collects payment, refunds excess, mints tokens
     * @param receiver Address to receive tokens
     * @param id Token type identifier
     * @param amount Quantity to purchase
     */
    function _purchaseFor(address receiver, uint256 id, uint256 amount) internal virtual {
        TokenPurchasableStorage storage $ = _getTokenPurchasableStorage();

        _validateReceiver(receiver);
        _validateAmount(amount);

        uint256 price = $.nativePrices[id];
        if (price == 0) revert TokenNotForSaleWithNativeCurrency(id);

        uint256 totalPrice = price * amount;

        if (msg.value < totalPrice) revert InsufficientPayment(id, amount, totalPrice, msg.value);

        // Refund excess payment to the sender
        if (msg.value > totalPrice) payable(_msgSender()).transfer(msg.value - totalPrice);

        // Transfer payment to treasury
        payable($.treasury).transfer(totalPrice);

        // Complete the purchase
        _completePurchase(receiver, id, amount, totalPrice);
    }

    /**
     * @notice Internal ERC-20 purchase handler
     * @dev Validates, checks balance/approval, transfers payment, mints tokens
     * @param receiver Address to receive tokens
     * @param paymentToken ERC-20 contract address
     * @param id Token type identifier
     * @param amount Quantity to purchase
     */
    function _purchaseWithERC20For(address receiver, address paymentToken, uint256 id, uint256 amount)
        internal
        virtual
    {
        TokenPurchasableStorage storage $ = _getTokenPurchasableStorage();

        _validateReceiver(receiver);
        _validateAmount(amount);

        uint256 price = $.erc20Prices[id][paymentToken];
        if (price == 0) revert TokenNotForSaleWithERC20(id, paymentToken);

        uint256 totalPrice = price * amount;

        IERC20 token = IERC20(paymentToken);

        // Check allowance
        uint256 allowance = token.allowance(_msgSender(), address(this));
        if (allowance < totalPrice) revert InsufficientERC20Allowance(paymentToken, totalPrice, allowance);

        // Check balance
        uint256 balance = token.balanceOf(_msgSender());
        if (balance < totalPrice) revert InsufficientERC20Balance(paymentToken, totalPrice, balance);

        // Transfer ERC-20 tokens from sender to treasury
        token.safeTransferFrom(_msgSender(), $.treasury, totalPrice);

        // Complete the purchase
        _completePurchase(receiver, id, amount, totalPrice);
    }

    /**
     * @notice Internal function to set native currency price
     * @dev Price of 0 disables native currency purchases
     * @param id Token type identifier
     * @param price Native currency price
     * @custom:emits NativePriceSet
     */
    function _setPrice(uint256 id, uint256 price) internal virtual {
        TokenPurchasableStorage storage $ = _getTokenPurchasableStorage();
        $.nativePrices[id] = price;
        emit NativePriceSet(id, price);
    }

    /**
     * @notice Internal function to set ERC-20 token price
     * @dev Price > 0 adds to accepted list, price = 0 removes from list
     * @param id Token type identifier
     * @param token ERC-20 contract address
     * @param price Price in token units (0 to disable)
     * @custom:emits ERC20PriceSet
     */
    function _setERC20Price(uint256 id, address token, uint256 price) internal virtual {
        if (token == address(0)) {
            revert InvalidERC20PaymentToken(token);
        }

        TokenPurchasableStorage storage $ = _getTokenPurchasableStorage();
        $.erc20Prices[id][token] = price;

        // If price > 0 and token not already in accepted list, add it
        if (price > 0) {
            address[] storage acceptedTokens = $.erc20TokensAccepted[id];
            bool alreadyAccepted = false;
            for (uint256 i = 0; i < acceptedTokens.length; i++) {
                if (acceptedTokens[i] == token) {
                    alreadyAccepted = true;
                    break;
                }
            }
            if (!alreadyAccepted) {
                acceptedTokens.push(token);
            }
        } else {
            // If price is set to 0, remove the token from the accepted list
            address[] storage acceptedTokens = $.erc20TokensAccepted[id];
            for (uint256 i = 0; i < acceptedTokens.length; i++) {
                if (acceptedTokens[i] == token) {
                    acceptedTokens[i] = acceptedTokens[acceptedTokens.length - 1];
                    acceptedTokens.pop();
                    break;
                }
            }
        }

        emit ERC20PriceSet(id, token, price);
    }

    /**
     * @notice Internal function to batch set ERC-20 prices
     * @dev Iterates through configs and sets each price
     * @param id Token type identifier
     * @param configs Array of PaymentToken structs
     */
    function _setERC20Prices(uint256 id, PaymentToken[] calldata configs) internal virtual {
        for (uint256 i = 0; i < configs.length; i++) {
            _setERC20Price(id, configs[i].token, configs[i].price);
        }
    }

    /**
     * @notice Internal function to update treasury address
     * @dev Validates address is not zero
     * @param account New treasury address
     * @custom:emits TreasuryUpdated
     */
    function _setTreasury(address payable account) internal virtual {
        TokenPurchasableStorage storage $ = _getTokenPurchasableStorage();

        if (account == address(0)) revert InvalidTreasuryAddress(account);

        $.treasury = account;
        emit TreasuryUpdated(_msgSender(), account);
    }

    /**
     * @notice Validates recipient address is not zero
     * @dev Pure function for address validation
     * @param receiver Address to validate
     * @custom:throws InvalidReceiverAddress When receiver is zero
     */
    function _validateReceiver(address receiver) internal pure virtual {
        if (receiver == address(0)) revert InvalidReceiverAddress(receiver);
    }

    /**
     * @notice Validates purchase quantity is not zero
     * @dev Pure function for amount validation
     * @param amount Quantity to validate
     * @custom:throws InvalidTokenQuantity When amount is zero
     */
    function _validateAmount(uint256 amount) internal pure virtual {
        if (amount == 0) revert InvalidTokenQuantity(amount);
    }

    /**
     * @notice Finalizes purchase by minting tokens and emitting event
     * @dev Calls abstract _mintPurchasedTokens function
     * @param receiver Address receiving tokens
     * @param id Token type identifier
     * @param amount Quantity purchased
     * @param totalPrice Total payment collected
     * @custom:emits TokenPurchased
     */
    function _completePurchase(address receiver, uint256 id, uint256 amount, uint256 totalPrice) internal virtual {
        _mintPurchasedTokens(receiver, id, amount);
        emit TokenPurchased(_msgSender(), receiver, id, amount, totalPrice);
    }

    /**
     * @notice Abstract function to mint purchased tokens
     * @dev Must be implemented by inheriting contracts
     * @param to Address to receive minted tokens
     * @param id Token type identifier
     * @param amount Quantity to mint
     */
    function _mintPurchasedTokens(address to, uint256 id, uint256 amount) internal virtual;
}
