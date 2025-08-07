# EVMAuth V2 - Modular Smart Contracts

EVMAuth V2 represents a **modular, plugin-based architecture** that extends the official EVMAuth core contracts with specialized functionality for XMTP group management.

## 🏗️ Architecture Overview

### **Modular Design Pattern**

```
┌─────────────────────────────────────────────────────┐
│                EVMAuthV2 (Base)                     │
│  • Core EVMAuth functionality                       │
│  • ERC-1155 with expiration                         │
│  • Purchasable tokens                               │
│  • Extension registry                               │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│            XMTPGroupExtension                       │
│  • XMTP conversation integration                    │
│  • Inbox ID mapping                                 │
│  • Group-specific purchase tracking                 │
│  • Agent automation support                        │
└─────────────────────────────────────────────────────┘
```

### **Key Improvements Over V1**

| Aspect | V1 (Custom) | V2 (Modular) |
|--------|-------------|--------------|
| **Base** | Custom implementation | Official EVMAuth core |
| **Architecture** | Monolithic | Plugin-based extensions |
| **Reusability** | XMTP-specific | Core + specialized extensions |
| **Upgradability** | Limited | Extension-based upgrades |
| **Standards Compliance** | Custom patterns | EVMAuth standards |
| **Maintenance** | Full responsibility | Shared with EVMAuth ecosystem |

## 📁 Contract Structure

### Core Contracts

1. **`EVMAuthV2.sol`** - Enhanced base contract with extension support
2. **`EVMAuthFactoryV2.sol`** - Factory for deploying modular systems
3. **`base/`** - Official EVMAuth core contracts
   - `EVMAuthAccessControl.sol`
   - `EVMAuthBaseERC1155.sol`
   - `EVMAuthPurchasableERC1155.sol`
   - `EVMAuthExpiringERC1155.sol`

### Extensions

4. **`extensions/XMTPGroupExtension.sol`** - XMTP-specific functionality
   - Group conversation integration
   - Inbox ID mapping
   - Purchase tracking with XMTP data
   - Agent automation support

## 🚀 Quick Start

### Prerequisites

- Node.js v18+
- Hardhat development framework
- MetaMask or compatible wallet

### Installation

```bash
# Navigate to contractsv2
cd contractsv2

# Install dependencies
npm install
```

### Configuration

Create a `.env` file:

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

## 📋 Deployment

### Local Development

```bash
# Start local Hardhat node
npm run node

# Deploy to local network (new terminal)
npm run deploy:local
```

### Base Sepolia (Testnet)

```bash
npm run deploy:base-sepolia
```

### Base Mainnet (Production)

```bash
npm run deploy:base-mainnet
```

## 🔧 Usage Examples

### Deploy Complete System

```javascript
// Deploy factory
const factory = await EVMAuthFactoryV2.deploy(
  feeRecipient,
  feeBasisPoints,
  initialOwner
);

// Deploy EVMAuth + XMTP extension in one transaction
const [baseContract, xmtpExtension] = await factory.deployEVMAuthWithXMTP(
  "My Group",
  "1.0.0",
  "https://api.example.com/metadata/{id}.json",
  0, // no ownership delay
  "sales-group-id",
  "premium-group-id",
  botAddress,
  { value: deploymentFee }
);
```

### Setup Access Tiers

```javascript
// Setup base token metadata
await baseContract.setMetadata(
  1, // tokenId
  true, // active
  true, // burnable
  false, // transferable (soulbound)
  ethers.parseEther("0.001"), // price
  7 * 24 * 60 * 60 // 7 days TTL
);

// Setup XMTP-specific tier info
await xmtpExtension.setupXMTPAccessTier(
  1, // tokenId
  "Weekly Access",
  "7-day access to premium group",
  "QmImageHash",
  "https://api.example.com/metadata/1.json"
);
```

### Purchase Access (XMTP-aware)

```javascript
// Purchase through XMTP extension
await xmtpExtension.purchaseXMTPAccess(
  tokenId,
  "transaction-hash-for-tracking",
  { value: price }
);

// Grant access (for trials)
await xmtpExtension.grantXMTPAccess(
  userAddress,
  tokenId,
  userInboxId
);
```

### Check Access

```javascript
// Check if user has valid access
const hasAccess = await xmtpExtension.hasValidXMTPAccess(userAddress);

// Check by inbox ID
const hasAccessByInbox = await xmtpExtension.hasValidAccessByInboxId(inboxId);

// Batch check multiple users
const results = await xmtpExtension.batchCheckXMTPAccess([addr1, addr2, addr3]);
```

## 🔌 Extension Development

### Creating Custom Extensions

1. **Inherit from base contracts** or implement required interfaces
2. **Register with base contract** via `registerExtension()`
3. **Use extension-safe functions** like `extMint()`, `extBurn()`

```solidity
contract MyCustomExtension is Ownable {
    EVMAuthV2 public immutable evmAuth;
    
    constructor(address _evmAuth) {
        evmAuth = EVMAuthV2(_evmAuth);
    }
    
    function customMint(address to, uint256 id, uint256 amount) external {
        // Custom logic here
        evmAuth.extMint(to, id, amount, "");
    }
}
```

### Extension Registration

```javascript
// Register extension with base contract
const extensionId = ethers.keccak256(ethers.toUtf8Bytes("MY_EXTENSION"));
await baseContract.registerExtension(extensionId, extensionAddress);

// Deploy via factory
await factory.deployExtension(
  baseContractAddress,
  extensionId,
  constructorData
);
```

## 🔐 Security Features

### Inherited from EVMAuth Core

- **Role-based Access Control** with admin roles
- **Blacklisting** functionality for malicious accounts
- **ReentrancyGuard** protection
- **Time-locked Ownership** transfers
- **Comprehensive Input Validation**

### V2 Enhancements

- **Extension Authorization** system
- **Plugin Isolation** - extensions can't interfere with each other
- **Safe Function Calls** - extensions use controlled interfaces
- **Factory Validation** - only authorized templates can be deployed

## 📊 Gas Optimization

### Efficient Batch Operations

```solidity
// Batch metadata queries
TokenMetadata[] memory metadata = evmAuth.metadataOfAll();

// Batch access checks
bool[] memory access = xmtpExtension.batchCheckXMTPAccess(users);

// Batch price updates
evmAuth.setPriceOfBatch(tokenIds, prices);
```

### Storage Optimization

- **Packed Structs** for minimal storage slots
- **Lazy Deletion** for expired tokens
- **Efficient Mappings** for quick lookups

## 🧪 Testing

```bash
# Compile contracts
npm run compile

# Run tests
npm test

# Run tests with gas reporting
npm run test:gas

# Clean build artifacts
npm run clean
```

## 📈 Migration from V1

### Feature Parity Matrix

| V1 Feature | V2 Implementation | Status |
|------------|-------------------|---------|
| Time-bound tokens | `EVMAuthExpiringERC1155` | ✅ Complete |
| Purchase functionality | `EVMAuthPurchasableERC1155` | ✅ Complete |
| XMTP integration | `XMTPGroupExtension` | ✅ Complete |
| Inbox ID mapping | `XMTPGroupExtension` | ✅ Complete |
| Access checking | Enhanced in extension | ✅ Complete |
| Factory deployment | `EVMAuthFactoryV2` | ✅ Complete |
| Platform fees | Factory + base contract | ✅ Complete |

### Migration Steps

1. **Deploy V2 system** using factory
2. **Setup equivalent tiers** with same pricing/duration
3. **Migrate user data** (inbox IDs, purchase history)
4. **Update agent integration** to use V2 contracts
5. **Sunset V1 contracts** after verification

## 🔗 Integration with XMTP Agent

The V2 system maintains full compatibility with existing XMTP agent patterns:

```typescript
// Agent integration remains the same
const hasAccess = await xmtpExtension.hasValidXMTPAccess(userAddress);
const hasAccessByInbox = await xmtpExtension.hasValidAccessByInboxId(inboxId);

// Enhanced features
const tierInfo = await xmtpExtension.getXMTPTier(tokenId);
const purchaseHistory = await xmtpExtension.getXMTPUserPurchases(userAddress);
```

## 🆚 V1 vs V2 Comparison

### Advantages of V2

✅ **Standards Compliance** - Built on official EVMAuth core  
✅ **Modular Architecture** - Plugin-based extensions  
✅ **Ecosystem Compatibility** - Works with EVMAuth tools  
✅ **Upgradability** - Add new extensions without base changes  
✅ **Reusability** - Core contracts usable for other purposes  
✅ **Maintenance** - Shared responsibility with EVMAuth team  

### When to Use V2

- **Production deployments** requiring long-term stability
- **Multiple extension needs** beyond just XMTP
- **Ecosystem integration** with other EVMAuth projects
- **Team development** with multiple developers
- **Regulatory compliance** requiring standard patterns

### When V1 Might Still Be Preferred

- **Rapid prototyping** with full control
- **Single-purpose applications** only needing XMTP
- **Custom modifications** not suitable for plugins
- **Legacy integrations** already built on V1

## 📄 License

MIT License - see [LICENSE](../LICENSE.md) for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/xmtpauth/xmtpauth/issues)
- **EVMAuth Documentation**: [https://evmauth.io](https://evmauth.io)
- **XMTP Documentation**: [https://docs.xmtp.org](https://docs.xmtp.org)
- **Community**: [XMTP Discord](https://discord.gg/xmtp)

---

## 🔧 Environment Variables Reference

```bash
# Required for deployment
PRIVATE_KEY=0x...                    # Deployer private key
BASE_SEPOLIA_RPC_URL=https://...     # Base Sepolia RPC
BASE_MAINNET_RPC_URL=https://...     # Base Mainnet RPC

# Optional configuration
FEE_RECIPIENT=0x...                  # Platform fee recipient
FEE_BASIS_POINTS=250                 # Platform fee (250 = 2.5%)
INITIAL_OWNER=0x...                  # Contract owner
BASESCAN_API_KEY=...                 # For contract verification
```
