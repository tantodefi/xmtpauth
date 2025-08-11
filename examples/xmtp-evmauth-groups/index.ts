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
  ContentTypeWalletSendCalls,
  WalletSendCallsCodec,
} from "@xmtp/content-type-wallet-send-calls";
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
import { JSONDatabase } from "./src/database/json-database";
import { EventDrivenAccessManager } from "./src/handlers/event-driven-access";
import { EVMAuthHandler } from "./src/handlers/evmauth-handler";
import { IPFSMetadataHandler } from "./src/handlers/ipfs-metadata";
import { USDCHandler } from "./src/handlers/usdc-handler";
import { ComprehensiveRecovery } from "./src/managers/comprehensive-recovery";
import { EnhancedGroupManager } from "./src/managers/enhanced-group-flow";
import { EnhancedTierSetup } from "./src/managers/enhanced-tier-setup";
import { GroupManager } from "./src/managers/group-manager";
import { RecoveryManager } from "./src/managers/recovery-mechanisms";
import { TestFlowManager } from "./src/test/test-flow";
import type {
  AccessTier,
  DualGroupConfig,
  GroupMetadata,
} from "./src/types/types";
import {
  handleEnhancedBuyAccess,
  handleEnhancedCreateGroup,
} from "./src/utils/enhanced-create-group";
import {
  handleCreateGroupWithPayment,
  handleGrantTrial,
  handleListGroups,
} from "./src/utils/enhanced-create-group-with-payment";
import { PaymentMonitor } from "./src/utils/payment-monitor";
import { PersistentStateManager } from "./src/utils/persistent-state";
import { TokenSalesHandler } from "./src/utils/token-sales";

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

async function main() {
  /* Create the signer and initialize client */
  const signer = createSigner(WALLET_KEY);
  const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);

  const client = await Client.create(signer, {
    dbEncryptionKey,
    env: XMTP_ENV as XmtpEnv,
    codecs: [new WalletSendCallsCodec(), new ReactionCodec()],
  });

  /* Get agent address */
  const identifier = await signer.getIdentifier();
  const agentAddress = identifier.identifier;

  const evmAuthHandler = new EVMAuthHandler(
    BASE_RPC_URL,
    EVMAUTH_FACTORY_ADDRESS,
    WALLET_KEY,
  );

  // Initialize JSON database first
  const database = new JSONDatabase();
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
  const recoveryManager = new RecoveryManager(
    textClient,
    BASE_RPC_URL,
    enhancedGroupManager,
  );
  const testFlowManager = new TestFlowManager(
    textClient,
    enhancedGroupManager,
    eventAccessManager,
    recoveryManager,
    groupConfigs,
  );
  const groupManager = new GroupManager(textClient, evmAuthHandler);

  // Initialize enhanced tier setup with database
  const tierSetup = new EnhancedTierSetup(usdcHandler, ipfsHandler);

  // Initialize comprehensive recovery system
  const comprehensiveRecovery = new ComprehensiveRecovery(
    textClient as any,
    database,
  );

  // Initialize persistent state manager (keep for compatibility)
  const persistentState = new PersistentStateManager();
  persistentState.cleanupOldRecords();

  // Payment monitoring system
  const paymentMonitor = new PaymentMonitor(
    BASE_RPC_URL,
    agentAddress,
    enhancedGroupManager,
    groupConfigs,
  );
  const tokenSalesHandler = new TokenSalesHandler(
    evmAuthHandler,
    FEE_RECIPIENT,
    parseInt(FEE_BASIS_POINTS),
  );

  void logAgentDetails(textClient as any);

  console.log("✓ Syncing conversations...");
  await textClient.conversations.sync();

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
          metadata: { name: group.name },
          tiers: group.tiers || [],
          premiumSettings: {
            welcomeMessage: `Welcome to ${group.name}! 🎉`,
          },
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

  // Start enhanced membership management background task
  void startEnhancedMembershipManager(textClient as any, enhancedGroupManager);

  // Start event-driven access management with improved polling system
  void eventAccessManager.startEventListening();

  // Start payment monitoring system
  console.log("💰 Starting payment monitoring...");
  void paymentMonitor.startPaymentMonitoring();

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
    const memberAddress = inboxState[0].identifiers[0].identifier;
    if (!memberAddress) {
      console.log("Unable to find member address, skipping");
      continue;
    }

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
      // Check if user is in tier setup session first
      const tierSetupHandled = await tierSetup.handleTierSetupMessage(
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
        await handleGrantTrial(
          conversation,
          memberAddress,
          message.senderInboxId,
          messageContent,
          groupConfigs,
        );
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
      } else if (command === "/help") {
        await handleHelp(conversation);
      } else if (command === "/test-system") {
        await handleTestSystem(conversation, testFlowManager);
      } else {
        // Contextual welcome/help
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
        } else {
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

async function handleCreateGroup_OLD_DEPRECATED(
  conversation: any,
  creatorInboxId: string,
  messageContent: string,
  groupManager: GroupManager,
): Promise<void> {
  // This function is deprecated - use handleEnhancedCreateGroup instead
  await conversation.send(
    "❌ This command is deprecated. Use the enhanced version.",
  );
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

async function handleBuyAccess(
  conversation: any,
  userAddress: string,
  messageContent: string,
  tokenSalesHandler: TokenSalesHandler,
) {
  const parts = messageContent.split(" ");
  if (parts.length < 3) {
    await conversation.send(
      "Usage: /buy-access <group_id> <tier_id>\nExample: /buy-access abc123 premium",
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
        .join(", ")}`,
    );
    return;
  }

  await conversation.send("🔄 Generating purchase transaction...");

  try {
    const walletSendCalls = await tokenSalesHandler.createPurchaseTransaction(
      userAddress,
      groupConfig.contractAddress,
      tier,
    );

    await conversation.send(
      `💰 Purchase ${tier.name}\n\n` +
        `🎯 Group: ${groupConfig.metadata.name}\n` +
        `⏰ Duration: ${tier.durationDays} days\n` +
        `💎 Price: ${parseFloat(tier.priceWei) / 1e18} ETH\n\n` +
        `Transaction details:\n` +
        `\`\`\`json\n${JSON.stringify(walletSendCalls, null, 2)}\n\`\`\`\n\n` +
        `Please use your wallet to send the transaction above.`,
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
    // Fallback to DB
    try {
      const rec = await new JSONDatabase().requireGroupByContract(groupId);
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
  const db = new JSONDatabase();
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
    // 1) Prefer DB USD price for stability
    if (dbPrices[tokenId]) {
      priceDisplay = `$${dbPrices[tokenId].toFixed(2)} USD`;
    } else if (
      typeof (tier as any).priceUSD === "number" &&
      (tier as any).priceUSD > 0
    ) {
      priceDisplay = `$${(tier as any).priceUSD.toFixed(2)} USD`;
    } else {
      // 2) Fallback to on-chain
      try {
        const on = await evmForInfo.readTierInfo(
          groupConfig.contractAddress,
          tokenId,
        );
        if (on && on.priceUSDC && on.priceUSDC > 0n) {
          const usdc = Number(on.priceUSDC) / 1_000_000;
          priceDisplay = `${usdc} USDC`;
        } else if (on && on.priceWei && on.priceWei > 0n) {
          const eth = Number(on.priceWei) / 1e18;
          priceDisplay = `${eth} ETH`;
        } else {
          priceDisplay = "Free";
        }
      } catch {
        priceDisplay = "Pricing unavailable";
      }
    }
    lines.push(
      `💎 **${tier.name}** (\`${tier.id}\`)\n` +
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
        userGroups = dbGroups.map((g) => ({
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

    if (ethBalance === 0n && usdcBalance === 0n) {
      await conversation.send(
        "💰 No funds to withdraw from this contract.\n\n" +
          `Contract: ${contractAddress}\n` +
          "ETH Balance: 0.000000 ETH\n" +
          "USDC Balance: $0.00 USDC",
      );
      return;
    }

    await conversation.send(
      "💰 Withdrawing funds...\n\n" +
        `Contract: ${contractAddress}\n` +
        `ETH Balance: ${(Number(ethBalance) / 1e18).toFixed(6)} ETH\n` +
        `USDC Balance: $${(Number(usdcBalance) / 1e6).toFixed(2)} USDC\n\n` +
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
      `🔍 \`/check-purchase <contract>\` - Check for recent NFT purchase\n` +
      `💰 \`/withdraw <contract>\` - Withdraw earnings from your groups\n` +
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

async function handleTestSystem(
  conversation: any,
  testFlowManager: TestFlowManager,
) {
  await conversation.send(
    `🧪 **Running System Test**\n\n` +
      `Testing all enhanced features...\n` +
      `This may take 1-2 minutes.`,
  );

  try {
    const testResults = await testFlowManager.runCompleteTest();

    await conversation.send(
      `🧪 **Test Results**\n\n` +
        `Overall: ${testResults.success ? "🎉 SUCCESS" : "❌ FAILED"}\n\n` +
        `**Component Tests:**\n` +
        `• Group Creation: ${testResults.results.groupCreation ? "✅" : "❌"}\n` +
        `• Tier Setup: ${testResults.results.tierSetup ? "✅" : "❌"}\n` +
        `• Membership Mgmt: ${testResults.results.membershipManagement ? "✅" : "❌"}\n` +
        `• Event Listening: ${testResults.results.eventListening ? "✅" : "❌"}\n` +
        `• Recovery: ${testResults.results.recovery ? "✅" : "❌"}\n\n` +
        (testResults.errors.length > 0
          ? `**Errors:**\n${testResults.errors.map((e) => `• ${e}`).join("\n")}`
          : `All systems operational! 🚀`),
    );
  } catch (error) {
    await conversation.send(
      `❌ **Test Failed**\n\n` +
        `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

main().catch(console.error);
