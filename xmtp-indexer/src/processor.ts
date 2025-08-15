import {
  Log as _Log,
  Transaction as _Transaction,
  BlockHeader,
  DataHandlerContext,
  EvmBatchProcessor,
  EvmBatchProcessorFields,
} from "@subsquid/evm-processor";
import { assertNotNull } from "@subsquid/util-internal";

// XMTP Agent Configuration
const AGENT_ADDRESS = "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc";
const DEPLOYMENT_BLOCK = 34200000; // Start from more recent block to sync faster

// EVMAuth contract events we want to track
const EVMAUTH_EVENTS = [
  "0x...", // UserAccessGranted event signature - will be filled in
  "0x...", // UserAccessRevoked event signature - will be filled in
  "0x...", // AccessTokenExpired event signature - will be filled in
];

// Enable SQD Network by default (recommended approach from SQD docs)
// Can be disabled with USE_SQD_GATEWAY=false for debugging
const USE_SQD_GATEWAY = process.env.USE_SQD_GATEWAY !== 'false';

// Create processor with conditional gateway
let processorBuilder = new EvmBatchProcessor();

// Conditionally add SQD Network gateway
if (USE_SQD_GATEWAY) {
  processorBuilder = processorBuilder.setGateway("https://v2.archive.subsquid.io/network/base-mainnet");
}

// Configure the processor with RPC endpoint and other settings
processorBuilder = processorBuilder
  .setRpcEndpoint({
    url: assertNotNull(
      process.env.RPC_BASE_HTTP || "https://base.llamarpc.com",
      "No RPC endpoint supplied",
    ),
    rateLimit: 5,
    requestTimeout: 30000,
  })
  .setFinalityConfirmation(10)
  .setFields({
    transaction: {
      from: true,
      to: true,
      value: true,
      hash: true,
    },
    log: {
      topics: true,
      data: true,
    },
    block: {
      timestamp: true,
    },
  })
  .setBlockRange({
    from: DEPLOYMENT_BLOCK,
  })
  // Track ETH transfers TO the agent address (payments)
  .addTransaction({
    to: [AGENT_ADDRESS],
    range: { from: DEPLOYMENT_BLOCK },
  })
  // Track EVMAuth contract events (will be added dynamically)
  .addLog({
    // This will be populated with known contract addresses
    // For now, we'll track all logs and filter in the processor
    range: { from: DEPLOYMENT_BLOCK },
  });

// Export the configured processor
export const processor = processorBuilder;

export type Fields = EvmBatchProcessorFields<typeof processorBuilder>;
export type Block = BlockHeader<Fields>;
export type Log = _Log<Fields>;
export type Transaction = _Transaction<Fields>;
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>;
