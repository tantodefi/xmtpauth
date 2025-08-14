# SQD Indexer Implementation Plan for XMTP EVMAuth Agent

## Overview
Replace manual block scanning with a proper SQD (Subsquid) indexer that tracks:
1. ETH payments to agent address
2. EVMAuth contract events
3. Contract deployments

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SQD Indexer   │───▶│   PostgreSQL    │───▶│  GraphQL API    │
│                 │    │                 │    │                 │
│ • Payment Txs   │    │ • eth_transfers │    │ • Query payments│
│ • Contract Evts │    │ • contract_evts │    │ • Query events  │
│ • Deployments   │    │ • deployments   │    │ • Real-time sub │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                                              │
         ▼                                              ▼
┌─────────────────┐                            ┌─────────────────┐
│  Base Network   │                            │  XMTP Agent     │
│                 │                            │                 │
│ • Transactions  │                            │ • Listens to    │
│ • Events        │                            │   GraphQL subs  │
│ • Blocks        │                            │ • Processes     │
└─────────────────┘                            │   events        │
                                               └─────────────────┘
```

## Data Models

### 1. ETH Transfers
```typescript
@Entity_()
export class EthTransfer {
  @PrimaryColumn_()
  id!: string // tx hash

  @Index_()
  @Column_("text")
  blockNumber!: string

  @Index_()
  @Column_("timestamp")
  timestamp!: Date

  @Index_()
  @Column_("text")
  from!: string

  @Index_()
  @Column_("text")
  to!: string

  @Column_("numeric")
  value!: string // in wei

  @Column_("text")
  transactionHash!: string

  @Column_("bool")
  isPayment!: boolean // >= 0.001 ETH

  @Column_("text", { nullable: true })
  status?: string // success/failed
}
```

### 2. Contract Events
```typescript
@Entity_()
export class ContractEvent {
  @PrimaryColumn_()
  id!: string // log id

  @Index_()
  @Column_("text")
  contractAddress!: string

  @Index_()
  @Column_("text")
  eventName!: string

  @Index_()
  @Column_("text")
  blockNumber!: string

  @Column_("timestamp")
  timestamp!: Date

  @Column_("text")
  transactionHash!: string

  @Column_("jsonb")
  args!: any // event arguments

  @Index_()
  @Column_("text", { nullable: true })
  userAddress?: string

  @Index_()
  @Column_("text", { nullable: true })
  userInboxId?: string

  @Column_("text", { nullable: true })
  tokenId?: string

  @Column_("timestamp", { nullable: true })
  expiresAt?: Date
}
```

### 3. Contract Deployments
```typescript
@Entity_()
export class ContractDeployment {
  @PrimaryColumn_()
  id!: string // tx hash

  @Index_()
  @Column_("text")
  contractAddress!: string

  @Column_("text")
  deployer!: string

  @Column_("text")
  blockNumber!: string

  @Column_("timestamp")
  timestamp!: Date

  @Column_("text")
  transactionHash!: string

  @Column_("text", { nullable: true })
  contractType?: string // "EVMAuth"
}
```

## SQD Processor Configuration

```typescript
const processor = new EvmBatchProcessor()
  .setGateway('https://v2.archive.subsquid.io/network/base-mainnet')
  .setRpcEndpoint('https://mainnet.base.org')
  .setFinalityConfirmation(10) // Base has ~2s blocks, 10 blocks = ~20s
  
  // Track ETH transfers TO agent address
  .addTransaction({
    range: { from: AGENT_DEPLOYMENT_BLOCK },
    to: [AGENT_ADDRESS],
    logs: true,
  })
  
  // Track contract events from known EVMAuth contracts
  .addLog({
    range: { from: AGENT_DEPLOYMENT_BLOCK },
    address: [...KNOWN_CONTRACT_ADDRESSES],
    topic0: [
      '0x...', // UserAccessGranted
      '0x...', // UserAccessRevoked  
      '0x...', // AccessTokenExpired
    ],
  })
  
  // Track contract deployments (optional)
  .addTransaction({
    range: { from: AGENT_DEPLOYMENT_BLOCK },
    logs: true,
  })
  
  .setFields({
    transaction: {
      from: true,
      to: true,
      value: true,
      status: true,
    },
    log: {
      address: true,
      topics: true,
      data: true,
      transactionHash: true,
    },
  })
```

## Benefits vs Current System

| Current System | SQD Indexer |
|----------------|-------------|
| Manual block scanning | Pre-filtered data chunks |
| 300 block window (~10min) | Complete historical data |
| RPC rate limiting issues | Dedicated SQD Network |
| Memory-only state | PostgreSQL persistence |
| No query interface | GraphQL API |
| Manual event parsing | Auto-decoded events |
| No rollback handling | Built-in fork handling |
| ~45s polling interval | Real-time processing |

## Integration with XMTP Agent

The agent would subscribe to the indexer via GraphQL subscriptions:

```typescript
// Replace PaymentMonitor with IndexerClient
export class IndexerClient {
  private graphqlClient: GraphQLClient;
  
  constructor(indexerUrl: string) {
    this.graphqlClient = new GraphQLClient(indexerUrl);
  }
  
  // Subscribe to new payments
  async subscribeToPayments(callback: (payment: EthTransfer) => void) {
    const subscription = gql`
      subscription NewPayments {
        ethTransfers(
          where: { isPayment: true }
          orderBy: timestamp_DESC
          limit: 1
        ) {
          id
          from
          to
          value
          timestamp
          blockNumber
        }
      }
    `;
    
    this.graphqlClient.subscribe(subscription, callback);
  }
  
  // Subscribe to contract events
  async subscribeToContractEvents(callback: (event: ContractEvent) => void) {
    const subscription = gql`
      subscription NewContractEvents {
        contractEvents(
          orderBy: timestamp_DESC
          limit: 1
        ) {
          id
          contractAddress
          eventName
          args
          userAddress
          userInboxId
          timestamp
        }
      }
    `;
    
    this.graphqlClient.subscribe(subscription, callback);
  }
}
```

## Setup Steps

1. **Initialize SQD Project**:
   ```bash
   npm i -g @subsquid/cli
   sqd init xmtp-indexer -t evm
   cd xmtp-indexer
   ```

2. **Configure for Base Network**:
   - Update `src/processor.ts` with Base mainnet config
   - Add agent address and contract addresses
   - Configure event filtering

3. **Define Schema**:
   - Create `schema.graphql` with the entities above
   - Generate TypeORM models: `sqd codegen`

4. **Implement Processor**:
   - Process ETH transfers to agent
   - Decode and store contract events
   - Handle contract deployments

5. **Deploy & Run**:
   - Local: `docker compose up -d && npm run build && node lib/main.js`
   - Production: Deploy to SQD Cloud

## Migration Strategy

1. **Phase 1**: Set up SQD indexer alongside current system
2. **Phase 2**: Compare results, ensure data accuracy
3. **Phase 3**: Replace PaymentMonitor with IndexerClient
4. **Phase 4**: Replace EventDrivenAccessManager polling
5. **Phase 5**: Remove manual scanning code

This approach provides:
- ✅ Reliable payment detection
- ✅ Real-time event processing
- ✅ Historical data access
- ✅ Automatic retries and error handling
- ✅ Query interface for debugging
- ✅ Scalable architecture

