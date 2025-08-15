import { TypeormDatabase } from "@subsquid/typeorm-store";
import { ContractDeployment, ContractEvent, EthTransfer } from "./model";
import { processor } from "./processor";

// Removed unused imports

// Agent configuration
const AGENT_ADDRESS = "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc";
const MIN_PAYMENT_WEI = 1000000000000000n; // 0.001 ETH
const MIN_USDC_PAYMENT = 1000000n; // 1 USDC (6 decimals)

// Base mainnet token addresses
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

// ERC20 Transfer event signature
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Event signatures for EVMAuth contracts (from your agent code)
const USER_ACCESS_GRANTED_TOPIC = "0x..."; // Will be calculated from event signature
const USER_ACCESS_REVOKED_TOPIC = "0x..."; // Will be calculated from event signature
const ACCESS_TOKEN_EXPIRED_TOPIC = "0x..."; // Will be calculated from event signature

// Add error handling for processor startup  
console.log('🚀 Starting Subsquid processor...');
console.log('📡 Gateway: https://v2.archive.subsquid.io/network/base-mainnet');
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
        // Check if transaction has value (ETH transfer)
        const hasValue = 'value' in tx && tx.value !== undefined;
        const txValue = hasValue ? tx.value : 0n;
        const isPayment = txValue >= MIN_PAYMENT_WEI;

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
            tokenType: "ETH",
          }),
        );

        if (isPayment) {
          console.log(
            `💰 ETH Payment: ${Number(txValue) / 1e18} ETH from ${tx.from} in block ${block.header.height}`,
          );
        }
      }
    }

    // Process logs (ERC20 transfers and contract events)
    for (let log of block.logs) {
      // Check for ERC20 transfers to agent address
      if (log.topics[0] === ERC20_TRANSFER_TOPIC && log.topics.length >= 3) {
        const toAddress = `0x${log.topics[2].slice(26)}`; // Extract 'to' address from topic2
        
        if (toAddress.toLowerCase() === AGENT_ADDRESS.toLowerCase()) {
          // Decode transfer amount from log data
          const transferAmount = log.data ? BigInt(log.data) : 0n;
          let tokenSymbol = "UNKNOWN";
          let isTokenPayment = false;
          
          if (log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
            tokenSymbol = "USDC";
            isTokenPayment = transferAmount >= MIN_USDC_PAYMENT;
          } else if (log.address.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
            tokenSymbol = "WETH";
            isTokenPayment = transferAmount >= MIN_PAYMENT_WEI;
          }

          ethTransfers.push(
            new EthTransfer({
              id: `${log.id}-token`,
              blockNumber: block.header.height,
              timestamp: blockTimestamp,
              from: `0x${log.topics[1].slice(26)}`, // Extract 'from' address from topic1
              to: toAddress,
              value: transferAmount,
              transactionHash: log.id,
              isPayment: isTokenPayment,
              status: `${tokenSymbol}_TRANSFER`,
              tokenType: tokenSymbol,
            }),
          );

          if (isTokenPayment) {
            const displayAmount = tokenSymbol === "USDC" 
              ? Number(transferAmount) / 1e6 
              : Number(transferAmount) / 1e18;
            console.log(
              `💰 ${tokenSymbol} Payment: ${displayAmount} ${tokenSymbol} from ${`0x${log.topics[1].slice(26)}`} in block ${block.header.height}`,
            );
          }
        }
      }

      // Check for EVMAuth contract events
      else if (log.topics.length > 0) {
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
