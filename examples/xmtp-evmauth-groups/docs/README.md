# 🚀 XMTP EVMAuth Groups - Enterprise Edition

> **Clean, Organized, Production-Ready**

**Create and monetize XMTP groups with custom USDC pricing, NFT images, and IPFS metadata!**

## 🎯 Key Features

- ✅ **Custom USD Pricing**: Set prices like `$5.99` for `30 days`
- ✅ **USDC Payments**: Stable dollar payments on Base network
- ✅ **Custom NFT Images**: Upload your own artwork for access tokens
- ✅ **IPFS Storage**: Decentralized metadata and image storage
- ✅ **Interactive Setup**: Guided tier creation process
- ✅ **Time-bound Access**: Automatic expiry and member management
- ✅ **Low Gas Fees**: Built on Base L2 for affordable transactions
- ✅ **Platform Revenue**: 2.5% fees, 97.5% to creators

## 🚀 Complete User Flow

### 1. **Group Creator Journey**

#### Create Premium Group

```
Creator: /create-group "My Premium Community"
Bot: ✅ Group created! ID: abc123
     📋 Contract: 0x1234...
     💬 XMTP Group: Ready for members
```

#### Setup Custom Tiers (Interactive)

```
Creator: /setup-tiers abc123
Bot: 🎯 How many access tiers do you want? (1-5)

Creator: 3
Bot: 🏷️ Tier 1 of 3
     Format: Name | Price | Duration
     Example: Basic | $5 | 7 days

Creator: Basic Access | $5 | 7 days
Bot: ✅ Tier 1 saved: Basic Access
     💰 $5.00 USD (5.00 USDC) - 7 days
     📸 Upload image or type 'skip'

Creator: [uploads custom logo image]
Bot: ✅ Image uploaded: logo.png (45 KB)
     🏷️ Next: Tier 2 of 3...

Creator: Premium | $15.99 | 30 days
Bot: ✅ Tier 2 saved...

Creator: VIP Membership | $50 | 90 days
Bot: ✅ All tiers configured!
     🎯 Tier Setup Complete - Please Confirm
     
     📊 Group: abc123
     🎫 Total Tiers: 3
     
     1. Basic Access 🖼️
        💰 $5.00 USD (5.00 USDC)
        ⏰ 7 days access
        
     2. Premium 🔲
        💰 $15.99 USD (15.99 USDC)
        ⏰ 30 days access
        
     3. VIP Membership 🖼️
        💰 $50.00 USD (50.00 USDC)
        ⏰ 90 days access
     
     💡 What happens next:
     1. Images will be uploaded to IPFS
     2. NFT metadata will be created
     3. Smart contract tiers will be configured
     
     Type 'confirm' to create these tiers

Creator: confirm
Bot: 🔄 Processing Tiers...
     • Uploading images to IPFS
     • Creating NFT metadata
     • Configuring smart contracts
     
     🎉 Tiers Created Successfully!
     Your group is ready to sell access tokens.
```

### 2. **Member Purchase Journey**

#### Discover Group

```
Member: /group-info abc123
Bot: 🏷️ My Premium Community
     
     Available Access Tiers:
     
     💎 Basic Access
        💰 $5.00 USD (5.00 USDC)
        ⏰ 7 days access
        🖼️ Custom NFT image
        
     💎 Premium
        💰 $15.99 USD (15.99 USDC)
        ⏰ 30 days access
        🔲 Default image
        
     💎 VIP Membership
        💰 $50.00 USD (50.00 USDC)
        ⏰ 90 days access
        🖼️ Custom NFT image
     
     Purchase: /buy-access abc123 <tier_id>
```

#### Purchase Access

```
Member: /buy-access abc123 premium
Bot: 💰 Purchase Premium
     
     🎯 Group: My Premium Community
     ⏰ Duration: 30 days
     💎 Price: $15.99 USD (15.99 USDC)
     
     Transaction details:
     {
       "to": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
       "data": "0xa9059cbb...",
       "value": "15990000"
     }
     
     Please use your wallet to send the transaction above.

[Member approves USDC transaction in wallet]

Bot: 🎉 Access Purchased Successfully!
     🎫 NFT minted to your wallet
     💬 You've been added to the premium group
     ⏰ Access expires: Jan 15, 2025
```

## 💰 USDC Pricing System

### **Supported Input Formats**

```typescript
✅ "$5"          → 5.00 USD
✅ "5.99"        → 5.99 USD  
✅ "$10.50"      → 10.50 USD
✅ "25"          → 25.00 USD
```

### **Price Validation**

- **Minimum**: $0.01 USD
- **Maximum**: $1000 USD
- **Precision**: 2 decimal places max
- **Currency**: Automatically converted to USDC

### **Example Tier Formats**

```
Basic Access | $5 | 7 days
Premium Membership | $15.99 | 30 days
VIP Community | $50 | 90 days
Weekly Pass | $3.50 | 7 days
Quarterly Access | $75.25 | 90 days
```

## 🖼️ NFT Image & Metadata System

### **File Upload Support**

- **Formats**: JPG, PNG, GIF, WebP
- **Max Size**: 5MB per image
- **Storage**: IPFS with permanent pinning
- **Fallback**: Default tier images if no upload

### **NFT Metadata Structure**

```json
{
  "name": "My Premium Community - VIP Membership",
  "description": "Access token for My Premium Community. Grants 90 days of premium group access.",
  "image": "https://ipfs.io/ipfs/QmVIPImageHash123",
  "external_url": "https://xmtp.chat/conversations/abc123",
  "attributes": [
    {
      "trait_type": "Access Duration",
      "value": "90 days"
    },
    {
      "trait_type": "Access Tier",
      "value": "VIP Membership"
    },
    {
      "trait_type": "Price USD",
      "value": 50
    },
    {
      "trait_type": "Group Name",
      "value": "My Premium Community"
    },
    {
      "trait_type": "Token Type",
      "value": "Access Token"
    },
    {
      "trait_type": "Platform",
      "value": "XMTP"
    }
  ],
  "group_id": "abc123",
  "access_duration_days": 90,
  "created_at": "2024-01-15T10:30:00Z"
}
```

## 🔧 Setup & Installation

### Prerequisites

```bash
# Required software
- Node.js v20+
- Yarn v4.6+
- Git

# Required for contracts
- Foundry (forge, cast, anvil)
```

### Quick Start

```bash
# 1. Clone and setup
git clone <repo>
cd examples/xmtp-evmauth-groups

# 2. Install dependencies
yarn install

# 3. Generate agent keys
yarn gen:keys

# 4. Setup environment
cp .env.example .env
# Edit .env with your values:
# WALLET_KEY=0x...
# ENCRYPTION_KEY=...
# BASE_RPC_URL=https://sepolia.base.org
# EVMAUTH_FACTORY_ADDRESS=0x... (from contract deployment)

# 5. Deploy contracts (first time only)
cd ../../contracts
chmod +x setup.sh
./setup.sh

# 6. Start agent
cd ../examples/xmtp-evmauth-groups
yarn dev
```

### Full Integration Setup

```bash
# Run complete setup script
chmod +x setup-complete-integration.sh
./setup-complete-integration.sh
```

## 📊 Economics & Revenue

### **Revenue Example**

```
Premium Community (100 members)
├── Basic (40 users):     $5.00 × 40 = $200
├── Premium (45 users):   $15.99 × 45 = $720
├── VIP (15 users):       $50.00 × 15 = $750
└── Total Revenue:        $1,670

Platform Fee (2.5%):      $41.75
Creator Revenue:          $1,628.25
```

### **Fee Structure**

- **Platform Fee**: 2.5% of all sales (configurable)
- **Deployment Fee**: 0.001 ETH per group creation
- **Gas Costs**: ~$0.01-0.05 per tx (Base network)
- **Creator Revenue**: 97.5% of token sales

## 🎨 Real-World Examples

### **Content Creator**

```
"Crypto Alpha Signals"
├── Daily Alpha:    $8 USDC × 7 days    [📈 chart image]
├── Weekly Report:  $25 USDC × 30 days  [📊 analysis image]
├── VIP Calls:      $100 USDC × 90 days [💎 exclusive logo]
```

### **Educational Course**

```
"Web3 Development Course"
├── Module Access:  $15 USDC × 30 days  [📚 course logo]
├── Full Course:    $75 USDC × 120 days [🎓 certificate]
├── Lifetime:       $200 USDC × 365 days [🏆 premium badge]
```

### **DAO Community**

```
"DeFi DAO Governance"
├── Observer:       $10 USDC × 30 days  [👁️ observer badge]
├── Contributor:    $50 USDC × 90 days  [⚡ contributor badge]
├── Core Member:    $200 USDC × 365 days [👑 core badge]
```

## 🔄 Background Processes

### **Membership Audit**

```typescript
// Runs every minute
1. Check all active memberships
2. Validate token expiration on-chain
3. Remove expired members from XMTP groups
4. Burn expired NFTs
5. Send expiration notifications
```

### **Analytics Tracking**

- Revenue by tier
- Member retention rates
- Popular purchase patterns
- Geographic distribution
- Payment method preferences

## 🛠️ Advanced Configuration

### **Custom IPFS Service**

```typescript
// In production, use paid IPFS services
const ipfsHandler = new IPFSMetadataHandler({
  gateway: "https://your-gateway.com/ipfs/",
  pinningService: "https://api.pinata.cloud",
  apiKey: "your-pinata-api-key"
});
```

### **Multiple Payment Tokens**

```typescript
// Support both ETH and USDC
const paymentConfig = {
  acceptedTokens: ["ETH", "USDC"],
  defaultToken: "USDC",
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  autoConvertPrices: true
};
```

### **Custom Group Settings**

```typescript
const groupSettings = {
  autoRemoveExpired: true,
  welcomeMessage: "Welcome to the premium community! 🎉",
  allowMemberInvites: false,
  maxMembers: 1000,
  requireApproval: false,
  allowCustomImages: true,
  notifications: {
    newPurchases: true,
    expiringTokens: true,
    memberJoined: true,
    memberLeft: false
  }
};
```

## 🎯 Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `/create-group <name>` | Create new premium group | `/create-group "My Community"` |
| `/setup-tiers <group_id>` | Interactive tier builder | `/setup-tiers abc123` |
| `/buy-access <group_id> <tier>` | Purchase group access | `/buy-access abc123 premium` |
| `/my-tokens` | View your access tokens | `/my-tokens` |
| `/group-info <group_id>` | Get group details | `/group-info abc123` |
| `/help` | Show help message | `/help` |

## 🚨 Troubleshooting

### **Common Issues**

#### Transaction Failures

```
❌ "Insufficient funds"
→ Ensure wallet has enough USDC + gas fees

❌ "Token expired" 
→ Purchase new access token

❌ "Group not found"
→ Check group ID spelling
```

#### Image Upload Issues

```
❌ "File too large"
→ Max 5MB, compress image

❌ "Unsupported format"
→ Use JPG, PNG, GIF, or WebP

❌ "Upload failed"
→ Check internet connection, try again
```

#### IPFS Issues

```
❌ "IPFS upload failed"
→ Using mock service in development
→ Configure real IPFS service for production
```

## 📚 Architecture

### **Technology Stack**

- **Frontend**: XMTP messaging interface
- **Backend**: Node.js + TypeScript agent
- **Blockchain**: Base network (L2)
- **Contracts**: Solidity + Foundry
- **Storage**: IPFS for metadata/images
- **Payments**: USDC stablecoin

### **Security Features**

- **Non-transferable NFTs**: Soulbound access tokens
- **Time-bound Access**: Automatic expiration
- **Role-based Permissions**: Creator/admin controls
- **Reentrancy Protection**: Smart contract security
- **Input Validation**: All user inputs sanitized

## 🎉 Production Deployment

### **Mainnet Checklist**

- [ ] Deploy contracts to Base mainnet
- [ ] Configure production IPFS service
- [ ] Set up monitoring & alerts
- [ ] Test full purchase flow
- [ ] Configure fee recipient
- [ ] Set gas price limits
- [ ] Test member management
- [ ] Verify contract security

### **Scaling Considerations**

- Database for group configs (replace in-memory storage)
- Redis for session management
- Background job queue for processing
- Rate limiting for API calls
- CDN for image delivery
- Multi-region IPFS nodes

---

**🚀 Ready to Launch!** This enhanced XMTP EVMAuth Groups agent transforms simple group chats into sophisticated, monetizable communities with professional-grade access control, custom branding, and seamless USDC payments.

**Start creating your premium community today!** 🎯
