# XMTP Authentication Contracts V2

Enhanced XMTP authentication smart contracts built on the EVMAuth ERC1155/6909 architecture. This version combines the robust, modular design of the EVMAuth system with XMTP-specific functionality for group access management.

## Overview

XMTPAuth V2 provides token-gated access control for XMTP groups with the following key features:

- **ERC1155-based Access Tokens**: NFT-compatible tokens with expiry and pricing
- **XMTP Integration**: Direct integration with XMTP groups and inbox ID management
- **Flexible Payment Options**: Support for ETH and ERC20 token payments (USDC, etc.)
- **Role-based Access Control**: Comprehensive permission system with time-delayed admin transfers
- **Factory Pattern**: Gas-efficient deployment using minimal proxies
- **Upgradeable Architecture**: UUPS proxy pattern for future improvements

## Architecture

### Core Contracts

#### XMTPAuthERC1155
The main authentication contract that inherits from `EVMAuth1155XP20`, providing:

- **Token Management**: Create and configure access tiers with expiry times
- **XMTP Integration**: Link with XMTP sales and premium groups
- **Purchase System**: Native ETH and ERC20 token payment support
- **Access Control**: Role-based permissions with account freezing
- **Inbox ID Mapping**: Link Ethereum addresses to XMTP inbox IDs

#### XMTPAuthFactory
Factory contract for deploying XMTP authentication contracts:

- **Minimal Proxy Deployment**: Gas-efficient contract creation
- **Platform Fees**: Configurable platform fee collection
- **Contract Tracking**: Registry of all deployed contracts
- **Deterministic Deployment**: Optional deterministic address generation

### Inherited Features from EVMAuth

The contracts inherit advanced features from the EVMAuth architecture:

#### TokenAccessControl
- **Roles**: Admin, Upgrade Manager, Access Manager, Token Manager, Minter, Burner, Treasurer
- **Account Freezing**: Ability to freeze/unfreeze accounts
- **Pausable Operations**: Emergency pause functionality
- **Time-delayed Admin**: Secure admin role transfers

#### TokenConfiguration
- **Sequential Token IDs**: Automatic token ID assignment
- **Transferability Control**: Configure which tokens can be transferred
- **Unified Configuration**: Single struct for all token properties

#### TokenExpiry
- **Time-to-Live (TTL)**: Automatic token expiration
- **Balance Records**: Efficient tracking of token expiry times
- **Pruning**: Gas optimization through expired record cleanup

#### TokenPurchase & TokenPurchaseERC20
- **Native Currency**: Direct ETH purchases
- **ERC20 Support**: USDC and other token payments
- **Treasury Management**: Configurable revenue collection
- **Purchase Validation**: Comprehensive payment verification

## Contract Variants

The EVMAuth architecture provides multiple contract variants:

| Contract | Token Standard | Features |
|----------|:--------------:|:---------|
| EVMAuth1155 | ERC-1155 | Base functionality |
| EVMAuth1155P | ERC-1155 | + Native token purchase |
| EVMAuth1155P20 | ERC-1155 | + ERC20 token purchase |
| EVMAuth1155X | ERC-1155 | + Token expiry |
| EVMAuth1155XP | ERC-1155 | + Expiry + Native purchase |
| **EVMAuth1155XP20** | ERC-1155 | + **All features** |

XMTPAuthERC1155 is based on EVMAuth1155XP20 for maximum functionality.

## 🔌 Extension System

XMTPAuth V2 features a powerful extension system that allows you to add custom functionality without modifying the core contracts. Extensions are separate contracts that receive notifications about token purchases, grants, and revocations.

### Built-in Extensions

#### MegapotExtension 🎰
Automatically purchases lottery tickets when users buy access tokens, creating a gamified experience.

**Features:**
- Automatic lottery ticket purchases on token purchases
- Configurable ticket amounts (fixed or value-proportional)
- USDC funding and management
- Referrer fee support
- Comprehensive statistics and error handling

**Usage:**
```solidity
// Deploy with Megapot extension
(address baseContract, address megapotExt) = factory.deployXMTPAuthWithMegapot(
    config,
    "0xbEDd4F2beBE9E3E636161E644759f3cbe3d51B95", // Megapot on Base
    referrerAddress
);
```

### Custom Extensions

Create your own extensions by implementing the `IExtension` interface:

```solidity
interface IExtension {
    function onTokenPurchased(address buyer, uint256 tokenId, uint256 amount, uint256 totalPrice, address paymentToken) external;
    function onTokenGranted(address recipient, uint256 tokenId, uint256 amount, address grantedBy) external;
    function onTokenRevoked(address user, uint256 tokenId, uint256 amount, string memory reason) external;
    function getExtensionInfo() external view returns (string memory name, string memory version, bool isActive);
}
```

**Extension Use Cases:**
- 🎮 **Gaming Integration**: Award in-game items or currency
- 💎 **Staking Rewards**: Earn tokens for holding access tokens
- 🏆 **Achievement Systems**: Unlock badges and achievements
- 📱 **Notifications**: Send push notifications or Discord messages
- 💰 **Referral Programs**: Reward users for referrals
- 🎁 **NFT Rewards**: Mint special NFTs for milestones

See [EXTENSION_SYSTEM.md](./EXTENSION_SYSTEM.md) for detailed documentation.

## Deployment

### Prerequisites

```bash
npm install
# or
yarn install
```

### Environment Setup

Create a `.env` file:

```bash
PRIVATE_KEY=your_private_key_here
INFURA_PROJECT_ID=your_infura_project_id
ETHERSCAN_API_KEY=your_etherscan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key
```

### Deploy to Local Network

```bash
# Start local Hardhat node
npx hardhat node

# Deploy contracts
npm run deploy:local
```

### Deploy to Testnet

```bash
npm run deploy:sepolia
```

### Deploy to Mainnet

```bash
npm run deploy:mainnet
```

## Usage

### Factory Deployment

```solidity
// Deploy factory with implementation
XMTPAuthFactory factory = new XMTPAuthFactory(
    implementationAddress,
    feeRecipient,
    250, // 2.5% fee
    owner
);
```

### Create XMTP Auth Contract

```solidity
// Simple deployment
address authContract = factory.deployGroupContract(
    "My XMTP Group",
    "Premium access group",
    "https://example.com/image.jpg",
    "sales-group-id",
    "premium-group-id",
    botAddress
);

// Advanced deployment with custom config
XMTPAuthFactory.DeploymentConfig memory config = XMTPAuthFactory.DeploymentConfig({
    groupName: "Advanced Group",
    groupDescription: "Advanced XMTP group",
    groupImageUrl: "https://example.com/image.jpg",
    baseURI: "https://api.example.com/metadata/",
    salesGroupId: "sales-group-id",
    premiumGroupId: "premium-group-id",
    botAddress: botAddress,
    treasury: treasuryAddress,
    adminDelay: 2 days
});

address authContract = factory.deployXMTPAuthContract(config);

// Deploy with Megapot extension for gamified experience
(address authContract, address megapotExtension) = factory.deployXMTPAuthWithMegapot(
    config,
    "0xbEDd4F2beBE9E3E636161E644759f3cbe3d51B95", // Megapot contract on Base
    referrerAddress // Optional referrer for lottery fees
);
```

### Configure Access Tiers

```solidity
XMTPAuthERC1155 auth = XMTPAuthERC1155(authContract);

// Create token configuration
TokenConfiguration.TokenConfig memory config = TokenConfiguration.TokenConfig({
    isTransferable: true,
    price: 0.01 ether,
    ttl: 30 days
});

// Create new access tier
uint256 tokenId = auth.newToken(config);

// Setup XMTP-specific metadata
auth.setupXMTPAccessTier(
    tokenId,
    "Premium Access",
    "30-day premium group access",
    "QmImageHash",
    "https://api.example.com/metadata/1"
);
```

### Purchase Access

```solidity
// Purchase with ETH
auth.purchase{value: 0.01 ether}(tokenId, 1);

// Purchase with USDC
IERC20 usdc = IERC20(usdcAddress);
usdc.approve(address(auth), price);
auth.purchase(usdcAddress, tokenId, 1);

// Purchase with transaction tracking
auth.purchaseXMTPAccess{value: 0.01 ether}(
    tokenId,
    1,
    "0x1234567890abcdef..." // transaction hash
);
```

### Access Control

```solidity
// Check access by address
bool hasAccess = auth.hasValidXMTPAccess(userAddress);

// Check access by XMTP inbox ID
bool hasAccess = auth.hasValidAccessByInboxId("inbox-id");

// Grant access (admin/bot only)
auth.grantXMTPAccess(userAddress, tokenId, 1, "inbox-id");

// Revoke access (admin only)
auth.revokeXMTPAccess(userAddress, tokenId, "Policy violation");
```

## Security Features

### Role-based Access Control

- **DEFAULT_ADMIN_ROLE**: Overall contract administration
- **UPGRADE_MANAGER_ROLE**: Contract upgrades
- **ACCESS_MANAGER_ROLE**: Pause/unpause and account freezing
- **TOKEN_MANAGER_ROLE**: Token configuration and metadata
- **MINTER_ROLE**: Token minting
- **BURNER_ROLE**: Token burning
- **TREASURER_ROLE**: Treasury address management

### Time-delayed Admin Transfers

Admin role transfers require a time delay (default 2 days) for security.

### Account Freezing

Ability to freeze accounts to prevent purchases, transfers, or token receipt.

### Pausable Operations

Emergency pause functionality for all contract operations.

## Gas Optimization

### Minimal Proxy Pattern

Factory uses OpenZeppelin's `Clones` library for gas-efficient deployments.

### Efficient Balance Tracking

Token expiry system uses optimized balance record tracking with automatic pruning.

### Batch Operations

Support for batch token operations to reduce gas costs.

## Testing

```bash
# Run tests
npm test

# Run tests with gas reporting
npm run gas-report

# Run coverage
npm run coverage
```

## Verification

After deployment, verify contracts on Etherscan:

```bash
# Verify implementation
npx hardhat verify --network sepolia IMPLEMENTATION_ADDRESS

# Verify factory
npx hardhat verify --network sepolia FACTORY_ADDRESS "IMPLEMENTATION_ADDRESS" "FEE_RECIPIENT" 250 "OWNER_ADDRESS"
```

## Integration with XMTP Agents

The contracts are designed to work seamlessly with XMTP agents:

1. **Inbox ID Management**: Agents can store and retrieve user inbox IDs
2. **Access Verification**: Real-time access checking for group membership
3. **Purchase Tracking**: Detailed purchase history with transaction hashes
4. **Event Monitoring**: Comprehensive events for agent integration

See the [XMTP Agent Examples](../examples/) for implementation details.

## Upgradeability

Contracts use the UUPS (Universal Upgradeable Proxy Standard) pattern:

- Implementation contracts can be upgraded
- Admin role required for upgrades
- Time-delayed admin transfers for security

## License

MIT License - see [LICENSE](../LICENSE.md) for details.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.

## Support

For questions and support:
- GitHub Issues: [Create an issue](https://github.com/xmtp/xmtpauth/issues)
- XMTP Discord: [Join the community](https://discord.gg/xmtp)
