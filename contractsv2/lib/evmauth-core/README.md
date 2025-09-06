# EVMAuth Core

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/evmauth/evmauth-core/test.yml?label=Tests)
![GitHub Repo stars](https://img.shields.io/github/stars/evmauth/evmauth-core)

## Overview

EVMAuth is an **authorization state management system** for software systems, service providers, and AI agents.

### Purpose

EVMAuth was created to provide a simple, standardized way to manage persistent authorization without the overhead of developing and maintaining auth servers and databases.

### Use Cases

- **Token-Gated Access Control**: Grant access to digital services, APIs, and AI agents based on token ownership.
- **Subscription Management**: Issue time-limited access tokens for subscription-based services.
- **Metered Usage**: Issue tokens that can be redeemed for usage credits, allowing for pay-as-you-go models.
- **Licensing**: Manage software licenses and entitlements through tokens.
- **Access Revocation**: Instantly revoke access by burning tokens or freezing accounts.
- **Decentralized Identity**: Leverage EVM networks for secure and verifiable identity management.

### Features

Each EVMAuth token type can be configured for direct purchase, with any of the following:

- Native currencies like ETH
- Stablecoins like USDC and USDT
- Any other ERC-20 tokens

Each accepted payment method can be priced independently. If no prices are set (i.e. all prices are zero), direct purchases are disabled for that token type.

EVMAuth tokens can also be issued to users programmatically and redeemed by the issuer at any time. This works well for metered usage models, where tokens are used as credits.

Each EVMAuth token type can be configured with a time-to-live (TTL). If the TTL is set (i.e. greater than zero), tokens of that type will automatically expire. This is ideal for subscription models.

All EVMAuth tokens are transferable by default, but each token type can be made non-transferable. This is useful for non-transferable licenses, identity tokens, or other situations where transfers are undesirable.

### Compatibility

EVMAuth comes in two flavors: [ERC-1155] and [ERC-6909]. Each version is fully compliant with its token standard and, as such, is fully compatible with existing wallets, apps, marketplaces, and other tools that support those standards.

EVMAuth contracts are upgradable by default, using OpenZeppelin's [UUPSUpgradeable] and [ERC-7201] namespaced storage layout, and can be deployed to any EVM-compatible network, including [Ethereum], [Base], [Tron], [Polygon], [Monad], and [Radius].

## Deployment

EVMAuth can be deployed on any EVM-compatible network (e.g. Ethereum, Base, Radius) using the scripts provided in the `scripts/` directory.

When deploying the contract, you will need to specify the following parameters:

- Initial [transfer delay] for the default admin role
- Initial default admin address, [for role management](https://docs.openzeppelin.com/contracts/5.x/api/access#AccessControlDefaultAdminRules)
- Initial treasury address, for receiving revenue from direct purchases
- Base token metadata URI ([for ERC-1155](https://eips.ethereum.org/EIPS/eip-1155#metadata-extensions)) or contract URI ([for ERC-6909](https://eips.ethereum.org/EIPS/eip-6909#content-uri-extension)) (optional, can be updated later)

## Access Control

Once you've deployed the contract, the default admin will need to grant various access roles:

- `grantRole(TOKEN_MANAGER_ROLE, address)` for accounts that can configure tokens and token metadata
- `grantRole(ACCESS_MANAGER_ROLE, address)` for accounts that can pause/unpause the contract and freeze accounts
- `grantRole(TREASURER_ROLE, address)` for accounts that can modify the treasury address where funds are collected
- `grantRole(MINTER_ROLE, address)`for accounts that can issue tokens to addresses
- `grantRole(BURNER_ROLE, address)`for accounts that can deduct tokens from addresses

## Token Configuration

An account with the `TOKEN_MANAGER_ROLE` should then create one or more new tokens by calling `createToken` with the desired configuration:

- `uint256 price`: The cost to purchase one unit of the token; 0 means the token cannot be purchased directly; set to `0` to disable native currency purchases
- `PaymentToken[] erc20Prices`: Array of `PaymentToken` structs, each containing ERC-20 `token` address and `price`; pass an empty array to disable ERC-20 token purchases
- `uint256 ttl`: Time-to-live in seconds; 0 means the token never expires; set to 0 for non-expiring tokens
- `bool transferable`: Whether the token can be transferred between accounts

An account with the `TOKEN_MANAGER_ROLE` can modify an existing token by calling `updateToken(id, EVMAuthTokenConfig)`, or any of the individual property setter functions:

- `setTokenPrice(id, uint256 price)`
- `setERC20Price(uint256 id, address token, uint256 price)`
- `setTokenERC20Prices(id, PaymentToken[] erc20Prices)`
- `setTokenTTL(id, uint256 ttl)`
- `setTokenTransferable(id, bool transferable)`

## Token Standards

### ERC-1155 vs ERC-6909

<style>
.table-3col-20-40-40 .table-wrapper table {
   th:first-of-type {
      width: 20%;
   }
   th:nth-of-type(2), th:nth-of-type(3) {
      width: 40%;
   }
}
</style>

<div class="table-3col-20-40-40">

| Feature                | ERC-1155                                                                     | ERC-6909                                                                    |
|------------------------|------------------------------------------------------------------------------|-----------------------------------------------------------------------------|
| Callbacks              | Required for each transfer to contract accounts; must return specific values | Removed entirely; no callbacks required                                     |
| Batch Operations       | Included in specification (batch transfers)                                  | Excluded from specification to allow custom implementations                 |
| Permission System      | Single operator scheme: operators get unlimited allowance on all token IDs   | Hybrid scheme: allowances for specific token IDs + operators for all tokens |
| Transfer Methods       | Both transferFrom and safeTransferFrom required; no opt-out for callbacks    | Simplified transfers without mandatory recipient validation                 |
| Transfer Semantics     | Safe transfers with data parameter and receiver hooks                        | Simple transfers without hooks                                              |
| Interface Complexity   | Includes multiple features (callbacks, batching, etc.)                       | Minimized to bare essentials for multi-token management                     |
| Recipient Requirements | Contract recipients must implement callback functions with return values     | No special requirements for contract recipients                             |
| Approval Granularity   | Operators only (all-or-nothing for entire contract)                          | Granular allowances per token ID + full operators                           |
| Metadata Handling      | URI-based metadata (typically off-chain JSON)                                | On-chain name/symbol/decimals per token ID                                  |
| Supply Tracking        | Global `totalSupply()` plus per-token supply                                 | Only per-token `totalSupply(id)`                                            |

</div>

### When to Choose Which

Choose [ERC-1155] when you:
- Need NFT marketplace compatibility
- Batch operations are important
- Want receiver hook notifications
- Prefer URI-based metadata

Choose [ERC-6909] when you:
- Need ERC-20-like semantics per token
- Want granular approval control
- Need on-chain token metadata
- Prefer a simpler token transfer model

## EVMAuth Contract Architecture

### Overview

The EVMAuth contract system is designed with a modular, composable architecture that separates concerns into focused base contracts. This approach provides flexibility while maintaining a clean inheritance structure.

The architecture consists of:

- **Base Contracts**: Modular components that handle specific functionality (e.g. access control, purchasing, token expiry)
- **Base EVMAuth Contract**: Combines all base contracts into a unified authorization state management system
- **Token Standard Implementations**: `EVMAuth1155` and `EVMAuth6909` extend `EVMAuth` with their respective token standards

### Base Contracts Hierarchy

```mermaid
classDiagram
    class TokenAccessControl {
        <<abstract>>
        +UPGRADE_MANAGER_ROLE
        +ACCESS_MANAGER_ROLE
        +TOKEN_MANAGER_ROLE
        +MINTER_ROLE
        +BURNER_ROLE
        +TREASURER_ROLE
        +freezeAccount(account)
        +unfreezeAccount(account)
        <<inherited from Pausable>>
        +pause()
        +unpause()
        +paused()
        <<inherited from AccessControl>>
        +hasRole(role, account)
        +grantRole(role, account)
        +revokeRole(role, account)
        +renounceRole(role, account)
    }
    
    class AccountFreezable {
        <<abstract>>
        -frozenAccounts mapping
        +isFrozen(address)
        +frozenAccounts()
        #_freezeAccount(address)
        #_unfreezeAccount(address)
    }
    
    class TokenEnumerable {
        <<abstract>>
        -nextTokenId
        -tokenExists mapping
        +nextTokenID()
        +exists(id)
        #_claimNextTokenID()
    }
    
    class TokenTransferable {
        <<abstract>>
        -transferable mapping
        +isTransferable(id)
        #_setTransferable(id, bool)
    }
    
    class TokenEphemeral {
        <<abstract>>
        -ttl mapping
        -balanceRecords mapping
        +balanceOf(account, id)
        +tokenTTL(id)
        +balanceRecordsOf(account, id)
        +pruneBalanceRecords(account, id)
        #_setTTL(id, ttl)
    }
    
    class TokenPurchasable {
        <<abstract>>
        -treasury address
        -prices mapping
        -erc20Prices mapping
        +treasury()
        +tokenPrice(id)
        +tokenERC20Price(id, token)
        +tokenERC20Prices(id)
        +isAcceptedERC20PaymentToken(id, token)
        +purchase(id, amount)
        +purchaseFor(receiver, id, amount)
        +purchaseWithERC20(token, id, amount)
        +purchaseWithERC20For(receiver, token, id, amount)
        #_setPrice(id, price)
        #_setERC20Price(id, token, price)
        #_setERC20Prices(id, prices[])
        #_mintPurchasedTokens(to, id, amount)
    }
    
    class EVMAuth {
        <<abstract>>
        +EVMAuthTokenConfig struct
        +createToken(config)
        +updateToken(id, config)
        +tokenConfig(id)
        +tokenConfigs(ids[])
        +setPrice(id, price)
        +setERC20Price(id, token, price)
        +setERC20Prices(id, prices[])
        +setTTL(id, ttl)
        +setTransferable(id, bool)
        #_authorizeUpgrade(newImplementation)
    }
    
    AccessControlDefaultAdminRulesUpgradeable <|-- TokenAccessControl
    PausableUpgradeable <|-- TokenAccessControl
    AccountFreezable <|-- TokenAccessControl
    TokenAccessControl <|-- EVMAuth
    TokenEnumerable <|-- EVMAuth
    TokenTransferable <|-- EVMAuth
    TokenEphemeral <|-- EVMAuth
    TokenPurchasable <|-- EVMAuth
    UUPSUpgradeable <|-- EVMAuth
```

### EVMAuth1155 Implementation

```mermaid
classDiagram
    class EVMAuth {
        <<abstract>>
        +createToken(config)
        +updateToken(id, config)
        +tokenConfig(id)
        +tokenConfigs(ids[])
        +setPrice(id, price)
        +setERC20Price(id, token, price)
        +setERC20Prices(id, prices[])
        +setTTL(id, ttl)
        +setTransferable(id, bool)
        +tokenPrice(id)
        +tokenERC20Price(id, token)
        +tokenERC20Prices(id)
        +tokenTTL(id)
        +isTransferable(id)
        +purchase(id, amount)
        +purchaseWithERC20(token, id, amount)
        +freezeAccount(account)
        +unfreezeAccount(account)
    }
    
    class ERC1155Upgradeable {
        +balanceOf(account, id)
        +balanceOfBatch(accounts[], ids[])
        +setApprovalForAll(operator, approved)
        +isApprovedForAll(account, operator)
        +safeTransferFrom(from, to, id, amount, data)
        +safeBatchTransferFrom(from, to, ids[], amounts[], data)
    }
    
    class ERC1155URIStorageUpgradeable {
        +uri(id)
        #_setURI(id, uri)
        #_setBaseURI(baseURI)
    }
    
    class EVMAuth1155 {
        +initialize(delay, admin, treasury, uri)
        +mint(to, id, amount, data)
        +mintBatch(to, ids[], amounts[], data)
        +burn(from, id, amount)
        +burnBatch(from, ids[], amounts[])
        +setBaseURI(uri)
        +setTokenURI(id, uri)
        +purchaseFor(recipient, id, amount)
        +purchaseWithERC20For(token, recipient, id, amount)
        +balanceRecordsOf(account, id)
        +pruneBalanceRecords(account, id)
        +exists(id)
        +supportsInterface(interfaceId)
        #_update(from, to, ids[], amounts[])
        #_mintPurchasedTokens(to, id, amount)
    }
    
    ERC1155Upgradeable <|-- ERC1155SupplyUpgradeable
    ERC1155Upgradeable <|-- ERC1155URIStorageUpgradeable
    ERC1155SupplyUpgradeable <|-- EVMAuth1155
    ERC1155URIStorageUpgradeable <|-- EVMAuth1155
    EVMAuth <|-- EVMAuth1155
```

### EVMAuth6909 Implementation

```mermaid
classDiagram
    class EVMAuth {
        <<abstract>>
        +createToken(config)
        +updateToken(id, config)
        +tokenConfig(id)
        +tokenConfigs(ids[])
        +setPrice(id, price)
        +setERC20Price(id, token, price)
        +setERC20Prices(id, prices[])
        +setTTL(id, ttl)
        +setTransferable(id, bool)
        +tokenPrice(id)
        +tokenERC20Price(id, token)
        +tokenERC20Prices(id)
        +tokenTTL(id)
        +isTransferable(id)
        +purchase(id, amount)
        +purchaseWithERC20(token, id, amount)
        +freezeAccount(account)
        +unfreezeAccount(account)
    }
    
    class ERC6909Upgradeable {
        +balanceOf(account, id)
        +allowance(owner, spender, id)
        +isOperator(owner, spender)
        +transfer(to, id, amount)
        +transferFrom(from, to, id, amount)
        +approve(spender, id, amount)
        +setOperator(operator, approved)
    }
    
    class ERC6909MetadataUpgradeable {
        +name(id)
        +symbol(id)
        +decimals(id)
        #_setTokenMetadata(id, name, symbol, decimals)
    }
    
    class ERC6909ContentURIUpgradeable {
        +contractURI()
        +tokenURI(id)
        #_setContractURI(uri)
        #_setTokenURI(id, uri)
    }
    
    class EVMAuth6909 {
        +initialize(delay, admin, treasury, uri)
        +mint(to, id, amount)
        +burn(from, id, amount)
        +setContractURI(uri)
        +setTokenURI(id, uri)
        +setTokenMetadata(id, name, symbol, decimals)
        +purchaseFor(recipient, id, amount)
        +purchaseWithERC20For(token, recipient, id, amount)
        +balanceRecordsOf(account, id)
        +pruneBalanceRecords(account, id)
        +exists(id)
        +supportsInterface(interfaceId)
        #_update(from, to, id, amount)
        #_mintPurchasedTokens(to, id, amount)
    }
    
    ERC6909Upgradeable <|-- ERC6909MetadataUpgradeable
    ERC6909Upgradeable <|-- ERC6909ContentURIUpgradeable
    ERC6909MetadataUpgradeable <|-- EVMAuth6909
    ERC6909ContentURIUpgradeable <|-- EVMAuth6909
    EVMAuth <|-- EVMAuth6909
```

### Base Contract Descriptions

#### TokenAccessControl
Provides role-based access control with six distinct roles, pausable functionality, and account freezing capabilities. Extends OpenZeppelin's AccessControlDefaultAdminRulesUpgradeable for secure admin transfer with time delays.

#### AccountFreezable
Enables freezing and unfreezing of individual accounts, preventing them from transferring or receiving tokens. Maintains a list of frozen accounts for transparency.

#### TokenEnumerable
Manages token ID generation and tracks which token IDs have been created. Provides a sequential ID system starting from 1.

#### TokenTransferable
Controls whether individual token types can be transferred between accounts. Each token ID can be configured as transferable or non-transferable.

#### TokenEphemeral
Implements time-to-live (TTL) functionality for tokens. Tokens with a TTL expire after the specified duration, with automatic pruning of expired balance records. Uses an efficient time-bucket system for gas optimization.

#### TokenPurchasable
Handles direct token purchases with both native currency and ERC-20 tokens. Supports per-token pricing in multiple currencies, with revenue sent to a configurable treasury address. Includes reentrancy protection for secure purchases.

#### EVMAuth
The main abstract contract that combines all base functionality and provides a unified interface for token configuration. Defines the EVMAuthTokenConfig structure that encapsulates price, ERC-20 prices, TTL, and transferability settings for each token type.

## Key Architectural Decisions

1. **Upgradability**: All contracts use the Universal Upgradeable Proxy Standard ([UUPS]) pattern for future improvements

2. **Security**:
   - Role-based access control with time-delayed admin transfers
   - Pausable operations for emergency situations
   - Account freezing capabilities
   - Reentrancy protection on purchase functions

3. **Gas Optimization**:
   - TTL implementation uses bounded arrays and time buckets for balance records
   - Automatic pruning of expired records, with manual pruning methods available
   - Efficient storage patterns for token properties, as defined in [ERC-7201]

4. **Flexibility**:
   - Alternative purchase options (native and/or ERC-20 tokens)
   - Configurable token properties (price, TTL, transferability)
   - Support for both [ERC-1155] and [ERC-6909] token standards

## SDKs & Libraries

EVMAuth provides the following SDKs and libraries for easy integration with applications and frameworks:

- [TypeScript SDK](https://github.com/evmauth/evmauth-ts)
- Python SDK (coming soon)

To request additional SDKs or libraries, create a new issue with the `question` label.

## Contributing

To contribute to this open source project, please follow the guidelines in the [CONTRIBUTING.md](CONTRIBUTING.md) file.

## License

The **EVMAuth** contract is released under the MIT License. See the [LICENSE](LICENSE) file for details.

[Base]: https://base.org/
[ERC-1155]: https://eips.ethereum.org/EIPS/eip-1155
[ERC-6909]: https://eips.ethereum.org/EIPS/eip-6909
[ERC-7201]: https://eips.ethereum.org/EIPS/eip-7201
[Ethereum]: https://ethereum.org/en/
[Monad]: https://monad.xyz/
[Polygon]: https://polygon.technology/
[Radius]: https://radiustech.xyz/
[transfer delay]: https://docs.openzeppelin.com/contracts/5.x/api/access#AccessControlDefaultAdminRules-defaultAdminDelay--
[Tron]: https://tron.network/
[UUPS]: https://docs.openzeppelin.com/contracts-stylus/0.3.0-rc.1/uups-proxy
[UUPSUpgradeable]: https://docs.openzeppelin.com/contracts/5.x/api/proxy#UUPSUpgradeable