# Hybrid Payment Monitoring for XMTP EVMAuth Groups Agent

## Overview

This agent uses a **Hybrid Payment Monitoring** system that combines:
1. **Instant Detection**: Direct RPC calls for real-time payment detection (10-second intervals)
2. **Historical Reliability**: Subsquid indexer for comprehensive historical data and fallback
3. **Automatic Failover**: Seamlessly switches between methods for maximum reliability

## Configuration

Add this environment variable to your `.env` file:

```bash
# Indexer GraphQL endpoint (deployed Subsquid indexer)
INDEXER_GRAPHQL_URL=https://8a90b832-68f2-4bb7-a355-f8a0e65cba16.squids.live/xmtp-indexer@v1/api/graphql
```

## Benefits

- **⚡ INSTANT** payment detection (10 seconds vs 20+ minutes)
- **🔄 Dual redundancy** - RPC + Indexer for maximum reliability
- **📊 Historical data** - comprehensive payment history via indexer
- **🚀 Real-time** - direct RPC monitoring for immediate detection
- **🛡️ Automatic fallback** - if one method fails, the other continues
- **📈 Scalable** - handles high transaction volumes efficiently

## How it Works

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
