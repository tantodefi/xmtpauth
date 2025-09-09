# 🚀 XMTPAuth Agent

**Modern XMTP agent built with @xmtp/agent-sdk featuring inline actions and streamlined UX**

Create and monetize premium XMTP groups with time-bound NFT access tokens on Base network. This agent leverages the new XMTP Agent SDK with middleware, filters, and inline action buttons for an enhanced user experience.

## ✨ Key Features

- 🎯 **Inline Action Buttons**: Interactive UI with clickable buttons instead of text commands
- 🔧 **Middleware Architecture**: Modern Node.js patterns with command routing and filters  
- 💬 **Enhanced Welcome Messages**: Guided onboarding with action buttons
- 🔄 **Transaction Confirmations**: Inline transaction approval/rejection buttons
- 📱 **Streamlined UX**: Reduced friction with smart defaults and guided flows
- 🚀 **Agent SDK**: Built on the modern @xmtp/agent-sdk with better performance
- 🎰 **MegaPot Lottery**: Integrated lottery ticket purchasing and winnings sharing

## 🏗️ Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   XMTP Agent SDK    │    │   Inline Actions    │    │   Smart Contracts   │
│                     │    │                     │    │                     │
│ • Command Router    │◄──►│ • Action Buttons    │◄──►│ • EVMAuth Factory   │
│ • Middleware        │    │ • Intent Handling   │    │ • Group Access V1   │
│ • Filters           │    │ • Welcome Messages  │    │ • ERC-1155 Tokens   │
│ • Event-Driven      │    │ • TX Confirmations  │    │ • USDC Payments     │
│ • Natural Language  │    │ • MegaPot Lottery   │    │ • MegaPot Lottery   │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## 🎯 Three Main User Flows

### 1. 🎰 **Setup MegaPot Lottery**
Configure automatic lottery ticket purchases from group revenue:

```bash
# Environment-based setup (recommended)
MEGAPOT_CONTRACT_ADDRESS=0x6f03c7BCaDAdBf5E6F5900DA3d56AdD8FbDac5De  # Testnet
MEGAPOT_USDC_ADDRESS=0xA4253E7C13525287C56550b8708100f93E60509f      # MPUSDC

# Interactive configuration (available after group creation)
/config-megapot auto-purchase on
/config-megapot percentage 5
/config-megapot group-share on

# Or setup during group creation flow:
# 1. /create-group "My Community"
# 2. Click "🎰 Setup Lottery" in success message
```

### 2. 💰 **Setup EVMAuth Pricing Layer**
Configure monetization for your premium groups:

```bash
# Create a premium group
/create-group "My Premium Community"

/setup-tiers  # Configure pricing tiers interactively
```

### 3. 🎫 **Interact with MegaPot Manager**
Direct lottery management and earnings:

```bash
# Buy tickets
/buy-tickets 10

# Schedule purchases
/schedule-tickets 5 daily 30

# Claim earnings
/claim-fees
/claim-winnings

# Manage liquidity
/add-liquidity 100
/withdraw-liquidity
```

## 🚀 Quick Start

### Prerequisites
- Node.js v20+
- Yarn v4+
- Base network wallet with ETH

### 1. Setup Environment

```bash
# Navigate to agent directory
cd examples/xmtpauth-agent-sdk

# Install dependencies
yarn install

# Generate XMTP keys
yarn gen:keys

# Configure environment
cp env.example .env
# Edit .env with your settings
```

### 2. Required Environment Variables

```bash
# XMTP Configuration (agent-sdk format)
XMTP_WALLET_KEY=0x...                          # Agent's private key
XMTP_DB_ENCRYPTION_KEY=...                     # Database encryption key
XMTP_ENV=dev                                   # dev, production

# Base Network
BASE_RPC_URL=https://mainnet.base.org
EVMAUTH_FACTORY_ADDRESS=0xa8830A603aE5143a1f8BAA46e28C36e4765EC754
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

### 3. Start the Agent

```bash
# Development mode (with hot reload)
yarn dev

# Production mode
yarn start
```

## 💬 Enhanced User Experience

### Welcome Message with Actions
Instead of showing a wall of text, users get interactive buttons:

```
🚀 Welcome to XMTPAuth Agent!

Create and monetize premium XMTP groups with time-bound NFT access tokens.

✨ Choose an action to get started:

[🏗️ Create Premium Group] [📋 My Groups] [💰 Buy Access]
[🎫 My Tokens] [📖 More Commands]
```

### Group Creation Flow
Complete setup with pricing tiers and lottery integration:

```
Create premium group "My Community"?

💰 Cost: 0.001 ETH deployment fee
⚡ Network: Base
🎫 Features: Time-bound NFT access tokens

[✅ Create Group] [❌ Cancel]
```

After creation, configure your group:

```
✅ Group Created Successfully!

📋 Group: My Community
🆔 ID: abc123...
📄 Contract: 0x1234...
💰 Cost: 0.001 ETH

Next steps: Set up pricing tiers and lottery integration!

[⚙️ Setup Pricing Tiers] [🎰 Setup Lottery] [📋 View All Groups]
```

### Transaction Confirmations
Real-time transaction handling:

```
🔍 Transaction Detected

📝 Reference: 0x1234...
💰 Amount: 0.001 ETH
⛽ Network: Base

[✅ Confirm Transaction] [❌ Reject Transaction] [🔍 View on Explorer]
```

## 🎯 Key Commands

All commands now support both text input and inline button interactions:

### Interactive Commands
- **`/help`** - Welcome message with action buttons
- **`/create-group <name>`** - Create group with confirmation flow
- **`/list-groups`** - View groups with inline actions
- **`/buy-access`** - Purchase flow with payment buttons

### Quick Actions (via buttons)
- 🏗️ **Create Premium Group** - Guided group creation
- 📋 **My Groups** - View and manage your groups
- 💰 **Buy Access** - Purchase group access
- 🎫 **My Tokens** - View your access tokens
- ⚙️ **Setup Pricing Tiers** - Configure monetization

## 🔧 Technical Features

### Modern Agent SDK Patterns

```typescript
// Event-driven with filters
agent.on("message", withFilter(f.and(f.notFromSelf, f.textOnly), async (ctx) => {
  // Handle text messages from others
}));

// Command routing middleware
const router = new CommandRouter();
router.command("/help", async (ctx) => {
  // Send inline actions
});
agent.use(router.middleware());

// Intent handling for button clicks
agent.on("message", withFilter(f.contentType(ContentTypeIntent), async (ctx) => {
  // Process button clicks
}));
```

### Inline Actions Content Type

```typescript
const welcomeActions: ActionsContent = {
  id: `welcome-${Date.now()}`,
  description: "Welcome! Choose an action:",
  actions: [
    {
      id: "create-group",
      label: "🏗️ Create Group",
      style: "primary"
    }
  ]
};

await ctx.conversation.send(welcomeActions, ContentTypeActions);
```

### Transaction Reference Handling

```typescript
// Automatic transaction detection with confirmations
agent.on("message", withFilter(f.contentType("xmtp.org/transactionReference:1.0"), async (ctx) => {
  await transactionManager.handleTransactionReference(ctx);
}));
```

## 📊 Improvements over v1

| Feature | v1 Agent | v2 Agent |
|---------|----------|----------|
| **Commands** | Text-only | Interactive buttons |
| **UX** | Manual typing | Click-to-action |
| **Architecture** | Monolithic | Middleware-based |
| **Welcome** | Text wall | Guided actions |
| **Transactions** | Manual tracking | Inline confirmations |
| **Error Handling** | Basic | Rich feedback |
| **Performance** | Node SDK direct | Agent SDK optimized |

## 🎨 Customization

### Adding Custom Actions

```typescript
// Add new interactive command
router.command("/custom", async (ctx) => {
  const customActions: ActionsContent = {
    id: `custom-${Date.now()}`,
    description: "Custom functionality:",
    actions: [
      {
        id: "custom-action",
        label: "🎯 Custom Action",
        style: "primary"
      }
    ]
  };
  
  await ctx.conversation.send(customActions, ContentTypeActions);
});
```

### Extending Managers

```typescript
// Extend EVMAuthManager for custom contract interactions
class CustomEVMAuthManager extends EVMAuthManager {
  async customFunction() {
    // Your custom logic
  }
}
```

## 🎰 MegaPot Lottery Integration

The agent includes built-in MegaPot lottery functionality for automated ticket purchasing and winnings management.

### Features

- **🎫 Instant Ticket Purchases**: Buy lottery tickets with USDC on Base network
- **⏰ Scheduled Purchases**: Set up recurring ticket buys (daily, weekly, monthly)
- **💰 Auto-Purchase from Sales**: Automatically allocate percentage of group sales to lottery
- **🏆 Winnings Tracking**: Monitor lottery winnings and statistics
- **🎉 Group Sharing**: Automatically share winnings with all group members
- **⚙️ Configurable Settings**: Customize purchase behavior and percentages

### Commands

```bash
# Buy tickets instantly
/buy-tickets 10

# Schedule recurring purchases
/schedule-tickets 5 daily 30    # 5 tickets daily for 30 days
/schedule-tickets 10 weekly 12  # 10 tickets weekly for 12 weeks

# View lottery status and stats
/megapot-status

# Configure auto-purchase settings
/config-megapot min-tickets 1
/config-megapot percentage 5
/config-megapot auto-purchase on
/config-megapot group-share on

# Claim earnings
/claim-fees                      # Claim referral fees
/claim-winnings                  # Claim lottery winnings

# Liquidity management
/add-liquidity 100              # Add 100 USDC liquidity
/withdraw-liquidity             # Withdraw all LP liquidity

# Network configuration is set via environment variables in .env
```

### Natural Language Support

The agent responds to natural language commands:

```
"hey xmtpauth buy 10 tickets now"
"hey xmpt buy 1 ticket every day for 30 days"
"how many tickets have I bought?"
"what's my megapot status?"
```

### Configuration Options

- **Minimum Tickets**: Set minimum number of tickets per purchase
- **Sales Percentage**: Percentage of group sales to allocate to lottery
- **Auto-Purchase**: Enable/disable automatic ticket purchases from sales
- **Group Sharing**: Share lottery winnings with all group members
- **Network**: Environment-based configuration for mainnet/testnet
- **Referrer Address**: Agent earns referral fees on all ticket purchases

### Winnings Management

- Automatic winnings detection every 5 minutes
- Winnings tracking and statistics
- Group-wide winnings announcements
- Configurable sharing with premium groups

### Liquidity Provider Features

- **Add Liquidity**: Earn fees from ticket purchases
- **Withdraw Liquidity**: Remove liquidity with earned fees
- **LP Management**: Full liquidity provider functionality

### Referral System

- **Agent as Referrer**: Agent automatically earns referral fees
- **Fee Claiming**: Claim accumulated referral fees
- **Transparent Tracking**: All referral earnings are tracked

### Network Configuration

Network configuration is set via environment variables in `.env`:

```bash
# Testnet Configuration (Default - Active)
MEGAPOT_CONTRACT_ADDRESS=0x6f03c7BCaDAdBf5E6F5900DA3d56AdD8FbDac5De  # Base Sepolia
MEGAPOT_USDC_ADDRESS=0xA4253E7C13525287C56550b8708100f93E60509f      # MPUSDC

# Mainnet Configuration (Uncomment for production)
# MEGAPOT_CONTRACT_ADDRESS=0xbEDd4F2beBE9E3E636161E644759f3cbe3d51B95  # Base Mainnet
# MEGAPOT_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913     # USDC
```

- **Testnet**: Base Sepolia with MPUSDC test token
- **Mainnet**: Base Mainnet with real USDC
- **Configuration**: Set in `.env` file, requires restart to change

## 🚀 Deployment

### Railway Deployment
The agent is configured for Railway deployment with persistent storage:

```bash
# Set environment variables in Railway dashboard
XMTP_WALLET_KEY=0x...
XMTP_DB_ENCRYPTION_KEY=...
XMTP_ENV=production
XMTP_DB_PATH=/app/data/xmtp
```

### Docker Deployment
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN yarn install --frozen-lockfile
CMD ["yarn", "start"]
```

## 🔍 Monitoring & Analytics

The agent includes built-in monitoring:

- 📊 Transaction tracking with reference IDs
- 💰 Revenue analytics per group
- 👥 Member management automation
- 🔄 Payment monitoring via indexer integration
- ⚠️ Error handling with user feedback

## 🤝 Contributing

This agent demonstrates modern XMTP development patterns. Key areas for contribution:

1. **Enhanced UI Components** - More interactive button types
2. **Advanced Filters** - Custom message filtering logic
3. **Middleware Extensions** - Rate limiting, analytics, etc.
4. **Content Type Integrations** - New message types
5. **Smart Contract Interactions** - Advanced DeFi integrations

## 📚 Resources

- [XMTP Agent SDK Documentation](https://docs.xmtp.org/agents)
- [Inline Actions Specification (XIP-67)](https://github.com/xmtp/XIPs)
- [Base Network Documentation](https://docs.base.org/)
- [EVMAuth Contracts](https://github.com/xmtp/evmauth-contracts)

---

**Built with ❤️ using @xmtp/agent-sdk**

*Experience the future of conversational agents with inline actions and streamlined UX!*
