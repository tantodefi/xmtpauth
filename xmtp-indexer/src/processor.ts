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

// Base network token addresses (mainnet and testnet)
const TOKEN_ADDRESSES = {
  USDC_MAINNET: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet USDC
  USDC_TESTNET: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
  WETH: "0x4200000000000000000000000000000000000006", // WETH on Base
};

// Factory contract addresses
const FACTORY_ADDRESSES = [
  "0x0D9c7A9ADC117814ed98B57BF64e8437Da5d4ef4", // Current mainnet Base factory
];

// Event signatures for comprehensive tracking
const EVENT_SIGNATURES = {
  // ERC20 Transfer
  ERC20_TRANSFER:
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",

  // Factory events
  CONTRACT_DEPLOYED:
    "0x340591c16186b027312157b18dba74a1e46a25295ed940d7d2555ab2a22b2bee", // ContractDeployed(address,address,string,uint256)

  // EVMAuth contract events
  USER_ACCESS_GRANTED:
    "0x832e3266eda251722a299e9cec6db5e6c82c1590615bf7f40f0d6f6651b403a1", // UserAccessGranted(address,string,uint256,uint256)
  USER_ACCESS_REVOKED:
    "0x1f50cca6e190c91c85b4889563d4100095e7bdf0deab20ad9e944cf9009149fc", // UserAccessRevoked(address,string,uint256,string)
  ACCESS_TOKEN_EXPIRED:
    "0x2728a642dad2b70017ea4f1d8668f7aad4d693eba69dce1d0e95ae7666bad189", // AccessTokenExpired(address,uint256)
};

// Processor configuration with SQD Network fallback
// Try SQD Network first, but allow RPC-only fallback if needed
const USE_SQD_GATEWAY = process.env.USE_SQD_GATEWAY !== "false";

let processorBuilder = new EvmBatchProcessor();

// Only use SQD Network if not explicitly disabled
if (USE_SQD_GATEWAY) {
  processorBuilder = processorBuilder.setGateway(
    "https://v2.archive.subsquid.io/network/base-mainnet",
  );
}

export const processor = processorBuilder
  .setRpcEndpoint({
    url: assertNotNull(
      process.env.RPC_BASE_HTTP || "https://mainnet.base.org", // Official Base RPC - faster
      "No RPC endpoint supplied",
    ),
    rateLimit: 15, // Increased for faster sync - Base can handle this
    requestTimeout: 30000,
  })
  .setFinalityConfirmation(3) // Reduced for faster confirmation
  .setFields({
    transaction: {
      from: true,
      to: true,
      value: true,
      hash: true,
      status: true,
    },
    log: {
      topics: true,
      data: true,
      address: true,
      transactionHash: true,
    },
    block: {
      timestamp: true,
    },
  })
  .setBlockRange({
    from: DEPLOYMENT_BLOCK,
  })

  // 1. Track ETH transfers TO the agent address (payments)
  .addTransaction({
    to: [AGENT_ADDRESS.toLowerCase()],
    range: { from: DEPLOYMENT_BLOCK },
  })

  // 2. Track USDC transfers TO the agent address (both mainnet and testnet)
  .addLog({
    address: [
      TOKEN_ADDRESSES.USDC_MAINNET.toLowerCase(),
      TOKEN_ADDRESSES.USDC_TESTNET.toLowerCase(),
    ],
    topic0: [EVENT_SIGNATURES.ERC20_TRANSFER],
    topic2: ["0x" + AGENT_ADDRESS.toLowerCase().slice(2).padStart(64, "0")], // Filter transfers TO agent
    range: { from: DEPLOYMENT_BLOCK },
  })

  // 3. Track WETH transfers TO the agent address
  .addLog({
    address: [TOKEN_ADDRESSES.WETH.toLowerCase()],
    topic0: [EVENT_SIGNATURES.ERC20_TRANSFER],
    topic2: ["0x" + AGENT_ADDRESS.toLowerCase().slice(2).padStart(64, "0")], // Filter transfers TO agent
    range: { from: DEPLOYMENT_BLOCK },
  })

  // 4. Track Factory contract events (ContractDeployed)
  .addLog({
    address: FACTORY_ADDRESSES.map((addr) => addr.toLowerCase()),
    topic0: [EVENT_SIGNATURES.CONTRACT_DEPLOYED],
    range: { from: DEPLOYMENT_BLOCK },
  });

// 5. Track EVMAuth contract events from known contracts only (more efficient)
// We'll discover new contracts from factory events above

// Export constants for use in main.ts
export {
  EVENT_SIGNATURES,
  TOKEN_ADDRESSES,
  FACTORY_ADDRESSES,
  AGENT_ADDRESS,
  DEPLOYMENT_BLOCK,
};

export type Fields = EvmBatchProcessorFields<typeof processor>;
export type Block = BlockHeader<Fields>;
export type Log = _Log<Fields>;
export type Transaction = _Transaction<Fields>;
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>;
