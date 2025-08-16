# Multi-Layer Payment Detection for XMTP EVMAuth Groups Agent

## Overview

This agent uses a **Multi-Layer Payment Detection** system with:
1. **🧾 Transaction References** - Modern wallet integration (RECOMMENDED)
2. **⚡ Real-time RPC** - Direct blockchain monitoring for legacy support
3. **🔍 Indexer Backup** - Subsquid indexer for historical data and analytics

## Configuration

Add this environment variable to your `.env` file:

```bash
# Indexer GraphQL endpoint (deployed Subsquid indexer)
INDEXER_GRAPHQL_URL=https://8a90b832-68f2-4bb7-a355-f8a0e65cba16.squids.live/xmtp-indexer@v1/api/graphql
```

## Benefits

- **🧾 INSTANT** detection via transaction references (< 1 second)
- **🔄 Multi-layer redundancy** - Transaction refs + RPC + Indexer
- **📊 Historical data** - comprehensive payment history via indexer
- **🚀 Modern UX** - seamless wallet integration (no manual steps)
- **🛡️ Automatic fallback** - multiple detection methods
- **📈 Production ready** - handles smart wallets and edge cases

## How it Works

### 1. Transaction Reference Detection (Primary Method)

When users approve payments in modern wallets (Coinbase, MetaMask, etc.), the wallet automatically sends a **transaction reference message** containing the transaction hash.

**Flow:**
1. User sends `/create-group dstealth`
2. Agent responds with payment transaction
3. User approves in wallet
4. **Wallet automatically sends transaction reference** 🎯
5. Agent verifies transaction and creates group instantly

**No manual steps required!** This is the modern, recommended approach.

### 2. Legacy RPC Detection (Backup)

1. **Indexer monitors Base blockchain** for:
   - ETH transfers to agent address (`0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc`)
   - USDC transfers to agent address
   - EVMAuth contract events
   - Contract deployments

2. **Agent polls indexer** every 30 seconds for new payments

3. **When payment detected**:
   - Agent automatically creates dual group system
   - User gets added to premium group
   - Contract gets deployed

## Indexer Data

The indexer tracks:

```typescript
type PaymentData = {
  id: string;
  blockNumber: number;
  timestamp: string;
  from: string;
  to: string;
  value: string;
  transactionHash: string;
  isPayment: boolean; // >= 0.001 ETH or >= 1 USDC
  status: string;
  tokenType: "ETH" | "USDC" | "WETH";
};
```

## Fallback

If the indexer is unavailable, you can temporarily switch back to the old payment monitor by changing the import in `index.ts`:

```typescript
// Switch back to manual scanning if needed
import { PaymentMonitor } from "./src/utils/payment-monitor";
```

## GraphQL Queries

The indexer supports queries like:

```graphql
query GetRecentPayments {
  ethTransfers(
    where: { 
      to: { _eq: "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc" }
      isPayment: { _eq: true }
    }
    orderBy: [{ timestamp: desc }]
  ) {
    id
    from
    value
    transactionHash
    timestamp
  }
}
```
