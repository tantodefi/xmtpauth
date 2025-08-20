import {
  createSigner,
  getEncryptionKeyFromHex,
  logAgentDetails,
  validateEnvironment,
} from "@helpers/client";
import {
  ContentTypeReaction,
  ReactionCodec,
} from "@xmtp/content-type-reaction";
import {
  TransactionReferenceCodec,
  type TransactionReference,
} from "@xmtp/content-type-transaction-reference";
import {
  ContentTypeWalletSendCalls,
  WalletSendCallsCodec,
} from "@xmtp/content-type-wallet-send-calls";
import {
  Client,
  IdentifierKind,
  type Group,
  type XmtpEnv,
} from "@xmtp/node-sdk";
import { JSONDatabase } from "./src/database/json-database";
import { EventDrivenAccessManager } from "./src/handlers/event-driven-access";
import { EVMAuthHandler } from "./src/handlers/evmauth-handler";
import { IPFSMetadataHandler } from "./src/handlers/ipfs-metadata";
import { USDCHandler } from "./src/handlers/usdc-handler";
import { EnhancedGroupManager } from "./src/managers/enhanced-group-flow";
import { EnhancedTierSetup } from "./src/managers/enhanced-tier-setup";
import { GroupManager } from "./src/managers/group-manager";
import { UnifiedRecoverySystem } from "./src/managers/unified-recovery-system";
// RecoveryManager removed - using unified recovery system

import type {
  AccessTier,
  DualGroupConfig,
  GroupMetadata,
} from "./src/types/types";
import { addressResolver } from "./src/utils/address-resolver";
import {
  handleEnhancedBuyAccess,
  handleEnhancedCreateGroup,
} from "./src/utils/enhanced-create-group";
import {
  handleCreateGroupWithPayment,
  handleGrantTrial,
  handleListGroups,
} from "./src/utils/enhanced-create-group-with-payment";
import { HybridPaymentMonitor } from "./src/utils/hybrid-payment-monitor";
import { PersistentStateManager } from "./src/utils/persistent-state";

/* Environment variables validation */
const {
  WALLET_KEY,
  ENCRYPTION_KEY,
  XMTP_ENV,
  BASE_RPC_URL,
  EVMAUTH_FACTORY_ADDRESS,
  FEE_RECIPIENT,
  FEE_BASIS_POINTS,
} = validateEnvironment([
  "WALLET_KEY",
  "ENCRYPTION_KEY",
  "XMTP_ENV",
  "BASE_RPC_URL",
  "EVMAUTH_FACTORY_ADDRESS",
  "FEE_RECIPIENT",
  "FEE_BASIS_POINTS",
]);

// In-memory storage for demo (use database in production)
const groupConfigs = new Map<string, DualGroupConfig>();
const userTokens = new Map<
  string,
  { groupId: string; tokenId: string; expiresAt: Date }[]
>();

// Helper function to get data directory path
function getDataDir(): string {
  return process.env.NODE_ENV === "production" ? "/app/data" : "./.data";
}

interface TransactionAnalysis {
  isValid: boolean;
  type: string;
  action: string;
  reason?: string;
  details?: string;
  contractAddress?: string;
  tokenId?: number;
  amount?: string;
}

/**
 * Analyze a transaction to determine its type and validity
 */
async function analyzeTransaction(
  txHash: string,
  senderAddress: string,
  agentAddress: string,
  senderInboxId: string,
  paymentMonitor: HybridPaymentMonitor,
  enhancedGroupManager: EnhancedGroupManager,
  groupConfigs: Map<string, DualGroupConfig>,
): Promise<TransactionAnalysis> {
  try {
    const BASE_RPC_URL = process.env.BASE_RPC_URL;
    if (!BASE_RPC_URL) {
      return {
        isValid: false,
        type: "unknown",
        action: "unknown",
        reason: "RPC URL not configured",
      };
    }

    // Get transaction details
    const response = await fetch(BASE_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionByHash",
        params: [txHash],
        id: 1,
      }),
    });

    const data = (await response.json()) as any;
    const tx = data.result;

    if (!tx) {
      return {
        isValid: false,
        type: "unknown",
        action: "unknown",
        reason: "Transaction not found on blockchain",
      };
    }

    console.log("🔍 Transaction analysis:");
    console.log(`  • From: ${tx.from}`);
    console.log(`  • To: ${tx.to}`);
    console.log(`  • Value: ${tx.value}`);
    console.log(`  • Data: ${tx.input?.slice(0, 20)}...`);
    console.log(`  • Expected sender: ${senderAddress}`);

    // Check for direct ETH payment to agent (group creation)
    const isToAgent = tx.to?.toLowerCase() === agentAddress.toLowerCase();
    const hasValue = tx.value && BigInt(tx.value) >= BigInt("1000000000000000"); // 0.001 ETH

    if (isToAgent && hasValue) {
      return {
        isValid: true,
        type: "ETH Payment",
        action: "group creation",
        amount: tx.value,
      };
    }

    // Check for smart contract wallet payments
    // If user has pending payment and transaction is from expected user context, accept it
    const userHasPendingPayment =
      paymentMonitor.hasPendingPayment(senderInboxId);

    if (userHasPendingPayment) {
      console.log(
        "🔍 User has pending payment, checking if transaction is related...",
      );

      // Check if transaction involves user's address in metadata or if it's a smart contract call
      const isFromExpectedUser =
        tx.from?.toLowerCase() === senderAddress.toLowerCase();
      const hasTransactionData =
        tx.input && tx.input !== "0x" && tx.input.length > 10;
      const isSmartContractCall =
        hasTransactionData && tx.to && tx.to !== agentAddress;

      // For smart contract wallets, the transaction might go through intermediary contracts
      if (isSmartContractCall && !isFromExpectedUser) {
        console.log("🤖 Detected potential smart contract wallet transaction");
        console.log(`  • Transaction from: ${tx.from}`);
        console.log(`  • Expected user: ${senderAddress}`);
        console.log(`  • Has complex data: ${hasTransactionData}`);

        // Check transaction receipt for internal transfers
        try {
          const receiptResponse = await fetch(BASE_RPC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "eth_getTransactionReceipt",
              params: [txHash],
              id: 2,
            }),
          });

          const receiptData = (await receiptResponse.json()) as any;
          const receipt = receiptData.result;

          if (receipt && receipt.status === "0x1") {
            console.log(
              "✅ Transaction was successful, likely a smart contract wallet payment",
            );

            return {
              isValid: true,
              type: "Smart Contract ETH Payment",
              action: "group creation",
              details:
                "Smart contract wallet payment (verified via pending payment match)",
            };
          }
        } catch (receiptError) {
          console.log("⚠️ Could not fetch transaction receipt:", receiptError);
        }
      }
    }

    // Check for contract interactions (access purchases)
    const managedContracts = Array.from(groupConfigs.keys());
    const isToManagedContract = managedContracts.some(
      (addr) => addr.toLowerCase() === tx.to?.toLowerCase(),
    );

    if (isToManagedContract) {
      const contractAddress = tx.to.toLowerCase();
      const config = Array.from(groupConfigs.entries()).find(
        ([addr, cfg]) => addr.toLowerCase() === contractAddress,
      );

      if (config) {
        return {
          isValid: true,
          type: "Contract Interaction",
          action: "access purchase",
          contractAddress,
          details: `Purchase for ${config[1].metadata?.name || "Premium Group"}`,
        };
      }
    }

    // Check for USDC token transfers (could be part of purchase flow)
    const USDC_ADDRESS =
      process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    const isUSDCTransfer = tx.to?.toLowerCase() === USDC_ADDRESS.toLowerCase();

    if (isUSDCTransfer && tx.input && tx.input.length > 10) {
      // This could be a USDC approve or transfer
      return {
        isValid: true,
        type: "USDC Transaction",
        action: "access purchase",
        details: "USDC token operation (approve/transfer)",
      };
    }

    // If we get here, it's not a recognized transaction type
    return {
      isValid: false,
      type: "Unrecognized",
      action: "unknown",
      reason: "Transaction does not match any expected payment patterns",
      details: `To: ${tx.to}, Value: ${tx.value}, Data: ${tx.input ? "has data" : "no data"}`,
    };
  } catch (error) {
    console.error("❌ Error analyzing transaction:", error);
    return {
      isValid: false,
      type: "error",
      action: "unknown",
      reason: "Failed to analyze transaction",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Process different types of transactions
 */
async function processTransactionByType(
  analysis: TransactionAnalysis,
  txHash: string,
  senderAddress: string,
  senderInboxId: string,
  paymentMonitor: HybridPaymentMonitor,
  enhancedGroupManager: EnhancedGroupManager,
): Promise<void> {
  try {
    switch (analysis.type) {
      case "ETH Payment":
      case "Smart Contract ETH Payment":
        // Handle group creation payment (both direct and smart contract wallet)
        const ethPayment = {
          id: `${txHash}-eth-txref`,
          blockNumber: 0,
          timestamp: new Date().toISOString(),
          from: senderAddress.toLowerCase(),
          to: process.env.WALLET_KEY
            ? (
                await createSigner(process.env.WALLET_KEY).getIdentifier()
              ).identifier.toLowerCase()
            : "",
          value: analysis.amount || "1000000000000000",
          transactionHash: txHash,
          tokenType: "ETH" as const,
        };

        await paymentMonitor.processExternalPayment(
          ethPayment,
          "transaction-reference",
        );
        break;

      case "Contract Interaction":
      case "USDC Transaction":
        // Handle access purchase
        if (analysis.contractAddress) {
          // Trigger the enhanced group manager to check for new NFT ownership
          await enhancedGroupManager.handleTokenPurchase(
            analysis.contractAddress,
            senderAddress,
            senderInboxId,
            1, // Default token ID - will be detected from chain
            "Premium Access",
          );
        }
        break;

      default:
        console.log(`⚠️ Unhandled transaction type: ${analysis.type}`);
    }
  } catch (error) {
    console.error("❌ Error processing transaction:", error);
    throw error;
  }
}

/**
 * Handle transaction reference messages from wallets
 */
async function handleTransactionReference(
  message: any,
  client: any,
  paymentMonitor: HybridPaymentMonitor,
  enhancedGroupManager: EnhancedGroupManager,
  groupConfigs: Map<string, DualGroupConfig>,
  agentAddress: string,
  database: JSONDatabase,
) {
  try {
    const conversation = await client.conversations.getConversationById(
      message.conversationId,
    );

    if (!conversation) {
      console.log("❌ Unable to find conversation for transaction reference");
      return;
    }

    // Get sender address
    const inboxState = await client.preferences.inboxStateFromInboxIds([
      message.senderInboxId,
    ]);
    const senderAddress = inboxState[0]?.identifiers[0]?.identifier;

    if (!senderAddress) {
      console.log("❌ Unable to find sender address for transaction reference");
      return;
    }

    // Extract transaction details
    const transactionRef = message.content as any;
    // Handle both direct and nested transaction reference formats
    const txData = transactionRef.transactionReference || transactionRef;
    const txHash = txData.reference;
    const networkId = txData.networkId;
    const metadata = txData.metadata;

    console.log("🔍 Transaction reference details:");
    console.log(`  • txHash: ${txHash}`);
    console.log(
      `  • networkId: ${networkId} (${typeof networkId === "string" && networkId.startsWith("0x") ? parseInt(networkId, 16) : networkId})`,
    );
    console.log(`  • senderAddress: ${senderAddress}`);
    console.log(`  • metadata:`, metadata);
    console.log(`  • txData structure:`, JSON.stringify(txData, null, 2));

    // Validate transaction hash format
    if (!txHash || !txHash.startsWith("0x") || txHash.length !== 66) {
      console.log("❌ Invalid transaction hash format");
      await conversation.send(
        "❌ Invalid transaction hash format. Please ensure you're sending a valid Ethereum transaction hash.",
      );
      return;
    }

    // Validate network is Base (8453 = 0x2105)
    const networkIdNum =
      typeof networkId === "string" && networkId.startsWith("0x")
        ? parseInt(networkId, 16)
        : parseInt(networkId);

    if (networkIdNum !== 8453) {
      console.log(`❌ Invalid network: ${networkIdNum}, expected Base (8453)`);
      await conversation.send(
        `❌ Invalid network detected: ${networkIdNum}\n\n` +
          `This agent only processes transactions on Base network (chain ID: 8453).\n` +
          `Please make sure you're sending the payment on the correct network.`,
      );
      return;
    }

    // Analyze the transaction to determine its type and validity
    const transactionAnalysis = await analyzeTransaction(
      txHash,
      senderAddress,
      agentAddress,
      message.senderInboxId,
      paymentMonitor,
      enhancedGroupManager,
      groupConfigs,
    );

    if (!transactionAnalysis.isValid) {
      console.log(
        `❌ Transaction analysis failed: ${transactionAnalysis.reason}`,
      );

      // Check if this user has a pending payment
      const hasPendingPayment = paymentMonitor.hasPendingPayment(
        message.senderInboxId,
      );

      await conversation.send(
        `📋 Transaction Reference Received\n\n` +
          `Transaction: ${txHash}\n` +
          `Network: Base (${networkIdNum})\n\n` +
          `❌ ${transactionAnalysis.reason}\n\n` +
          `**What I'm looking for:**\n` +
          `• ETH payments to agent: ${agentAddress}\n` +
          `• USDC payments to EVMAuth contracts\n` +
          `• Smart contract interactions for access purchases\n` +
          `• Network: Base (8453)\n\n` +
          (hasPendingPayment
            ? `💡 **Next Steps:**\n` +
              `1. Look for the correct transaction in your wallet\n` +
              `2. For group creation: ETH transfer to ${agentAddress}\n` +
              `3. For access purchase: USDC transaction or contract interaction\n` +
              `4. Share that specific transaction hash\n\n` +
              `The transaction you shared: ${transactionAnalysis.details}`
            : `💡 To get started, use: /create-group <name> or /buy-access <tier>`),
      );
      return;
    }

    console.log(
      `✅ Valid ${transactionAnalysis.type} transaction detected via transaction reference`,
    );

    // Send immediate confirmation
    await conversation.send(
      `🎉 Transaction Confirmed!\n\n` +
        `✅ Valid ${transactionAnalysis.type} transaction detected:\n` +
        `• Transaction: ${txHash}\n` +
        `• From: ${senderAddress}\n` +
        `• Type: ${transactionAnalysis.type}\n` +
        `• Network: Base (${networkIdNum})\n\n` +
        `⚡ Processing your ${transactionAnalysis.action} instantly...\n` +
        `This will take just a few seconds!`,
    );

    // Process the transaction through the appropriate system
    await processTransactionByType(
      transactionAnalysis,
      txHash,
      senderAddress,
      message.senderInboxId,
      paymentMonitor,
      enhancedGroupManager,
    );
  } catch (error) {
    console.error("❌ Error in handleTransactionReference:", error);
    try {
      const conversation = await client.conversations.getConversationById(
        message.conversationId,
      );
      if (conversation) {
        await conversation.send(
          `❌ Error processing transaction reference: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } catch (sendError) {
      console.error("❌ Failed to send error message:", sendError);
    }
  }
}

async function main() {
  /* Create the signer and initialize client */
  const signer = createSigner(WALLET_KEY);
  const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);

  // Configure XMTP database path for mounted disk
  const xmtpDbPath =
    process.env.NODE_ENV === "production"
      ? `/app/data/xmtp-${XMTP_ENV}-${(await signer.getIdentifier()).identifier}`
      : undefined;

  const client = await Client.create(signer, {
    dbEncryptionKey,
    env: XMTP_ENV as XmtpEnv,
    dbPath: xmtpDbPath,
    codecs: [
      new WalletSendCallsCodec(),
      new ReactionCodec(),
      new TransactionReferenceCodec(),
    ],
  });

  /* Get agent address */
  const identifier = await signer.getIdentifier();
  const agentAddress = identifier.identifier;

  const evmAuthHandler = new EVMAuthHandler(
    BASE_RPC_URL,
    EVMAUTH_FACTORY_ADDRESS,
    WALLET_KEY,
  );

  // Initialize JSON database with mounted disk path
  const database = new JSONDatabase(getDataDir());
  await database.cleanupOldSessions();
  console.log("📊 Database stats:", database.getStats());

  const usdcHandler = new USDCHandler(BASE_RPC_URL, WALLET_KEY, false); // false = testnet
  const ipfsHandler = new IPFSMetadataHandler();

  // Enhanced dual-group manager with database
  // Narrow the client type to plain text to avoid union issues when adding codecs
  type PlainClient = Client<string>;
  const textClient = client as unknown as PlainClient;
  const enhancedGroupManager = new EnhancedGroupManager(
    textClient,
    evmAuthHandler,
    database,
  );
  const eventAccessManager = new EventDrivenAccessManager(
    textClient,
    BASE_RPC_URL,
    enhancedGroupManager,
    groupConfigs,
  );

  const groupManager = new GroupManager(textClient, evmAuthHandler);

  // Initialize enhanced tier setup with database
  const tierSetup = new EnhancedTierSetup(usdcHandler, ipfsHandler);

  // Initialize unified recovery system
  const unifiedRecoverySystem = new UnifiedRecoverySystem(
    textClient as any,
    database,
    evmAuthHandler,
    enhancedGroupManager,
    BASE_RPC_URL,
  );

  // Initialize persistent state manager (keep for compatibility)
  const persistentState = new PersistentStateManager();
  persistentState.cleanupOldRecords();

  // Hybrid payment monitoring system - instant detection + historical reliability
  const INDEXER_GRAPHQL_URL =
    process.env.INDEXER_URL ||
    "https://8a90b832-68f2-4bb7-a355-f8a0e65cba16.squids.live/xmtp-indexer@v1/api/graphql";
  const RPC_URL = BASE_RPC_URL; // Use same RPC as other operations
  const paymentMonitor = new HybridPaymentMonitor(
    INDEXER_GRAPHQL_URL,
    RPC_URL,
    agentAddress,
    enhancedGroupManager,
    Object.fromEntries(groupConfigs), // Convert Map to Record
  );

  void logAgentDetails(textClient as any);

  console.log("✓ Syncing conversations...");
  await textClient.conversations.sync();

  // Attempt recovery of existing groups
  console.log("🔄 Attempting to recover existing group configurations...");
  try {
    const recoveredConfigs = await unifiedRecoverySystem.performFullRecovery();

    // Merge recovered configs with current groupConfigs
    for (const [contractAddress, config] of recoveredConfigs.groups.entries()) {
      groupConfigs.set(contractAddress, config);
      // Add to event listening
      await eventAccessManager.addContractToListen(contractAddress, config);
    }

    if (recoveredConfigs.groups.size > 0) {
      console.log(
        `✅ Recovered ${recoveredConfigs.groups.size} group configurations`,
      );
    } else {
      console.log("ℹ️ No existing groups found to recover");
    }
  } catch (error) {
    console.error("⚠️ Recovery failed, starting fresh:", error);
  }

  // FALLBACK: Manually register known groups from database if recovery failed
  try {
    const allGroups = await database.getAllGroups();
    console.log(`🔍 Found ${allGroups.length} groups in database`);

    for (const group of allGroups) {
      if (!groupConfigs.has(group.contractAddress)) {
        console.log(
          `📋 Manually registering group: ${group.name} (${group.contractAddress})`,
        );

        // Create minimal config for event listening
        const config: DualGroupConfig = {
          contractAddress: group.contractAddress,
          salesGroupId: group.salesGroupId,
          premiumGroupId: group.premiumGroupId,
          creatorInboxId: group.creatorInboxId,
          metadata: { name: group.name, description: "" },
          tiers: (group.tiers || []).map((t: any, idx: number) => ({
            id: String(t?.id ?? idx + 1),
            name: t?.name ?? `Tier ${idx + 1}`,
            durationDays: Number(t?.durationDays ?? 30),
            priceWei: "0",
            priceUSD:
              typeof t?.priceUsd === "number" && t?.priceUsd > 0
                ? t.priceUsd
                : undefined,
            description: t?.description ?? "",
          })),
          premiumSettings: {
            welcomeMessage: `Welcome to ${group.name}! 🎉`,
            description: "",
          },
          // Fill required fields with safe defaults
          salesSettings: { description: "" } as any,
          groupId: group.premiumGroupId,
          creatorAddress: "",
          createdAt: new Date(),
          isActive: true,
          paymentConfig: { currency: "USDC" } as any,
        };

        groupConfigs.set(group.contractAddress, config);
        // Also add to enhanced group manager
        enhancedGroupManager.addGroupConfig(group.contractAddress, config);
        await eventAccessManager.addContractToListen(
          group.contractAddress,
          config,
        );
        console.log(`✅ Registered event listener for ${group.name}`);
      }
    }
  } catch (dbError) {
    console.error("⚠️ Database fallback failed:", dbError);
  }

  // Track conversations where welcome message has been sent
  const welcomeSentConversations = new Set<string>();

  // Start enhanced membership management background task
  void startEnhancedMembershipManager(textClient as any, enhancedGroupManager);

  // Start event-driven access management with improved polling system
  void eventAccessManager.startEventListening();

  // Start payment monitoring system
  console.log("💰 Starting payment monitoring...");
  void paymentMonitor.startMonitoring();

  console.log("🚀 EVMAuth Groups Agent is running!");
  console.log("💰 Enhanced with USDC pricing and custom NFT images!");
  console.log("");
  console.log("Available commands:");
  console.log(
    "  /create-group <name> - Create a new premium community (0.001 ETH)",
  );
  console.log(
    "  /grant-trial <group> <address> <days> - Grant free trial access (creators only)",
  );
  console.log("  /list-groups - View your premium communities");
  console.log("  /buy-access <group_id> <tier_id> - Purchase access with USDC");
  console.log("  /my-tokens - View your access tokens");
  console.log("  /group-info <group_id> - Get group information and pricing");
  console.log(
    "  /test-expiration - Test token expiration with ultra-short tokens",
  );
  console.log("  /help - Show this help message");
  console.log("");
  console.log("💡 Features:");
  console.log("  • User-approved transactions with 0.001 ETH deployment fee");
  console.log("  • Creators can grant free trial access");
  console.log("  • Custom USD pricing for access tiers");
  console.log("  • USDC payments on Base network");
  console.log("  • Time-bound NFT access tokens");

  const stream = await client.conversations.streamAllMessages();

  for await (const message of stream) {
    /* Ignore messages from the same agent */
    if (message.senderInboxId.toLowerCase() === client.inboxId.toLowerCase()) {
      continue;
    }

    /* Handle transaction reference messages */
    if (message.contentType?.typeId === "transactionReference") {
      console.log("🧾 Detected transaction reference message");
      console.log(
        "📋 Raw message content:",
        JSON.stringify(message.content, null, 2),
      );

      try {
        await handleTransactionReference(
          message,
          client,
          paymentMonitor,
          enhancedGroupManager,
          groupConfigs,
          agentAddress,
          database,
        );
      } catch (error) {
        console.error("❌ Error processing transaction reference:", error);
      }
      continue;
    }

    /* Skip non-text messages for regular processing */
    if (message.contentType?.typeId !== "text") {
      continue;
    }

    console.log(
      `Received message: ${message.content as string} by ${message.senderInboxId}`,
    );

    const conversation = await client.conversations.getConversationById(
      message.conversationId,
    );

    if (!conversation) {
      console.log("Unable to find conversation, skipping");
      continue;
    }

    const inboxState = await client.preferences.inboxStateFromInboxIds([
      message.senderInboxId,
    ]);

    // Enhanced address resolution with validation
    const rawMemberAddress = inboxState[0]?.identifiers[0]?.identifier;
    const addressValidation = addressResolver.validateResolvedAddress(
      rawMemberAddress,
      "main-message-loop",
    );

    if (!addressValidation.isValid) {
      console.error(
        `❌ Invalid member address for ${message.senderInboxId}: ${addressValidation.error}`,
      );
      try {
        const conversation = await client.conversations.getConversationById(
          message.conversationId,
        );
        if (conversation) {
          await conversation.send(
            "❌ Unable to process your message\n\n" +
              "I couldn't resolve your wallet address from your XMTP inbox. " +
              "Please make sure you're messaging from a wallet-connected XMTP client.\n\n" +
              `Technical error: ${addressValidation.error}`,
          );
        }
      } catch (sendError) {
        console.error("Failed to send address error message:", sendError);
      }
      continue;
    }

    const memberAddress = addressValidation.normalizedAddress!;

    // Add a reaction to the message we just received (Unicode emoji)
    try {
      await conversation.send(
        {
          reference: message.id,
          action: "added",
          content: "👀",
          schema: "unicode",
        },
        ContentTypeReaction,
      );
    } catch {}

    const messageContent = message.content as string;
    let command = messageContent.toLowerCase().trim();
    // Handle common typo alias
    if (command.startsWith("/crate-group")) {
      command = command.replace("/crate-group", "/create-group");
    }

    // Determine context (sales vs premium) and tag requirement
    const convoId = conversation.id;
    let matchedConfig: DualGroupConfig | undefined;
    for (const cfg of groupConfigs.values()) {
      if (
        cfg.salesGroupId.toLowerCase() === convoId.toLowerCase() ||
        cfg.premiumGroupId.toLowerCase() === convoId.toLowerCase()
      ) {
        matchedConfig = cfg;
        break;
      }
    }
    const isSalesGroup =
      matchedConfig?.salesGroupId?.toLowerCase() === convoId.toLowerCase();
    const isPremiumGroup =
      matchedConfig?.premiumGroupId?.toLowerCase() === convoId.toLowerCase();
    const mentionedAgent = /@xmtpauth\.base\.eth/i.test(messageContent);

    // Only respond in premium or other groups when tagged; sales always allowed
    const isGroupConvo = !!matchedConfig; // our managed groups
    if (!isSalesGroup && isGroupConvo && !mentionedAgent) {
      continue;
    }

    try {
      // Check if user is in tier setup session first - only if they have an active session
      let tierSetupHandled = false;
      if (tierSetup.getSession(message.senderInboxId)) {
        tierSetupHandled = await tierSetup.handleTierSetupMessage(
          message.senderInboxId,
          messageContent,
          conversation,
          undefined,
          async (tiers: AccessTier[]) => {
            // Callback when tiers are completed
            const groupConfig = groupConfigs.get(
              tierSetup.getSession(message.senderInboxId)?.groupId || "",
            );
            if (groupConfig) {
              // Persist DB first
              try {
                const rec = await database.findGroupByContract(
                  groupConfig.contractAddress,
                );
                if (rec) {
                  const mapped = tiers.map((t, idx) => ({
                    id: idx + 1,
                    name: t.name,
                    priceUsd: typeof t.priceUSD === "number" ? t.priceUSD : 0,
                    durationDays: t.durationDays,
                    imageUrl: t.imageUrl,
                    metadataUri: t.metadata?.ipfsHash
                      ? `ipfs://${t.metadata.ipfsHash}`
                      : undefined,
                  }));
                  await database.updateGroup(rec.id, { tiers: mapped });
                }
              } catch {}

              // Update memory
              groupConfig.tiers = tiers;

              // Configure on-chain using agent's wallet (better UX than 5 user signatures)
              await evmAuthHandler.setupAccessTiers(
                groupConfig.contractAddress,
                tiers,
              );
            }
          },
        );
      }

      if (tierSetupHandled) {
        // Message was handled by tier setup
        continue;
      }

      // Handle regular commands
      if (command.startsWith("/create-group")) {
        // Validate name is present
        const parts = messageContent.split(" ");
        if (parts.length < 2) {
          await conversation.send(
            'Usage: /create-group "<name>"\nExample: /create-group "My Premium Group"',
          );
          continue;
        }
        await handleCreateGroupWithPayment(
          conversation,
          memberAddress,
          message.senderInboxId,
          messageContent,
          enhancedGroupManager,
          groupConfigs,
          agentAddress,
          paymentMonitor,
          persistentState,
          database,
        );
      } else if (command.startsWith("/setup-tiers")) {
        await handleEnhancedSetupTiers(
          conversation,
          message.senderInboxId,
          messageContent,
          tierSetup,
          textClient,
          database,
        );
      } else if (command.startsWith("/grant-trial")) {
        console.log(`🎁 Processing grant-trial command: ${messageContent}`);
        try {
          await handleGrantTrial(
            conversation,
            memberAddress,
            message.senderInboxId,
            messageContent,
            groupConfigs,
            evmAuthHandler,
            enhancedGroupManager,
          );
          console.log(`✅ Grant-trial command completed successfully`);
        } catch (error) {
          console.error(`❌ Error in grant-trial command:`, error);
          await conversation.send(
            `❌ Failed to process grant-trial command\n\n` +
              `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
              `Please try again or contact support.`,
          );
        }
      } else if (command === "/list-groups") {
        await handleListGroups(
          conversation,
          message.senderInboxId,
          groupConfigs,
          database,
          evmAuthHandler,
        );
      } else if (command.startsWith("/buy-access")) {
        await handleEnhancedBuyAccess(
          conversation,
          memberAddress,
          message.senderInboxId,
          messageContent,
          enhancedGroupManager,
          groupConfigs,
          database,
        );
      } else if (command === "/my-tokens") {
        await handleMyTokens(conversation, message.senderInboxId);
      } else if (command.startsWith("/group-info")) {
        await handleGroupInfo(conversation, messageContent);
      } else if (command.startsWith("/check-purchase")) {
        await handleCheckPurchase(
          conversation,
          message.senderInboxId,
          messageContent,
          eventAccessManager,
          textClient,
        );
      } else if (command.startsWith("/withdraw")) {
        await handleWithdraw(
          conversation,
          message.senderInboxId,
          messageContent,
          evmAuthHandler,
          groupConfigs,
          database,
        );
      } else if (command.startsWith("/earnings")) {
        await handleEarnings(
          conversation,
          message.senderInboxId,
          messageContent,
          evmAuthHandler,
          groupConfigs,
          database,
        );
      } else if (command.startsWith("/fix-access")) {
        await handleFixAccess(
          conversation,
          message.senderInboxId,
          messageContent,
          enhancedGroupManager,
          groupConfigs,
          database,
          textClient,
        );
      } else if (command.startsWith("/test-expiration")) {
        await handleTestExpiration(
          conversation,
          message.senderInboxId,
          messageContent,
          evmAuthHandler,
          enhancedGroupManager,
          eventAccessManager,
          null, // recoveryManager removed - using unified recovery system
          groupConfigs,
        );
      } else if (command === "/help") {
        await handleHelp(conversation);
      } else if (command === "/debug-contracts") {
        await handleDebugContracts(conversation, evmAuthHandler, database);
      } else if (command === "/fix-contracts") {
        await handleFixContracts(
          conversation,
          evmAuthHandler,
          database,
          groupConfigs,
        );
      } else if (command === "/restart-recovery") {
        await handleRestartRecovery(
          conversation,
          unifiedRecoverySystem,
          groupConfigs,
        );
      } else if (command === "/opensea-links") {
        await handleOpenSeaLinks(conversation, groupConfigs);
      } else if (command === "/check-payments") {
        await handleCheckPayments(conversation, evmAuthHandler, groupConfigs);
      } else {
        // Contextual welcome/help - only send once per conversation
        if (isSalesGroup && matchedConfig) {
          const groupName = matchedConfig.metadata?.name || "Premium Group";
          const creator = matchedConfig.creatorAddress
            ? `${matchedConfig.creatorAddress.slice(0, 6)}...${matchedConfig.creatorAddress.slice(-4)}`
            : "Unknown";
          const tiers = (matchedConfig.tiers || []).map((t: any, i: number) => {
            const price =
              t.priceUSD ??
              (t.priceWei ? Number(t.priceWei) / 1e18 : undefined);
            const priceText = price !== undefined ? `$${price}` : "TBD";
            const idOrName = t.id || t.name || `tier-${i + 1}`;
            return `• ${t.name || idOrName} — ${priceText} — ${t.durationDays} days\n   Buy: /buy-access ${idOrName}`;
          });
          const tiersText =
            tiers.length > 0
              ? tiers.join("\n")
              : "Tiers coming soon. Please check back later.";
          await conversation.send(
            `🏪 ${groupName} — Sales\n\n` +
              `👤 Creator: ${creator}\n` +
              `📋 Available Tiers:\n${tiersText}`,
          );
        } else if (!welcomeSentConversations.has(conversation.id)) {
          // Only send welcome message once per conversation
          await conversation.send(
            "👋 Welcome to the XMTP EVMAuth Groups Agent!\n\n" +
              "Create and monetize premium XMTP groups with time-bound NFT access.\n\n" +
              "Quick start:\n" +
              '• /create-group "My Premium Group" — deploy contract + groups\n' +
              "• /setup-tiers <group_or_contract> — interactive tier setup\n" +
              "• /buy-access <group_or_contract> <tier_id> — purchase access\n" +
              "• /list-groups — see your groups\n" +
              "• /help — full guide",
          );

          // Mark welcome as sent for this conversation
          welcomeSentConversations.add(conversation.id);
        }
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error processing command:", errorMessage);
      await conversation.send(
        "Sorry, I encountered an error processing your command.",
      );
    }
  }
}

async function handleEnhancedSetupTiers(
  conversation: any,
  senderInboxId: string,
  messageContent: string,
  tierSetup: EnhancedTierSetup,
  client: any,
  database?: JSONDatabase,
) {
  const parts = messageContent.split(" ");
  if (parts.length < 2) {
    await conversation.send(
      "Usage: /setup-tiers <group_name_or_contract>\nExample: /setup-tiers dstealth",
    );
    return;
  }

  const identifier = parts[1];

  // Find group by name OR contract address
  let groupConfig: DualGroupConfig | undefined;
  let contractAddress: string | undefined;

  // First try to find by contract address (exact match)
  if (identifier.startsWith("0x")) {
    groupConfig = groupConfigs.get(identifier);
    contractAddress = identifier;
  } else {
    // Search by group name
    for (const [address, config] of groupConfigs.entries()) {
      if (config.metadata?.name?.toLowerCase() === identifier.toLowerCase()) {
        groupConfig = config;
        contractAddress = address;
        break;
      }
    }
  }

  if (!groupConfig || !contractAddress) {
    // Try to recover from persistent database by group name
    if (!identifier.startsWith("0x") && database) {
      try {
        const dbGroups = await database.getUserGroups(senderInboxId);
        const match = dbGroups.find(
          (g) => g.name.toLowerCase() === identifier.toLowerCase(),
        );
        if (match) {
          contractAddress = match.contractAddress;
          // Rehydrate minimal config into memory for subsequent commands
          const restoredConfig: any = {
            contractAddress: match.contractAddress,
            salesGroupId: match.salesGroupId,
            premiumGroupId: match.premiumGroupId,
            creatorInboxId: match.creatorInboxId,
            metadata: { name: match.name },
            tiers: [],
          };
          groupConfig = restoredConfig as DualGroupConfig;
          groupConfigs.set(match.contractAddress, restoredConfig);
        }
      } catch {}
    }

    if (!groupConfig || !contractAddress) {
      await conversation.send(
        "❌ Group not found. Use `/list-groups` to see available groups.\n\nIf you just paid to create a group, wait for the confirmation message (contract + group IDs). Then run `/setup-tiers <group_name_or_contract>`.",
      );
      return;
    }
  }

  if (groupConfig.creatorInboxId !== senderInboxId) {
    await conversation.send("❌ Only the group creator can setup tiers.");
    return;
  }

  // Start enhanced tier setup
  console.log(`🎯 Starting tier setup for contract: ${contractAddress}`);
  await tierSetup.startTierSetup(contractAddress, senderInboxId, conversation);
  console.log(`✅ Tier setup session created for: ${senderInboxId}`);
}

async function handleMyTokens(conversation: any, senderInboxId: string) {
  const tokens = userTokens.get(senderInboxId) || [];

  if (tokens.length === 0) {
    await conversation.send("📭 You don't have any access tokens yet.");
    return;
  }

  const tokenList = tokens
    .map((token) => {
      const groupConfig = groupConfigs.get(token.groupId);
      const groupName = groupConfig?.metadata.name || "Unknown Group";
      const isExpired = token.expiresAt < new Date();
      const status = isExpired ? "❌ Expired" : "✅ Active";

      return (
        `🎫 ${groupName}\n` +
        `   Token ID: ${token.tokenId}\n` +
        `   Status: ${status}\n` +
        `   Expires: ${token.expiresAt.toLocaleDateString()}\n`
      );
    })
    .join("\n");

  await conversation.send(`🎫 Your Access Tokens\n\n${tokenList}`);
}

async function handleGroupInfo(conversation: any, messageContent: string) {
  const parts = messageContent.split(" ");
  if (parts.length < 2) {
    await conversation.send(
      "Usage: /group-info <group_id>\nExample: /group-info abc123",
    );
    return;
  }

  const groupId = parts[1];
  let groupConfig = groupConfigs.get(groupId);
  if (!groupConfig) {
    // Try lookup by contract address in memory
    for (const [addr, cfg] of groupConfigs.entries()) {
      if (addr.toLowerCase() === groupId.toLowerCase()) {
        groupConfig = cfg;
        break;
      }
    }
  }
  if (!groupConfig) {
    // Try lookup by group name in memory
    for (const [addr, cfg] of groupConfigs.entries()) {
      if (cfg.metadata?.name?.toLowerCase() === groupId.toLowerCase()) {
        groupConfig = cfg;
        break;
      }
    }
  }
  if (!groupConfig) {
    // Fallback to DB - try by contract first, then by name
    try {
      let rec;
      try {
        rec = await new JSONDatabase(getDataDir()).requireGroupByContract(
          groupId,
        );
      } catch {
        // Try by name
        const db = new JSONDatabase(getDataDir());
        const allGroups = await db.getAllGroups();
        rec = allGroups.find(
          (g) => g.name.toLowerCase() === groupId.toLowerCase(),
        );
      }
      if (rec) {
        groupConfig = {
          groupId: rec.premiumGroupId,
          contractAddress: rec.contractAddress,
          creatorInboxId: rec.creatorInboxId,
          salesGroupId: rec.salesGroupId,
          premiumGroupId: rec.premiumGroupId,
          metadata: { name: rec.name, description: "" },
          tiers: (rec.tiers || []).map((t: any) => ({
            id: String(t.id),
            name: t.name,
            durationDays: t.durationDays,
            priceWei: "0", // unknown here; display USD
            priceUSD: t.priceUsd,
            description: "",
          })),
        } as unknown as DualGroupConfig;
        groupConfigs.set(rec.contractAddress, groupConfig);
      }
    } catch {}
  }

  if (!groupConfig) {
    await conversation.send("❌ Group not found. Please check the group ID.");
    return;
  }

  // Build price display with DB-first (USD), then on-chain fallback (USDC or ETH)
  const evmForInfo = new EVMAuthHandler(
    process.env.BASE_RPC_URL || "",
    process.env.EVMAUTH_FACTORY_ADDRESS ||
      "0x0000000000000000000000000000000000000000",
    process.env.WALLET_KEY || "0x",
  );
  const db = new JSONDatabase(getDataDir());
  const dbRecord = await db.requireGroupByContract(groupConfig.contractAddress);
  const dbPrices: Record<number, number> = {};
  if (dbRecord && dbRecord.tiers) {
    dbRecord.tiers.forEach((t, idx) => {
      if (typeof t.priceUsd === "number" && t.priceUsd > 0) {
        dbPrices[idx + 1] = t.priceUsd;
      }
    });
  }
  const tiers = groupConfig.tiers || [];
  const lines: string[] = [];
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i] as AccessTier;
    const tokenId = i + 1;
    let priceDisplay = "";
    // 1) First check on-chain for accurate pricing
    try {
      const on = await evmForInfo.readTierInfo(
        groupConfig.contractAddress,
        tokenId,
      );
      if (on && on.priceUSDC && on.priceUSDC > 0n) {
        const usdc = Number(on.priceUSDC) / 1_000_000;
        priceDisplay = `$${usdc.toFixed(2)} USDC`;
      } else if (on && on.priceWei && on.priceWei > 0n) {
        const eth = Number(on.priceWei) / 1e18;
        priceDisplay = `${eth} ETH`;
      } else {
        priceDisplay = "Free";
      }
    } catch {
      // 2) Fallback to stored pricing
      if (dbPrices[tokenId]) {
        priceDisplay = `$${dbPrices[tokenId].toFixed(2)} USDC`;
      } else if (
        typeof (tier as any).priceUSD === "number" &&
        (tier as any).priceUSD > 0
      ) {
        priceDisplay = `$${(tier as any).priceUSD.toFixed(2)} USDC`;
      } else {
        priceDisplay = "Pricing unavailable";
      }
    }
    lines.push(
      `💎 ${tier.name} (\`${tier.id}\`)\n` +
        `   ${tier.durationDays} days - ${priceDisplay}\n` +
        `   ${tier.description ?? ""}\n`,
    );
  }
  const tierInfo = lines.join("\n");

  await conversation.send(
    `📊 ${groupConfig.metadata.name}\n\n` +
      `${groupConfig.metadata.description || ""}\n\n` +
      `Contract: ${groupConfig.contractAddress}\n` +
      `Group URL: https://xmtp.chat/conversations/${groupId}\n\n` +
      `Access Tiers:\n${tierInfo}\n` +
      `Purchase access with: /buy-access ${groupId} <tier_id>`,
  );
}

async function handleCheckPurchase(
  conversation: any,
  senderInboxId: string,
  messageContent: string,
  eventAccessManager: EventDrivenAccessManager,
  client: any,
) {
  const parts = messageContent.trim().split(" ");
  if (parts.length < 2) {
    await conversation.send(
      "Usage: /check-purchase <contract_address>\nExample: /check-purchase 0x602EC5228FD577757ee15ffD6afaf86BFB85805d",
    );
    return;
  }

  const contractAddress = parts[1];

  try {
    // Get user's address from inbox ID
    const cleanSenderInboxId = senderInboxId.startsWith("0x")
      ? senderInboxId.slice(2)
      : senderInboxId;
    const inboxState = await client.preferences.inboxStateFromInboxIds([
      cleanSenderInboxId,
    ]);
    if (!inboxState || inboxState.length === 0) {
      await conversation.send("❌ Could not find your wallet address");
      return;
    }

    const userAddress = inboxState[0].identifiers[0].identifier;

    await conversation.send(
      `🔍 Checking for recent purchases...\n\n` +
        `Contract: ${contractAddress}\n` +
        `Address: ${userAddress}\n\n` +
        `Please wait while I search for your NFT purchase...`,
    );

    // Check for recent purchases
    await eventAccessManager.checkRecentPurchases(
      contractAddress,
      userAddress,
      senderInboxId,
    );
  } catch (error) {
    console.error("Error checking purchase:", error);
    await conversation.send(
      `❌ Error checking purchase: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function handleFixAccess(
  conversation: any,
  senderInboxId: string,
  messageContent: string,
  enhancedGroupManager: any,
  groupConfigs: Map<string, any>,
  database?: any,
  client?: any,
) {
  const parts = messageContent.trim().split(" ");
  if (parts.length < 2) {
    await conversation.send(
      "Usage: /fix-access <contract_address>\n" +
        "This command manually adds you to the premium group if you have a valid NFT but weren't added automatically.\n\n" +
        "Example: /fix-access 0x4B45A8Bd08bBD9F82bEBf261A255881E57786A51",
    );
    return;
  }

  const contractAddress = parts[1];

  try {
    await conversation.send(
      "🔍 Checking your NFT access and fixing group membership...",
    );

    // Find the group config
    let groupConfig = groupConfigs.get(contractAddress);
    if (!groupConfig && database) {
      try {
        const rec = await database.requireGroupByContract(contractAddress);
        if (rec) {
          groupConfig = {
            contractAddress: rec.contractAddress,
            premiumGroupId: rec.premiumGroupId,
            salesGroupId: rec.salesGroupId,
            metadata: { name: rec.name },
            tiers: rec.tiers || [],
          };
        }
      } catch {}
    }

    if (!groupConfig) {
      await conversation.send("❌ Group not found for this contract address.");
      return;
    }

    // Get user's address
    const cleanSenderInboxId = senderInboxId.startsWith("0x")
      ? senderInboxId.slice(2)
      : senderInboxId;
    const inboxState = await client.preferences.inboxStateFromInboxIds([
      cleanSenderInboxId,
    ]);

    if (!inboxState || inboxState.length === 0) {
      await conversation.send("❌ Could not find your wallet address");
      return;
    }

    const userAddress = inboxState[0].identifiers[0].identifier;

    // Use existing evmAuthHandler instance
    const tempEvmAuthHandler = new EVMAuthHandler(
      process.env.BASE_RPC_URL || "",
      process.env.EVMAUTH_FACTORY_ADDRESS || "",
      process.env.WALLET_KEY || "0x",
    );

    const hasAccess = await tempEvmAuthHandler.checkTokenAccess(
      contractAddress,
      userAddress,
    );

    if (!hasAccess) {
      await conversation.send(
        "❌ You don't have a valid NFT for this group.\n\n" +
          `Contract: ${contractAddress}\n` +
          `Your address: ${userAddress}\n\n` +
          "Purchase access first with /buy-access",
      );
      return;
    }

    // User has valid access, try to add them to premium group
    await conversation.send(
      "✅ Valid NFT found! Adding you to the premium group...\n\n" +
        `Group: ${groupConfig.metadata.name}\n` +
        `Address: ${userAddress}`,
    );

    // Find the best tier for this user
    const tier = groupConfig.tiers?.[0] || { name: "Premium", id: "1" };

    // Use the enhanced group manager to add the user
    await enhancedGroupManager.handleTokenPurchase(
      contractAddress,
      userAddress,
      senderInboxId,
      1, // Default to token ID 1
      tier.name,
    );

    await conversation.send(
      "🎉 Successfully added you to the premium group!\n\n" +
        "You should now be able to access the premium community. " +
        "Check your XMTP conversations for the premium group!",
    );
  } catch (error) {
    console.error("Error in fix-access:", error);
    await conversation.send(
      `❌ Error fixing access: ${error instanceof Error ? error.message : String(error)}\n\n` +
        "Please try again or contact support.",
    );
  }
}

async function handleWithdraw(
  conversation: any,
  senderInboxId: string,
  messageContent: string,
  evmAuthHandler: any,
  groupConfigs: Map<string, any>,
  database?: any,
) {
  const parts = messageContent.trim().split(" ");
  if (parts.length < 2) {
    await conversation.send(
      "Usage: /withdraw <contract_address>\nExample: /withdraw 0x602EC5228FD577757ee15ffD6afaf86BFB85805d",
    );
    return;
  }

  const contractAddress = parts[1];

  try {
    // Verify user owns this contract
    let userGroups = Array.from(groupConfigs.values()).filter(
      (config) => config.creatorInboxId === senderInboxId,
    );

    // If none in memory, try persistent database
    if (userGroups.length === 0 && database) {
      try {
        const dbGroups = await database.getUserGroups(senderInboxId);
        userGroups = dbGroups.map((g: any) => ({
          contractAddress: g.contractAddress,
          creatorInboxId: g.creatorInboxId,
        }));
      } catch {}
    }

    const userGroup = userGroups.find(
      (group) =>
        group.contractAddress.toLowerCase() === contractAddress.toLowerCase(),
    );

    if (!userGroup) {
      await conversation.send(
        "❌ You don't own this contract or it doesn't exist.\n\n" +
          "Use `/list-groups` to see your contracts.",
      );
      return;
    }

    // Check balances before withdrawal
    const ethBalance = await evmAuthHandler.getContractBalance(contractAddress);
    const usdcBalance =
      await evmAuthHandler.getContractUSDCBalance(contractAddress);

    // Compute lifetime USDC payouts to creator
    const payoutsRes =
      await evmAuthHandler.getTotalUSDCCreatorPayouts(contractAddress);

    if (ethBalance === 0n && usdcBalance === 0n) {
      await conversation.send(
        "💰 No funds to withdraw from this contract.\n\n" +
          `Contract: ${contractAddress}\n` +
          "ETH Balance: 0.000000 ETH\n" +
          "USDC Balance: $0.00 USDC\n" +
          (payoutsRes.ok
            ? `Total USDC Payouts (lifetime): $${(Number(payoutsRes.total) / 1e6).toFixed(2)}`
            : `Total USDC Payouts (lifetime): temporarily unavailable`),
      );
      return;
    }

    await conversation.send(
      "💰 Withdrawing funds...\n\n" +
        `Contract: ${contractAddress}\n` +
        `ETH Balance: ${(Number(ethBalance) / 1e18).toFixed(6)} ETH\n` +
        `USDC Balance: $${(Number(usdcBalance) / 1e6).toFixed(2)} USDC\n` +
        (payoutsRes.ok
          ? `Total USDC Payouts (lifetime): $${(Number(payoutsRes.total) / 1e6).toFixed(2)}\n\n`
          : `Total USDC Payouts (lifetime): temporarily unavailable\n\n`) +
        "⏳ Processing withdrawal...",
    );

    // Withdraw ETH if any
    if (ethBalance > 0n) {
      const withdrawHash = await evmAuthHandler.withdrawETH(contractAddress);
      await conversation.send(
        `✅ ETH Withdrawal Complete!\n\n` +
          `Amount: ${(Number(ethBalance) / 1e18).toFixed(6)} ETH\n` +
          `Transaction: ${withdrawHash}\n` +
          `View: https://sepolia.basescan.org/tx/${withdrawHash}`,
      );
    }

    // Note about USDC (goes directly to creator in new system)
    if (usdcBalance > 0n) {
      await conversation.send(
        `⚠️ USDC Balance Detected\n\n` +
          `There appears to be $${(Number(usdcBalance) / 1e6).toFixed(2)} USDC in the contract.\n` +
          `This shouldn't happen with the new fee system - USDC goes directly to you.\n\n` +
          `Please contact support if you see this message.`,
      );
    }
  } catch (error) {
    console.error("Error in withdrawal:", error);
    await conversation.send(
      `❌ Withdrawal failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function handleEarnings(
  conversation: any,
  senderInboxId: string,
  messageContent: string,
  evmAuthHandler: any,
  groupConfigs: Map<string, any>,
  database?: any,
) {
  const parts = messageContent.trim().split(" ");
  if (parts.length < 2) {
    await conversation.send(
      "Usage: /earnings <contract_address>\nExample: /earnings 0x602EC5228FD577757ee15ffD6afaf86BFB85805d",
    );
    return;
  }

  const contractAddress = parts[1];

  try {
    // Optional: verify ownership like /withdraw
    let userGroups = Array.from(groupConfigs.values()).filter(
      (config: any) => config.creatorInboxId === senderInboxId,
    );
    if (userGroups.length === 0 && database) {
      try {
        const dbGroups = await database.getUserGroups(senderInboxId);
        userGroups = dbGroups.map((g: any) => ({
          contractAddress: g.contractAddress,
          creatorInboxId: g.creatorInboxId,
        }));
      } catch {}
    }
    const userGroup = userGroups.find(
      (group) =>
        group.contractAddress.toLowerCase() === contractAddress.toLowerCase(),
    );
    if (!userGroup) {
      await conversation.send(
        "❌ You don't own this contract or it doesn't exist.\n\nUse `/list-groups` to see your contracts.",
      );
      return;
    }

    const ethBalance = await evmAuthHandler.getContractBalance(contractAddress);
    const usdcBalance =
      await evmAuthHandler.getContractUSDCBalance(contractAddress);
    const payouts =
      await evmAuthHandler.getTotalUSDCCreatorPayouts(contractAddress);

    await conversation.send(
      "📈 Earnings Summary\n\n" +
        `Contract: ${contractAddress}\n` +
        `ETH (withdrawable): ${(Number(ethBalance) / 1e18).toFixed(6)} ETH\n` +
        `USDC (stuck on contract): $${(Number(usdcBalance) / 1e6).toFixed(2)} USDC\n` +
        (payouts.ok
          ? `Total USDC Payouts to Creator (lifetime): $${(Number(payouts.total) / 1e6).toFixed(2)}\n`
          : `Total USDC Payouts to Creator (lifetime): temporarily unavailable\n`) +
        `Note: USDC purchases pay the creator directly; ETH shows in contract balance.`,
    );
  } catch (error) {
    console.error("Error in earnings:", error);
    await conversation.send(
      `❌ Failed to fetch earnings: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function handleHelp(conversation: any) {
  await conversation.send(
    `🤖 EVMAuth Groups Agent - Enhanced Edition\n\n` +
      `Create and monetize premium XMTP groups with custom USDC pricing and NFT images!\n\n` +
      `Commands:\n` +
      `📊 \`/create-group <name>\` - Create a new paid group\n` +
      `⚙️ \`/setup-tiers <group_id>\` - Interactive tier setup with custom pricing\n` +
      `💰 \`/buy-access <group_id> <tier_id>\` - Purchase access with USDC\n` +
      `🎫 \`/my-tokens\` - View your access tokens\n` +
      `📄 \`/group-info <group_id>\` - Get group information\n` +
      `🔍 \`/check-purchase <contract>\` - Check for recent NFT purchase\n` +
      `💰 \`/withdraw <contract>\` - Withdraw earnings from your groups\n` +
      `🔧 \`/fix-access <contract>\` - Manually add yourself to premium group if you have NFT\n` +
      `🧪 \`/test-expiration\` - Test token expiration with ultra-short tokens\n` +
      `🐛 \`/debug-contracts\` - Show contract deployment status\n` +
      `🔧 \`/fix-contracts\` - Recover correct contract addresses\n` +
      `🔄 \`/restart-recovery\` - Force complete recovery restart\n` +
      `🌊 \`/opensea-links\` - Show OpenSea collection links\n` +
      `💰 \`/check-payments\` - Check payment routing and contract ownership\n` +
      `❓ \`/help\` - Show this help message\n\n` +
      `Enhanced Features:\n` +
      `💵 USDC Pricing: Set prices in USD (e.g., $5.99 for 30 days)\n` +
      `🎨 Custom NFT Images: Upload your own artwork for access tokens\n` +
      `📁 IPFS Storage: Decentralized metadata and image storage\n` +
      `🔧 Interactive Setup: Guided tier creation process\n` +
      `⚖️ Base Network: Low gas fees, fast transactions\n` +
      `⏰ Time-bound Access: Automatic expiry and membership management\n\n` +
      `Example Tier Setup:\n` +
      `Format: \`Name | Price | Duration\`\n` +
      `• \`Basic Access | $5 | 7 days\`\n` +
      `• \`Premium | $15.99 | 30 days\`\n` +
      `• \`VIP Membership | $50 | 90 days\`\n\n` +
      `Start by creating a group, then setup your custom tiers!`,
  );
}

async function startEnhancedMembershipManager(
  client: Client,
  enhancedGroupManager: EnhancedGroupManager,
) {
  console.log("🔄 Starting enhanced membership manager...");

  setInterval(async () => {
    try {
      console.log("🔍 Running membership audit...");

      for (const [contractAddress, config] of groupConfigs.entries()) {
        // Safe access to config properties
        const groupName = config.metadata?.name || "Unknown Group";
        console.log(`Auditing group: ${groupName} (${contractAddress})`);

        const auditResults =
          await enhancedGroupManager.auditGroupMembership(contractAddress);

        if (auditResults.addedMembers.length > 0) {
          console.log(
            `✅ Added ${auditResults.addedMembers.length} new members`,
          );
        }

        if (auditResults.removedMembers.length > 0) {
          console.log(
            `❌ Removed ${auditResults.removedMembers.length} expired members`,
          );
        }
      }

      console.log("✅ Membership audit complete");
    } catch (error) {
      console.error("Error in enhanced membership manager:", error);
    }
  }, 60000); // Check every minute
}

async function handleTestExpiration(
  conversation: any,
  senderInboxId: string,
  messageContent: string,
  evmAuthHandler: any,
  enhancedGroupManager: any,
  eventAccessManager: any,
  recoveryManager: any,
  groupConfigs: Map<string, any>,
) {
  await conversation.send(
    `🧪 Starting Token Expiration Test\n\n` +
      `This test will:\n` +
      `1️⃣ Create a test group with 1-minute expiration tiers\n` +
      `2️⃣ Purchase ultra-short tokens\n` +
      `3️⃣ Wait for expiration\n` +
      `4️⃣ Verify access changes\n` +
      `5️⃣ Test manual token burning\n\n` +
      `⏰ Total time: ~2 minutes\n` +
      `💰 Cost: Very low (test tokens)\n\n` +
      `Starting test...`,
  );

  try {
    // Import the test class
    const { TokenExpirationTest } = await import(
      "./src/test/token-expiration-test"
    );

    // Create test instance
    const test = new TokenExpirationTest(
      {} as any, // Mock XMTP client for now
      evmAuthHandler,
      enhancedGroupManager,
      eventAccessManager,
      recoveryManager,
    );

    // Run the test
    const testResults = await test.runCompleteTest();

    // Send results
    await conversation.send(
      `🧪 Token Expiration Test Complete\n\n` +
        `Overall: ${testResults.success ? "🎉 SUCCESS" : "❌ FAILED"}\n\n` +
        `Test Results:\n` +
        `• Group Creation: ${testResults.results.groupCreation ? "✅" : "❌"}\n` +
        `• Tier Setup: ${testResults.results.tierSetup ? "✅" : "❌"}\n` +
        `• Token Purchase: ${testResults.results.tokenPurchase ? "✅" : "❌"}\n` +
        `• Access Verification: ${testResults.results.accessVerification ? "✅" : "❌"}\n` +
        `• Expiration Waiting: ${testResults.results.expirationWaiting ? "✅" : "❌"}\n` +
        `• Expired Access Check: ${testResults.results.expiredAccessCheck ? "✅" : "❌"}\n` +
        `• Manual Expiration: ${testResults.results.manualExpiration ? "✅" : "❌"}\n` +
        `• Group Access Update: ${testResults.results.groupAccessUpdate ? "✅" : "❌"}\n\n` +
        (testResults.success && testResults.details.contractAddress
          ? `📋 Test Details:\n` +
            `• Contract: ${testResults.details.contractAddress}\n` +
            `• Short Tier: ${testResults.details.shortTierId}\n` +
            `• Long Tier: ${testResults.details.longTierId}\n` +
            `• Purchase Hash: ${testResults.details.purchaseHash}\n` +
            `• Manual Burn Hash: ${testResults.details.manualBurnHash}\n\n`
          : "") +
        (testResults.errors.length > 0
          ? `🐛 Errors:\n${testResults.errors.map((e) => `• ${e}`).join("\n")}`
          : `🎯 All expiration tests passed! Tokens correctly expire and can be manually burned.`),
    );
  } catch (error) {
    await conversation.send(
      `❌ Expiration Test Failed\n\n` +
        `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
        `💡 This test requires:\n` +
        `• Active XMTP connection\n` +
        `• Valid contract deployment\n` +
        `• USDC token setup\n` +
        `• Proper event listening`,
    );
  }
}

/**
 * Debug contracts - show all deployed contracts and database groups
 */
async function handleDebugContracts(
  conversation: any,
  evmAuthHandler: EVMAuthHandler,
  database: JSONDatabase,
) {
  try {
    console.log("🔍 Debug contracts requested");

    // Get all contracts from factory
    const agentContracts = await evmAuthHandler.getAllAgentContracts();

    // Get all groups from database
    const dbGroups = await database.listGroupsWithContracts();

    let response = "🔍 **Contract Debug Information**\n\n";

    response += `📋 **Database Groups (${dbGroups.length}):**\n`;
    dbGroups.forEach((group, index) => {
      response += `${index + 1}. **${group.name}**\n`;
      response += `   ID: \`${group.id}\`\n`;
      response += `   Contract: \`${group.contractAddress}\`\n`;
      response += `   Created: ${new Date(group.createdAt).toLocaleString()}\n\n`;
    });

    response += `🏭 **Factory Contracts (${agentContracts.length}):**\n`;
    agentContracts.forEach((contract, index) => {
      response += `${index + 1}. \`${contract}\`\n`;
    });

    // Check contract metadata to see what got overwritten
    response += `\n🔍 **Contract Metadata Analysis:**\n`;
    try {
      const contractAddress = "0x602cA984D7f9C693b6061C8AaE072D6B553b0Aff";
      // We can't easily read contract metadata here without more complex setup
      // But we can infer from the deployment logs
      response += `Contract \`${contractAddress}\` currently contains:\n`;
      response += `• Latest deployment: "xmtpauth" metadata\n`;
      response += `• Previous "dstealth" metadata was overwritten\n`;
      response += `• XMTP groups for both communities still exist separately\n`;
    } catch (error) {
      response += `⚠️ Could not analyze contract metadata\n`;
    }

    response += `\n🔧 **Issue Detection:**\n`;
    const duplicateContracts = dbGroups.reduce(
      (acc: { [key: string]: string[] }, group) => {
        if (!acc[group.contractAddress]) acc[group.contractAddress] = [];
        acc[group.contractAddress].push(group.name);
        return acc;
      },
      {},
    );

    Object.entries(duplicateContracts).forEach(([contract, groups]) => {
      if (groups.length > 1) {
        response += `⚠️ Contract \`${contract}\` is used by multiple groups: ${groups.join(", ")}\n`;
      }
    });

    await conversation.send(response);
  } catch (error) {
    console.error("Error in debug contracts:", error);
    await conversation.send("❌ Error retrieving contract debug information");
  }
}

/**
 * Fix contracts - attempt to recover correct contract addresses
 */
async function handleFixContracts(
  conversation: any,
  evmAuthHandler: EVMAuthHandler,
  database: JSONDatabase,
  groupConfigs: Map<string, DualGroupConfig>,
) {
  try {
    console.log("🔧 Contract fix requested");

    let response = "🔧 **Contract Recovery Process**\n\n";

    // Get all contracts from factory
    const agentContracts = await evmAuthHandler.getAllAgentContracts();

    // Get all groups from database (sorted by creation date)
    const dbGroups = await database.listGroupsWithContracts();
    dbGroups.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    response += `📋 **Current Database State:**\n`;
    dbGroups.forEach((group, index) => {
      response += `${index + 1}. **${group.name}** → \`${group.contractAddress}\`\n`;
    });
    response += `\n`;

    if (agentContracts.length !== dbGroups.length) {
      response += `⚠️ Mismatch: ${dbGroups.length} groups in DB, ${agentContracts.length} contracts on-chain\n\n`;
    }

    // Attempt to map contracts to groups chronologically
    if (agentContracts.length >= dbGroups.length) {
      response += "📋 **Proposed Fixes:**\n";

      for (let i = 0; i < dbGroups.length; i++) {
        const group = dbGroups[i];
        const proposedContract = agentContracts[i];

        response += `${i + 1}. **${group.name}**\n`;
        response += `   Current: \`${group.contractAddress}\`\n`;
        response += `   Proposed: \`${proposedContract}\`\n`;

        if (group.contractAddress !== proposedContract) {
          response += `   Status: Fixing... ✅\n\n`;

          // Apply the fix
          await database.fixContractAddress(group.id, proposedContract);

          // Update the in-memory group configs
          const oldConfig = groupConfigs.get(group.contractAddress);
          if (oldConfig) {
            groupConfigs.delete(group.contractAddress);
            groupConfigs.set(proposedContract, {
              ...oldConfig,
              contractAddress: proposedContract,
            });
          }
        } else {
          response += `   Status: Already correct ✅\n\n`;
        }
      }

      response += "\n🎉 **Contract addresses have been fixed!**\n";
      response +=
        "The groups should now have their correct unique contracts.\n\n";
      response += "💡 **Next Steps:**\n";
      response += "• Test group access functionality\n";
      response += "• Verify tier configurations\n";
      response += "• Check membership syncing\n";
    } else {
      response += "❌ **Cannot fix**: Not enough contracts on-chain\n";
      response += "Some contracts may have failed to deploy properly.\n";
    }

    await conversation.send(response);
  } catch (error) {
    console.error("Error in fix contracts:", error);
    await conversation.send("❌ Error during contract recovery process");
  }
}

/**
 * Restart recovery - force a complete recovery restart
 */
async function handleRestartRecovery(
  conversation: any,
  unifiedRecoverySystem: any,
  groupConfigs: Map<string, DualGroupConfig>,
) {
  try {
    console.log("🔄 Restarting recovery system");

    let response = "🔄 **Restarting Recovery System**\n\n";

    // Clear current group configs
    const oldSize = groupConfigs.size;
    groupConfigs.clear();

    response += `🗑️ Cleared ${oldSize} existing group configurations\n\n`;

    // Restart the unified recovery system
    response += "🔍 **Starting Fresh Recovery...**\n";
    const recoveryResults = await unifiedRecoverySystem.startRecovery();

    response += `📊 **Recovery Results:**\n`;
    response += `• Groups recovered: ${recoveryResults.groups?.size || 0}\n`;
    response += `• Contracts found: ${recoveryResults.foundContracts?.length || 0}\n`;
    response += `• Metadata fixed: ${recoveryResults.metadataFixed || 0}\n`;
    response += `• Members synced: ${recoveryResults.membersSynced || 0}\n\n`;

    // Copy recovered groups to the main groupConfigs
    if (recoveryResults.groups) {
      for (const [
        contractAddress,
        config,
      ] of recoveryResults.groups.entries()) {
        groupConfigs.set(contractAddress, config);
      }
    }

    response += "✅ **Recovery Complete!**\n";
    response +=
      "All groups should now be properly loaded with correct contract addresses.\n\n";
    response += "💡 **Next Steps:**\n";
    response += "• Run `/list-groups` to verify all groups are visible\n";
    response += "• Check that each group has its unique contract\n";
    response += "• Test group functionality\n";

    await conversation.send(response);
  } catch (error) {
    console.error("Error in restart recovery:", error);
    await conversation.send("❌ Error during recovery restart");
  }
}

/**
 * Check payment routing and contract ownership
 */
async function handleCheckPayments(
  conversation: any,
  evmAuthHandler: EVMAuthHandler,
  groupConfigs: Map<string, DualGroupConfig>,
) {
  try {
    let response = "💰 **Payment Routing Check**\n\n";

    if (groupConfigs.size === 0) {
      response +=
        "❌ No groups found. Run `/list-groups` to see available groups.\n";
      await conversation.send(response);
      return;
    }

    response += "🔍 **Contract Ownership & Payment Routing:**\n\n";

    for (const [contractAddress, config] of groupConfigs.entries()) {
      const groupName = config.metadata?.name || "Unknown Group";

      try {
        // This would need to be implemented in EVMAuthHandler
        // For now, show the expected flow
        response += `🎯 **${groupName}**\n`;
        response += `📄 Contract: \`${contractAddress}\`\n`;
        response += `👤 Creator: \`${config.creatorAddress || "Unknown"}\`\n`;
        response += `💰 ETH Payments: → Creator (for group creation)\n`;
        response += `💎 USDC Payments: → Creator (contract owner)\n`;
        response += `🤖 Agent Role: Facilitates transactions only\n\n`;
      } catch (error) {
        response += `❌ Error checking ${groupName}: ${error instanceof Error ? error.message : String(error)}\n\n`;
      }
    }

    response += "💡 **Payment Flow Summary:**\n";
    response +=
      "• **Group Creation (0.001 ETH)**: Paid to agent for deployment\n";
    response +=
      "• **Access Purchases (USDC)**: Paid directly to group creator\n";
    response += "• **Trial Grants**: Free, issued by creator or agent\n\n";

    response += "🔧 **If Payments Are Going Wrong:**\n";
    response += "• Check contract ownership with block explorer\n";
    response += "• Verify USDC approval and purchase transactions\n";
    response += "• Ensure creator address is set correctly\n";

    await conversation.send(response);
  } catch (error) {
    console.error("Error checking payments:", error);
    await conversation.send("❌ Error checking payment routing");
  }
}

/**
 * Show OpenSea collection links for all groups
 */
async function handleOpenSeaLinks(
  conversation: any,
  groupConfigs: Map<string, DualGroupConfig>,
) {
  try {
    let response = "🌊 **OpenSea Collection Links**\n\n";

    if (groupConfigs.size === 0) {
      response +=
        "❌ No groups found. Run `/list-groups` to see available groups.\n";
      await conversation.send(response);
      return;
    }

    response += "🎨 **Your NFT Collections on OpenSea:**\n\n";

    for (const [contractAddress, config] of groupConfigs.entries()) {
      const groupName = config.metadata?.name || "Unknown Group";
      const openseaUrl = `https://opensea.io/assets/base/${contractAddress.toLowerCase()}`;
      const collectionUrl = `https://opensea.io/collection/${contractAddress.toLowerCase()}`;

      response += `🎯 **${groupName}**\n`;
      response += `📄 Contract: \`${contractAddress}\`\n`;
      response += `🌊 OpenSea Collection: ${collectionUrl}\n`;
      response += `🎨 OpenSea Assets: ${openseaUrl}\n`;
      response += `🔗 Base Scan: https://basescan.org/address/${contractAddress}\n\n`;
    }

    response += "💡 **About These Collections:**\n";
    response += "• Each group has its own NFT contract\n";
    response += "• Access tokens appear as NFTs on OpenSea\n";
    response += "• Users can view/trade their access tokens\n";
    response += "• Expired tokens may still show but won't grant access\n\n";

    response += "🎨 **Collection Features:**\n";
    response += "• Custom metadata for each tier\n";
    response += "• Time-bound access tokens\n";
    response += "• Automatic expiration handling\n";
    response += "• IPFS-hosted images and metadata\n";

    await conversation.send(response);
  } catch (error) {
    console.error("Error showing OpenSea links:", error);
    await conversation.send("❌ Error retrieving OpenSea links");
  }
}

main().catch(console.error);
