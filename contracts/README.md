# EVMAuth Smart Contracts

Smart contracts for the XMTP EVMAuth Groups Agent. Provides time-bound access control using ERC-1155 tokens with automatic expiration and XMTP group integration.

## 🏗️ Architecture Overview

This implementation represents a **custom adaptation** of EVMAuth concepts, purpose-built for XMTP group access control. While inspired by standard EVMAuth patterns, our contracts are specifically designed for:

- **XMTP Group Management**: Direct integration with XMTP conversations
- **Time-Bound Access Control**: Automatic token expiration and membership management  
- **Agent Automation**: Built for autonomous XMTP agent operation
- **Community Monetization**: Revenue sharing for group creators

### Relationship to EVMAuth Ecosystem

Our approach differs from standard EVMAuth implementations by focusing on:
- **Specialized Use Case**: XMTP group access vs. general DApp authentication
- **Time-Based Tokens**: ERC-1155 with expiration vs. persistent access tokens
- **Agent Integration**: Purpose-built for XMTP agent workflows
- **Non-Transferable**: Soulbound tokens prevent secondary markets

> **Note**: This is a custom implementation inspired by EVMAuth concepts. For general-purpose EVMAuth solutions, refer to the [official EVMAuth documentation](https://evmauth.io/#overview).

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

## 🏛️ Architectural Analysis

### Current Custom Approach

Our implementation is a **purpose-built adaptation** that prioritizes:

#### ✅ **Advantages**
- **XMTP-Optimized**: Direct integration with XMTP conversations and inbox IDs
- **Agent-Friendly**: Built for autonomous operation with transaction proposals
- **Revenue Model**: Integrated monetization for community creators
- **Time-Bound Access**: Automatic membership management with token expiration
- **Gas Efficient**: Optimized for frequent access verification

#### ⚠️ **Considerations** 
- **Custom Codebase**: Requires ongoing maintenance vs. using established libraries
- **Specialized**: Highly optimized for XMTP, less reusable for other use cases
- **Security Responsibility**: Custom contracts need thorough auditing

### Alternative: More Robust Standard Approach

A more robust, standards-compliant approach would involve:

#### **1. Modular Architecture**
```
┌─────────────────────────────────────────────────────┐
│                EVMAuth Core                         │
│  • Standard authentication patterns                 │
│  • EIP-1271 signature validation                    │
│  • Role-based access control                        │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│             XMTP Extensions                         │
│  • Group integration contracts                      │
│  • Inbox ID mapping                                 │
│  • Time-bound token management                      │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│            Agent Automation                         │
│  • Transaction proposal system                      │
│  • Automated membership management                  │
│  • Revenue distribution                             │
└─────────────────────────────────────────────────────┘
```

#### **2. Standards Compliance**
- **EIP-4337**: Account abstraction support for gasless transactions
- **EIP-1271**: Smart contract signature validation
- **OpenZeppelin**: Battle-tested security patterns
- **EIP-2535**: Diamond pattern for upgradeable contracts

#### **3. Enhanced Security**
- **Formal Verification**: Mathematical proof of contract correctness
- **Multi-sig Governance**: Decentralized contract administration
- **Time-locked Upgrades**: Community review period for changes
- **Emergency Pause**: Circuit breakers for critical issues

#### **4. Ecosystem Integration**
- **Standard EVMAuth SDK**: Compatibility with existing tools
- **Plugin Architecture**: Extensible for different access models
- **Cross-chain Support**: Multi-network deployment capabilities
- **Subgraph Indexing**: Standardized data querying

### When to Choose Each Approach

#### **Custom Approach (Current)** - Choose when:
- Rapid prototyping and iteration needed
- Highly specialized use case (XMTP groups)
- Small, focused team with specific expertise
- Direct control over all contract logic required

#### **Standard Approach** - Choose when:
- Building for production at scale
- Need ecosystem compatibility
- Multiple teams/developers involved
- Long-term maintenance and upgrades planned
- Regulatory compliance requirements

### Migration Path

To evolve toward a more robust standard approach:

1. **Phase 1**: Audit and harden current contracts
2. **Phase 2**: Extract reusable components into libraries
3. **Phase 3**: Implement standard EVMAuth interfaces
4. **Phase 4**: Add modular extension system
5. **Phase 5**: Deploy with full standards compliance

## 📄 License

MIT License - see [LICENSE](../LICENSE.md) for details.

## 🔗 EVMAuth Resources

### Official EVMAuth
- **Website**: [https://evmauth.io](https://evmauth.io)
- **Documentation**: [EVMAuth Overview](https://evmauth.io/#overview)
- **Core Repository**: [https://github.com/evmauth/evmauth-core](https://github.com/evmauth/evmauth-core)
- **TypeScript SDK**: [https://github.com/evmauth/evmauth-ts](https://github.com/evmauth/evmauth-ts)

### Our Implementation
- **Focus**: XMTP group access control with time-bound tokens
- **Approach**: Custom adaptation optimized for agent automation
- **Integration**: Purpose-built for XMTP conversation management

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