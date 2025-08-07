# 🚀 XMTP EVMAuth Groups - Complete Integration

**Enterprise-grade XMTP agent for monetized group chats with time-bound NFT access tokens**

Create and monetize XMTP communities using EVMAuth (ERC-1155 tokens with TTL) on Base network. Features dual-group architecture, USDC pricing, custom NFT images, and automated membership management.

## 🏗️ Architecture Overview

### Clean Project Structure

```
xmtp-evmauth-groups/
├── 📂 src/                          # Organized source code
│   ├── handlers/                    # External integrations
│   ├── managers/                    # Business logic
│   ├── utils/                       # Pure functions
│   ├── types/                       # TypeScript definitions
│   └── test/                        # Testing framework
├── 📂 docs/                         # Documentation
├── 📂 scripts/                      # Deployment scripts
├── 📄 README.md                     # This file
└── 📄 .env.example                  # Environment template
```

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   XMTP Agent    │    │  Smart Contracts │    │  Base Network   │
│                 │    │                 │    │                 │
│ • Dual Groups   │◄──►│ • Factory       │◄──►│ • ERC-1155      │
│ • Event-Driven  │    │ • Group Access  │    │ • Time-bound    │
│ • Auto Recovery │    │ • Access Tiers  │    │ • USDC Payments │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Step 1: Deploy Smart Contracts

```bash
# 1. Navigate to contracts directory
cd ../../contracts

# 2. Setup Foundry (if not installed)
chmod +x setup.sh
./setup.sh

# 3. Configure environment
cp .env.example .env
# Edit .env with your private key and settings

# 4. Deploy to Base Sepolia (testnet)
npm run deploy:base-sepolia
```

### Step 2: Configure XMTP Agent

```bash
# 1. Navigate back to agent directory
cd ../examples/xmtp-evmauth-groups

# 2. Configure environment
cp .env.example .env
# Edit .env with contract addresses from Step 1

# 3. Generate bot credentials
yarn gen:keys

# 4. Install dependencies and start
yarn install
yarn dev  # Development mode with hot reload
```

### Step 3: Integration Flow

## 💡 How It Actually Works

### 1. Group Creation Flow

```typescript
// User sends: /create-group "My Premium Community"

// Agent Process:
1. Deploy EVMAuth contract via Factory
2. Create XMTP group
3. Link contract address to group ID
4. Make creator admin
5. Send confirmation with group URL
```

**Smart Contract Calls:**

```solidity
// 1. Deploy new group contract
address groupContract = factory.deployGroupContract{value: deploymentFee}(
    "My Premium Community Access",
    "ACCESS",
    "My Premium Community",
    "Premium access community",
    "https://metadata.example.com/"
);

// 2. Create access tiers
groupContract.createTier(
    1,              // tokenId
    0.01 ether,     // price
    7,              // duration (days)
    100,            // maxSupply
    "Basic Access", // name
    "7 days access",
    "https://image.example.com/basic.png"
);
```

### 2. Token Purchase Flow

```typescript
// User sends: /buy-access abc123 premium

// Agent Process:
1. Validate group and tier exist
2. Generate purchase transaction
3. Send transaction to user's wallet
4. Monitor for successful purchase
5. Add user to XMTP group
```

**Smart Contract Interaction:**

```solidity
// User's wallet executes:
groupContract.purchaseAccess{value: totalPrice}(tokenId);

// Contract automatically:
1. Validates payment (price + platform fee)
2. Mints ERC-1155 token to user
3. Sets expiration timestamp
4. Transfers fees to platform
5. Transfers payment to group creator
```

### 3. Membership Management Flow

```typescript
// Background process runs every minute

// Agent Process:
1. For each group, get all members
2. Check each member's token validity
3. Remove expired members from XMTP group
4. Optionally burn expired tokens
```

**Smart Contract Calls:**

```solidity
// Check if user has valid access
bool hasAccess = groupContract.hasValidAccess(userAddress);

// If expired, remove from group and burn token
if (!hasAccess && block.timestamp >= expiration) {
    groupContract.burnExpiredToken(userAddress, tokenId);
}
```

## 🔄 Real Contract Integration

The key difference between the mock and real implementation:

### Mock Implementation (What We Had)

```typescript
// Simulated contract calls
const data = "0x" + "40c10f19" + /* hardcoded function selector */;
return { to: contractAddress, data, value: tier.priceWei };
```

### Real Implementation (What We Need)

```typescript
// Actual contract calls using viem
const data = encodeFunctionData({
  abi: GROUP_ABI,
  functionName: "purchaseAccess", 
  args: [BigInt(tokenId)],
});

const contract = getContract({
  address: contractAddress,
  abi: GROUP_ABI,
  client: publicClient,
});

const hasAccess = await contract.read.hasValidAccess([userAddress]);
```

## 📊 Economics & Revenue Model

### Revenue Streams

1. **Platform Fees**: 2.5% of all token sales
2. **Deployment Fees**: 0.001 ETH per group creation
3. **Volume**: Scale with number of groups and users

### Example Revenue Calculation

```typescript
// Group with 100 users buying premium access (0.03 ETH)
const totalSales = 100 * 0.03; // 3 ETH
const platformFee = totalSales * 0.025; // 0.075 ETH (~$150)
const creatorRevenue = totalSales - platformFee; // 2.925 ETH (~$5,850)
```

## 🔐 Security Considerations

### Smart Contract Security

- **Non-reentrancy**: Guards against reentrancy attacks
- **Access Control**: Role-based permissions
- **Pausable**: Emergency stop functionality
- **Non-transferable**: Prevents secondary markets
- **Expiration**: Automatic access revocation

### Agent Security

- **Input Validation**: All user inputs validated
- **Rate Limiting**: Prevent spam/abuse
- **Access Verification**: Always verify on-chain state
- **Error Handling**: Graceful failure handling

## 🚨 Common Issues & Solutions

### Issue 1: Transaction Failures

```typescript
// Problem: User transaction fails
// Solution: Add better error handling
try {
  const tx = await contract.purchaseAccess(tokenId);
  await tx.wait();
} catch (error) {
  if (error.code === 'INSUFFICIENT_FUNDS') {
    await conversation.send("❌ Insufficient funds for purchase");
  } else {
    await conversation.send("❌ Transaction failed. Please try again.");
  }
}
```

### Issue 2: Sync Delays

```typescript
// Problem: On-chain state not immediately reflected
// Solution: Add polling mechanism
async function waitForTokenUpdate(userAddress: string, tokenId: number) {
  for (let i = 0; i < 10; i++) {
    const hasAccess = await contract.hasValidAccess(userAddress);
    if (hasAccess) return true;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return false;
}
```

### Issue 3: Gas Price Spikes

```typescript
// Problem: High gas costs on Base
// Solution: Implement gas price monitoring
const gasPrice = await publicClient.getGasPrice();
if (gasPrice > maxGasPrice) {
  await conversation.send("⛽ Gas prices are high. Try again later.");
  return;
}
```

## 📈 Scaling Considerations

### Performance Optimization

1. **Batch Operations**: Group multiple contract calls
2. **Caching**: Cache frequently accessed data
3. **Event Monitoring**: Use contract events for real-time updates
4. **Database**: Store group configs in persistent database

### Cost Optimization

1. **Gas Efficient**: Optimize contract gas usage
2. **Batch Transactions**: Reduce transaction count
3. **Layer 2**: Leverage Base's low fees
4. **Smart Batching**: Group similar operations

## 🎯 Next Steps for Production

### Phase 1: MVP Launch

- [ ] Deploy contracts to Base mainnet
- [ ] Launch with basic tiers (7, 30, 90 days)
- [ ] Monitor first 10 groups
- [ ] Gather user feedback

### Phase 2: Enhanced Features

- [ ] Custom tier creation by users
- [ ] Group analytics dashboard
- [ ] Token holder benefits/perks
- [ ] Integration with DeFi protocols

### Phase 3: Platform Scale

- [ ] Multi-chain deployment
- [ ] Advanced governance features
- [ ] Creator monetization tools
- [ ] Enterprise solutions

## 📞 Support Resources

- **Smart Contract Issues**: Check `contracts/README.md`
- **Agent Issues**: Check `examples/xmtp-evmauth-groups/README.md`
- **Integration Help**: See this guide's troubleshooting section
- **Community**: Join XMTP Discord for real-time help

---

**🎉 Congratulations!** You now have a complete understanding of how to integrate XMTP with EVMAuth for monetized group chats. The combination of time-bound NFT access tokens and automatic membership management creates a powerful platform for creators to monetize their communities.

Start with the testnet deployment, test the full flow, and then move to mainnet for production use!
