// Local createSigner function
import { NeynarAPIClient } from "@neynar/nodejs-sdk";
import { Agent, f, withFilter } from "@xmtp/agent-sdk";
import {
  ContentTypeReaction,
  ReactionCodec,
} from "@xmtp/content-type-reaction";
import { RemoteAttachmentCodec } from "@xmtp/content-type-remote-attachment";
import {
  ContentTypeTransactionReference,
  TransactionReferenceCodec,
  type TransactionReference,
} from "@xmtp/content-type-transaction-reference";
import {
  ContentTypeWalletSendCalls,
  WalletSendCallsCodec,
  type WalletSendCallsParams,
} from "@xmtp/content-type-wallet-send-calls";
import {
  Client,
  Group,
  IdentifierKind,
  type Conversation,
} from "@xmtp/node-sdk";
// Local createSigner function imports
import { createWalletClient, encodeFunctionData, http, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
// Import EVMAuth components from v1 agent
import {
  EnhancedGroupManager,
  EVMAuthHandler,
  GroupManager,
  USDCHandler,
} from "../../xmtp-evmauth-groups/src/index.js";
import { JSONDatabase } from "./database/JSONDatabase.js";
import { MegaPotManager } from "./managers/MegaPotManager.js";
import {
  ActionsCodec,
  ContentTypeActions,
  type ActionsContent,
} from "./types/ActionsContent.js";
import {
  ContentTypeIntent,
  IntentCodec,
  type IntentContent,
} from "./types/IntentContent.js";

// Environment variables loaded via tsx --env-file .env

// Full environment validation for v1 agent functionality
const requiredEnvVars = [
  "XMTP_WALLET_KEY",
  "XMTP_DB_ENCRYPTION_KEY",
  "XMTP_ENV",
  "BASE_RPC_URL",
  "EVMAUTH_FACTORY_ADDRESS",
  "MEGAPOT_CONTRACT_ADDRESS",
  "MEGAPOT_USDC_ADDRESS",
];

// Set default values for development/testing if env vars are missing
const defaultEnvVars: Record<string, string> = {
  XMTP_WALLET_KEY:
    "0x1234567890123456789012345678901234567890123456789012345678901234",
  XMTP_DB_ENCRYPTION_KEY: "test_encryption_key_12345",
  XMTP_ENV: "dev",
  BASE_RPC_URL: "https://mainnet.base.org",
  EVMAUTH_FACTORY_ADDRESS: "0xa8830A603aE5143a1f8BAA46e28C36e4765EC754",
  MEGAPOT_CONTRACT_ADDRESS: "0x6f03c7BCaDAdBf5E6F5900DA3d56AdD8FbDac5De",
  MEGAPOT_USDC_ADDRESS: "0xA4253E7C13525287C56550b8708100f93E60509f",
  NEYNAR_API_KEY: "test_neynar_api_key", // For development/testing
};

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    if (defaultEnvVars[envVar]) {
      process.env[envVar] = defaultEnvVars[envVar];
      console.warn(
        `⚠️ Using default value for ${envVar} (for development/testing only)`,
      );
    } else {
      console.error(`❌ Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
  }
}

function createSigner(privateKey: `0x${string}`): Signer {
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  return {
    type: "EOA",
    getIdentifier: () => ({
      identifierKind: IdentifierKind.Ethereum,
      identifier: account.address.toLowerCase(),
    }),
    signMessage: async (message: string) => {
      const signature = await wallet.signMessage({
        message,
        account,
      });
      return toBytes(signature);
    },
  };
}

/**
 * Handle natural language MegaPot commands
 */
async function handleNaturalLanguageMegaPot(
  ctx: any,
  content: string,
  megaPotManager: any,
): Promise<void> {
  const lowerContent = content.toLowerCase();

  // Check for buy tickets commands
  const buyTicketRegex =
    /(?:hey\s+)?(?:xmtpauth|xmpt|agent)\s+buy\s+(\d+)\s+tickets?\s+(?:now|please|for me)/i;
  const buyTicketMatch = content.match(buyTicketRegex);

  if (buyTicketMatch) {
    const numTickets = parseInt(buyTicketMatch[1]);
    if (numTickets > 0 && numTickets <= 100) {
      // Reasonable limit
      try {
        await ctx.sendTextReply(
          `🎫 Purchasing ${numTickets} MegaPot tickets...`,
        );

        const result = await megaPotManager.buyTickets(numTickets, {
          groupId: "direct-purchase",
          groupName: "Direct Purchase",
          contractAddress: "0x0000000000000000000000000000000000000000",
          purchaserInboxId: "unknown",
          source: "manual",
        });

        const successActions: ActionsContent = {
          id: `nlp-ticket-purchase-${Date.now()}`,
          description: `✅ Tickets Purchased Successfully!\n\n🎫 ${numTickets} tickets bought\n💰 Cost: ${megaPotManager.formatAmount(result.cost)}\n🔗 Transaction: ${result.txHash}\n\nGood luck! 🍀`,
          actions: [
            {
              id: "megapot-status",
              label: "📊 View Status",
              style: "primary",
            },
            {
              id: "buy-tickets",
              label: "🎫 Buy More",
              style: "secondary",
            },
          ],
        };

        await safeSend(ctx, successActions, ContentTypeActions);
        return;
      } catch (error) {
        await ctx.sendTextReply(
          `❌ Failed to purchase tickets: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
    }
  }

  // Check for scheduled purchase commands
  const scheduleRegex =
    /(?:hey\s+)?(?:xmtpauth|xmpt|agent)\s+buy\s+(\d+)\s+tickets?\s+(?:every|each)\s+(day|week|month)(?:\s+for\s+(\d+)\s+(?:days?|weeks?|months?))?/i;
  const scheduleMatch = content.match(scheduleRegex);

  if (scheduleMatch) {
    const tickets = parseInt(scheduleMatch[1]);
    const frequency = scheduleMatch[2] as "day" | "week" | "month";
    const durationStr = scheduleMatch[3];
    const duration = durationStr ? parseInt(durationStr) : 30; // Default 30 periods

    if (tickets > 0 && tickets <= 50) {
      // Reasonable limits
      try {
        const freqMap = {
          day: "daily",
          week: "weekly",
          month: "monthly",
        } as const;
        const mappedFrequency = freqMap[frequency];

        const purchase = megaPotManager.createScheduledPurchase(
          tickets,
          mappedFrequency,
          duration,
        );

        const confirmActions: ActionsContent = {
          id: `nlp-schedule-confirm-${Date.now()}`,
          description: `✅ Scheduled Purchase Created!\n\n🎫 ${tickets} ticket${tickets > 1 ? "s" : ""} ${mappedFrequency} for ${duration} ${frequency}${duration > 1 ? "s" : ""}\n🆔 ID: ${purchase.id}\n📅 Next Purchase: ${purchase.nextPurchase.toLocaleString()}\n\nI'll automatically purchase tickets at the scheduled times.`,
          actions: [
            {
              id: "megapot-status",
              label: "📊 View Schedules",
              style: "primary",
            },
            {
              id: "config-megapot",
              label: "⚙️ Configure",
              style: "secondary",
            },
          ],
        };

        await safeSend(ctx, confirmActions, ContentTypeActions);
        return;
      } catch (error) {
        await ctx.sendTextReply(
          `❌ Failed to schedule purchase: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
    }
  }

  // Check for MegaPot status queries
  if (
    lowerContent.includes("megapot") &&
    (lowerContent.includes("status") ||
      lowerContent.includes("how") ||
      lowerContent.includes("what"))
  ) {
    // Trigger status command by simulating the command
    const statusActions: ActionsContent = {
      id: `nlp-status-${Date.now()}`,
      description: "🎰 Here's your MegaPot status:",
      actions: [
        {
          id: "megapot-status",
          label: "📊 View Full Status",
          style: "primary" as const,
        },
      ],
    };
    await safeSend(ctx, statusActions, ContentTypeActions);
    return;
  }

  // Check for ticket count queries
  if (
    (lowerContent.includes("how many") || lowerContent.includes("what")) &&
    lowerContent.includes("ticket")
  ) {
    try {
      const stats = await megaPotManager.getStats();
      await ctx.sendTextReply(
        `🎫 You've purchased ${stats.totalTicketsPurchased} MegaPot tickets total, spending ${megaPotManager.formatAmount(stats.totalSpent)} and winning ${megaPotManager.formatAmount(stats.totalWinnings)}!`,
      );
      return;
    } catch (error) {
      console.error("Error getting ticket stats:", error);
    }
  }
}

/**
 * Start periodic winnings checker
 */
function startWinningsChecker(
  megaPotManager: any,
  agent: any,
  groupManager: any,
): void {
  // Check for winnings every 5 minutes
  const winningsInterval = setInterval(
    async () => {
      try {
        const winnings = await megaPotManager.checkWinnings();
        const config = megaPotManager.getConfig();

        if (parseFloat(winnings.winnings) > 0 && config.groupShareWinnings) {
          await shareWinningsWithGroups(
            agent,
            groupManager,
            winnings.winnings,
            megaPotManager,
          );
        }
      } catch (error) {
        console.error("❌ Error checking winnings:", error);
      }
    },
    5 * 60 * 1000,
  ); // 5 minutes

  // Clear interval on process exit
  process.on("exit", () => {
    clearInterval(winningsInterval);
  });
}

/**
 * Share winnings with all user groups
 */
async function shareWinningsWithGroups(
  agent: any,
  groupManager: any,
  winningsAmount: string,
  megaPotManager: any,
): Promise<void> {
  try {
    console.log(
      `🎉 Sharing MegaPot winnings: ${winningsAmount} ETH with groups`,
    );

    // Get all user groups
    const groups = await groupManager.getAllGroups();

    const winningsMessage = `🎰 MEGA WIN! 🎰\n\nI just won ${megaPotManager.formatAmount(winningsAmount)} in the MegaPot lottery! 🎉\n\nThis win will be shared with all group members. Stay tuned for more lottery fun! 🍀`;

    // Send to each group
    for (const group of groups) {
      try {
        const conversation =
          await agent.client.conversations.getConversationById(
            group.conversationId,
          );
        if (conversation) {
          await conversation.send(winningsMessage);
        }
      } catch (error) {
        console.error(
          `❌ Failed to send winnings message to group ${group.id}:`,
          error,
        );
      }
    }
  } catch (error) {
    console.error("❌ Error sharing winnings with groups:", error);
  }
}

async function main() {
  console.log("🚀 Starting XMTPAuth Agent with Agent SDK...");

  console.log(
    "🔑 XMTP_WALLET_KEY loaded:",
    process.env.XMTP_WALLET_KEY ? "YES" : "NO",
  );

  // Track used button sets to prevent multiple clicks (declared early)
  const usedButtonSets = new Set<string>();
  const activeButtonSets = new Map<string, Set<string>>();

  // Reset button state on startup for clean slate
  console.log("🧹 Resetting button state for clean startup...");
  usedButtonSets.clear();
  activeButtonSets.clear();

  // Helper functions declared early to avoid scope issues
  function registerActiveButtons(userInboxId: string, actions: any[]) {
    // Always start with a fresh set for this user
    activeButtonSets.set(userInboxId, new Set());
    const userButtons = activeButtonSets.get(userInboxId)!;
    actions.forEach((action) => {
      if (action.id) {
        userButtons.add(action.id);
        console.log(
          `🔘 Registered button: ${action.id} for user ${userInboxId}`,
        );
      }
    });
    console.log(
      `📋 Active buttons for ${userInboxId}: ${Array.from(userButtons).join(", ")}`,
    );
  }

  function clearActiveButtons(userInboxId: string) {
    console.log(`🧹 Clearing active buttons for user ${userInboxId}`);
    activeButtonSets.delete(userInboxId);
  }

  // Helper function to determine group context
  function getGroupContext(conversation: any): {
    groupInfo: any;
    isGroupContext: boolean;
  } {
    let groupInfo: any = null;
    let isGroupContext = false;

    try {
      console.log(`🔍 Checking conversation type:`, typeof conversation);
      console.log(
        `🔍 Conversation constructor:`,
        conversation?.constructor?.name,
      );
      console.log(
        `🔍 Has group properties:`,
        conversation?.name ? "YES" : "NO",
      );
      console.log(
        `🔍 Has members method:`,
        typeof conversation?.members === "function" ? "YES" : "NO",
      );

      // Check if we're in a group context - try multiple approaches
      if (conversation instanceof Group) {
        console.log(`✅ Group instance detected via instanceof!`);
        isGroupContext = true;
        const group = conversation as Group;
        console.log(`📋 Group name: ${group.name}`);
        console.log(`📋 Group ID: ${group.id}`);
      } else if (
        conversation?.name &&
        typeof conversation?.members === "function"
      ) {
        console.log(`✅ Group instance detected via properties!`);
        isGroupContext = true;
        const group = conversation as any; // Cast to any to access group properties
        console.log(`📋 Group name: ${group.name}`);
        console.log(`📋 Group ID: ${group.id}`);
      } else {
        console.log(
          `📋 DM context detected - conversation doesn't appear to be a Group`,
        );
        console.log(
          `📋 Available properties:`,
          Object.keys(conversation || {}),
        );
      }

      if (isGroupContext) {
        const group = conversation as any;
        console.log(`📋 Group configs count: ${groupConfigs.size}`);

        // Look up group info from our stored groups
        for (const [contractAddress, config] of groupConfigs.entries()) {
          console.log(`🔍 Checking contract: ${contractAddress}`);
          console.log(`🔍 Sales group ID: ${config.salesGroupId}`);
          console.log(`🔍 Premium group ID: ${config.premiumGroupId}`);
          if (
            config.salesGroupId === group.id ||
            config.premiumGroupId === group.id
          ) {
            groupInfo = {
              groupId: group.id,
              groupName: config.groupName,
              contractAddress: contractAddress,
            };
            console.log(`📋 Found stored group: ${group.name} (${group.id})`);
            break;
          }
        }

        // If not in stored groups but we're in a group context, create basic group info
        if (!groupInfo) {
          groupInfo = {
            groupId: group.id,
            groupName: group.name || "Unknown Group",
            contractAddress: "unknown", // Not managed by our agent
          };
          console.log(
            `📋 Unmanaged group context: ${group.name} (${group.id})`,
          );
        }
      }
    } catch (error) {
      console.warn("Could not determine group context:", error);
      console.warn("Error details:", error.stack);
    }

    console.log(
      `🎯 Final result: isGroupContext=${isGroupContext}, groupInfo=${groupInfo ? "YES" : "NO"}`,
    );
    return { groupInfo, isGroupContext };
  }

  try {
    // Create a minimal agent first to test basic functionality
    console.log("🔧 Creating minimal agent...");
    const agent = await Agent.create(undefined, {
      env: "dev",
      dbPath: null, // in-memory
      codecs: [
        new ReactionCodec(),
        new RemoteAttachmentCodec(),
        new TransactionReferenceCodec(),
        new WalletSendCallsCodec(),
        new ActionsCodec(),
        new IntentCodec(),
      ],
    });
    console.log("✅ Agent created successfully!");
    console.log("🎉 XMTPAuth Agent is running!");
    console.log(
      `🔗 Test URL: http://xmtp.chat/dm/${agent.client.inboxId || "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc"}`,
    );
    console.log("\n💬 Features:");
    console.log("  • Basic XMTP messaging");
    console.log("  • Reaction support");
    console.log("  • Remote attachments");
    console.log("  • Transaction references");
    console.log("  • Wallet send calls");
    console.log("\nTry messaging the agent with 'gm' or 'hello'");

    // Initialize EVMAuth components from v1 agent
    const evmAuthHandler = new EVMAuthHandler(
      process.env.BASE_RPC_URL!,
      process.env.EVMAUTH_FACTORY_ADDRESS!,
      process.env.XMTP_WALLET_KEY!,
    );

    const database = new JSONDatabase(getDataDir());
    await database.cleanupOldSessions();
    console.log("📊 Database stats:", database.getStats());

    const usdcHandler = new USDCHandler(
      process.env.BASE_RPC_URL!,
      process.env.XMTP_WALLET_KEY!,
      false, // false = testnet
    );

    // Enhanced dual-group manager with database
    const enhancedGroupManager = new EnhancedGroupManager(
      agent.client,
      evmAuthHandler,
      database,
    );

    const groupManager = new GroupManager(agent.client, evmAuthHandler);

    // Initialize MegaPot manager
    const megaPotManager = new MegaPotManager(
      process.env.BASE_RPC_URL!,
      process.env.XMTP_WALLET_KEY! as `0x${string}`,
      database,
      {
        contractAddress: process.env.MEGAPOT_CONTRACT_ADDRESS! as `0x${string}`,
        usdcAddress: process.env.MEGAPOT_USDC_ADDRESS! as `0x${string}`,
        referrerAddress:
          (process.env.MEGAPOT_REFERRER_ADDRESS as `0x${string}`) ||
          (process.env.XMTP_WALLET_KEY! as `0x${string}`),
      },
    );

    // Set global reference for cleanup
    globalMegaPotManager = megaPotManager;

    // Initialize Neynar client for user mentions
    const neynarApiKey = process.env.NEYNAR_API_KEY || "test_neynar_api_key";
    console.log(
      `🔑 Neynar API Key configured: ${neynarApiKey !== "test_neynar_api_key" ? "YES" : "NO"}`,
    );

    const neynar = new NeynarAPIClient({
      apiKey: neynarApiKey,
    });

    // Helper function to get display name from address
    async function getDisplayName(address: string): Promise<string> {
      try {
        console.log(`🔍 Resolving display name for: ${address}`);

        // Try Neynar API lookup by custody address (wallet address)
        try {
          console.log(`📡 Trying Neynar lookupUserByCustodyAddress...`);
          const response = await neynar.lookupUserByCustodyAddress({
            custodyAddress: address,
          });

          console.log(`📡 Neynar response:`, JSON.stringify(response, null, 2));

          if (response.result?.user) {
            const user = response.result.user;
            console.log(`👤 Found user:`, JSON.stringify(user, null, 2));

            if (user.display_name && user.display_name.trim()) {
              console.log(`✅ Using display_name: ${user.display_name}`);
              return user.display_name;
            } else if (user.username && user.username.trim()) {
              console.log(`✅ Using username: @${user.username}`);
              return `@${user.username}`;
            }
          }

          console.log(`❌ No user found for custody address: ${address}`);
        } catch (neynarError) {
          console.warn(
            "❌ Neynar lookupUserByCustodyAddress failed:",
            neynarError.message,
          );
          console.warn(
            "This might be due to invalid API key or network issues",
          );
        }

        // Fallback to basename format when Neynar is unavailable
        const baseName = `${address.slice(0, 6)}...${address.slice(-4)}`;
        console.log(`🔄 Using basename fallback: ${baseName}`);
        return baseName;
      } catch (error) {
        console.warn("❌ Could not resolve display name:", error);
        // Final fallback to truncated address
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
      }
    }

    // Group configurations storage
    const groupConfigs = new Map<string, any>();

    // Helper function to get data directory path
    function getDataDir(): string {
      return process.env.NODE_ENV === "production" ? "/app/data" : "./.data";
    }

    // Message handlers for text and intent messages
    console.log("🔧 Setting up message handlers...");

    // Handle text messages
    agent.on(
      "message",
      withFilter(f.and(f.notFromSelf, f.textOnly), async (ctx) => {
        const content = ctx.message.content as string;
        console.log(
          `📨 Processing text message: "${content}" from ${ctx.message.senderInboxId}`,
        );

        // Add a reaction to the message we just received (Unicode emoji) - non-blocking
        ctx.conversation
          .send(
            {
              reference: ctx.message.id,
              action: "added",
              content: "👀",
              schema: "unicode",
            },
            ContentTypeReaction,
          )
          .catch((error) => {
            console.error("❌ Failed to send reaction:", error);
          });

        // Check if in group context - require mention for all commands except navigation
        const { isGroupContext } = getGroupContext(ctx.conversation);
        const isNavigationCommand =
          content.startsWith("/help") || content.startsWith("/list-commands");

        if (
          isGroupContext &&
          !content.includes("@xmtpauth.base.eth") &&
          !isNavigationCommand
        ) {
          console.log(
            "🚫 Ignoring command in group - agent not mentioned:",
            content,
          );
          return;
        }

        // Handle basic commands
        if (
          content.toLowerCase().includes("gm") ||
          content.toLowerCase().includes("hello")
        ) {
          console.log("📨 Handling greeting");
          await handleHelpCommand(ctx.conversation, ctx.message.senderInboxId);
        } else if (content.startsWith("/help")) {
          console.log("📨 Handling /help");
          await handleHelpCommand(ctx.conversation, ctx.message.senderInboxId);
        } else if (content.startsWith("/create-group")) {
          console.log("📨 Handling /create-group");
          await handleCreateGroupCommand(
            ctx.conversation,
            content,
            ctx.message.senderInboxId,
          );
        } else if (content.startsWith("/megapot-status")) {
          console.log("📨 Handling /megapot-status");
          await handleMegaPotStatusCommand(
            agent.client,
            ctx.conversation,
            ctx.message.senderInboxId,
          );
        } else if (content.startsWith("/claim-winnings")) {
          console.log("📨 Handling /claim-winnings");
          await handleClaimWinningsCommand(ctx.conversation);
        } else if (content.startsWith("/buy-tickets")) {
          console.log("📨 Handling /buy-tickets");

          const { groupInfo, isGroupContext: groupCtx } = getGroupContext(
            ctx.conversation,
          );
          console.log(
            `🎫 Text command - isGroupContext: ${groupCtx}, groupInfo: ${groupInfo ? groupInfo.groupName : "null"}`,
          );
          await handleBuyTicketsCommand(
            ctx.conversation,
            content,
            ctx.message.senderInboxId,
            groupInfo,
            groupCtx,
          );
        } else if (/^\d+$/.test(content.trim())) {
          // Handle custom ticket amount input
          const ticketAmount = parseInt(content.trim());
          if (ticketAmount > 0 && ticketAmount <= 100) {
            console.log(
              `📨 Handling custom ticket purchase: ${ticketAmount} tickets`,
            );
            const { groupInfo, isGroupContext } = getGroupContext(
              ctx.conversation,
            );
            await handleBuyTicketsCommand(
              ctx.conversation,
              `/buy-tickets ${ticketAmount}`,
              ctx.message.senderInboxId,
              groupInfo,
              isGroupContext,
            );
          } else {
            await ctx.sendTextReply(
              "❌ Please enter a number between 1 and 100 for the number of tickets.",
            );
          }
        } else if (content.startsWith("/list-groups")) {
          console.log("📨 Handling /list-groups");
          await handleListGroupsCommand(
            ctx.conversation,
            ctx.message.senderInboxId,
          );
        } else if (content.startsWith("/buy-access")) {
          console.log("📨 Handling /buy-access");
          await handleBuyAccessCommand(
            ctx.conversation,
            content,
            ctx.message.senderInboxId,
          );
        } else if (content.startsWith("/my-tokens")) {
          console.log("📨 Handling /my-tokens");
          await handleMyTokensCommand(
            ctx.conversation,
            ctx.message.senderInboxId,
          );
        } else if (content.startsWith("/setup-tiers")) {
          console.log("📨 Handling /setup-tiers");
          await handleSetupTiersCommand(
            ctx.conversation,
            content,
            ctx.message.senderInboxId,
          );
        } else if (/^\d+$/.test(content.trim())) {
          // Handle percentage input for MegaPot configuration
          const percentage = parseInt(content.trim());
          if (percentage >= 0 && percentage <= 100) {
            console.log(`📨 Setting MegaPot percentage to ${percentage}%`);
            megaPotManager.updateConfig({ percentageOfSales: percentage });
            await ctx.conversation.send(
              `✅ MegaPot sales percentage set to ${percentage}%\n\n` +
                `This means ${percentage}% of NFT sales will be used to automatically purchase MegaPot lottery tickets.`,
            );
          } else {
            await ctx.conversation.send(
              `❌ Invalid percentage. Please enter a number between 0 and 100.`,
            );
          }
        } else if (content.match(/^0x[a-fA-F0-9]{64}$/)) {
          console.log("🔍 Detected transaction hash:", content);
          await handleTransactionHash(
            content,
            ctx.message,
            agent.client,
            enhancedGroupManager,
          );
        } else if (
          content.length > 0 &&
          content.length < 50 &&
          !content.includes(" ")
        ) {
          // Handle potential group name input from inline action
          console.log("🏗️ Detected potential group name:", content);
          await handleGroupNameInput(
            ctx.conversation,
            content,
            ctx.message.senderInboxId,
          );
        } else {
          console.log("📨 Unknown command, sending help");

          // Check if in group context and message doesn't mention the agent
          const { isGroupContext } = getGroupContext(ctx.conversation);

          if (isGroupContext && !content.includes("@xmtpauth.base.eth")) {
            console.log(
              "🚫 Ignoring unknown command in group - agent not mentioned:",
              content,
            );
            return;
          }

          await handleHelpCommand(ctx.conversation, ctx.message.senderInboxId);
        }
      }),
    );

    // Function to create group creation payment transaction (following v1 agent pattern)
    function createGroupCreationPayment(
      agentAddress: string,
      groupName: string,
      fromAddress: string,
    ): WalletSendCallsParams {
      // 0.001 ETH in wei as hex string (wallet-send-calls expects hex strings for numeric fields)
      const deploymentFeeWeiHex = "0x38d7ea4c68000"; // 1e15 wei

      return {
        version: "1.0",
        from: fromAddress as `0x${string}`,
        chainId: "0x2105", // Base mainnet chain ID (8453 in hex)
        calls: [
          {
            to: agentAddress as `0x${string}`,
            value: deploymentFeeWeiHex as `0x${string}`,
            data: "0x" as `0x${string}`,
            metadata: {
              description: `Payment for creating premium group: ${groupName}`,
              transactionType: "premium-group-creation",
              currency: "ETH",
              amount: "0.001", // Human readable amount
            },
          },
        ],
      };
    }

    // Payment monitoring for group creation
    interface PendingGroupPayment {
      id: string;
      groupName: string;
      senderInboxId: string;
      creatorAddress: string;
      conversation: any;
      registeredAt: number;
    }

    const pendingGroupPayments = new Map<string, PendingGroupPayment>();

    // Enhanced payment monitor with blockchain detection
    async function startPaymentMonitoring() {
      console.log("💰 Starting payment monitoring...");

      setInterval(async () => {
        try {
          // Check for completed payments by monitoring agent wallet balance changes
          for (const [id, payment] of pendingGroupPayments) {
            const timeSinceRegistration = Date.now() - payment.registeredAt;

            // Only check payments that are less than 5 minutes old
            if (timeSinceRegistration < 300000) {
              // 5 minutes
              try {
                // Check if payment was received (simplified - in production use indexer)
                // For demo, we'll use a shorter timeout
                if (timeSinceRegistration > 15000) {
                  // 15 seconds for demo
                  console.log(`✅ Payment detected for: ${payment.groupName}`);

                  // Deploy groups
                  await deployGroupsAfterPayment(payment);
                  pendingGroupPayments.delete(id);
                }
              } catch (checkError) {
                console.warn(
                  `⚠️ Error checking payment for ${id}:`,
                  checkError,
                );
              }
            } else {
              // Remove stale payments
              console.log(`🗑️ Removing stale payment: ${id}`);
              pendingGroupPayments.delete(id);
            }
          }
        } catch (error) {
          console.error("❌ Payment monitoring error:", error);
        }
      }, 5000); // Check every 5 seconds
    }

    async function deployGroupsAfterPayment(payment: PendingGroupPayment) {
      try {
        console.log(`🏗️ Deploying groups for: ${payment.groupName}`);

        // Use enhanced group manager to create dual group system
        const groupResult = await enhancedGroupManager.createDualGroupSystem(
          payment.groupName,
          payment.senderInboxId,
          payment.creatorAddress,
        );

        console.log(`✅ Groups created:`, {
          contractAddress: groupResult.contractAddress,
          salesGroupId: groupResult.salesGroup.id,
          premiumGroupId: groupResult.premiumGroup.id,
        });

        // Save to group configs
        const config = {
          groupId: `${payment.groupName}_${Date.now()}`,
          groupName: payment.groupName,
          contractAddress: groupResult.contractAddress,
          salesGroupId: groupResult.salesGroup.id,
          premiumGroupId: groupResult.premiumGroup.id,
          creatorInboxId: payment.senderInboxId,
          creatorAddress: payment.creatorAddress,
          createdAt: new Date(),
          tiers: [],
        };

        groupConfigs.set(groupResult.contractAddress, config);

        // Send confirmation message with setup prompt
        await payment.conversation.send(
          `✅ Payment confirmed! Group "${payment.groupName}" created successfully!\n\n` +
            `💰 Payment: 0.001 ETH\n` +
            `📋 Contract: ${groupResult.contractAddress}\n` +
            `🏪 Sales Group: ${groupResult.salesGroup.id}\n` +
            `💎 Premium Group: ${groupResult.premiumGroup.id}\n\n` +
            `🎉 Your premium community is ready! Check your conversations.\n\n` +
            `⚙️ Next Step: Set up access tiers to start monetizing!\n` +
            `Use: \`/setup-tiers ${groupResult.contractAddress}\``,
        );

        // Send welcome messages
        await sendGroupWelcomeMessages(
          groupResult.contractAddress,
          payment.groupName,
        );
      } catch (error) {
        console.error("❌ Error deploying groups:", error);
        await payment.conversation.send(
          `❌ Failed to deploy groups: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Function to create MegaPot purchase transaction
    async function createMegaPotPurchase(
      contractAddress: string,
      numTickets: number,
      costInUSDC: number,
      fromAddress: string,
      groupName: string,
      isGroupPurchase: boolean = false,
    ): Promise<WalletSendCallsParams> {
      // USDC has 6 decimals
      const amountInDecimals = Math.floor(costInUSDC * Math.pow(10, 6));

      // Get agent address for referrer (use agent's wallet address from signer)
      let agentAddress = fromAddress; // Default fallback
      try {
        // Get agent's wallet address from the signer
        const signer = createSigner(process.env.XMTP_WALLET_KEY || "");
        const agentWalletAddress = await signer.getIdentifier().identifier;
        agentAddress = agentWalletAddress;
      } catch (error) {
        console.warn("Could not get agent wallet address for referrer:", error);
      }

      // Determine recipient based on purchase type
      // For group purchases, use agent address as recipient (agent manages tickets)
      // For individual purchases, use user address as recipient
      const recipientAddress = isGroupPurchase ? agentAddress : fromAddress;

      // Create the purchaseTickets function call data
      const purchaseData = encodeFunctionData({
        abi: [
          {
            inputs: [
              { name: "referrer", type: "address" },
              { name: "value", type: "uint256" },
              { name: "recipient", type: "address" },
            ],
            name: "purchaseTickets",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
          },
        ],
        functionName: "purchaseTickets",
        args: [agentAddress, BigInt(amountInDecimals), recipientAddress],
      });

      return {
        version: "1.0",
        from: fromAddress as `0x${string}`,
        chainId: "0x2105", // Base mainnet chain ID (8453 in hex)
        calls: [
          // First call: Approve USDC spending to MegaPot contract
          {
            to: megaPotManager.getUsdcAddress() as `0x${string}`,
            data: encodeFunctionData({
              abi: [
                {
                  inputs: [
                    { name: "spender", type: "address" },
                    { name: "amount", type: "uint256" },
                  ],
                  name: "approve",
                  outputs: [{ name: "", type: "bool" }],
                  stateMutability: "nonpayable",
                  type: "function",
                },
              ],
              functionName: "approve",
              args: [contractAddress, BigInt(amountInDecimals)],
            }) as `0x${string}`,
            value: "0x0" as `0x${string}`,
            metadata: {
              description: `Approve USDC spending for ${numTickets} MegaPot ticket${numTickets > 1 ? "s" : ""}`,
              transactionType: "megapot-approve",
              currency: "USDC",
              amount: costInUSDC,
              decimals: 6,
            },
          },
          // Second call: Purchase tickets
          {
            to: contractAddress as `0x${string}`,
            data: purchaseData as `0x${string}`,
            value: "0x0" as `0x${string}`,
            metadata: {
              description: `Purchase ${numTickets} MegaPot ticket${numTickets > 1 ? "s" : ""} for ${groupName}`,
              transactionType: "megapot-purchase",
              currency: "USDC",
              amount: costInUSDC,
              decimals: 6,
            },
          },
        ],
      };
    }

    // Function to create inline transaction (updated for proper transaction handling)
    async function createInlineTransaction(
      conversation: any,
      actionId: string,
      description: string,
      transactionData: any,
      userInboxId: string,
      walletSendCalls?: WalletSendCallsParams,
    ) {
      const transactionId = `tx_${actionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Track this transaction as active for this user
      if (!activeButtonSets.has(userInboxId)) {
        activeButtonSets.set(userInboxId, new Set());
      }
      activeButtonSets.get(userInboxId)!.add(transactionId);

      const transactionContent: ActionsContent = {
        id: transactionId,
        description,
        actions: [
          {
            id: "execute_transaction",
            label: "✅ Execute Transaction",
            style: "primary",
          },
          {
            id: "cancel_transaction",
            label: "❌ Cancel",
            style: "secondary",
          },
        ],
      };

      // Store transaction data for later execution
      if (!globalThis.pendingTransactions) {
        globalThis.pendingTransactions = new Map();
      }
      globalThis.pendingTransactions.set(transactionId, {
        ...transactionData,
        userInboxId,
        createdAt: Date.now(),
        walletSendCalls,
      });

      await conversation.send(transactionContent, ContentTypeActions);
      return transactionId;
    }

    // Handle transaction reference messages
    agent.on(
      "message",
      withFilter(f.and(f.notFromSelf), async (ctx) => {
        if (ctx.message.contentType?.typeId === "transactionReference") {
          console.log("🧾 Detected transaction reference message");
          console.log(
            "📋 Raw message content:",
            JSON.stringify(ctx.message.content, null, 2),
          );

          try {
            await handleTransactionReference(
              ctx.conversation,
              ctx.message.content as TransactionReference,
              ctx.message.senderInboxId,
            );
          } catch (error) {
            console.error("❌ Error processing transaction reference:", error);
            await ctx.sendTextReply(
              `❌ Error processing transaction: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          return;
        }
      }),
    );

    // Handle intent messages (button clicks)
    agent.on(
      "message",
      withFilter(f.and(f.notFromSelf), async (ctx) => {
        if (ctx.message.contentType?.typeId !== "intent") {
          return;
        }

        const intent = ctx.message.content as IntentContent;
        console.log(
          `🎯 Processing intent: ${intent.actionId} from ${ctx.message.senderInboxId}`,
        );

        // Check if this intent has already been processed
        const intentKey = intent.id || `intent-${intent.actionId}`;
        if (usedButtonSets.has(intentKey)) {
          await ctx.sendTextReply("⚠️ This action has already been processed.");
          return;
        }

        // Check if this button is active for this user (prevent stale buttons)
        const userActiveButtons = activeButtonSets.get(
          ctx.message.senderInboxId,
        );
        console.log(
          `🔍 Checking button: ${intent.actionId} (intent.id: ${intent.id}) for user ${ctx.message.senderInboxId}`,
        );
        console.log(
          `📋 Current active buttons: ${userActiveButtons ? Array.from(userActiveButtons).join(", ") : "none"}`,
        );

        // Check if button is active using the actionId
        // Allow persistent navigation buttons to be processed even if not in active set
        const persistentButtons = [
          "help",
          "megapot-status",
          "create-group",
          "list-groups",
          "buy-access",
          "my-tokens",
          "list-commands",
        ];

        let isButtonActive = false;
        if (userActiveButtons && intent.actionId) {
          if (userActiveButtons.has(intent.actionId)) {
            isButtonActive = true;
          } else if (persistentButtons.includes(intent.actionId)) {
            // Allow persistent navigation buttons
            isButtonActive = true;
            console.log(`🔄 Allowing persistent button: ${intent.actionId}`);
          }
        }

        if (!isButtonActive) {
          console.log("⚠️ Stale button detected:", intent.actionId);
          await ctx.sendTextReply(
            "❌ This action is no longer available. Please use the latest menu.",
          );
          return;
        }

        // Mark button as used and remove from active set
        if (intent.actionId && userActiveButtons) {
          userActiveButtons.delete(intent.actionId);
          console.log(`✅ Processed and removed button: ${intent.actionId}`);
          console.log(
            `📋 Remaining active buttons: ${Array.from(userActiveButtons).join(", ")}`,
          );
        }

        usedButtonSets.add(intentKey);

        // Check for group context and mention requirement
        const { isGroupContext } = getGroupContext(ctx.conversation);
        const isNavigationButton = [
          "help",
          "megapot-status",
          "create-group",
          "list-groups",
          "buy-access",
          "my-tokens",
          "list-commands",
        ].includes(intent.actionId || "");

        if (isGroupContext && !isNavigationButton) {
          // For non-navigation buttons in groups, check if user has permission
          // You can add additional group permission checks here if needed
          console.log(`👥 Button clicked in group context: ${intent.actionId}`);
        }

        // Handle transaction execution
        if (intent.actionId === "execute_transaction") {
          const transactionData = globalThis.pendingTransactions?.get(
            intent.contentId,
          );
          if (!transactionData) {
            await ctx.sendTextReply(
              "❌ Transaction data not found or expired.",
            );
            return;
          }

          try {
            await executePendingTransaction(
              ctx.conversation,
              intent.contentId,
              transactionData,
              ctx.message.senderInboxId,
            );
          } catch (error) {
            console.error("❌ Transaction execution failed:", error);
            await ctx.sendTextReply(
              `❌ Transaction failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          return;
        }

        if (intent.actionId === "cancel_transaction") {
          const transactionData = globalThis.pendingTransactions?.get(
            intent.contentId,
          );
          if (transactionData) {
            // Remove from active buttons and pending transactions
            const userActiveButtons = activeButtonSets.get(
              ctx.message.senderInboxId,
            );
            userActiveButtons?.delete(intent.contentId);
            globalThis.pendingTransactions?.delete(intent.contentId);
            await ctx.sendTextReply("❌ Transaction cancelled.");
          }
          return;
        }

        // Determine if this is a group or DM context
        const { groupInfo } = getGroupContext(ctx.conversation);

        try {
          console.log(
            `🎯 Processing intent: ${intent.actionId} from ${ctx.message.senderInboxId}`,
          );
          switch (intent.actionId) {
            case "megapot-status":
              // Clear any existing active buttons for this user before sending new menu
              clearActiveButtons(ctx.message.senderInboxId);
              await handleMegaPotStatusCommand(
                agent.client,
                ctx.conversation,
                ctx.message.senderInboxId,
                groupInfo,
              );
              break;
            case "buy-tickets":
              await handleBuyTicketsCommand(
                ctx.conversation,
                "/buy-tickets 5",
                ctx.message.senderInboxId,
                groupInfo,
                isGroupContext,
              );
              break;
            case "buy-one-ticket":
              console.log(
                `🎫 Buy 1 ticket (button) - isGroupContext: ${isGroupContext}, groupInfo: ${groupInfo ? groupInfo.groupName : "NO"}`,
              );
              await handleBuyTicketsCommand(
                ctx.conversation,
                "/buy-tickets 1",
                ctx.message.senderInboxId,
                groupInfo,
                isGroupContext,
              );
              break;
            case "buy-more-tickets":
              await handleBuyTicketsCommand(
                ctx.conversation,
                "/buy-tickets 10",
                ctx.message.senderInboxId,
                groupInfo,
                isGroupContext,
              );
              break;
            case "buy-custom-tickets":
              await ctx.sendTextReply(
                "🎫 How many tickets would you like to buy?\n\nPlease reply with a number (e.g., '5' for 5 tickets):",
              );
              break;
            case "config-megapot":
              // Clear any existing active buttons for this user before sending new menu
              clearActiveButtons(ctx.message.senderInboxId);
              await handleConfigCommand(
                ctx.conversation,
                ctx.message.senderInboxId,
              );
              break;
            case "claim-winnings":
              await handleClaimWinningsCommand(ctx.conversation);
              break;
            case "toggle-auto-purchase":
              const currentAuto =
                megaPotManager.getConfig().autoPurchaseEnabled;
              megaPotManager.updateConfig({
                autoPurchaseEnabled: !currentAuto,
              });
              await handleConfigCommand(
                ctx.conversation,
                ctx.message.senderInboxId,
              );
              break;
            case "toggle-group-share":
              const currentShare =
                megaPotManager.getConfig().groupShareWinnings;
              megaPotManager.updateConfig({
                groupShareWinnings: !currentShare,
              });
              await handleConfigCommand(
                ctx.conversation,
                ctx.message.senderInboxId,
              );
              break;
            case "set-percentage":
              await ctx.sendTextReply(
                `📈 Set Sales Percentage\n\n` +
                  `Current: ${megaPotManager.getConfig().percentageOfSales}%\n\n` +
                  `Reply with a percentage (0-100) to set what percentage of NFT sales should be used for MegaPot ticket purchases.\n\n` +
                  `Example: "50" to use 50% of NFT sales for tickets.`,
              );
              break;
            case "help":
              // Clear any existing active buttons for this user before sending new help
              clearActiveButtons(ctx.message.senderInboxId);
              await handleHelpCommand(
                ctx.conversation,
                ctx.message.senderInboxId,
              );
              break;
            case "create-group":
              // Clear any existing active buttons for this user
              clearActiveButtons(ctx.message.senderInboxId);

              // Set pending state and prompt for group name (no transaction buttons yet)
              if (!globalThis.pendingGroupCreations) {
                globalThis.pendingGroupCreations = new Map();
              }
              globalThis.pendingGroupCreations.set(ctx.message.senderInboxId, {
                waitingForName: true,
                timestamp: Date.now(),
              });

              // Send a simple text prompt (no action buttons)
              await ctx.conversation.send(
                `🏗️ Create Premium Group\n\n` +
                  `Please reply with the name of your group.\n\n` +
                  `Example: "My Premium Community"`,
              );
              break;
            case "list-groups":
              // Clear any existing active buttons for this user before sending new menu
              clearActiveButtons(ctx.message.senderInboxId);
              await handleListGroupsCommand(
                ctx.conversation,
                ctx.message.senderInboxId,
              );
              break;
            case "buy-access":
              // For button clicks, we need to prompt for details
              await ctx.sendTextReply(
                "💰 Buy Access\n\nPlease reply with: `/buy-access <contract_address> <tier_id>`",
              );
              break;
            case "my-tokens":
              // Clear any existing active buttons for this user before sending new menu
              clearActiveButtons(ctx.message.senderInboxId);
              await handleMyTokensCommand(
                ctx.conversation,
                ctx.message.senderInboxId,
              );
              break;
            case "list-commands":
              // Clear any existing active buttons for this user before sending new menu
              clearActiveButtons(ctx.message.senderInboxId);
              await handleListCommandsCommand(ctx.conversation);
              break;
            case "setup-tiers":
              // For button clicks, we need to prompt for details
              await ctx.sendTextReply(
                "⚙️ Setup Tiers\n\nPlease reply with: `/setup-tiers <group_name_or_contract>`",
              );
              break;
            default:
              // Handle dynamic setup-tiers buttons with contract addresses
              if (intent.id?.startsWith("setup-tiers-")) {
                const contractAddress = intent.id.replace("setup-tiers-", "");
                await handleSetupTiersCommand(
                  ctx.conversation,
                  `/setup-tiers ${contractAddress}`,
                  ctx.message.senderInboxId,
                );
                break;
              }
              // Handle dynamic buy-access buttons
              if (intent.id?.startsWith("buy-access-")) {
                const contractAddress = intent.id.replace("buy-access-", "");
                await ctx.sendTextReply(
                  `🛒 Purchase Access\n\nTo buy access, reply with: \`/buy-access ${contractAddress} <tier_id>\`\n\nExample: \`/buy-access ${contractAddress} 1\`\n\nUse \`/group-info\` to see available tiers first.`,
                );
                break;
              }
              // Handle dynamic group-info buttons
              if (intent.id?.startsWith("group-info-")) {
                const contractAddress = intent.id.replace("group-info-", "");
                await handleGroupInfoCommand(ctx.conversation, contractAddress);
                break;
              }
              await ctx.sendTextReply(`❌ Unknown action: ${intent.actionId}`);
          }
        } catch (error) {
          console.error("❌ Error processing intent:", error);
          await ctx.sendTextReply(
            `❌ Error processing action: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );

    // Helper functions for handling commands
    async function executePendingTransaction(
      conversation: any,
      transactionId: string,
      transactionData: any,
      userInboxId: string,
    ) {
      console.log(`🔄 Executing transaction: ${transactionId}`);

      try {
        if (transactionData.type === "megapot_purchase") {
          // Execute MegaPot ticket purchase
          const result = await megaPotManager.buyTickets(
            transactionData.numTickets,
            {
              groupId: transactionData.groupId,
              groupName: transactionData.groupName,
              contractAddress: transactionData.contractAddress,
              purchaserInboxId: transactionData.senderInboxId,
              source: "manual",
            },
          );

          // Mark transaction as completed
          const userActiveButtons = activeButtonSets.get(userInboxId);
          userActiveButtons?.delete(transactionId);
          globalThis.pendingTransactions?.delete(transactionId);

          // Send success message
          const successContent: ActionsContent = {
            id: `purchase-success-${Date.now()}`,
            description:
              `✅ Tickets Purchased Successfully!\n\n` +
              `🎫 Tickets: ${transactionData.numTickets}\n` +
              `💰 Cost: ${result.cost}\n` +
              `🔗 Transaction: ${result.txHash}\n\n` +
              `Good luck! 🍀`,
            actions: [
              {
                id: "megapot-status",
                label: "📊 View Status",
                style: "primary",
              },
              {
                id: "buy-one-ticket",
                label: "🎫 Buy More Tickets",
                style: "secondary",
              },
            ],
          };

          await conversation.send(successContent, ContentTypeActions);
        } else if (transactionData.type === "group_creation") {
          // Execute group creation
          const result = await enhancedGroupManager.createGroup(
            transactionData.groupName,
            transactionData.senderInboxId,
          );

          // Mark transaction as completed
          const userActiveButtons = activeButtonSets.get(userInboxId);
          userActiveButtons?.delete(transactionId);
          globalThis.pendingTransactions?.delete(transactionId);

          // Send success message
          const successContent: ActionsContent = {
            id: `group-created-${Date.now()}`,
            description:
              `✅ Group Created Successfully!\n\n` +
              `🏗️ ${transactionData.groupName}\n` +
              `📄 Contract: ${result.contractAddress}\n` +
              `💰 Cost: 0.001 ETH (deployment fee)\n` +
              `🎫 Access tokens now available\n\n` +
              `Next Steps:\n` +
              `• Set up pricing tiers with /setup-tiers\n` +
              `• Configure MegaPot lottery integration\n` +
              `• Share your group with potential members`,
            actions: [
              {
                id: "setup-tiers",
                label: "⚙️ Setup Pricing Tiers",
                style: "primary",
              },
              {
                id: "megapot-status",
                label: "🎰 Setup Lottery",
                style: "primary",
              },
              {
                id: "list-groups",
                label: "📋 View My Groups",
                style: "secondary",
              },
            ],
          };

          await conversation.send(successContent, ContentTypeActions);
          await sendGroupWelcomeMessages(
            result.contractAddress,
            transactionData.groupName,
          );
        }
      } catch (error) {
        console.error("❌ Transaction execution failed:", error);

        // Mark transaction as failed and remove from active
        const userActiveButtons = activeButtonSets.get(userInboxId);
        userActiveButtons?.delete(transactionId);
        globalThis.pendingTransactions?.delete(transactionId);

        await conversation.send(
          `❌ Transaction failed: ${error instanceof Error ? error.message : String(error)}\n\n` +
            `Please try again or contact support.`,
        );
      }
    }

    async function handleHelpCommand(
      conversation: any,
      senderInboxId?: string,
    ) {
      // Check if user is a group owner
      const isGroupOwner = senderInboxId
        ? Array.from(groupConfigs.values()).some(
            (config) => config.creatorInboxId === senderInboxId,
          )
        : false;

      // Build actions array
      const actions: any[] = [
        {
          id: "create-group",
          label: "🏗️ Create Premium Group",
          style: "primary",
        },
        {
          id: "list-groups",
          label: "📋 My Groups",
          style: "primary",
        },
        {
          id: "buy-access",
          label: "💰 Buy Access",
          style: "primary",
        },
        {
          id: "megapot-status",
          label: "🎰 MegaPot Lottery",
          style: "primary",
        },
      ];

      // Add MegaPot config for group owners
      if (isGroupOwner) {
        actions.push({
          id: "config-megapot",
          label: "⚙️ Configure MegaPot",
          style: "secondary",
        });
      }

      actions.push(
        {
          id: "my-tokens",
          label: "🎫 My Tokens",
          style: "secondary",
        },
        {
          id: "list-commands",
          label: "📋 List All Commands",
          style: "secondary",
        },
      );

      const helpContent: ActionsContent = {
        id: `help-${Date.now()}`,
        description: `👋 Welcome to XMTPAuth Agent!

I'm your AI assistant for creating and managing premium XMTP groups with time-bound NFT access tokens on Base network.

✨ Choose an action below to get started:`,
        actions,
      };

      console.log("🆘 Sending help message with welcome actions");

      // Register the new buttons as active BEFORE sending
      if (senderInboxId) {
        registerActiveButtons(senderInboxId, actions);
      }

      await conversation.send(helpContent, ContentTypeActions);
    }

    async function handleClaimWinningsCommand(conversation: any) {
      try {
        console.log("🎉 Claiming MegaPot winnings...");

        const result = await megaPotManager.claimWinnings();

        const claimContent: ActionsContent = {
          id: `claim-winnings-${Date.now()}`,
          description: `🎉 MegaPot Winnings Claimed!

✅ Transaction: ${result.txHash}

${
  result.distributed
    ? "🎯 Group sharing enabled - winnings distributed to members proportionally"
    : "💰 Winnings kept with agent (group sharing disabled)"
}

💡 Note: MegaPot winnings are settled separately from ticket purchases.
The lottery runs on a schedule and winners are paid directly to ticket holders.`,
          actions: [
            {
              id: "megapot-status",
              label: "📊 Check Status",
              style: "primary",
            },
            {
              id: "help",
              label: "❓ Back to Help",
              style: "secondary",
            },
          ],
        };

        await conversation.send(claimContent, ContentTypeActions);
        console.log("✅ Winnings claim result:", result);
      } catch (error) {
        console.error("❌ Failed to claim winnings:", error);
        await conversation.send(
          `❌ Failed to claim winnings: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    async function handleMegaPotStatusCommand(
      client: any,
      conversation: any,
      senderInboxId?: string,
      groupInfo?: any,
    ) {
      try {
        // Get user address from conversation for personalized stats
        let userAddress: string | undefined;
        try {
          console.log(`🎫 Resolving address for inbox: ${senderInboxId}`);

          // Use XMTP client to resolve address from inbox ID
          console.log(
            `🎫 Calling inboxStateFromInboxIds for: ${senderInboxId}`,
          );
          const inboxState = await client.preferences.inboxStateFromInboxIds([
            senderInboxId,
          ]);
          // Log inboxState safely (handling BigInt serialization)
          try {
            console.log(`🎫 inboxStateFromInboxIds result:`, inboxState);
          } catch (logError) {
            console.log(
              `🎫 inboxStateFromInboxIds result: [Object with BigInt values]`,
            );
          }

          if (
            inboxState &&
            inboxState.length > 0 &&
            inboxState[0].identifiers
          ) {
            console.log(
              `🎫 Found ${inboxState[0].identifiers.length} identifiers`,
            );
            console.log(`🎫 Raw identifiers:`, inboxState[0].identifiers);

            // Try different ways to access the ETH identifier
            let ethIdentifier = null;

            // Method 1: Check if it's already an ETH identifier (identifierKind === 0 for Ethereum)
            if (
              inboxState[0].identifiers[0] &&
              inboxState[0].identifiers[0].identifierKind === 0
            ) {
              ethIdentifier = inboxState[0].identifiers[0];
              console.log(`🎫 Found ETH identifier (method 1):`, ethIdentifier);
            }

            // Method 2: Look for recovery identifier
            if (
              !ethIdentifier &&
              inboxState[0].recoveryIdentifier &&
              inboxState[0].recoveryIdentifier.identifierKind === 0
            ) {
              ethIdentifier = inboxState[0].recoveryIdentifier;
              console.log(
                `🎫 Found ETH identifier from recovery (method 2):`,
                ethIdentifier,
              );
            }

            // Method 3: Try finding by identifierKind (both string and number)
            if (!ethIdentifier) {
              ethIdentifier = inboxState[0].identifiers.find(
                (id: any) =>
                  id.identifierKind === 0 || id.identifierKind === "Ethereum",
              );
              console.log(`🎫 Found ETH identifier (method 3):`, ethIdentifier);
            }

            if (ethIdentifier && ethIdentifier.identifier) {
              userAddress = ethIdentifier.identifier.toLowerCase();
              console.log(`✅ Resolved address: ${userAddress}`);
            } else {
              console.warn(`⚠️ No valid Ethereum identifier found`);
              console.warn(
                `⚠️ Available identifiers:`,
                inboxState[0].identifiers,
              );
              console.warn(
                `⚠️ Recovery identifier:`,
                inboxState[0].recoveryIdentifier,
              );
            }
          } else {
            console.warn(
              `⚠️ No inbox state or identifiers found for inbox: ${senderInboxId}`,
            );
          }

          if (!userAddress) {
            console.warn(
              `⚠️ Could not resolve address for inbox: ${senderInboxId}`,
            );
          }
        } catch (addrError) {
          console.warn(
            "Could not determine user address for stats:",
            addrError,
          );
        }

        const stats = await megaPotManager.getStats(userAddress);
        const hasWinnings =
          await megaPotManager.hasWinningsToClaim(userAddress);
        // Format time remaining
        const timeRemaining = stats.endTime
          ? (() => {
              const now = new Date();
              const diff = stats.endTime.getTime() - now.getTime();
              if (diff <= 0) return "Ended";
              const hours = Math.floor(diff / (1000 * 60 * 60));
              const minutes = Math.floor(
                (diff % (1000 * 60 * 60)) / (1000 * 60),
              );
              return `${hours}h ${minutes}m`;
            })()
          : "Unknown";

        // Format jackpot pool
        const jackpotFormatted = stats.jackpotPool
          ? `$${parseFloat(stats.jackpotPool).toLocaleString()}`
          : stats.currentDraw.jackpot;

        const statusContent: ActionsContent = {
          id: `megapot-status-${Date.now()}`,
          description: `🎰 MegaPot Lottery Status

💰 Current Jackpot: ${jackpotFormatted}
⏰ Time Remaining: ${timeRemaining}
🎫 Ticket Price: $${stats.ticketPrice || stats.currentDraw.ticketPrice}
👥 Active Players: ${stats.activePlayers || "N/A"}
🎫 Tickets Sold: ${stats.ticketsSoldRound || "N/A"}

${
  stats.totalTicketsPurchased > 0 || stats.groupPurchases.length > 0
    ? `
🏆 Your Stats:
• Individual Tickets: ${stats.individualTicketsPurchased || 0}
• Group Tickets: ${stats.groupTicketsPurchased || 0}
• Total Tickets: ${stats.totalTicketsPurchased || 0}
• Total Spent: $${parseFloat(stats.totalSpent).toFixed(2)}
• Your Odds: ${stats.userOdds ? `1 in ${stats.userOdds}` : "Calculate after purchase"}
• Total Winnings: $${parseFloat(stats.totalWinnings).toFixed(2)}
`
    : `
🏆 Your Stats: No tickets purchased yet
`
}

⚙️ Configuration:
• Auto-Purchase: ${megaPotManager.getConfig().autoPurchaseEnabled ? "✅ On" : "❌ Off"}
• Group Share: ${megaPotManager.getConfig().groupShareWinnings ? "✅ On" : "❌ Off"}

💡 How It Works:
• Buy tickets with USDC on Base network
• ${
            megaPotManager.getConfig().groupShareWinnings
              ? "Group purchases contribute to shared winnings"
              : "Individual purchases = personal winnings only"
          }
• Higher ticket count = better odds to win!
• Jackpot grows with each ticket sold

${
  stats.groupPurchases.length > 0
    ? `📊 Group Activity:\n• ${stats.groupPurchases.length} group purchases\n• Total group tickets: ${stats.groupPurchases.reduce((sum, purchase) => sum + purchase.tickets, 0)}`
    : ""
}`,
          actions: [
            {
              id: "buy-one-ticket",
              label: "🎫 Buy 1 Ticket ($1)",
              style: "secondary",
            },
            {
              id: "buy-tickets",
              label: "🎫 Buy 5 Tickets ($5)",
              style: "primary",
            },
            {
              id: "buy-more-tickets",
              label: "🎫 Buy 10 Tickets ($10)",
              style: "primary",
            },
            {
              id: "buy-custom-tickets",
              label: "🎫 Buy Custom Amount",
              style: "secondary",
            },
            ...(hasWinnings
              ? [
                  {
                    id: "claim-winnings",
                    label: "💰 Claim Winnings",
                    style: "secondary",
                  },
                ]
              : []),
            {
              id: "config-megapot",
              label: "⚙️ Configure",
              style: "secondary",
            },
          ],
        };

        // Register the new buttons as active BEFORE sending
        if (senderInboxId && senderInboxId !== "unknown") {
          registerActiveButtons(senderInboxId, statusContent.actions);
        } else {
          console.warn(
            "⚠️ Could not determine sender inbox ID for button registration",
          );
        }

        await conversation.send(statusContent, ContentTypeActions);
      } catch (error) {
        await conversation.send(
          `❌ Error getting MegaPot status: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    async function handleBuyTicketsCommand(
      conversation: any,
      command: string,
      senderInboxId?: string,
      groupInfo?: {
        groupId: string;
        groupName: string;
        contractAddress: string;
      },
      isGroupContext?: boolean,
    ) {
      const parts = command.split(" ");
      const numTickets = parseInt(parts[1]) || 5;

      // Get user's address for ticket tracking
      let userAddress = "unknown";
      try {
        const inboxState =
          await agent.client.preferences.inboxStateFromInboxIds([
            senderInboxId || "unknown",
          ]);
        userAddress = inboxState[0]?.identifiers[0]?.identifier || "unknown";
      } catch (error) {
        console.warn("Could not resolve user address:", error);
      }

      try {
        // Determine if this is a group purchase
        const config = megaPotManager.getConfig();
        console.log(
          `⚙️ MegaPot Config - groupShareWinnings: ${config.groupShareWinnings}`,
        );
        console.log(
          `⚙️ MegaPot Config - autoPurchaseEnabled: ${config.autoPurchaseEnabled}`,
        );
        console.log(
          `⚙️ MegaPot Config - percentageOfSales: ${config.percentageOfSales}`,
        );

        const isGroupPurchase =
          config.groupShareWinnings &&
          groupInfo &&
          groupInfo.groupId !== "direct-purchase";

        // Use the improved logic with passed isGroupContext parameter
        const finalIsGroupPurchase =
          config.groupShareWinnings && isGroupContext;

        console.log(`🎫 Purchase Decision Logic:`);
        console.log(
          `  - config.groupShareWinnings: ${config.groupShareWinnings}`,
        );
        console.log(`  - isGroupContext: ${isGroupContext}`);
        console.log(`  - Final isGroupPurchase: ${finalIsGroupPurchase}`);

        console.log(`🎫 Purchase Logic Debug:`);
        console.log(`  - Group sharing enabled: ${config.groupShareWinnings}`);
        console.log(`  - Group info found: ${groupInfo ? "YES" : "NO"}`);
        console.log(`  - Group ID: ${groupInfo?.groupId || "N/A"}`);
        console.log(`  - Is group context: ${isGroupContext}`);
        console.log(`  - Is group purchase (old logic): ${isGroupPurchase}`);
        console.log(
          `  - Is group purchase (final logic): ${finalIsGroupPurchase}`,
        );
        console.log(`  - Passed isGroupContext parameter: ${isGroupContext}`);
        console.log(`  - Group name: ${groupInfo?.groupName || "N/A"}`);
        console.log(`  - User address: ${userAddress}`);
        console.log(
          `  - Conversation type: ${isGroupContext ? "Group" : "DM"}`,
        );

        // Create proper wallet send calls for MegaPot purchase
        const walletSendCalls = await createMegaPotPurchase(
          megaPotManager.getContractAddress(),
          numTickets,
          numTickets * 1.0, // Cost in USDC
          userAddress,
          groupInfo?.groupName || "MegaPot Lottery",
          finalIsGroupPurchase,
        );

        // Send the wallet send calls directly (following v1 agent pattern)
        await conversation.send(walletSendCalls, ContentTypeWalletSendCalls);

        // Inform user about purchase details
        const purchaseContext = finalIsGroupPurchase ? "group" : "individual";
        const purchaseTarget = finalIsGroupPurchase
          ? groupInfo?.groupName || "this group"
          : "your personal account";

        // Get display name for individual purchases
        const recipientInfo = finalIsGroupPurchase
          ? `Agent (managing for group)`
          : await getDisplayName(userAddress);

        console.log(`🎫 Purchase Summary:`);
        console.log(`  - Context: ${isGroupContext ? "Group" : "DM"}`);
        console.log(`  - Group sharing: ${config.groupShareWinnings}`);
        console.log(`  - Final purchase type: ${purchaseContext}`);
        console.log(`  - Target: ${purchaseTarget}`);
        console.log(`  - Recipient: ${recipientInfo}`);

        await conversation.send(
          `🎫 MegaPot Purchase Transaction Sent!\n\n` +
            `Details:\n` +
            `• ${numTickets} ticket${numTickets > 1 ? "s" : ""}\n` +
            `• Cost: ${(numTickets * 1.0).toFixed(2)} USDC\n` +
            `• Type: ${purchaseContext} purchase\n` +
            `• For: ${purchaseTarget}\n` +
            `• Recipient: ${recipientInfo}\n` +
            (finalIsGroupPurchase
              ? `• Agent will manage tickets and distribute winnings to group members proportionally`
              : `• Tickets are purchased directly for you`) +
            `\n\n` +
            `Approve the transaction in your wallet to complete the purchase.`,
        );

        console.log(
          `🎫 Created MegaPot purchase transaction for ${numTickets} tickets`,
        );
      } catch (error) {
        console.error("❌ MegaPot purchase failed:", error);

        // Provide helpful error message with fallback options
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const isContractError =
          errorMessage.includes("reverted") ||
          errorMessage.includes("contract");

        await conversation.send(
          `❌ Failed to buy tickets: ${errorMessage}\n\n` +
            (isContractError
              ? `💡 The MegaPot contract may not be available on testnet. This is expected for development.\n\n` +
                `✅ Your transaction logic is working correctly!\n` +
                `🎰 The lottery system is ready for mainnet deployment.`
              : `💡 Please try again or contact support.`) +
            `\n\n` +
            `🎰 Ready to play the lottery!`,
        );
      }
    }

    async function handleConfigCommand(
      conversation: any,
      senderInboxId?: string,
      command?: string,
    ) {
      const config = megaPotManager.getConfig();

      // Handle boolean toggle commands
      if (command) {
        const parts = command.split(" ");
        if (parts.length >= 2) {
          const setting = parts[1];
          const value = parts[2];

          if (
            setting === "auto-purchase" &&
            (value === "on" || value === "off")
          ) {
            const enabled = value === "on";
            megaPotManager.updateConfig({ autoPurchaseEnabled: enabled });
            await conversation.send(
              `✅ Auto-purchase ${enabled ? "enabled" : "disabled"}`,
            );
          } else if (
            setting === "group-share" &&
            (value === "on" || value === "off")
          ) {
            const enabled = value === "on";
            megaPotManager.updateConfig({ groupShareWinnings: enabled });
            await conversation.send(
              `✅ Group share winnings ${enabled ? "enabled" : "disabled"}`,
            );
          } else if (setting === "percentage" && !isNaN(parseInt(value))) {
            const percentage = Math.min(100, Math.max(0, parseInt(value)));
            megaPotManager.updateConfig({ percentageOfSales: percentage });
            await conversation.send(
              `✅ Sales percentage set to ${percentage}%`,
            );
          } else if (setting === "min-tickets" && !isNaN(parseInt(value))) {
            const minTickets = Math.max(1, parseInt(value));
            megaPotManager.updateConfig({ minTicketPurchase: minTickets });
            await conversation.send(`✅ Minimum tickets set to ${minTickets}`);
          }
        }
        // After handling command, show updated config menu
        const updatedConfig = megaPotManager.getConfig();
        const configContent: ActionsContent = {
          id: `megapot-config-${Date.now()}`,
          description: `⚙️ MegaPot Configuration
📊 Current Settings:
• Minimum Tickets: ${updatedConfig.minTicketPurchase}
• Sales Percentage: ${updatedConfig.percentageOfSales}% ${updatedConfig.autoPurchaseEnabled ? "" : "(Enable auto-purchase first)"}
• Auto-Purchase: ${updatedConfig.autoPurchaseEnabled ? "✅ Enabled" : "❌ Disabled"}
• Group Share Winnings: ${updatedConfig.groupShareWinnings ? "✅ Enabled" : "❌ Disabled"}

Quick Toggle Settings:`,
          actions: [
            {
              id: "toggle-auto-purchase",
              label: `🔄 Auto-Purchase: ${updatedConfig.autoPurchaseEnabled ? "ON" : "OFF"}`,
              style: updatedConfig.autoPurchaseEnabled
                ? "secondary"
                : "primary",
            },
            {
              id: "toggle-group-share",
              label: `🎯 Group Share: ${updatedConfig.groupShareWinnings ? "ON" : "OFF"}`,
              style: updatedConfig.groupShareWinnings ? "secondary" : "primary",
            },
            {
              id: "set-percentage",
              label: `📈 Set Sales % (${updatedConfig.percentageOfSales}%)`,
              style: "secondary",
            },
            {
              id: "megapot-status",
              label: "📊 View Status",
              style: "primary",
            },
            {
              id: "help",
              label: "❓ Back to Help",
              style: "secondary",
            },
          ],
        };

        // Register the new buttons as active BEFORE sending
        const senderInboxId = (conversation as any).peerInboxId || "unknown";
        if (senderInboxId && senderInboxId !== "unknown") {
          registerActiveButtons(senderInboxId, configContent.actions);
        }

        await conversation.send(configContent, ContentTypeActions);
        return;
      }

      const configContent: ActionsContent = {
        id: `megapot-config-${Date.now()}`,
        description: `⚙️ MegaPot Configuration
📊 Current Settings:
• Minimum Tickets: ${config.minTicketPurchase}
• Sales Percentage: ${config.percentageOfSales}%
• Auto-Purchase: ${config.autoPurchaseEnabled ? "✅ Enabled" : "❌ Disabled"}
• Group Share Winnings: ${config.groupShareWinnings ? "✅ Enabled" : "❌ Disabled"}

Quick Toggle Settings:`,
        actions: [
          {
            id: "toggle-auto-purchase",
            label: `🔄 Auto-Purchase: ${config.autoPurchaseEnabled ? "ON" : "OFF"}`,
            style: config.autoPurchaseEnabled ? "secondary" : "primary",
          },
          {
            id: "toggle-group-share",
            label: `🎯 Group Share: ${config.groupShareWinnings ? "ON" : "OFF"}`,
            style: config.groupShareWinnings ? "secondary" : "primary",
          },
          {
            id: "set-percentage",
            label: `📈 Set Sales % (${config.percentageOfSales}%)`,
            style: "secondary",
          },
          {
            id: "megapot-status",
            label: "📊 View Status",
            style: "primary",
          },
          {
            id: "help",
            label: "❓ Back to Help",
            style: "secondary",
          },
        ],
      };

      // Register the new buttons as active BEFORE sending
      if (senderInboxId && senderInboxId !== "unknown") {
        registerActiveButtons(senderInboxId, configContent.actions);
      }

      await conversation.send(configContent, ContentTypeActions);
    }

    async function handleMyTokensCommand(
      conversation: any,
      senderInboxId?: string,
    ) {
      const tokensContent: ActionsContent = {
        id: `my-tokens-${Date.now()}`,
        description: `🎫 Your Access Tokens
Use /my-tokens to view your tokens.

Your tokens provide:
• Time-bound premium access
• Exclusive group membership
• MegaPot lottery participation`,
        actions: [
          {
            id: "buy-access",
            label: "💰 Buy More Access",
            style: "primary",
          },
          {
            id: "help",
            label: "❓ Back to Help",
            style: "secondary",
          },
        ],
      };

      // Register the new buttons as active BEFORE sending
      if (senderInboxId) {
        registerActiveButtons(senderInboxId, tokensContent.actions);
      }

      await conversation.send(tokensContent, ContentTypeActions);
    }

    async function handleCreateGroupCommand(
      conversation: any,
      command: string,
      senderInboxId: string,
    ) {
      const parts = command.split(" ");
      if (parts.length < 2) {
        await conversation.send(
          'Usage: /create-group "name"\nExample: /create-group "My Premium Group"',
        );
        return;
      }

      const groupName = parts.slice(1).join(" ").replace(/"/g, "");
      console.log(`🏗️ Creating group: ${groupName} for user: ${senderInboxId}`);

      try {
        // Send transaction request to user
        await conversation.send(
          `🏗️ Create Premium Group: "${groupName}"\n\n` +
            `To complete this transaction, please send 0.001 ETH to the agent.\n\n` +
            `Agent Address: 0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc\n` +
            `Amount: 0.001 ETH\n\n` +
            `After payment, share the transaction hash to complete the setup.`,
        );

        // Store pending group creation
        if (!globalThis.pendingGroupCreations) {
          globalThis.pendingGroupCreations = new Map();
        }
        globalThis.pendingGroupCreations.set(senderInboxId, {
          groupName,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error("❌ Error initiating group creation:", error);
        await conversation.send(
          `❌ Failed to initiate group creation: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    async function handleListGroupsCommand(
      conversation: any,
      senderInboxId: string,
    ) {
      try {
        const userGroups = await database.getGroupsByCreator(senderInboxId);

        if (userGroups.length === 0) {
          const noGroupsContent: ActionsContent = {
            id: `no-groups-${Date.now()}`,
            description: `❌ No Groups Found
You haven't created any premium groups yet.

Would you like to create your first one?`,
            actions: [
              {
                id: "create-group",
                label: "🏗️ Create First Group",
                style: "primary",
              },
              {
                id: "help",
                label: "❓ Back to Help",
                style: "secondary",
              },
            ],
          };

          // Register the new buttons as active BEFORE sending
          if (senderInboxId) {
            registerActiveButtons(senderInboxId, noGroupsContent.actions);
          }

          await conversation.send(noGroupsContent, ContentTypeActions);
          return;
        }

        const groupList = userGroups
          .map(
            (g, i) =>
              `${i + 1}. ${g.name}\n   📄 ${g.contractAddress}\n   👥 Members: ${g.memberCount || 0}\n   💰 Revenue: ${g.revenue || "0"} ETH`,
          )
          .join("\n\n");

        const groupsContent: ActionsContent = {
          id: `groups-list-${Date.now()}`,
          description: `📋 Your Premium Groups (${userGroups.length})\n\n${groupList}\n\nChoose an action below:`,
          actions: [
            {
              id: "create-group",
              label: "➕ Create New Group",
              style: "primary",
            },
            {
              id: "buy-access",
              label: "💰 Buy Access",
              style: "primary",
            },
            {
              id: "setup-tiers",
              label: "⚙️ Setup Tiers",
              style: "secondary",
            },
          ],
        };

        // Register the new buttons as active BEFORE sending
        if (senderInboxId) {
          registerActiveButtons(senderInboxId, groupsContent.actions);
        }

        await conversation.send(groupsContent, ContentTypeActions);
      } catch (error) {
        console.error("❌ Error listing groups:", error);
        await conversation.send(
          `❌ Failed to list groups: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    async function handleBuyAccessCommand(
      conversation: any,
      command: string,
      senderInboxId: string,
    ) {
      const parts = command.split(" ");
      if (parts.length < 3) {
        await conversation.send(
          "Usage: /buy-access <group_contract> <tier_id>\nExample: /buy-access 0x123...abc 1",
        );
        return;
      }

      const contractAddress = parts[1];
      const tierId = parseInt(parts[2]);

      if (isNaN(tierId) || tierId < 1) {
        await conversation.send(
          "❌ Invalid tier ID. Please specify a positive number.",
        );
        return;
      }

      try {
        console.log(
          `💰 Purchasing access to ${contractAddress} tier ${tierId}`,
        );

        // Get user address
        const inboxState =
          await agent.client.preferences.inboxStateFromInboxIds([
            senderInboxId,
          ]);
        const userAddress = inboxState[0]?.identifiers[0]?.identifier;

        if (!userAddress) {
          await conversation.send("❌ Could not resolve your wallet address.");
          return;
        }

        // Purchase access using enhanced group manager
        const result = await enhancedGroupManager.purchaseAccess(
          contractAddress,
          tierId,
          userAddress,
          senderInboxId,
        );

        const successContent: ActionsContent = {
          id: `access-purchased-${Date.now()}`,
          description: `✅ Access Purchased Successfully!
🎫 Tier ${tierId} Access📄 Contract: \`${contractAddress}\`
💰 Cost: ${result.amount} USDC
🔗 Transaction: ${result.txHash}

You now have premium access to this group!`,
          actions: [
            {
              id: "my-tokens",
              label: "🎫 View My Tokens",
              style: "primary",
            },
            {
              id: "megapot-status",
              label: "🎰 Buy Lottery Tickets",
              style: "secondary",
            },
          ],
        };

        await conversation.send(successContent, ContentTypeActions);
      } catch (error) {
        console.error("❌ Error purchasing access:", error);
        await conversation.send(
          `❌ Failed to purchase access: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    async function handleSetupTiersCommand(
      conversation: any,
      command: string,
      senderInboxId: string,
    ) {
      const parts = command.split(" ");
      if (parts.length < 2) {
        await conversation.send(
          'Usage: /setup-tiers <group_name_or_contract>\nExample: /setup-tiers "My Group"',
        );
        return;
      }

      const identifier = parts.slice(1).join(" ");

      const tiersContent: ActionsContent = {
        id: `setup-tiers-${Date.now()}`,
        description: `⚙️ Setup Pricing Tiers
Interactive tier setup for: ${identifier}
This will guide you through:
• Setting USDC pricing for each tier
• Configuring access durations
• Uploading custom NFT images
• Setting up MegaPot lottery integration

Ready to begin the setup process?`,
        actions: [
          {
            id: "start-tier-setup",
            label: "🚀 Start Tier Setup",
            style: "primary",
          },
          {
            id: "help",
            label: "❓ Back to Help",
            style: "secondary",
          },
        ],
      };

      await conversation.send(tiersContent, ContentTypeActions);
    }

    async function sendGroupWelcomeMessages(
      contractAddress: string,
      groupName: string,
    ) {
      try {
        // Get the group configuration
        const groupConfig = Array.from(groupConfigs.values()).find(
          (config) =>
            config.contractAddress.toLowerCase() ===
            contractAddress.toLowerCase(),
        );

        if (!groupConfig) {
          console.log("⚠️ Group config not found for welcome messages");
          return;
        }

        // Send welcome message to sales group
        if (groupConfig.salesGroupId) {
          try {
            const salesGroup =
              await agent.client.conversations.getConversationById(
                groupConfig.salesGroupId,
              );
            if (salesGroup) {
              // Check if tiers are already configured
              const hasTiers =
                groupConfig.tiers && groupConfig.tiers.length > 0;

              let description = `🎉 Welcome to ${groupName} Sales Group!\n\n`;
              const actions = [];

              if (hasTiers) {
                description +=
                  `This is your premium community's sales channel!\n\n` +
                  `💎 Available Access Tiers:\n`;

                // Show configured tiers
                groupConfig.tiers.forEach((tier, index) => {
                  const priceUSD = tier.priceUSD || 0;
                  const durationDays = tier.durationDays || 30;
                  description += `${index + 1}. ${tier.name} - $${priceUSD} (${durationDays} days)\n`;
                });

                description += `\nUse the buttons below to purchase access or manage your community!`;

                actions.push(
                  {
                    id: `buy-access-${contractAddress}`,
                    label: "🛒 Purchase Access",
                    style: "primary",
                  },
                  {
                    id: `group-info-${contractAddress}`,
                    label: "📋 View Details",
                    style: "secondary",
                  },
                  {
                    id: `setup-tiers-${contractAddress}`,
                    label: "⚙️ Manage Tiers",
                    style: "secondary",
                  },
                );

                // Add MegaPot configuration for group owner
                // Note: We can't easily determine the current user in group context
                // This would need to be added to individual DM context
              } else {
                description +=
                  `This is your premium community's sales channel where members can:\n` +
                  `🛒 Purchase access to our premium community\n` +
                  `📋 Learn about available tiers and pricing\n` +
                  `💬 Get support from our team\n\n` +
                  `⚙️ First step: Set up your pricing tiers to enable purchases!`;

                actions.push(
                  {
                    id: `setup-tiers-${contractAddress}`,
                    label: "⚙️ Setup Pricing Tiers",
                    style: "primary",
                  },
                  {
                    id: "help",
                    label: "❓ Help & Commands",
                    style: "secondary",
                  },
                );
              }

              const salesWelcomeContent: ActionsContent = {
                id: `sales-welcome-${contractAddress}`,
                description,
                actions,
              };

              await salesGroup.send(salesWelcomeContent, ContentTypeActions);
            }
          } catch (error) {
            console.error("❌ Failed to send sales group welcome:", error);
          }
        }

        // Send welcome message to premium group
        if (groupConfig.premiumGroupId) {
          try {
            const premiumGroup =
              await agent.client.conversations.getConversationById(
                groupConfig.premiumGroupId,
              );
            if (premiumGroup) {
              await premiumGroup.send(
                `💎 Welcome to ${groupName} Premium!\n\n` +
                  `🎉 Congratulations! You now have exclusive access to our premium community.\n\n` +
                  `✨ Premium Benefits:\n` +
                  `• Exclusive content and discussions\n` +
                  `• Priority support\n` +
                  `• Special member privileges\n` +
                  `• Early access to new features\n\n` +
                  `Enjoy your premium experience! 🚀`,
              );
            }
          } catch (error) {
            console.error("❌ Failed to send premium group welcome:", error);
          }
        }
      } catch (error) {
        console.error("❌ Error sending group welcome messages:", error);
      }
    }

    async function handleGroupInfoCommand(
      conversation: any,
      contractAddress?: string,
    ) {
      try {
        if (!contractAddress) {
          await conversation.send(
            "❌ Please specify a group contract address or name.\n\nUsage: `/group-info <contract_address>`",
          );
          return;
        }

        // Find group config by contract address
        const groupConfig = Array.from(groupConfigs.values()).find(
          (config) =>
            config.contractAddress.toLowerCase() ===
            contractAddress.toLowerCase(),
        );

        if (!groupConfig) {
          await conversation.send(
            `❌ Group not found for contract: ${contractAddress}\n\nUse \`/list-groups\` to see your groups.`,
          );
          return;
        }

        if (!groupConfig.tiers || groupConfig.tiers.length === 0) {
          await conversation.send(
            `📋 ${groupConfig.groupName} Group Info\n\n` +
              `❌ No pricing tiers configured yet.\n\n` +
              `Use \`/setup-tiers\` to configure pricing tiers and enable purchases.`,
          );
          return;
        }

        let infoMessage =
          `📋 ${groupConfig.groupName} Group Info\n\n` +
          `💎 Available Access Tiers:\n\n`;

        groupConfig.tiers.forEach((tier, index) => {
          const priceUSD = tier.priceUSD || 0;
          const durationDays = tier.durationDays || 30;
          const maxSupply = tier.maxSupply || "Unlimited";

          infoMessage +=
            `${index + 1}. ${tier.name}\n` +
            `   💰 Price: $${priceUSD}\n` +
            `   ⏰ Duration: ${durationDays} days\n` +
            `   📊 Max Supply: ${maxSupply}\n`;

          if (tier.description) {
            infoMessage += `   📝 ${tier.description}\n`;
          }

          if (tier.benefits && tier.benefits.length > 0) {
            infoMessage += `   ✨ Benefits: ${tier.benefits.join(", ")}\n`;
          }

          infoMessage += `\n`;
        });

        infoMessage +=
          `🛒 To purchase access, reply with:\n` +
          `\`/buy-access ${contractAddress} <tier_number>\`\n\n` +
          `Example: \`/buy-access ${contractAddress} 1\``;

        await conversation.send(infoMessage);
      } catch (error) {
        console.error("❌ Error getting group info:", error);
        await conversation.send(
          `❌ Failed to get group info: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    async function handleListCommandsCommand(conversation: any) {
      const commandsContent: ActionsContent = {
        id: `commands-list-${Date.now()}`,
        description:
          `📋 Complete Command List\n\n` +
          `🏗️ Group Management:\n` +
          `/create-group "name" - Create premium group (approve 0.001 ETH transaction)\n` +
          `/list-groups - View your groups\n` +
          `/setup-tiers <contract> - Configure pricing tiers\n` +
          `\n` +
          `💰 Access & Payments:\n` +
          `/buy-access <contract> <tier> - Purchase group access (approve USDC transaction)\n` +
          `/my-tokens - View your access tokens\n` +
          `\n` +
          `🎰 MegaPot Lottery:\n` +
          `/megapot-status - View lottery status\n` +
          `/buy-tickets <number> - Purchase lottery tickets (approve USDC transaction)\n` +
          `/claim-winnings - Claim lottery winnings (with optional group distribution)\n` +
          `\n` +
          `💡 Transaction Flow:\n` +
          `1. Use /create-group to start group creation\n` +
          `2. Approve the 0.001 ETH transaction in your wallet\n` +
          `3. Groups are automatically deployed after payment\n` +
          `\n` +
          `All purchases require wallet transaction approval.`,
        actions: [
          {
            id: "create-group",
            label: "🏗️ Create Group",
            style: "primary",
          },
          {
            id: "megapot-status",
            label: "🎰 MegaPot",
            style: "primary",
          },
          {
            id: "help",
            label: "❓ Back to Main Menu",
            style: "secondary",
          },
        ],
      };

      // Register the new buttons as active BEFORE sending
      const senderInboxId = (conversation as any).peerInboxId || "unknown";
      if (senderInboxId && senderInboxId !== "unknown") {
        registerActiveButtons(senderInboxId, commandsContent.actions);
      }

      await conversation.send(commandsContent, ContentTypeActions);
    }

    async function handleGroupNameInput(
      conversation: any,
      groupName: string,
      senderInboxId: string,
    ) {
      // Check if this user has a pending create-group action
      const pending = globalThis.pendingGroupCreations?.get(senderInboxId);
      if (!pending || !pending.waitingForName) {
        // This might not be a group name input, send help
        await handleHelpCommand(conversation, senderInboxId);
        return;
      }

      console.log(
        `🏗️ Processing group name input: ${groupName} for user: ${senderInboxId}`,
      );

      try {
        // Clear the waiting state
        globalThis.pendingGroupCreations.delete(senderInboxId);

        // Get sender's address
        let senderAddress = "unknown";
        try {
          const inboxState =
            await agent.client.preferences.inboxStateFromInboxIds([
              senderInboxId,
            ]);
          senderAddress =
            inboxState[0]?.identifiers[0]?.identifier || "unknown";
        } catch (error) {
          console.warn("Could not resolve sender address:", error);
        }

        // Send initial message
        await conversation.send(
          `🏗️ Creating Premium Community System\n\n` +
            `📋 Group Name: ${groupName}\n` +
            `💰 Creation Fee: 0.001 ETH\n\n` +
            `⚙️ Please approve the payment transaction to continue...\n\n` +
            `This covers deployment costs and gas fees.`,
        );

        // Create payment transaction for user approval
        const walletSendCalls = createGroupCreationPayment(
          "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc", // Agent's Ethereum address
          groupName,
          senderAddress,
        );

        // Send transaction proposal to user
        await conversation.send(walletSendCalls, ContentTypeWalletSendCalls);

        // Register pending payment for monitoring
        const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        pendingGroupPayments.set(paymentId, {
          id: paymentId,
          groupName,
          senderInboxId,
          creatorAddress: senderAddress,
          conversation,
          registeredAt: Date.now(),
        });

        await conversation.send(
          `✅ Transaction sent for approval!\n\n` +
            `After you approve the payment:\n` +
            `• I'll detect the payment within 1-2 minutes\n` +
            `• Your premium community will be deployed automatically\n` +
            `• You'll get admin access to both groups\n\n` +
            `⏳ Monitoring blockchain for your payment...`,
        );
      } catch (error) {
        console.error("❌ Error creating group transaction:", error);
        await conversation.send(
          `❌ Failed to create group transaction: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    async function handleTransactionReference(
      conversation: any,
      transactionRef: TransactionReference,
      senderInboxId: string,
    ) {
      console.log("🧾 Processing transaction reference:", transactionRef);
      console.log(
        "📊 Full transaction reference object:",
        JSON.stringify(transactionRef, null, 2),
      );

      const networkInfo = { name: "Base", id: "base" };

      // Extract transaction details - the data is nested under transactionReference property
      const txData = transactionRef.transactionReference || transactionRef;
      const txHash = txData.reference;
      const networkId = txData.networkId;
      const metadata = txData.metadata;

      console.log("🔍 Extracted data:");
      console.log(`  • txHash: ${txHash}`);
      console.log(`  • networkId: ${networkId}`);
      console.log(
        `  • metadata:`,
        metadata ? JSON.stringify(metadata, null, 4) : "null",
      );

      let receiptMessage =
        `📋 Transaction Reference Received\n\n` +
        `TRANSACTION DETAILS:\n` +
        `• Transaction Hash: ${txHash}\n` +
        `• Network ID: ${networkId}\n` +
        `• Transaction Type: ${metadata?.transactionType || "Unknown"}\n` +
        `• From Address: ${metadata?.fromAddress || "Unknown"}`;

      // Add additional metadata information if available
      if (metadata) {
        receiptMessage += `\n\nADDITIONAL INFO:`;
        if (metadata.currency && metadata.amount && metadata.decimals) {
          const amount = metadata.amount / Math.pow(10, metadata.decimals);
          receiptMessage += `\n• Amount: ${amount} ${metadata.currency}`;
        }
        if (metadata.toAddress) {
          receiptMessage += `\n• To Address: ${metadata.toAddress}`;
        }
        // Add any other metadata fields that might be present
        const excludeFields = [
          "transactionType",
          "fromAddress",
          "currency",
          "amount",
          "decimals",
          "toAddress",
        ];
        Object.entries(metadata).forEach(([key, value]) => {
          if (
            !excludeFields.includes(key) &&
            value !== undefined &&
            value !== null
          ) {
            receiptMessage += `\n• ${key}: ${value}`;
          }
        });
      }

      receiptMessage += `\n\n🔗 View on explorer:\n${getExplorerUrl(txHash, networkId || networkInfo.id)}`;
      receiptMessage += `\n\n✅ Thank you for sharing the transaction details!`;

      console.log("📤 Sending transaction reference response to user");
      await conversation.send(receiptMessage);
      console.log("✅ Transaction reference processing completed successfully");
    }

    // Helper function to get explorer URL
    function getExplorerUrl(txHash: string, networkId: string): string {
      const explorers: Record<string, string> = {
        base: "https://basescan.org/tx/",
        "base-mainnet": "https://basescan.org/tx/",
        "base-sepolia": "https://sepolia.basescan.org/tx/",
      };

      const baseUrl = explorers[networkId] || explorers["base"];
      return `${baseUrl}${txHash}`;
    }

    async function handleTransactionHash(
      txHash: string,
      message: any,
      client: any,
      enhancedGroupManager: any,
    ) {
      try {
        const conversation = await client.conversations.getConversationById(
          message.conversationId,
        );

        if (!conversation) {
          console.log("❌ Unable to find conversation for transaction hash");
          return;
        }

        // Get sender address
        const inboxState = await client.preferences.inboxStateFromInboxIds([
          message.senderInboxId,
        ]);
        const senderAddress = inboxState[0]?.identifiers[0]?.identifier;

        if (!senderAddress) {
          await conversation.send("❌ Could not resolve your wallet address.");
          return;
        }

        // Check for pending group creation
        if (globalThis.pendingGroupCreations?.has(message.senderInboxId)) {
          const pending = globalThis.pendingGroupCreations.get(
            message.senderInboxId,
          );

          // Verify the transaction
          const BASE_RPC_URL = process.env.BASE_RPC_URL;
          if (!BASE_RPC_URL) {
            await conversation.send("❌ RPC URL not configured");
            return;
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
            await conversation.send("❌ Transaction not found on blockchain");
            return;
          }

          // Verify transaction details
          const agentAddress = "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc";
          const expectedAmount = "0xde0b6b3a7640000"; // 0.001 ETH in wei

          if (tx.to?.toLowerCase() !== agentAddress.toLowerCase()) {
            await conversation.send(
              "❌ Transaction not sent to the correct agent address",
            );
            return;
          }

          if (tx.value !== expectedAmount) {
            await conversation.send(
              "❌ Transaction amount is incorrect. Expected 0.001 ETH",
            );
            return;
          }

          // Transaction is valid, create the group
          console.log(
            `✅ Valid payment received for group: ${pending.groupName}`,
          );

          try {
            const result = await enhancedGroupManager.createGroup(
              pending.groupName,
              message.senderInboxId,
            );

            const successContent: ActionsContent = {
              id: `group-created-${Date.now()}`,
              description:
                `✅ Group Created Successfully!\n\n` +
                `🏗️ ${pending.groupName}\n` +
                `📄 Contract: ${result.contractAddress}\n` +
                `💰 Cost: 0.001 ETH (deployment fee)\n` +
                `🎫 Access tokens now available\n\n` +
                `Next Steps:\n` +
                `• Set up pricing tiers with /setup-tiers\n` +
                `• Configure MegaPot lottery integration\n` +
                `• Share your group with potential members`,
              actions: [
                {
                  id: "setup-tiers",
                  label: "⚙️ Setup Pricing Tiers",
                  style: "primary",
                },
                {
                  id: "megapot-status",
                  label: "🎰 Setup Lottery",
                  style: "primary",
                },
                {
                  id: "list-groups",
                  label: "📋 View My Groups",
                  style: "secondary",
                },
              ],
            };

            await conversation.send(successContent, ContentTypeActions);

            // Send welcome messages to the groups
            await sendGroupWelcomeMessages(
              result.contractAddress,
              pending.groupName,
            );

            // Clear pending state
            globalThis.pendingGroupCreations.delete(message.senderInboxId);
          } catch (error) {
            console.error("❌ Error creating group:", error);
            await conversation.send(
              `❌ Failed to create group: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        } else {
          await conversation.send(
            `Transaction hash received: ${txHash}\n\n` +
              `If this is for group creation, please use /create-group first.\n` +
              `If this is for access purchase, please use /buy-access.`,
          );
        }
      } catch (error) {
        console.error("❌ Error processing transaction hash:", error);
        try {
          const conversation = await client.conversations.getConversationById(
            message.conversationId,
          );
          if (conversation) {
            await conversation.send(
              `❌ Error processing transaction: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        } catch (sendError) {
          console.error("❌ Failed to send error message:", sendError);
        }
      }
    }

    console.log("✅ Message handlers set up");

    // Error handling
    agent.on("error", (error) => {
      console.error("❌ Agent error:", error);
    });

    // Lifecycle events
    agent.on("start", () => {
      console.log("✅ XMTPAuth Agent is online!");
      console.log(
        `🔗 Test URL: http://xmtp.chat/dm/${agent.client.inboxId || "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc"}`,
      );
      console.log("");
      console.log("🎯 Features:");
      console.log("  • Basic XMTP messaging");
      console.log("  • Reaction support");
      console.log("  • 🎯 Interactive Action Buttons");
      console.log("  • 🎰 MegaPot Lottery Integration");
      console.log("  • Simple command handling");
      console.log("");
      console.log(
        "💬 Try messaging the agent with 'gm' or 'hello' to see the interactive buttons!",
      );
    });

    agent.on("stop", () => {
      console.log("👋 Agent stopped");
    });

    // Start the agent
    await agent.start();

    // Start payment monitoring for group creation
    await startPaymentMonitoring();

    // Set global reference for cleanup
    globalMegaPotManager = megaPotManager;
  } catch (error) {
    console.error("❌ Failed to start agent:", error);
    process.exit(1);
  }
}

// Global variable for cleanup
let globalMegaPotManager: any;

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down gracefully...");
  if (globalMegaPotManager) {
    globalMegaPotManager.cleanup();
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n👋 Shutting down gracefully...");
  if (globalMegaPotManager) {
    globalMegaPotManager.cleanup();
  }
  process.exit(0);
});

// Start the agent
main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
