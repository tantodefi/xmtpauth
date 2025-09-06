import {
  Agent,
  CommandRouter,
  createSigner,
  createUser,
  f,
  filter,
  getTestUrl,
  withFilter,
} from "@xmtp/agent-sdk";
import { ReactionCodec } from "@xmtp/content-type-reaction";
import { RemoteAttachmentCodec } from "@xmtp/content-type-remote-attachment";
import { TransactionReferenceCodec } from "@xmtp/content-type-transaction-reference";
import { WalletSendCallsCodec } from "@xmtp/content-type-wallet-send-calls";
import { IPFSHandler } from "./handlers/IPFSHandler.js";
// Import handlers and managers
import { EVMAuthManager } from "./managers/EVMAuthManager.js";
import { GroupManager } from "./managers/GroupManager.js";
import { TransactionManager } from "./managers/TransactionManager.js";
import { WelcomeManager } from "./managers/WelcomeManager.js";
// Import our custom content types
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

// Load environment variables
process.loadEnvFile(".env");

// Environment validation
const requiredEnvVars = [
  "XMTP_WALLET_KEY",
  "XMTP_ENV",
  "XMTP_DB_ENCRYPTION_KEY",
  "BASE_RPC_URL",
  "EVMAUTH_FACTORY_ADDRESS",
  "USDC_ADDRESS",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

async function main() {
  console.log("🚀 Starting XMTP EVMAuth Groups Agent v2 with Agent SDK...");

  try {
    // Create agent using environment variables
    const agent = await Agent.create(undefined, {
      env: (process.env.XMTP_ENV as "dev" | "production") || "dev",
      dbPath: process.env.XMTP_DB_PATH || null, // in-memory if not specified
      codecs: [
        new ActionsCodec(),
        new IntentCodec(),
        new ReactionCodec(),
        new RemoteAttachmentCodec(),
        new TransactionReferenceCodec(),
        new WalletSendCallsCodec(),
      ],
    });

    // Initialize managers
    const evmAuthManager = new EVMAuthManager(
      process.env.BASE_RPC_URL!,
      process.env.EVMAUTH_FACTORY_ADDRESS!,
      process.env.XMTP_WALLET_KEY!,
    );

    const ipfsHandler = new IPFSHandler();
    const groupManager = new GroupManager(agent.client, evmAuthManager);
    const welcomeManager = new WelcomeManager();
    const transactionManager = new TransactionManager();

    // Initialize database and get stats
    console.log("📊 Initializing database...");
    // Database is initialized in GroupManager constructor

    // Helper function to send eyeball reaction
    const sendEyeballReaction = async (
      conversation: any,
      messageId: string,
    ) => {
      try {
        await conversation.send(
          {
            reference: messageId,
            action: "added",
            content: "👀",
          },
          "xmtp.org/reaction:1.0",
        );
      } catch (error) {
        console.error("Failed to send eyeball reaction:", error);
      }
    };

    // Create command router for streamlined command handling
    const router = new CommandRouter();

    // Welcome message with inline actions
    router.command("/help", async (ctx) => {
      const welcomeActions: ActionsContent = {
        id: `welcome-${Date.now()}`,
        description: `🚀 Welcome to EVMAuth Groups Agent v2!

Create and monetize premium XMTP groups with time-bound NFT access tokens on Base network.

✨ Choose an action to get started:`,
        actions: [
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
            id: "my-tokens",
            label: "🎫 My Tokens",
            style: "secondary",
          },
          {
            id: "more-commands",
            label: "📖 More Commands",
            style: "secondary",
          },
        ],
      };

      await ctx.conversation.send(welcomeActions, ContentTypeActions);
    });

    // Group creation command
    router.command("/create-group", async (ctx) => {
      const args = ctx.message.content.split(" ").slice(1);
      if (args.length === 0) {
        const createActions: ActionsContent = {
          id: `create-help-${Date.now()}`,
          description:
            "To create a premium group, please provide a name:\n\nExample: `/create-group My Premium Community`",
          actions: [
            {
              id: "help",
              label: "❓ Back to Help",
              style: "secondary",
            },
          ],
        };
        await ctx.conversation.send(createActions, ContentTypeActions);
        return;
      }

      const groupName = args.join(" ");

      try {
        // Get real deployment fee from contract
        const deploymentFee = await evmAuthManager.getDeploymentFee();
        const feeInEth = evmAuthManager.formatEth(deploymentFee);

        // Show confirmation with inline actions
        const confirmActions: ActionsContent = {
          id: `create-confirm-${Date.now()}`,
          description: `Create premium group "${groupName}"?\n\n💰 Cost: ${feeInEth} ETH deployment fee\n⚡ Network: Base Mainnet\n🎫 Features: Time-bound NFT access tokens\n📊 Creates dual groups (Sales + Premium)`,
          actions: [
            {
              id: "confirm-create",
              label: "✅ Create Group",
              style: "primary",
            },
            {
              id: "cancel-create",
              label: "❌ Cancel",
              style: "secondary",
            },
          ],
        };

        // Store group name in metadata for confirmation
        confirmActions.actions[0].id = `confirm-create-${Buffer.from(groupName).toString("base64")}`;

        await ctx.conversation.send(confirmActions, ContentTypeActions);
      } catch (error) {
        await ctx.sendTextReply(
          `❌ Error getting deployment fee: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });

    // List groups command
    router.command("/list-groups", async (ctx) => {
      await ctx.sendTextReply("🔍 Fetching your premium groups...");

      try {
        const groups = await groupManager.getUserGroups(
          ctx.message.senderInboxId,
        );

        if (groups.length === 0) {
          const noGroupsActions: ActionsContent = {
            id: `no-groups-${Date.now()}`,
            description: "You don't have any premium groups yet.",
            actions: [
              {
                id: "create-group",
                label: "🏗️ Create Your First Group",
                style: "primary",
              },
              {
                id: "help",
                label: "❓ Back to Help",
                style: "secondary",
              },
            ],
          };
          await ctx.conversation.send(noGroupsActions, ContentTypeActions);
          return;
        }

        // Show groups with inline actions
        const groupActions: ActionsContent = {
          id: `groups-${Date.now()}`,
          description: `📋 Your Premium Groups (${groups.length}):\n\n${groups
            .map((g, i) => {
              const urls = evmAuthManager.generateOpenSeaUrls(
                g.contractAddress,
              );
              return `${i + 1}. ${g.name}\n   💰 Revenue: ${g.revenue} ETH\n   👥 Members: ${g.memberCount}\n   🌊 OpenSea: ${urls.collection}`;
            })
            .join("\n\n")}`,
          actions: groups
            .slice(0, 5)
            .map((group, index) => ({
              id: `group-info-${group.id}`,
              label: `ℹ️ ${group.name.slice(0, 20)}${group.name.length > 20 ? "..." : ""}`,
              style: "secondary" as const,
            }))
            .concat([
              {
                id: "create-group",
                label: "➕ Create New Group",
                style: "primary",
              },
            ]),
        };

        await ctx.conversation.send(groupActions, ContentTypeActions);
      } catch (error) {
        await ctx.sendTextReply(
          `❌ Error fetching groups: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });

    // Handle Intent messages (button clicks)
    agent.on(
      "message",
      withFilter(f.contentType(ContentTypeIntent), async (ctx) => {
        const intent = ctx.message.content as IntentContent;
        console.log(`🎯 Processing intent: ${intent.actionId}`);

        try {
          switch (intent.actionId) {
            case "create-group":
              const createInstructions: ActionsContent = {
                id: `create-instructions-${Date.now()}`,
                description:
                  "📝 To create a premium group, use:\n\n`/create-group <name>`\n\nExample: `/create-group My Premium Community`",
                actions: [
                  {
                    id: "help",
                    label: "❓ Back to Help",
                    style: "secondary",
                  },
                ],
              };
              await ctx.conversation.send(
                createInstructions,
                ContentTypeActions,
              );
              break;

            case "list-groups":
              // Trigger list groups command
              await router.handle({
                ...ctx,
                message: { ...ctx.message, content: "/list-groups" },
              } as any);
              break;

            case "buy-access":
              const buyInstructions: ActionsContent = {
                id: `buy-instructions-${Date.now()}`,
                description:
                  "💰 To purchase access to a premium group:\n\n`/buy-access <group_id> <tier_id>`\n\nUse `/list-groups` to see available groups first.",
                actions: [
                  {
                    id: "list-groups",
                    label: "📋 View Groups",
                    style: "primary",
                  },
                  {
                    id: "help",
                    label: "❓ Back to Help",
                    style: "secondary",
                  },
                ],
              };
              await ctx.conversation.send(buyInstructions, ContentTypeActions);
              break;

            case "my-tokens":
              await ctx.sendTextReply("🎫 Fetching your access tokens...");
              // TODO: Implement token fetching
              break;

            case "more-commands":
              const moreCommands: ActionsContent = {
                id: `more-commands-${Date.now()}`,
                description: `📖 **Additional Commands:**

**Group Management:**
• \`/group-info <group_id>\` - View group details
• \`/grant-trial <group> <user> <days>\` - Grant trial access

**Access Control:**
• \`/setup-tiers <group_id>\` - Configure pricing tiers
• \`/buy-access <group_id> <tier_id>\` - Purchase with USDC

**Utilities:**
• \`/test-expiration\` - Test token expiration
• \`/withdraw <contract>\` - Withdraw earnings`,
                actions: [
                  {
                    id: "help",
                    label: "🏠 Main Menu",
                    style: "primary",
                  },
                ],
              };
              await ctx.conversation.send(moreCommands, ContentTypeActions);
              break;

            case "help":
              // Trigger help command
              await router.handle({
                ...ctx,
                message: { ...ctx.message, content: "/help" },
              } as any);
              break;

            default:
              // Handle group creation confirmations
              if (intent.actionId.startsWith("confirm-create-")) {
                const groupNameB64 = intent.actionId.replace(
                  "confirm-create-",
                  "",
                );
                const groupName = Buffer.from(
                  groupNameB64,
                  "base64",
                ).toString();

                await ctx.sendTextReply(
                  `🏗️ Creating premium group "${groupName}"...`,
                );

                try {
                  const result = await groupManager.createGroup(
                    groupName,
                    ctx.message.senderInboxId,
                  );

                  // Generate OpenSea URLs
                  const urls = evmAuthManager.generateOpenSeaUrls(
                    result.contractAddress,
                  );

                  const successActions: ActionsContent = {
                    id: `success-${Date.now()}`,
                    description: `✅ Group Created Successfully!

📋 Group: ${groupName}
🆔 ID: ${result.groupId}
📄 Contract: ${result.contractAddress}
💰 Cost: 0.001 ETH

🔗 Links:
🌊 OpenSea: ${urls.collection}
🔍 BaseScan: ${urls.baseScan}

Next steps: Set up pricing tiers for monetization!`,
                    actions: [
                      {
                        id: `setup-tiers-${result.groupId}`,
                        label: "⚙️ Setup Pricing Tiers",
                        style: "primary",
                      },
                      {
                        id: "list-groups",
                        label: "📋 View All Groups",
                        style: "secondary",
                      },
                    ],
                  };

                  await ctx.conversation.send(
                    successActions,
                    ContentTypeActions,
                  );
                } catch (error) {
                  await ctx.sendTextReply(
                    `❌ Failed to create group: ${error instanceof Error ? error.message : String(error)}`,
                  );
                }
              }
              // Handle transaction confirmations
              else if (intent.actionId.startsWith("confirm-tx-")) {
                const txId = intent.actionId.replace("confirm-tx-", "");
                await transactionManager.confirmTransaction(txId, ctx);
              }
              // Handle transaction rejections
              else if (intent.actionId.startsWith("reject-tx-")) {
                const txId = intent.actionId.replace("reject-tx-", "");
                await transactionManager.rejectTransaction(txId, ctx);
              }
              // Handle group info requests
              else if (intent.actionId.startsWith("group-info-")) {
                const groupId = intent.actionId.replace("group-info-", "");
                const groupInfo = await groupManager.getGroupInfo(groupId);

                if (groupInfo) {
                  const infoActions: ActionsContent = {
                    id: `group-info-${Date.now()}`,
                    description: `📋 ${groupInfo.name}

🆔 ID: ${groupInfo.id}
📄 Contract: ${groupInfo.contractAddress}
💰 Revenue: ${groupInfo.revenue} ETH
👥 Members: ${groupInfo.memberCount}
🎫 Tiers: ${groupInfo.tiers.length}`,
                    actions: [
                      {
                        id: `setup-tiers-${groupId}`,
                        label: "⚙️ Setup Tiers",
                        style: "primary",
                      },
                      {
                        id: "list-groups",
                        label: "📋 Back to Groups",
                        style: "secondary",
                      },
                    ],
                  };
                  await ctx.conversation.send(infoActions, ContentTypeActions);
                } else {
                  await ctx.sendTextReply("❌ Group not found.");
                }
              }
              // Handle feature showcase
              else if (intent.actionId === "show-features") {
                const featureActions = welcomeManager.createFeatureShowcase();
                await ctx.conversation.send(featureActions, ContentTypeActions);
              }
              // Handle command reference
              else if (intent.actionId === "show-commands") {
                const commandActions = welcomeManager.createCommandReference();
                await ctx.conversation.send(commandActions, ContentTypeActions);
              }
              break;
          }
        } catch (error) {
          console.error("Error processing intent:", error);
          await ctx.sendTextReply(
            "❌ An error occurred processing your request.",
          );
        }
      }),
    );

    // Handle transaction references with inline confirmations
    agent.on(
      "message",
      withFilter(
        f.contentType("xmtp.org/transactionReference:1.0"),
        async (ctx) => {
          await transactionManager.handleTransactionReference(ctx);
        },
      ),
    );

    // Filter for text-only messages from others (not self)
    const textFromOthers = f.and(f.notFromSelf, f.textOnly);

    // Handle regular text messages
    agent.on(
      "message",
      withFilter(textFromOthers, async (ctx) => {
        const content = ctx.message.content as string;

        // Send eyeball reaction to all messages
        await sendEyeballReaction(ctx.conversation, ctx.message.id);

        // Skip if it's a command (will be handled by router)
        if (content.startsWith("/")) {
          return;
        }

        // Auto-welcome for new conversations
        if (
          content.toLowerCase().includes("gm") ||
          content.toLowerCase().includes("hello")
        ) {
          await router.handle({
            ...ctx,
            message: { ...ctx.message, content: "/help" },
          } as any);
        }
      }),
    );

    // Use the router middleware
    agent.use(router.middleware());

    // Error handling
    agent.on("error", (error) => {
      console.error("❌ Agent error:", error);
    });

    // Lifecycle events
    agent.on("start", () => {
      console.log("✅ EVMAuth Groups Agent v2 is online!");
      console.log(`🔗 Test URL: ${getTestUrl(agent)}`);
      console.log("");
      console.log("🎯 Features:");
      console.log("  • Inline action buttons for better UX");
      console.log("  • Streamlined group creation flow");
      console.log("  • Transaction confirmations with buttons");
      console.log("  • Welcome messages with guided actions");
      console.log("  • Modern middleware-based architecture");
      console.log("");
      console.log("💬 Try messaging the agent with 'gm' or '/help'");
    });

    agent.on("stop", () => {
      console.log("👋 Agent stopped");
    });

    // Start the agent
    await agent.start();
  } catch (error) {
    console.error("❌ Failed to start agent:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n👋 Shutting down gracefully...");
  process.exit(0);
});

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
