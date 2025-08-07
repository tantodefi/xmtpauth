# EVMAuth Smart Contracts

Smart contracts for the XMTP EVMAuth Groups Agent. Provides time-bound access control using ERC-1155 tokens with automatic expiration and XMTP group integration.

## 📁 Contract Architecture

### Core Contracts

1. **EVMAuthFactory.sol** - Factory contract for deploying group access contracts
2. **EVMAuthGroupAccessV2.sol** - Individual group access control contract (ERC-1155) with XMTP integration

### Features

- ✅ **Time-bound Access**: Tokens automatically expire after set duration
- ✅ **Multi-tier Pricing**: Different access levels with custom pricing  
- ✅ **XMTP Integration**: Direct integration with XMTP group conversations
- ✅ **Inbox ID Mapping**: Links wallet addresses to XMTP inbox IDs
- ✅ **Non-transferable**: Soulbound tokens prevent secondary sales
- ✅ **Platform Fees**: Built-in fee mechanism for revenue sharing
- ✅ **Access Control**: Role-based permissions for group management
- ✅ **Pausable**: Emergency pause functionality
- ✅ **Gas Optimized**: Efficient storage and operations

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Hardhat](https://hardhat.org/) development framework
- MetaMask or compatible wallet

### Installation

```bash
# Clone and setup
git clone <repo>
cd contracts

# Install dependencies
npm install
```

### Configuration

Create a `.env` file with your configuration:

```bash
# Private key for deployment
PRIVATE_KEY=0x...

# Network RPC URLs
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_MAINNET_RPC_URL=https://mainnet.base.org

# Contract configuration
FEE_RECIPIENT=0x...
FEE_BASIS_POINTS=250
INITIAL_OWNER=0x...

# Optional: Basescan API key for verification
BASESCAN_API_KEY=...
```

## 🌐 Deployed Contracts

### Base Sepolia (Testnet)

| Contract | Address | Description |
|----------|---------|-------------|
| **EVMAuthFactory** | `0xa8830a603ae5143a1f8baa46e28c36e4765ec754` | Factory for deploying group contracts |
| **Test Group Contract** | `TBD` | Example group access contract |

### Base Mainnet (Production)

| Contract | Address | Description |
|----------|---------|-------------|
| **EVMAuthFactory** | `TBD` | Factory for deploying group contracts |
| **Production Groups** | `TBD` | Live group access contracts |

> **Note**: Contract addresses will be updated after mainnet deployment.

## 📋 Deployment

### Local Development

```bash
# Start local Hardhat node (new terminal)
npm run node

# Deploy to local network
npm run deploy:local
```

### Base Sepolia (Testnet)

```bash
# Deploy to testnet
npm run deploy:base-sepolia
```

### Base Mainnet (Production)

```bash
# Deploy to mainnet (use with caution)
npm run deploy:base-mainnet
```

## 🔧 Contract Interface

### Factory Contract

```solidity
function deployGroupContract(
    string memory groupName,
    string memory groupDescription, 
    string memory groupImageUrl,
    string memory salesGroupId,
    string memory premiumGroupId,
    address botAddress
) external payable returns (address);
```

### Group Access Contract (V2)

```solidity
// Setup access tier
function setupAccessTier(
    uint256 tokenId,
    uint256 durationDays,
    uint256 priceWei,
    string memory name,
    string memory description,
    string memory imageHash,
    string memory metadataUri
) external;

// Purchase access
function purchaseAccess(uint256 tokenId) external payable;
function grantAccess(address user, uint256 tokenId, string memory userInboxId) external;

// Check access
function hasValidAccess(address user) external view returns (bool);
function hasValidAccessForTier(address user, uint256 tokenId) external view returns (bool);

// XMTP Integration
function linkInboxId(address userAddress, string memory inboxId) external;
function getUserInboxId(address userAddress) external view returns (string memory);
function getAddressFromInboxId(string memory inboxId) external view returns (address);

// Expiration management
function getUserTokenExpiration(address user, uint256 tokenId) external view returns (uint256);
function burnExpiredToken(address user, uint256 tokenId) external;
```

## 💰 Economics

### Fee Structure

- **Platform Fee**: 2.5% default (configurable, max 10%)
- **Deployment Fee**: 0.0001 ETH (configurable via factory)
- **Creator Revenue**: 97.5% of token sales

### Example Tier Pricing

| Tier | Duration | Price (ETH) | Platform Fee | Creator Gets |
|------|----------|-------------|--------------|--------------|
| Weekly | 7 days | 0.001 | 0.000025 | 0.000975 |
| Monthly | 30 days | 0.003 | 0.000075 | 0.002925 |
| Quarterly | 90 days | 0.008 | 0.0002 | 0.0078 |

## 🧪 Testing

```bash
# Compile contracts
npm run compile

# Run all tests
npm test

# Run tests with gas reporting
npm run test:gas

# Generate coverage report
npx hardhat coverage
```

## 📊 Contract Verification

Contracts can be verified on Basescan after deployment:

```bash
# Verify factory contract
npx hardhat verify --network baseSepolia <FACTORY_ADDRESS> <FEE_RECIPIENT> <FEE_BASIS_POINTS> <INITIAL_OWNER>

# Verify group contract  
npx hardhat verify --network baseSepolia <GROUP_ADDRESS> <FACTORY_ADDRESS> <GROUP_NAME> <GROUP_DESCRIPTION> <GROUP_IMAGE> <SALES_GROUP_ID> <PREMIUM_GROUP_ID> <BOT_ADDRESS> <INITIAL_OWNER>
```

## 🔐 Security Features

### Access Control

- **Owner**: Contract deployer/creator with full control
- **Factory**: Can deploy new group contracts
- **Bot**: XMTP agent with minting permissions

### Safety Mechanisms

- **ReentrancyGuard**: Prevents reentrancy attacks
- **Ownable**: Secure ownership management
- **Non-transferable**: Tokens are soulbound (cannot be transferred)
- **Automatic Expiration**: Tokens expire after set duration
- **Fee Limits**: Maximum 10% platform fee enforced
- **Input Validation**: Comprehensive parameter validation

## 🔄 Integration with XMTP Agent

The deployed contracts integrate seamlessly with the XMTP agent:

```typescript
// Agent checks access via contract
const hasAccess = await contract.hasValidAccess(userAddress);

// Agent monitors for expired tokens
const expiration = await contract.getUserTokenExpiration(userAddress, tokenId);
if (Date.now() / 1000 >= expiration) {
  await removeFromGroup(userInboxId);
}

// Agent grants trial access
await contract.grantAccess(userAddress, tokenId, userInboxId);
```

### XMTP Group Mapping

Each deployed contract links to two XMTP groups:
- **Sales Group**: Public group for information and sales
- **Premium Group**: Private group for token holders only

## 📈 Monitoring & Analytics

### Key Events

- `ContractDeployed`: New group contract created
- `AccessTierCreated`: New tier setup
- `AccessGranted`: Token minted (purchase or grant)
- `AccessExpired`: Token expired
- `InboxLinked`: Wallet linked to XMTP inbox ID

### Integration Points

The contracts emit comprehensive events suitable for:
- Subgraph indexing
- Analytics dashboards  
- Real-time monitoring
- XMTP agent automation

## 🛠️ Development

### Build

```bash
npm run compile
```

### Clean

```bash
npm run clean
```

### Local Testing

```bash
# Start local node
npm run node

# In another terminal, run tests
npm test
```

## 📄 License

MIT License - see [LICENSE](../LICENSE.md) for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/xmtpauth/xmtpauth/issues)
- **Documentation**: [XMTP Documentation](https://docs.xmtp.org)
- **Community**: [XMTP Discord](https://discord.gg/xmtp)

## 🔧 Environment Variables

Required environment variables for deployment:

```bash
# Required
PRIVATE_KEY=0x...                    # Deployer private key
BASE_SEPOLIA_RPC_URL=https://...     # Base Sepolia RPC
BASE_MAINNET_RPC_URL=https://...     # Base Mainnet RPC

# Optional (with defaults)
FEE_RECIPIENT=0x...                  # Platform fee recipient (defaults to deployer)
FEE_BASIS_POINTS=250                 # Platform fee (250 = 2.5%)
INITIAL_OWNER=0x...                  # Contract owner (defaults to deployer)
BASESCAN_API_KEY=...                 # For contract verification
```