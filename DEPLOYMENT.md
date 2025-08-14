# 🚀 Render Deployment Guide

## Quick Deploy to Render

### 1. Factory Contract (Already Deployed ✅)
**Base Mainnet Factory**: `0xa8830A603aE5143a1f8BAA46e28C36e4765EC754`

### 2. Deploy to Render

1. **Fork/Clone** this repository to your GitHub account
2. **Connect to Render**:
   - Go to [render.com](https://render.com)
   - Connect your GitHub account
   - Create new "Web Service"
   - Select this repository

3. **Configure Environment Variables** in Render dashboard:
   ```bash
   # Required - Set these in Render dashboard
   WALLET_KEY=0x...                    # Your agent's private key
   ENCRYPTION_KEY=...                  # XMTP database encryption key
   FEE_RECIPIENT=0x...                # Address to receive platform fees
   
   # Auto-configured via render.yaml
   NODE_ENV=production
   XMTP_ENV=production
   EVMAUTH_FACTORY_ADDRESS=0xa8830A603aE5143a1f8BAA46e28C36e4765EC754
   BASE_RPC_URL=https://mainnet.base.org
   USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
   FEE_BASIS_POINTS=250
   ```

4. **Deploy Settings** (auto-configured via `render.yaml`):
   - Build Command: `yarn install --immutable`
   - Start Command: `yarn start`
   - Node Version: 22.13.0 (via `.node-version`)

### 3. Generate Keys (if needed)

```bash
# Generate new agent keys locally
yarn gen:keys

# Copy the generated keys to Render environment variables:
# WALLET_KEY=0x...
# ENCRYPTION_KEY=...
```

### 4. Test Deployment

Once deployed, your agent will be available at:
- **Agent URL**: `https://your-app-name.onrender.com`
- **XMTP Chat**: Use the agent's wallet address in [xmtp.chat](https://xmtp.chat)

## 🔧 Configuration Details

### Factory Contract Features
- **Network**: Base Mainnet (Chain ID: 8453)
- **Platform Fee**: 2.5% (250 basis points)
- **USDC Support**: Full USDC payment integration
- **Time-bound NFTs**: Automatic token expiration
- **Group Integration**: Seamless XMTP group management

### Agent Capabilities
- `/create-group "Name"` - Deploy new premium groups (0.001 ETH)
- `/buy-access <group> <tier>` - Purchase with USDC
- `/setup-tiers <group>` - Interactive tier configuration
- `/group-info <group>` - View pricing and details
- `/withdraw <contract>` - Withdraw earnings
- `/earnings <contract>` - View revenue analytics

## 🛠️ Troubleshooting

### Common Issues

1. **"insufficient funds" error**
   - Ensure agent wallet has ETH for gas on Base mainnet
   - Group deployment requires 0.001 ETH

2. **"Connector not connected" error**
   - User needs to connect wallet in XMTP chat
   - Ensure Base network is selected

3. **Build failures**
   - Render uses Yarn v4 with `--immutable` flag
   - TypeScript compilation handled by TSX at runtime

### Monitoring
- Check Render logs for deployment issues
- Monitor agent responses in XMTP chat
- View contract interactions on [BaseScan](https://basescan.org)

## 📋 Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `WALLET_KEY` | Agent's private key | ✅ | - |
| `ENCRYPTION_KEY` | XMTP database encryption | ✅ | - |
| `FEE_RECIPIENT` | Platform fee address | ✅ | - |
| `EVMAUTH_FACTORY_ADDRESS` | Factory contract | ✅ | `0xa8830A...` |
| `BASE_RPC_URL` | Base RPC endpoint | ✅ | `https://mainnet.base.org` |
| `USDC_ADDRESS` | USDC token address | ✅ | `0x833589f...` |
| `XMTP_ENV` | XMTP network | ✅ | `production` |
| `FEE_BASIS_POINTS` | Platform fee % | ✅ | `250` |

## 🔗 Resources

- **Factory Contract**: [0xa8830A603aE5143a1f8BAA46e28C36e4765EC754](https://basescan.org/address/0xa8830A603aE5143a1f8BAA46e28C36e4765EC754)
- **XMTP Chat**: [xmtp.chat](https://xmtp.chat)
- **Base Network**: [base.org](https://base.org)
- **Render Docs**: [render.com/docs](https://render.com/docs)
