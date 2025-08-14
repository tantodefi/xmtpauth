# SQD Indexer Integration Guide for XMTP EVMAuth Agent

## Overview

This guide shows how to replace your current manual block scanning system with a proper SQD (Subsquid) indexer for reliable payment and event tracking.

## Current vs New Architecture

### Before (Manual Block Scanning)
```
XMTP Agent ──┐
             ├─► Base RPC ──► Manual Block Scanning
             │   (Rate limits, timeouts, missing txs)
             └─► Event Polling (Every 15s)
```

### After (SQD Indexer)
```
SQD Indexer ──► Base Network ──► Pre-filtered Data
     │
     ├─► PostgreSQL ──► Persistent Storage
     │
     └─► GraphQL API ──► XMTP Agent
         (Real-time queries, no rate limits)
```

## Setup Instructions

### 1. Start the Indexer

```bash
# In the xmtp-indexer directory
cd /Users/rob/xmtpauth/xmtp-indexer

# Start PostgreSQL
docker compose up -d

# Apply database migrations
npx squid-typeorm-migration apply

# Start the indexer processor
npm run build && node -r dotenv/config lib/main.js

# In another terminal, start the GraphQL API
npx squid-graphql-server
```

The indexer will:
- Connect to Base mainnet
- Start indexing from block 34,000,000 (adjust in `.env`)
- Index all ETH transfers to your agent address
- Index EVMAuth contract events
- Serve data via GraphQL at `http://localhost:4350/graphql`

### 2. Update Your XMTP Agent

Replace the current `PaymentMonitor` with the new `IndexerPaymentMonitor`:

```typescript
// In your main index.ts file

// OLD:
// import { PaymentMonitor } from "./src/utils/payment-monitor";
// const paymentMonitor = new PaymentMonitor(
//   BASE_RPC_URL,
//   agentAddress,
//   enhancedGroupManager,
//   groupConfigs,
// );

// NEW:
import { IndexerPaymentMonitor } from "./src/utils/indexer-payment-monitor";
const paymentMonitor = new IndexerPaymentMonitor(
  'http://localhost:4350/graphql', // Indexer GraphQL URL
  agentAddress,
  enhancedGroupManager,
  groupConfigs,
);
```

### 3. Update Event-Driven Access Manager

Replace polling with indexer queries:

```typescript
// Create a new indexer-based event manager
import { IndexerClient } from "../path/to/indexer-client";

export class IndexerEventManager {
  private indexerClient: IndexerClient;
  private knownContracts: Set<string>;

  constructor(indexerUrl: string) {
    this.indexerClient = new IndexerClient(indexerUrl);
    this.knownContracts = new Set();
  }

  async checkForNewEvents(): Promise<void> {
    // Get recent contract events from indexer
    const events = await this.indexerClient.getContractEvents(
      contractAddress, 
      10 // last 10 events
    );

    for (const event of events) {
      if (event.eventName === 'UserAccessGranted') {
        await this.handleUserAccessGranted(event);
      } else if (event.eventName === 'UserAccessRevoked') {
        await this.handleUserAccessRevoked(event);
      }
    }
  }

  // Replace polling with indexer queries
  async startEventListening(): Promise<void> {
    // Poll indexer every 30 seconds instead of blockchain every 15s
    setInterval(() => this.checkForNewEvents(), 30000);
  }
}
```

## Benefits

### Performance Improvements
- **No RPC Rate Limits**: SQD Network provides pre-filtered data
- **Faster Queries**: PostgreSQL queries vs blockchain scanning
- **Reliable Data**: Built-in retry logic and error handling
- **Historical Access**: Query any historical payment or event

### Reliability Improvements
- **No Missing Transactions**: Complete blockchain coverage
- **Persistent Storage**: Data survives agent restarts
- **Fork Handling**: Automatic blockchain reorganization support
- **Reduced Complexity**: No manual block scanning logic

### Development Benefits
- **GraphQL Playground**: Interactive query interface at `http://localhost:4350/graphql`
- **Rich Queries**: Filter, sort, paginate any way you need
- **Real-time Debugging**: Query payment status instantly
- **Monitoring**: Built-in logging and metrics

## Example Queries

### Check Recent Payments
```graphql
query RecentPayments {
  ethTransfers(
    where: { isPayment: { _eq: true } }
    orderBy: [{ timestamp: desc }]
    limit: 10
  ) {
    id
    from
    value
    timestamp
    transactionHash
    blockNumber
  }
}
```

### Find Payment by Address
```graphql
query PaymentFromAddress($address: String!) {
  ethTransfers(
    where: { 
      from: { _eq: $address }
      isPayment: { _eq: true }
    }
    orderBy: [{ timestamp: desc }]
    limit: 1
  ) {
    id
    transactionHash
    value
    timestamp
    blockNumber
  }
}
```

### Get Contract Events
```graphql
query ContractEvents($contractAddress: String!) {
  contractEvents(
    where: { contractAddress: { _eq: $contractAddress } }
    orderBy: [{ timestamp: desc }]
    limit: 10
  ) {
    id
    eventName
    userAddress
    userInboxId
    timestamp
    args
  }
}
```

## Migration Steps

### Phase 1: Parallel Operation
1. Deploy SQD indexer alongside existing system
2. Let it sync historical data (may take a few hours)
3. Compare results with current system

### Phase 2: Integration Testing
1. Update payment monitor to use indexer
2. Test with small payments on testnet first
3. Verify all edge cases work correctly

### Phase 3: Full Migration
1. Replace `PaymentMonitor` with `IndexerPaymentMonitor`
2. Replace `EventDrivenAccessManager` polling with indexer queries
3. Remove old block scanning code
4. Monitor for 24 hours to ensure stability

### Phase 4: Optimization
1. Add GraphQL subscriptions for real-time updates
2. Implement caching for frequently accessed data
3. Add monitoring and alerting

## Troubleshooting

### Indexer Not Starting
- Check PostgreSQL is running: `docker ps`
- Check Base RPC endpoint: `curl https://mainnet.base.org`
- Check logs: `SQD_DEBUG=* node lib/main.js`

### No Payment Data
- Verify agent address in `.env` file
- Check starting block number (should be before first payment)
- Query GraphQL directly to see if data exists

### Missing Events
- Verify contract addresses are being tracked
- Check event signatures match your contracts
- Add debug logging to processor

## Production Deployment

### Local Development
- Use the setup above with local PostgreSQL

### Production (SQD Cloud)
```bash
# Deploy to SQD Cloud
sqd deploy

# Set environment variables
sqd env set RPC_BASE_HTTP https://your-production-rpc-url
sqd env set AGENT_ADDRESS 0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc
```

### Self-Hosted Production
- Use managed PostgreSQL (AWS RDS, etc.)
- Set up proper monitoring and alerting
- Use multiple RPC endpoints for redundancy
- Implement proper backup strategy

## Support

- SQD Documentation: https://docs.subsquid.io/
- GraphQL Playground: http://localhost:4350/graphql
- Indexer logs: Check console output from `node lib/main.js`
- Database queries: Connect to PostgreSQL directly for debugging

This indexer will solve your payment detection issues and provide a much more robust foundation for your XMTP agent!

