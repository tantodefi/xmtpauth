# Indexer Integration for XMTP EVMAuth Groups Agent

## Overview

This agent now uses a deployed Subsquid indexer for efficient payment monitoring instead of manual blockchain scanning.

## Configuration

Add this environment variable to your `.env` file:

```bash
# Indexer GraphQL endpoint (deployed Subsquid indexer)
INDEXER_GRAPHQL_URL=https://8a90b832-68f2-4bb7-a355-f8a0e65cba16.squids.live/xmtp-indexer@v1/api/graphql
```

## Benefits

- **10x faster** payment detection (30 seconds vs 5+ minutes)
- **Historical data** - can query past payments
- **Real-time updates** via GraphQL subscriptions  
- **Persistent storage** in PostgreSQL
- **More reliable** than manual block scanning

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
