import { TypeormDatabase } from "@subsquid/typeorm-store";
import { ContractDeployment, ContractEvent, EthTransfer } from "./model";
import { processor, EVENT_SIGNATURES, TOKEN_ADDRESSES, FACTORY_ADDRESSES, AGENT_ADDRESS } from "./processor";

// Payment thresholds
const MIN_PAYMENT_WEI = 1000000000000000n; // 0.001 ETH
const MIN_USDC_PAYMENT = 1000000n; // 1 USDC (6 decimals)

// Track deployed contracts for dynamic discovery
const knownContracts = new Set<string>(FACTORY_ADDRESSES.map(addr => addr.toLowerCase()));

// Database connection
const database = new TypeormDatabase({
  supportHotBlocks: true,
  stateSchema: "processor",
});

// Add error handling for processor startup  
const USE_SQD_GATEWAY = process.env.USE_SQD_GATEWAY !== 'false';
console.log('🚀 Starting Comprehensive XMTP Indexer...');
console.log(`📡 Mode: ${USE_SQD_GATEWAY ? 'SQD Network + RPC (recommended)' : 'RPC-only (fallback)'}`);
console.log(`🎯 Agent Address: ${AGENT_ADDRESS}`);
console.log(`🏭 Factory Addresses: ${FACTORY_ADDRESSES.join(', ')}`);
console.log(`💰 Tracking: ETH, USDC, Contract Events, Factory Deployments`);

// Utility functions
function decodeAddress(topic: string): string {
  return `0x${topic.slice(26)}`;
}

function decodeString(data: string, offset: number = 64): string {
  try {
    // Simple string decoding - this is a basic implementation
    // In production, you'd want to use proper ABI decoding
    const lengthHex = data.slice(offset, offset + 64);
    const length = parseInt(lengthHex, 16);
    const stringHex = data.slice(offset + 64, offset + 64 + length * 2);
    return Buffer.from(stringHex, 'hex').toString('utf8');
  } catch (error) {
    console.warn('Failed to decode string:', error);
    return '';
  }
}

function decodeUint256(topic: string): bigint {
  return BigInt(topic);
}

// Retry mechanism
let retryCount = 0;
const MAX_RETRIES = 3;

async function runProcessorWithRetry() {
  try {
    console.log('🔄 Starting comprehensive processor...');
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
                status: tx.status === 1 ? "success" : "failed",
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

        // Process logs for comprehensive event tracking
        for (let log of block.logs) {
          const topic0 = log.topics[0];
          const logAddress = log.address.toLowerCase();

          // 1. Handle ERC20 Transfer events (USDC/WETH to agent)
          if (topic0 === EVENT_SIGNATURES.ERC20_TRANSFER && log.topics.length >= 3) {
            const toAddress = decodeAddress(log.topics[2]);
            
            if (toAddress.toLowerCase() === AGENT_ADDRESS.toLowerCase()) {
              const fromAddress = decodeAddress(log.topics[1]);
              const value = decodeUint256(log.data);
              
              let tokenType = "UNKNOWN";
              let isPayment = false;
              
              if (logAddress === TOKEN_ADDRESSES.USDC_MAINNET.toLowerCase() || 
                  logAddress === TOKEN_ADDRESSES.USDC_TESTNET.toLowerCase()) {
                tokenType = "USDC";
                isPayment = value >= MIN_USDC_PAYMENT;
              } else if (logAddress === TOKEN_ADDRESSES.WETH.toLowerCase()) {
                tokenType = "WETH";
                isPayment = value >= MIN_PAYMENT_WEI;
              }

              ethTransfers.push(
                new EthTransfer({
                  id: `${log.transactionHash}-${log.address}-${log.topics[1]}-${log.topics[2]}`,
                  blockNumber: block.header.height,
                  timestamp: blockTimestamp,
                  from: fromAddress,
                  to: toAddress,
                  value: value,
                  transactionHash: log.transactionHash || '',
                  isPayment: isPayment,
                  status: `${tokenType}_TRANSFER`,
                  tokenType: tokenType,
                }),
              );

              if (isPayment) {
                const displayValue = tokenType === "USDC" ? 
                  `${Number(value) / 1e6} USDC` : 
                  `${Number(value) / 1e18} ${tokenType}`;
                console.log(
                  `💰 ${tokenType} Payment: ${displayValue} from ${fromAddress} in block ${block.header.height}`,
                );
              }
            }
          }

          // 2. Handle Factory ContractDeployed events
          else if (topic0 === EVENT_SIGNATURES.CONTRACT_DEPLOYED && 
                   FACTORY_ADDRESSES.some(addr => addr.toLowerCase() === logAddress)) {
            
            const creator = decodeAddress(log.topics[1]);
            const contractAddress = decodeAddress(log.topics[2]);
            const groupName = decodeString(log.data, 0);
            
            // Add to known contracts for future event tracking
            knownContracts.add(contractAddress.toLowerCase());

            contractDeployments.push(
              new ContractDeployment({
                id: log.transactionHash || `${block.header.height}-${logAddress}`,
                contractAddress: contractAddress,
                deployer: creator,
                blockNumber: block.header.height,
                timestamp: blockTimestamp,
                transactionHash: log.transactionHash || '',
                contractType: "EVMAuth",
              }),
            );

            console.log(
              `🏭 Contract Deployed: ${contractAddress} by ${creator} (${groupName}) in block ${block.header.height}`,
            );
          }

          // 3. Handle EVMAuth contract events (UserAccessGranted, etc.)
          else if (knownContracts.has(logAddress) || 
                   // Also check if this looks like an EVMAuth contract event
                   [EVENT_SIGNATURES.USER_ACCESS_GRANTED, 
                    EVENT_SIGNATURES.USER_ACCESS_REVOKED, 
                    EVENT_SIGNATURES.ACCESS_TOKEN_EXPIRED].includes(topic0)) {
            
            let eventName = "";
            let userAddress = "";
            let userInboxId = "";
            let tokenId = "";
            let expiresAt: Date | undefined;
            let reason = "";

            if (topic0 === EVENT_SIGNATURES.USER_ACCESS_GRANTED) {
              eventName = "UserAccessGranted";
              userAddress = decodeAddress(log.topics[1]);
              userInboxId = decodeString(log.topics[2]);
              tokenId = log.topics[3];
              // expiresAt would be in log.data - would need proper ABI decoding
              
              // Add this contract to known contracts
              knownContracts.add(logAddress);
            }
            else if (topic0 === EVENT_SIGNATURES.USER_ACCESS_REVOKED) {
              eventName = "UserAccessRevoked";
              userAddress = decodeAddress(log.topics[1]);
              userInboxId = decodeString(log.topics[2]);
              tokenId = log.topics[3];
              reason = decodeString(log.data);
              
              knownContracts.add(logAddress);
            }
            else if (topic0 === EVENT_SIGNATURES.ACCESS_TOKEN_EXPIRED) {
              eventName = "AccessTokenExpired";
              userAddress = decodeAddress(log.topics[1]);
              tokenId = log.topics[2];
              
              knownContracts.add(logAddress);
            }

            if (eventName) {
              contractEvents.push(
                new ContractEvent({
                  id: `${log.transactionHash}-${logAddress}-${eventName}`,
                  contractAddress: logAddress,
                  eventName: eventName,
                  blockNumber: block.header.height,
                  timestamp: blockTimestamp,
                  transactionHash: log.transactionHash || '',
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

              console.log(
                `📋 ${eventName}: ${userAddress} (${userInboxId}) token ${tokenId} in block ${block.header.height}`,
              );
            }
          }
        }
      }

      // Log processing summary
      const startBlock = ctx.blocks.at(0)?.header.height;
      const endBlock = ctx.blocks.at(-1)?.header.height;
      const paymentCount = ethTransfers.filter((t) => t.isPayment).length;

      ctx.log.info(`📊 Processed blocks ${startBlock} to ${endBlock}:`);
      ctx.log.info(`  💰 ${ethTransfers.length} transfers (${paymentCount} payments)`);
      ctx.log.info(`  📋 ${contractEvents.length} contract events`);
      ctx.log.info(`  🏭 ${contractDeployments.length} contract deployments`);
      ctx.log.info(`  🔍 ${knownContracts.size} known contracts`);

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
    console.error('❌ Processor error:', errorMessage);
    
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(`🔄 Retrying... (${retryCount}/${MAX_RETRIES})`);
      setTimeout(() => runProcessorWithRetry(), 5000);
    } else {
      console.error('💀 Max retries exceeded. Exiting.');
      process.exit(1);
    }
  }
}

runProcessorWithRetry();
