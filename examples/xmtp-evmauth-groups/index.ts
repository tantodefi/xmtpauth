import {
  createSigner,
  getEncryptionKeyFromHex,
  logAgentDetails,
  validateEnvironment,
} from "@helpers/client";
// Note: These content types would need to be installed separately if available
// import { TransactionReferenceCodec } from "@xmtp/content-type-transaction-reference";
// import {
//   ContentTypeWalletSendCalls,
//   WalletSendCallsCodec,
// } from "@xmtp/content-type-wallet-send-calls";
import {
  Client,
  IdentifierKind,
  type Group,
  type XmtpEnv,
} from "@xmtp/node-sdk";
import {
  ContentTypeWalletSendCalls,
  WalletSendCallsCodec,
} from "@xmtp/content-type-wallet-send-calls";
import { EVMAuthHandler } from "./src/handlers/evmauth-handler";
import { USDCHandler } from "./src/handlers/usdc-handler";
import { IPFSMetadataHandler } from "./src/handlers/ipfs-metadata";
import { EventDrivenAccessManager } from "./src/handlers/event-driven-access";
import { GroupManager } from "./src/managers/group-manager";
import { EnhancedTierSetup } from "./src/managers/enhanced-tier-setup";
import { EnhancedGroupManager } from "./src/managers/enhanced-group-flow";
import { RecoveryManager } from "./src/managers/recovery-mechanisms";
import { TokenSalesHandler } from "./src/utils/token-sales";
import { handleEnhancedCreateGroup, handleEnhancedBuyAccess } from "./src/utils/enhanced-create-group";
import { 
  handleCreateGroupWithPayment, 
  handleGrantTrial, 
  handleListGroups 
} from "./src/utils/enhanced-create-group-with-payment";
import { PaymentMonitor } from "./src/utils/payment-monitor";
import { JSONDatabase } from "./src/database/json-database";
import { ComprehensiveRecovery } from "./src/managers/comprehensive-recovery";
import { TestFlowManager } from "./src/test/test-flow";
import { PersistentStateManager } from "./src/utils/persistent-state";
import type { AccessTier, GroupMetadata, DualGroupConfig } from "./src/types/types";

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
const userTokens = new Map<string, { groupId: string; tokenId: string; expiresAt: Date }[]>();

async function main() {
  /* Create the signer and initialize client */
  const signer = createSigner(WALLET_KEY);
  const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);

  const client = await Client.create(signer, {
    dbEncryptionKey,
    env: XMTP_ENV as XmtpEnv,
    codecs: [new WalletSendCallsCodec()],
  });

  /* Get agent address */
  const identifier = await signer.getIdentifier();
  const agentAddress = identifier.identifier;

  const evmAuthHandler = new EVMAuthHandler(
    BASE_RPC_URL,
    EVMAUTH_FACTORY_ADDRESS,
    WALLET_KEY
  );

  // Initialize JSON database first
  const database = new JSONDatabase();
  await database.cleanupOldSessions();
  console.log("📊 Database stats:", database.getStats());

  const usdcHandler = new USDCHandler(BASE_RPC_URL, WALLET_KEY, false); // false = testnet
  const ipfsHandler = new IPFSMetadataHandler();
  
  // Enhanced dual-group manager with database
  const enhancedGroupManager = new EnhancedGroupManager(client, evmAuthHandler, database);
  const eventAccessManager = new EventDrivenAccessManager(client, BASE_RPC_URL, enhancedGroupManager, groupConfigs);
  const recoveryManager = new RecoveryManager(client, BASE_RPC_URL, enhancedGroupManager);
  const testFlowManager = new TestFlowManager(client, enhancedGroupManager, eventAccessManager, recoveryManager, groupConfigs);
  const groupManager = new GroupManager(client, evmAuthHandler);
  
  // Initialize enhanced tier setup with database
  const tierSetup = new EnhancedTierSetup(groupConfigs, database);
  
  // Initialize comprehensive recovery system
  const comprehensiveRecovery = new ComprehensiveRecovery(client, database);
  
  // Initialize persistent state manager (keep for compatibility)
  const persistentState = new PersistentStateManager();
  persistentState.cleanupOldRecords();
  
  // Payment monitoring system
  const paymentMonitor = new PaymentMonitor(BASE_RPC_URL, agentAddress, enhancedGroupManager, groupConfigs);
  const tokenSalesHandler = new TokenSalesHandler(evmAuthHandler, FEE_RECIPIENT, parseInt(FEE_BASIS_POINTS));

  void logAgentDetails(client);

  console.log("✓ Syncing conversations...");
  await client.conversations.sync();

  // Attempt recovery of existing groups
  console.log("🔄 Attempting to recover existing group configurations...");
  try {
    const recoveredConfigs = await recoveryManager.performFullRecovery();
    
    // Merge recovered configs with current groupConfigs
    for (const [contractAddress, config] of recoveredConfigs.entries()) {
      groupConfigs.set(contractAddress, config);
      // Add to event listening
      await eventAccessManager.addContractToListen(contractAddress, config);
    }
    
    if (recoveredConfigs.size > 0) {
      console.log(`✅ Recovered ${recoveredConfigs.size} group configurations`);
    } else {
      console.log("ℹ️ No existing groups found to recover");
    }
  } catch (error) {
    console.error("⚠️ Recovery failed, starting fresh:", error);
  }

  // Start enhanced membership management background task
  void startEnhancedMembershipManager(client, enhancedGroupManager);
  
  // Start event-driven access management
  void eventAccessManager.startEventListening();

  // Start payment monitoring system
  console.log("💰 Starting payment monitoring...");
  void paymentMonitor.startPaymentMonitoring();

  console.log("🚀 EVMAuth Groups Agent is running!");
  console.log("💰 Enhanced with USDC pricing and custom NFT images!");
  console.log("");
  console.log("Available commands:");
  console.log("  /create-group <name> - Create a new premium community (0.001 ETH)");
  console.log("  /grant-trial <group> <address> <days> - Grant free trial access (creators only)");
  console.log("  /list-groups - View your premium communities");
  console.log("  /buy-access <group_id> <tier_id> - Purchase access with USDC");
  console.log("  /my-tokens - View your access tokens");
  console.log("  /group-info <group_id> - Get group information and pricing");
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
    /* Ignore messages from the same agent or non-text messages */
    if (
      message.senderInboxId.toLowerCase() === client.inboxId.toLowerCase() ||
      message.contentType?.typeId !== "text"
    ) {
      continue;
    }

    console.log(
      `Received message: ${message.content as string} by ${message.senderInboxId}`
    );

    const conversation = await client.conversations.getConversationById(
      message.conversationId
    );

    if (!conversation) {
      console.log("Unable to find conversation, skipping");
      continue;
    }

    const inboxState = await client.preferences.inboxStateFromInboxIds([
      message.senderInboxId,
    ]);
    const memberAddress = inboxState[0].identifiers[0].identifier;
    if (!memberAddress) {
      console.log("Unable to find member address, skipping");
      continue;
    }

    const messageContent = message.content as string;
    const command = messageContent.toLowerCase().trim();

    try {
      // Check if user is in tier setup session first
      const tierSetupHandled = await tierSetup.handleTierSetupMessage(
        message.senderInboxId,
        messageContent,
        conversation,
        message.content, // Handle all content types (text, attachments, etc.)
        async (tiers: AccessTier[]) => {
          // Callback when tiers are completed
          const groupConfig = groupConfigs.get(tierSetup.getSession(message.senderInboxId)?.groupId || '');
          if (groupConfig) {
            groupConfig.tiers = tiers;
            await evmAuthHandler.setupAccessTiers(groupConfig.contractAddress, tiers);
          }
        }
      );

      if (tierSetupHandled) {
        // Message was handled by tier setup
        continue;
      }

      // Handle regular commands
      if (command.startsWith("/create-group")) {
        await handleCreateGroupWithPayment(conversation, memberAddress, message.senderInboxId, messageContent, enhancedGroupManager, groupConfigs, agentAddress, paymentMonitor, persistentState, database);
      } else if (command.startsWith("/setup-tiers")) {
        await handleEnhancedSetupTiers(conversation, message.senderInboxId, messageContent, tierSetup);
      } else if (command.startsWith("/grant-trial")) {
        await handleGrantTrial(conversation, memberAddress, message.senderInboxId, messageContent, groupConfigs);
      } else if (command === "/list-groups") {
        await handleListGroups(conversation, message.senderInboxId, groupConfigs);
      } else if (command.startsWith("/buy-access")) {
        await handleEnhancedBuyAccess(conversation, memberAddress, message.senderInboxId, messageContent, enhancedGroupManager, groupConfigs);
      } else if (command === "/my-tokens") {
        await handleMyTokens(conversation, message.senderInboxId);
      } else if (command.startsWith("/group-info")) {
        await handleGroupInfo(conversation, messageContent);
      } else if (command === "/help") {
        await handleHelp(conversation);
      } else if (command === "/test-system") {
        await handleTestSystem(conversation, testFlowManager);
      } else {
        await conversation.send(
          "Unknown command. Type /help for available commands."
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error processing command:", errorMessage);
      await conversation.send(
        "Sorry, I encountered an error processing your command."
      );
    }
  }
}

async function handleCreateGroup_OLD_DEPRECATED(
  conversation: any,
  creatorInboxId: string,
  messageContent: string,
  groupManager: GroupManager
): Promise<void> {
  // This function is deprecated - use handleEnhancedCreateGroup instead
  await conversation.send("❌ This command is deprecated. Use the enhanced version.");
  return;
  /*
  const parts = messageContent.split(" ");
  if (parts.length < 2) {
    await conversation.send(
      "Usage: /create-group <name>\nExample: /create-group \"My Premium Group\""
    );
    return;
  }

  const groupName = parts.slice(1).join(" ").replace(/"/g, "");
  
  await conversation.send("🔄 Creating your paid group...");

  try {
    const result = await groupManager.createPaidGroup({
      name: groupName,
      description: `Premium access group created via EVMAuth`,
      creatorInboxId,
    });

    groupConfigs.set(result.groupId, {
      groupId: result.groupId,
      contractAddress: result.contractAddress,
      tiers: [],
      metadata: {
        name: groupName,
        description: `Premium access group created via EVMAuth`,
      },
      creatorInboxId,
    });

    await conversation.send(
      `✅ Group created successfully!\n\n` +
      `📊 Group ID: \`${result.groupId}\`\n` +
      `🔗 Contract: \`${result.contractAddress}\`\n` +
      `💎 Group URL: https://xmtp.chat/conversations/${result.groupId}\n\n` +
      `Next steps:\n` +
      `1. Setup access tiers: \`/setup-tiers ${result.groupId}\`\n` +
      `2. Configure pricing and duration for each tier\n` +
      `3. Start selling access to your group!`
    );
  } catch (error) {
    console.error("Error creating group:", error);
    await conversation.send("❌ Failed to create group. Please try again.");
  }
  */
}

async function handleEnhancedSetupTiers(
  conversation: any,
  senderInboxId: string,
  messageContent: string,
  tierSetup: EnhancedTierSetup
) {
  const parts = messageContent.split(" ");
  if (parts.length < 2) {
    await conversation.send(
      "Usage: /setup-tiers <group_name_or_contract>\nExample: /setup-tiers dstealth"
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
      if (config.groupName?.toLowerCase() === identifier.toLowerCase() || 
          config.metadata?.name?.toLowerCase() === identifier.toLowerCase()) {
        groupConfig = config;
        contractAddress = address;
        break;
      }
    }
  }

  if (!groupConfig || !contractAddress) {
    await conversation.send("❌ Group not found. Use `/list-groups` to see available groups.");
    return;
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

async function handleBuyAccess(
  conversation: any,
  userAddress: string,
  messageContent: string,
  tokenSalesHandler: TokenSalesHandler
) {
  const parts = messageContent.split(" ");
  if (parts.length < 3) {
    await conversation.send(
      "Usage: /buy-access <group_id> <tier_id>\nExample: /buy-access abc123 premium"
    );
    return;
  }

  const groupId = parts[1];
  const tierId = parts[2];
  const groupConfig = groupConfigs.get(groupId);

  if (!groupConfig) {
    await conversation.send("❌ Group not found. Please check the group ID.");
    return;
  }

  const tier = groupConfig.tiers.find((t: AccessTier) => t.id === tierId);
  if (!tier) {
    await conversation.send(
      `❌ Tier not found. Available tiers: ${groupConfig.tiers
        .map((t: AccessTier) => t.id)
        .join(", ")}`
    );
    return;
  }

  await conversation.send("🔄 Generating purchase transaction...");

  try {
    const walletSendCalls = await tokenSalesHandler.createPurchaseTransaction(
      userAddress,
      groupConfig.contractAddress,
      tier
    );

    await conversation.send(
      `💰 **Purchase ${tier.name}**\n\n` +
      `🎯 Group: ${groupConfig.metadata.name}\n` +
      `⏰ Duration: ${tier.durationDays} days\n` +
      `💎 Price: ${parseFloat(tier.priceWei) / 1e18} ETH\n\n` +
      `Transaction details:\n` +
      `\`\`\`json\n${JSON.stringify(walletSendCalls, null, 2)}\n\`\`\`\n\n` +
      `Please use your wallet to send the transaction above.`
    );
  } catch (error) {
    console.error("Error creating purchase transaction:", error);
    await conversation.send("❌ Failed to create purchase transaction.");
  }
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
        `🎫 **${groupName}**\n` +
        `   Token ID: \`${token.tokenId}\`\n` +
        `   Status: ${status}\n` +
        `   Expires: ${token.expiresAt.toLocaleDateString()}\n`
      );
    })
    .join("\n");

  await conversation.send(`🎫 **Your Access Tokens**\n\n${tokenList}`);
}

async function handleGroupInfo(conversation: any, messageContent: string) {
  const parts = messageContent.split(" ");
  if (parts.length < 2) {
    await conversation.send(
      "Usage: /group-info <group_id>\nExample: /group-info abc123"
    );
    return;
  }

  const groupId = parts[1];
  const groupConfig = groupConfigs.get(groupId);

  if (!groupConfig) {
    await conversation.send("❌ Group not found. Please check the group ID.");
    return;
  }

  const tierInfo = groupConfig.tiers
    .map(
      (tier: AccessTier) =>
        `💎 **${tier.name}** (\`${tier.id}\`)\n` +
        `   ${tier.durationDays} days - ${parseFloat(tier.priceWei) / 1e18} ETH\n` +
        `   ${tier.description}\n`
    )
    .join("\n");

  await conversation.send(
    `📊 **${groupConfig.metadata.name}**\n\n` +
    `${groupConfig.metadata.description}\n\n` +
    `🔗 Contract: \`${groupConfig.contractAddress}\`\n` +
    `💎 Group URL: https://xmtp.chat/conversations/${groupId}\n\n` +
    `**Access Tiers:**\n${tierInfo}\n` +
    `Purchase access with: \`/buy-access ${groupId} <tier_id>\``
  );
}

async function handleHelp(conversation: any) {
  await conversation.send(
    `🤖 **EVMAuth Groups Agent - Enhanced Edition**\n\n` +
    `Create and monetize premium XMTP groups with custom USDC pricing and NFT images!\n\n` +
    `**Commands:**\n` +
    `📊 \`/create-group <name>\` - Create a new paid group\n` +
    `⚙️ \`/setup-tiers <group_id>\` - Interactive tier setup with custom pricing\n` +
    `💰 \`/buy-access <group_id> <tier_id>\` - Purchase access with USDC\n` +
    `🎫 \`/my-tokens\` - View your access tokens\n` +
    `📄 \`/group-info <group_id>\` - Get group information\n` +
    `❓ \`/help\` - Show this help message\n\n` +
    `**Enhanced Features:**\n` +
    `💵 **USDC Pricing**: Set prices in USD (e.g., $5.99 for 30 days)\n` +
    `🎨 **Custom NFT Images**: Upload your own artwork for access tokens\n` +
    `📁 **IPFS Storage**: Decentralized metadata and image storage\n` +
    `🔧 **Interactive Setup**: Guided tier creation process\n` +
    `⚖️ **Base Network**: Low gas fees, fast transactions\n` +
    `⏰ **Time-bound Access**: Automatic expiry and membership management\n\n` +
    `**Example Tier Setup:**\n` +
    `Format: \`Name | Price | Duration\`\n` +
    `• \`Basic Access | $5 | 7 days\`\n` +
    `• \`Premium | $15.99 | 30 days\`\n` +
    `• \`VIP Membership | $50 | 90 days\`\n\n` +
    `Start by creating a group, then setup your custom tiers!`
  );
}

async function startEnhancedMembershipManager(
  client: Client,
  enhancedGroupManager: EnhancedGroupManager
) {
  console.log("🔄 Starting enhanced membership manager...");
  
  setInterval(async () => {
    try {
      console.log("🔍 Running membership audit...");
      
      for (const [contractAddress, config] of groupConfigs.entries()) {
        // Safe access to config properties
        const groupName = config.metadata?.name || config.groupName || 'Unknown Group';
        console.log(`Auditing group: ${groupName} (${contractAddress})`);
        
        const auditResults = await enhancedGroupManager.auditGroupMembership(contractAddress);
        
        if (auditResults.addedMembers.length > 0) {
          console.log(`✅ Added ${auditResults.addedMembers.length} new members`);
        }
        
        if (auditResults.removedMembers.length > 0) {
          console.log(`❌ Removed ${auditResults.removedMembers.length} expired members`);
        }
      }
      
      console.log("✅ Membership audit complete");
    } catch (error) {
      console.error("Error in enhanced membership manager:", error);
    }
  }, 60000); // Check every minute
}

async function handleTestSystem(conversation: any, testFlowManager: TestFlowManager) {
  await conversation.send(
    `🧪 **Running System Test**\n\n` +
    `Testing all enhanced features...\n` +
    `This may take 1-2 minutes.`
  );

  try {
    const testResults = await testFlowManager.runCompleteTest();
    
    await conversation.send(
      `🧪 **Test Results**\n\n` +
      `Overall: ${testResults.success ? '🎉 SUCCESS' : '❌ FAILED'}\n\n` +
      `**Component Tests:**\n` +
      `• Group Creation: ${testResults.results.groupCreation ? '✅' : '❌'}\n` +
      `• Tier Setup: ${testResults.results.tierSetup ? '✅' : '❌'}\n` +
      `• Membership Mgmt: ${testResults.results.membershipManagement ? '✅' : '❌'}\n` +
      `• Event Listening: ${testResults.results.eventListening ? '✅' : '❌'}\n` +
      `• Recovery: ${testResults.results.recovery ? '✅' : '❌'}\n\n` +
      (testResults.errors.length > 0 ? 
        `**Errors:**\n${testResults.errors.map(e => `• ${e}`).join('\n')}` : 
        `All systems operational! 🚀`)
    );
  } catch (error) {
    await conversation.send(
      `❌ **Test Failed**\n\n` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

main().catch(console.error);