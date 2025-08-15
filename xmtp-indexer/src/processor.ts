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

export const processor = new EvmBatchProcessor()
  // Use Base mainnet instead of Ethereum
  .setGateway("https://v2.archive.subsquid.io/network/base-mainnet")
  .setRpcEndpoint({
    url: assertNotNull(
      process.env.RPC_BASE_HTTP || "https://base-mainnet.g.alchemy.com/v2/demo",
      "No RPC endpoint supplied",
    ),
    rateLimit: 5, // Reduced rate limit
  })
  .setFinalityConfirmation(10) // Base has ~2s blocks, so 10 blocks = ~20s finality
  .setFields({
    transaction: {
      from: true,
      to: true,
      value: true,
      hash: true,
      status: true,
    },
    log: {
      address: true,
      topics: true,
      data: true,
      transactionHash: true,
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

export type Fields = EvmBatchProcessorFields<typeof processor>;
export type Block = BlockHeader<Fields>;
export type Log = _Log<Fields>;
export type Transaction = _Transaction<Fields>;
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>;
