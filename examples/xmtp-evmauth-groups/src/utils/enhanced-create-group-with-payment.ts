/**
 * Enhanced group creation with payment approval workflow
 */

import { ContentTypeWalletSendCalls } from "@xmtp/content-type-wallet-send-calls";
import type { JSONDatabase } from "../database/json-database";
import type { EnhancedGroupManager } from "../managers/enhanced-group-flow";
import type { DualGroupConfig, GroupMetadata } from "../types/types";
import { GroupDeduplicationManager } from "./group-deduplication";
import type { PaymentMonitor } from "./payment-monitor";
import {
  createGroupCreationPayment,
  createTrialAccessGrant,
} from "./payment-transactions";
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
    const paymentId = `${senderInboxId}-${groupName}-${Date.now()}`;
    paymentMonitor.registerPendingPayment(
      paymentId,
      senderInboxId,
      groupName,
      memberAddress,
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
      `❌ **Failed to create premium community**\n\n` +
        `Error: ${errorMessage}\n\n` +
        `Please try again or contact support if the issue persists.`,
    );
  }
}

/**
 * Handle grant-trial command for creators to give free access
 */
export async function handleGrantTrial(
  conversation: any,
  memberAddress: string,
  senderInboxId: string,
  messageContent: string,
  groupConfigs: Map<string, DualGroupConfig>,
): Promise<void> {
  try {
    // Parse command: /grant-trial <group_name> <user_address> <days>
    const parts = messageContent.split(" ");
    if (parts.length < 4) {
      await conversation.send(
        "Usage: /grant-trial <group_name> <user_address> <days>\n" +
          "Example: /grant-trial MyGroup 0x123... 7",
      );
      return;
    }

    const groupName = parts[1];
    const userAddress = parts[2];
    const days = parseInt(parts[3]);

    if (isNaN(days) || days <= 0) {
      await conversation.send("Please provide a valid number of days.");
      return;
    }

    // Find the group configuration
    const groupConfig = Array.from(groupConfigs.values()).find(
      (config) => config.groupName.toLowerCase() === groupName.toLowerCase(),
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

    // Create trial access grant transaction
    const trialTransaction = createTrialAccessGrant(
      groupConfig.contractAddress,
      userAddress,
      1, // Default token ID for trial access
      groupName,
    );

    await conversation.send(
      `🎁 **Granting Trial Access**\n\n` +
        `📋 Group: ${groupName}\n` +
        `👤 Recipient: ${userAddress}\n` +
        `⏰ Duration: ${days} days\n\n` +
        `Please approve the transaction to grant access:`,
    );

    await conversation.send(trialTransaction, ContentTypeWalletSendCalls);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in grant-trial:", errorMessage);

    await conversation.send(
      `❌ **Failed to grant trial access**\n\n` +
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
): Promise<void> {
  try {
    // Find groups created by this user
    const userGroups = Array.from(groupConfigs.values()).filter(
      (config) => config.creatorInboxId === senderInboxId,
    );

    if (userGroups.length === 0) {
      await conversation.send(
        "📋 **Your Groups**: None\n\n" +
          'Use `/create-group "Name"` to create your first premium community!',
      );
      return;
    }

    let response = "📋 **Your Premium Communities**\n\n";

    userGroups.forEach((group, index) => {
      response += `${index + 1}. **${group.groupName}**\n`;
      response += `   📍 Contract: ${group.contractAddress.slice(0, 10)}...${group.contractAddress.slice(-8)}\n`;
      response += `   👥 Sales Group: ${group.salesGroupId}\n`;
      response += `   🔒 Premium Group: ${group.premiumGroupId}\n\n`;
    });

    response += "💡 **Creator Commands:**\n";
    response +=
      "• `/grant-trial <group_name> <user_address> <days>` - Grant free access\n";
    response += "• `/group-info <group_name>` - View group details\n";

    await conversation.send(response);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in list-groups:", errorMessage);

    await conversation.send(
      `❌ **Failed to list groups**\n\n` + `Error: ${errorMessage}`,
    );
  }
}
