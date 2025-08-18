/**
 * Enhanced group creation with payment approval workflow
 */

import { ContentTypeWalletSendCalls } from "@xmtp/content-type-wallet-send-calls";
import type { JSONDatabase } from "../database/json-database";
import type { EnhancedGroupManager } from "../managers/enhanced-group-flow";
import type { DualGroupConfig, GroupMetadata } from "../types/types";
import { addressResolver } from "./address-resolver";
import { GroupDeduplicationManager } from "./group-deduplication";
import type { PaymentMonitor } from "./payment-monitor";
import { createGroupCreationPayment } from "./payment-transactions";
import type { PersistentStateManager } from "./persistent-state";

/**
 * Handle create-group command with payment approval workflow
 */
export async function handleCreateGroupWithPayment(
  conversation: any,
  memberAddress: string,
  senderInboxId: string,
  messageContent: string,
  enhancedGroupManager: EnhancedGroupManager,
  groupConfigs: Map<string, DualGroupConfig>,
  agentAddress: string,
  paymentMonitor: PaymentMonitor,
  persistentState: PersistentStateManager,
  database?: JSONDatabase,
): Promise<void> {
  try {
    const parts = messageContent.split(" ");
    if (parts.length < 2) {
      await conversation.send(
        'Usage: /create-group "<name>"\nExample: /create-group "My Premium Community"',
      );
      return;
    }

    // Extract group name (handle quoted names)
    const groupName = messageContent
      .substring(messageContent.indexOf(" ") + 1)
      .replace(/['"]/g, "")
      .trim();

    if (!groupName) {
      await conversation.send("Please provide a valid group name.");
      return;
    }

    // Prevent duplicate premium groups for the same creator (persistent + in-memory)
    try {
      // Check persistent DB
      if (database) {
        const existing = await database.findGroupByName(
          senderInboxId,
          groupName,
        );
        if (existing) {
          await conversation.send(
            `❌ A premium group named "${groupName}" already exists for you.\n\n` +
              `Contract: ${existing.contractAddress}\n` +
              `Sales Group: ${existing.salesGroupId}\n` +
              `Premium Group: ${existing.premiumGroupId}`,
          );
          return;
        }
      }

      // Check in-memory configs as an extra guard
      const dup = Array.from(groupConfigs.values()).find(
        (cfg) =>
          cfg.creatorInboxId === senderInboxId &&
          cfg.metadata?.name?.toLowerCase() === groupName.toLowerCase(),
      );
      if (dup) {
        await conversation.send(
          `❌ A premium group named "${groupName}" already exists for you.\n\n` +
            `Contract: ${dup.contractAddress}\n` +
            `Sales Group: ${dup.salesGroupId}\n` +
            `Premium Group: ${dup.premiumGroupId}`,
        );
        return;
      }
    } catch (e) {
      // Non-fatal; continue
    }

    await conversation.send(
      `🏗️ Creating Premium Community System\n\n` +
        `📋 Group Name: ${groupName}\n` +
        `💰 Creation Fee: 0.001 ETH\n\n` +
        `⚙️ Please approve the payment transaction to continue...\n\n` +
        `This covers deployment costs and gas fees.`,
    );

    // Create payment transaction for user approval
    const paymentTransaction = createGroupCreationPayment(
      agentAddress,
      groupName,
      memberAddress,
    );

    // Send transaction proposal to user
    await conversation.send(paymentTransaction, ContentTypeWalletSendCalls);

    // Register pending payment for monitoring
    paymentMonitor.registerPendingPayment(
      `${senderInboxId}-${groupName}-${Date.now()}`,
      senderInboxId,
      groupName,
      memberAddress, // This is actually the creator's address
      conversation,
    );

    await conversation.send(
      `✅ Transaction sent for approval!\n\n` +
        `After you approve the payment:\n` +
        `• I'll detect the payment within 1-2 minutes\n` +
        `• Your premium community will be deployed automatically\n` +
        `• You'll get admin access to both groups\n` +
        `• You can issue free trial access to users\n\n` +
        `⏳ Monitoring blockchain for your payment...`,
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in create-group-with-payment:", errorMessage);

    await conversation.send(
      `❌ Failed to create premium community\n\n` +
        `Error: ${errorMessage}\n\n` +
        `Please try again or contact support if the issue persists.`,
    );
  }
}

/**
 * Handle grant-trial command for creators to give free access
 * Agent directly mints NFT and adds user to group - NO USER APPROVAL NEEDED
 */
export async function handleGrantTrial(
  conversation: any,
  memberAddress: string,
  senderInboxId: string,
  messageContent: string,
  groupConfigs: Map<string, DualGroupConfig>,
  evmAuthHandler?: any,
  enhancedGroupManager?: any,
): Promise<void> {
  try {
    // Parse command: /grant-trial <group_name> <user_address_or_name> <days>
    const parts = messageContent.split(" ");
    if (parts.length < 4) {
      await conversation.send(
        "Usage: /grant-trial <group_name> <user_address_or_name> <days>\n" +
          "Examples:\n" +
          "• /grant-trial MyGroup 0x123... 7\n" +
          "• /grant-trial MyGroup @username.base.eth 7\n" +
          "• /grant-trial MyGroup @username.eth 7\n" +
          "• /grant-trial MyGroup @farcaster_handle 7",
      );
      return;
    }

    const groupName = parts[1];
    const userInput = parts[2];
    const days = parseInt(parts[3]);

    if (isNaN(days) || days <= 0) {
      await conversation.send("Please provide a valid number of days.");
      return;
    }

    // Resolve user address
    await conversation.send(`🔍 Resolving address for: ${userInput}...`);
    const resolution = await addressResolver.resolveAddress(userInput);

    if (!resolution.address) {
      await conversation.send(
        `❌ Could not resolve address: ${userInput}\n\n` +
          `Error: ${resolution.error}\n\n` +
          `💡 **Solution**: Please use a direct Ethereum address instead:\n` +
          `• /grant-trial ${groupName} 0x1234567890abcdef... ${days}\n\n` +
          `⚠️ **Note**: Address resolution services are temporarily disabled.\n` +
          `Supported formats:\n` +
          `• ✅ Direct address: 0x123... (EOA or Smart Contract)\n` +
          `• ❌ Basename: @username.base.eth (disabled)\n` +
          `• ❌ ENS: @username.eth (disabled)\n` +
          `• ❌ Farcaster: @handle (disabled)`,
      );
      return;
    }

    const userAddress = resolution.address;
    const resolutionDisplay = addressResolver.formatResolution(resolution);
    const walletType = addressResolver.getWalletType(
      userAddress,
      resolution.isSmartContract,
    );

    // Show wallet type information
    await conversation.send(
      `✅ Address resolved successfully!\n\n` +
        `📍 Address: ${userAddress}\n` +
        `🔧 Type: ${walletType}\n` +
        `📋 Group: ${groupName}\n` +
        `⏰ Duration: ${days} days\n\n` +
        `🔄 Proceeding with trial grant...`,
    );

    // Find the group configuration
    const groupConfig = Array.from(groupConfigs.values()).find(
      (config) =>
        config.metadata?.name?.toLowerCase() === groupName.toLowerCase(),
    );

    if (!groupConfig) {
      await conversation.send(`Group "${groupName}" not found.`);
      return;
    }

    // Check if sender is the creator/admin
    if (groupConfig.creatorInboxId !== senderInboxId) {
      await conversation.send(
        "❌ Only the group creator can grant trial access.",
      );
      return;
    }

    // Agent directly mints trial NFT - NO USER APPROVAL NEEDED
    await conversation.send(
      `🎁 Granting Trial Access\n\n` +
        `📋 Group: ${groupName}\n` +
        `👤 Recipient: ${resolutionDisplay}\n` +
        `⏰ Duration: ${days} days\n\n` +
        `🔄 Minting trial NFT and adding to group...`,
    );

    if (!evmAuthHandler) {
      await conversation.send(
        "❌ EVM handler not available. Please try again later.",
      );
      return;
    }

    // Step 1: Find or create token ID for this specific trial duration
    console.log(`🎁 Finding or creating token ID for ${days}-day trial`);
    try {
      const tokenId = await evmAuthHandler.findOrCreateTrialTokenId(
        groupConfig.contractAddress,
        days,
      );
      console.log(`✅ Found/created token ID: ${tokenId}`);

      // Step 2: Mint the trial NFT
      console.log(`🎁 Minting trial NFT to ${userAddress}...`);
      const txHash = await evmAuthHandler.mintTrialNFT(
        groupConfig.contractAddress,
        userAddress,
        tokenId,
        days,
      );

      console.log(`✅ Trial NFT minted: ${txHash}`);

      // Step 3: Add user to premium group if manager available
      let inboxId: string | null = null;
      let groupAddedSuccessfully = false;

      if (enhancedGroupManager) {
        try {
          // Try to resolve inbox ID from address
          try {
            // Use XMTP client to get inbox ID from address
            const client = enhancedGroupManager.getClient();
            if (client) {
              // Try creating a DM with the address to get their inbox ID
              try {
                const dm = await client.conversations.newDmWithIdentifier({
                  identifier: userAddress,
                  identifierKind: 0, // Ethereum address
                });

                // Get the peer's inbox ID from the DM
                if (dm && "peerInboxId" in dm) {
                  inboxId = dm.peerInboxId;
                  console.log(`📍 Resolved inbox ID from DM: ${inboxId}`);
                }
              } catch (dmError) {
                console.log(
                  `⚠️ Could not create DM to resolve inbox ID: ${dmError}`,
                );
              }
            }
          } catch (resolveError) {
            console.log(`⚠️ Could not resolve inbox ID: ${resolveError}`);
          }

          // If we couldn't resolve inbox ID, skip group addition for now
          if (!inboxId) {
            console.log(
              `⚠️ Could not resolve inbox ID for ${userAddress}, skipping group addition`,
            );
            console.log(
              `💡 User can use /fix-access command later to join the group`,
            );
          } else {
            await enhancedGroupManager.addMemberToPremiumGroup(
              groupConfig.contractAddress,
              inboxId,
              `Trial Access (${days} days)`,
              tokenId,
            );
            console.log(`✅ User added to premium group`);
            groupAddedSuccessfully = true;
          }
        } catch (groupError) {
          console.warn(
            `⚠️ NFT minted but failed to add to group: ${groupError}`,
          );
          // Don't fail - user has NFT and can use /fix-access
        }
      }

      // Determine if user was added to group successfully
      const groupAdditionStatus = groupAddedSuccessfully
        ? "✅ Added to premium group"
        : "⚠️ NFT minted - use /fix-access to join group";

      await conversation.send(
        `✅ Trial Access Granted Successfully!\n\n` +
          `🎫 NFT minted to: ${resolutionDisplay}\n` +
          `📋 Group: ${groupName}\n` +
          `⏰ Duration: ${days} days\n` +
          `🔗 Transaction: https://basescan.org/tx/${txHash}\n` +
          `🖼️ OpenSea: https://opensea.io/assets/base/${groupConfig.contractAddress}/${tokenId}\n` +
          `📍 Status: ${groupAdditionStatus}\n\n` +
          `💡 ${groupAddedSuccessfully ? "User can now access premium content!" : "User should use '/fix-access' command to join the premium group."}`,
      );
    } catch (error) {
      console.error("Error in trial granting process:", error);
      await conversation.send(
        `❌ Failed to grant trial access\n\n` +
          `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
          `Please try again or contact support.`,
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in grant-trial:", errorMessage);

    await conversation.send(
      `❌ Failed to grant trial access\n\n` +
        `Error: ${errorMessage}\n\n` +
        `Please try again or contact support.`,
    );
  }
}

/**
 * Handle list-groups command to show creator's groups
 */
export async function handleListGroups(
  conversation: any,
  senderInboxId: string,
  groupConfigs: Map<string, DualGroupConfig>,
  database?: JSONDatabase,
  evmAuthHandler?: any,
): Promise<void> {
  try {
    // Find groups created by this user (in-memory)
    let userGroups = Array.from(groupConfigs.values()).filter(
      (config) => config.creatorInboxId === senderInboxId,
    );

    // If none in memory, try persistent database
    if (userGroups.length === 0 && database) {
      try {
        const dbGroups = await database.getUserGroups(senderInboxId);
        // Convert DB records to display entries
        userGroups = dbGroups.map((g) => ({
          contractAddress: g.contractAddress,
          salesGroupId: g.salesGroupId,
          premiumGroupId: g.premiumGroupId,
          metadata: { name: g.name, description: "", image: undefined },
          creatorInboxId: g.creatorInboxId,
        })) as unknown as DualGroupConfig[];
      } catch {}
    }

    if (userGroups.length === 0) {
      await conversation.send(
        "📋 Your Groups: None\n\n" +
          'Use `/create-group "Name"` to create your first premium community!',
      );
      return;
    }

    let response = "📋 Your Premium Communities\n\n";

    for (let i = 0; i < userGroups.length; i++) {
      const group = userGroups[i];
      response += `${i + 1}. ${group.metadata?.name || "Group"}\n`;
      response += `   📍 Contract: ${group.contractAddress.slice(0, 10)}...${group.contractAddress.slice(-8)}\n`;
      response += `   👥 Sales Group: ${group.salesGroupId}\n`;
      response += `   🔒 Premium Group: ${group.premiumGroupId}\n`;

      // Add balance information if evmAuthHandler is available
      if (evmAuthHandler) {
        try {
          const ethBalance = await evmAuthHandler.getContractBalance(
            group.contractAddress,
          );
          const usdcBalance = await evmAuthHandler.getContractUSDCBalance(
            group.contractAddress,
          );

          if (ethBalance > 0n || usdcBalance > 0n) {
            response += `   💰 Available to withdraw:\n`;
            if (ethBalance > 0n) {
              const ethFormatted = (Number(ethBalance) / 1e18).toFixed(6);
              response += `      • ${ethFormatted} ETH\n`;
            }
            if (usdcBalance > 0n) {
              const usdcFormatted = (Number(usdcBalance) / 1e6).toFixed(2);
              response += `      • $${usdcFormatted} USDC\n`;
            }
          }
        } catch (error) {
          console.warn(
            `Failed to get balance for ${group.contractAddress}:`,
            error,
          );
        }
      }

      response += "\n";
    }

    response += "💡 Creator Commands:\n";
    response +=
      "• `/grant-trial <group_name> <user_address> <days>` - Grant free access\n";
    response += "• `/group-info <group_name>` - View group details\n";
    response += "• `/withdraw <contract>` - Withdraw earnings\n";

    await conversation.send(response);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in list-groups:", errorMessage);

    await conversation.send(
      `❌ Failed to list groups\n\n` + `Error: ${errorMessage}`,
    );
  }
}
