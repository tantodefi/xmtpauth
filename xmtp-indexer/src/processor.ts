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

// Smart wallet infrastructure addresses
const SMART_WALLET_ADDRESSES = {
  ENTRYPOINT_V6: "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789", // ERC-4337 EntryPoint v0.6
  ENTRYPOINT_V7: "0x0000000071727De22E5E9d8BAf0edAc6f37da032", // ERC-4337 EntryPoint v0.7
  COINBASE_SMART_WALLET_FACTORY: "0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a", // Coinbase Smart Wallet Factory
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

  // Smart wallet / ERC-4337 events
  USER_OPERATION_EVENT:
    "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f", // UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)
  ACCOUNT_DEPLOYED:
    "0xd51a9c61267aa6196961883ecf5ff2da6619c37dac0fa92122513fb32c032d2d", // AccountDeployed(bytes32,address,address,address)

  // Native ETH transfer events (for tracking internal transfers)
  DEPOSIT: "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c", // Deposit(address,uint256)
  WITHDRAWAL:
    "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65", // Withdrawal(address,uint256)
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
      process.env.RPC_BASE_HTTP || "https://base-rpc.publicnode.com", // More reliable public RPC
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
      gasUsed: true,
    },
    receipt: {
      contractAddress: true,
      status: true,
      gasUsed: true,
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

  // 1. Track direct ETH transfers TO the agent address (EOA payments)
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
  })

  // 5. Track EntryPoint UserOperations (Smart Wallet Transactions)
  .addLog({
    address: [
      SMART_WALLET_ADDRESSES.ENTRYPOINT_V6.toLowerCase(),
      SMART_WALLET_ADDRESSES.ENTRYPOINT_V7.toLowerCase(),
    ],
    topic0: [EVENT_SIGNATURES.USER_OPERATION_EVENT],
    range: { from: DEPLOYMENT_BLOCK },
  })

  // 6. Track contract creation transactions (to: null) from the agent
  .addTransaction({
    from: [AGENT_ADDRESS.toLowerCase()],
    to: [], // Empty array means contract creation (to: null)
    range: { from: DEPLOYMENT_BLOCK },
  });

// Export constants for use in main.ts
export {
  AGENT_ADDRESS,
  TOKEN_ADDRESSES,
  SMART_WALLET_ADDRESSES,
  EVENT_SIGNATURES,
  FACTORY_ADDRESSES,
  DEPLOYMENT_BLOCK,
};

export type Fields = EvmBatchProcessorFields<typeof processor>;
export type Block = BlockHeader<Fields>;
export type Log = _Log<Fields>;
export type Transaction = _Transaction<Fields>;
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>;
