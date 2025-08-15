import { TypeormDatabase } from "@subsquid/typeorm-store";
import { ContractDeployment, ContractEvent, EthTransfer } from "./model";
import { processor } from "./processor";

// Removed unused imports

// Agent configuration
const AGENT_ADDRESS = "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc";
const MIN_PAYMENT_WEI = 1000000000000000n; // 0.001 ETH

// Event signatures for EVMAuth contracts (from your agent code)
const USER_ACCESS_GRANTED_TOPIC = "0x..."; // Will be calculated from event signature
const USER_ACCESS_REVOKED_TOPIC = "0x..."; // Will be calculated from event signature
const ACCESS_TOKEN_EXPIRED_TOPIC = "0x..."; // Will be calculated from event signature

// Add error handling for processor startup
const USE_SQD_GATEWAY = process.env.USE_SQD_GATEWAY !== 'false';
console.log('🚀 Starting Subsquid processor...');
console.log(`📡 Mode: ${USE_SQD_GATEWAY ? 'SQD Network + RPC (recommended)' : 'RPC-only (fallback)'}`);
if (USE_SQD_GATEWAY) {
  console.log('📡 Gateway: https://v2.archive.subsquid.io/network/base-mainnet');
} else {
  console.log('⚠️  SQD Network disabled - using slower RPC-only mode');
}
console.log('🌐 RPC:', process.env.RPC_BASE_HTTP || "https://base.llamarpc.com");
console.log('🗄️ Database URL:', process.env.DATABASE_URL ? 'Set' : 'Missing');

// Add error handling for the processor
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error.message);
  console.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Enhanced database with better error handling
const database = new TypeormDatabase({ supportHotBlocks: true });

// Add connection retry logic for better reliability
let retryCount = 0;
const MAX_RETRIES = 3;

async function runProcessorWithRetry() {
  try {
    console.log('🔄 Starting processor with database connection...');
    await processor.run(database, async (ctx) => {
      const ethTransfers: EthTransfer[] = [];
      const contractEvents: ContractEvent[] = [];
      const contractDeployments: ContractDeployment[] = [];

      for (let block of ctx.blocks) {
    const blockTimestamp = new Date(block.header.timestamp);

    // Process transactions (ETH transfers to agent)
    for (let tx of block.transactions) {
      if (tx.to?.toLowerCase() === AGENT_ADDRESS.toLowerCase()) {
        // Create a basic transaction record
        // Value will be 0 for now - we can enhance this later with RPC calls
        const txValue = 0n; // Use 0 bigint for now
        const isPayment = false; // Will be determined later via RPC

        ethTransfers.push(
          new EthTransfer({
            id: tx.hash,
            blockNumber: block.header.height,
            timestamp: blockTimestamp,
            from: tx.from,
            to: tx.to || '',
            value: txValue,
            transactionHash: tx.hash,
            isPayment: isPayment,
            status: "success",
          }),
        );

        console.log(
          `📝 Transaction recorded: ${tx.hash} from ${tx.from} to ${tx.to} in block ${block.header.height}`,
        );
      }
    }

    // Process logs (contract events)
    for (let log of block.logs) {
      // Check if this is an EVMAuth contract event we care about
      if (log.topics.length > 0) {
        const eventTopic = log.topics[0];
        let eventName = "";
        let userAddress = "";
        let userInboxId = "";
        let tokenId = "";
        let expiresAt: Date | undefined;
        let reason = "";

        // Parse different event types
        if (eventTopic === USER_ACCESS_GRANTED_TOPIC) {
          eventName = "UserAccessGranted";
          // Parse event data based on signature:
          // event UserAccessGranted(address indexed user, string indexed userInboxId, uint256 indexed tokenId, uint256 expiresAt)
          if (log.topics.length >= 4) {
            userAddress = "0x" + log.topics[1].slice(-40); // Extract address from topic
            // userInboxId would be in topics[2] (indexed string)
            tokenId = log.topics[3];
            // expiresAt would be in log.data
          }
        } else if (eventTopic === USER_ACCESS_REVOKED_TOPIC) {
          eventName = "UserAccessRevoked";
          // Similar parsing for revocation events
        } else if (eventTopic === ACCESS_TOKEN_EXPIRED_TOPIC) {
          eventName = "AccessTokenExpired";
          // Similar parsing for expiration events
        }

        if (eventName) {
          contractEvents.push(
            new ContractEvent({
              id: log.id,
              contractAddress: log.address,
              eventName: eventName,
              blockNumber: block.header.height,
              timestamp: blockTimestamp,
              transactionHash: log.id, // Use log ID as transaction reference
              userAddress: userAddress || undefined,
              userInboxId: userInboxId || undefined,
              tokenId: tokenId || undefined,
              expiresAt: expiresAt,
              reason: reason || undefined,
              args: {
                topics: log.topics,
                data: log.data,
              },
            }),
          );

          ctx.log.info(
            `📋 Contract event: ${eventName} from ${log.address} in block ${block.header.height}`,
          );
        }
      }
    }
  }

  // Log processing summary
  const startBlock = ctx.blocks.at(0)?.header.height;
  const endBlock = ctx.blocks.at(-1)?.header.height;
  const paymentCount = ethTransfers.filter((t) => t.isPayment).length;

  ctx.log.info(`Processed blocks ${startBlock} to ${endBlock}:`);
  ctx.log.info(
    `  • ${ethTransfers.length} ETH transfers (${paymentCount} payments)`,
  );
  ctx.log.info(`  • ${contractEvents.length} contract events`);
  ctx.log.info(`  • ${contractDeployments.length} contract deployments`);

  // Store all entities in batches
  if (ethTransfers.length > 0) {
    await ctx.store.insert(ethTransfers);
  }
  if (contractEvents.length > 0) {
    await ctx.store.insert(contractEvents);
  }
  if (contractDeployments.length > 0) {
    await ctx.store.insert(contractDeployments);
  }
});
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Processor error (attempt ${retryCount + 1}/${MAX_RETRIES}):`, errorMessage);
    
    if (errorMessage.includes('ECONNREFUSED') && retryCount < MAX_RETRIES - 1) {
      retryCount++;
      console.log(`🔄 Retrying in 10 seconds... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      return runProcessorWithRetry();
    } else {
      console.error('💥 Max retries exceeded or non-recoverable error. Exiting...');
      process.exit(1);
    }
  }
}

// Start the processor with retry logic
runProcessorWithRetry().catch((error) => {
  console.error('💥 Fatal processor error:', error);
  process.exit(1);
});
