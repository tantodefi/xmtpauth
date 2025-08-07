/**
 * Enhanced group creation with dual-group architecture
 */

import type { EnhancedGroupManager } from "../managers/enhanced-group-flow";
import type { GroupMetadata, DualGroupConfig } from "../types/types";
import { createGroupCreationPayment } from "./payment-transactions";
import { ContentTypeWalletSendCalls } from "@xmtp/content-type-wallet-send-calls";

export async function handleEnhancedCreateGroup(
  conversation: any,
  memberAddress: string,
  senderInboxId: string,
  messageContent: string,
  enhancedGroupManager: EnhancedGroupManager,
  groupConfigs: Map<string, DualGroupConfig>
): Promise<void> {
  try {
    const parts = messageContent.split(" ");
    if (parts.length < 2) {
      await conversation.send(
        "Usage: /create-group \"<name>\"\nExample: /create-group \"My Premium Community\""
      );
      return;
    }

    // Extract group name (handle quoted names)
    const groupName = messageContent
      .substring(messageContent.indexOf(" ") + 1)
      .replace(/['"]/g, "")
      .trim();

    if (!groupName || groupName.length < 3) {
      await conversation.send(
        "❌ Group name must be at least 3 characters long."
      );
      return;
    }

    if (!memberAddress || memberAddress === "Unknown") {
      await conversation.send("❌ **Unable to create group**\n\nI couldn't determine your wallet address. Please make sure you're messaging from a wallet-connected XMTP client.");
      return;
    }

    await conversation.send(
      `🏗️ **Creating Premium Community System**\n\n` +
      `📋 Group Name: ${groupName}\n` +
      `⚙️ Setting up dual-group architecture...\n\n` +
      `This may take 30-60 seconds:`
    );

    // Create group metadata
    const metadata: GroupMetadata = {
      name: groupName,
      description: `Premium community for ${groupName} with token-gated access`,
              image: "https://via.placeholder.com/400x400/6366f1/ffffff?text=Premium+Group", // Default group image
    };

    // Create dual-group system
    const result = await enhancedGroupManager.createDualGroupSystem(
      groupName,
      senderInboxId,
      memberAddress, // Pass the actual wallet address for contract deployment
      metadata
    );

    // Store the enhanced group configuration
    groupConfigs.set(result.contractAddress, result.groupConfig);

    // Send success message with details
    await conversation.send(
      `🎉 **Premium Community Created Successfully!**\n\n` +
      `📋 **Contract**: \`${result.contractAddress}\`\n` +
      `🏪 **Sales Group**: Join to browse and purchase access\n` +
      `💎 **Premium Group**: Exclusive content for token holders\n\n` +
      `**Next Steps:**\n` +
      `1️⃣ Setup custom tiers: \`/setup-tiers ${result.contractAddress.slice(0, 8)}...\`\n` +
      `2️⃣ Configure pricing in USD\n` +
      `3️⃣ Upload custom NFT images\n` +
      `4️⃣ Start selling access!\n\n` +
      `**Sales Group Link**: Share this for discovery\n` +
      `**Premium Group**: Automatic access after purchase\n\n` +
      `🚀 Your monetized community is ready!`
    );

    console.log(`✅ Enhanced dual-group system created for: ${groupName}`);
    console.log(`📋 Contract: ${result.contractAddress}`);
    console.log(`🏪 Sales: ${result.salesGroup.id}`);
    console.log(`💎 Premium: ${result.premiumGroup.id}`);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error creating enhanced group:", errorMessage);
    
    await conversation.send(
      `❌ **Failed to create premium community**\n\n` +
      `Error: ${errorMessage}\n\n` +
      `Please try again or contact support if the issue persists.`
    );
  }
}

export async function handleEnhancedBuyAccess(
  conversation: any,
  userAddress: string,
  userInboxId: string,
  messageContent: string,
  enhancedGroupManager: EnhancedGroupManager,
  groupConfigs: Map<string, DualGroupConfig>
): Promise<void> {
  try {
    const parts = messageContent.split(" ");
    if (parts.length < 3) {
      await conversation.send(
        "Usage: /buy-access <group_id> <tier_id>\n" +
        "Example: /buy-access abc123 premium"
      );
      return;
    }

    const groupIdOrContract = parts[1];
    const tierId = parts[2];

    // Find group config by contract address or group ID
    let config: DualGroupConfig | undefined;
    let contractAddress: string | undefined;

    for (const [addr, cfg] of groupConfigs.entries()) {
      if (addr.startsWith(groupIdOrContract) || 
          cfg.salesGroupId.startsWith(groupIdOrContract) ||
          cfg.premiumGroupId.startsWith(groupIdOrContract)) {
        config = cfg;
        contractAddress = addr;
        break;
      }
    }

    if (!config || !contractAddress) {
      await conversation.send(
        `❌ Group not found: ${groupIdOrContract}\n\n` +
        `Make sure you're using the correct group ID or contract address.`
      );
      return;
    }

    // Find the requested tier
    const tier = config.tiers.find((t: any) => t.id === tierId);
    if (!tier) {
      const availableTiers = config.tiers.map((t: any) => t.id).join(", ");
      await conversation.send(
        `❌ Tier "${tierId}" not found.\n\n` +
        `Available tiers: ${availableTiers}\n` +
        `Use: \`/group-info ${groupIdOrContract}\` to see details`
      );
      return;
    }

    await conversation.send(
      `💰 **Purchasing ${tier.name}**\n\n` +
      `🎯 Group: ${config.metadata.name}\n` +
      `⏰ Duration: ${tier.durationDays} days\n` +
      `💎 Price: $${tier.priceUSD} USD\n\n` +
      `🔄 Generating USDC transaction...\n` +
      `Please wait while we prepare your purchase.`
    );

    // Simulate transaction generation (in real implementation, this would create actual USDC transaction)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Mock transaction details
    const mockTransaction = {
      to: contractAddress,
      data: "0xa9059cbb" + userAddress.slice(2).padStart(64, "0") + "1".padStart(64, "0"),
      value: "0",
      description: `Purchase ${tier.name} access for ${tier.durationDays} days`
    };

    await conversation.send(
      `💳 **USDC Transaction Ready**\n\n` +
      `**Please approve this transaction in your wallet:**\n\n` +
      `\`\`\`json\n${JSON.stringify(mockTransaction, null, 2)}\n\`\`\`\n\n` +
      `**After approval:**\n` +
      `• NFT will be minted to your wallet\n` +
      `• You'll be automatically added to premium group\n` +
      `• Access expires in ${tier.durationDays} days\n\n` +
      `💡 **Having issues?** Message the bot directly for help.`
    );

    // Simulate successful purchase after a delay (for demo)
    setTimeout(async () => {
      try {
        await enhancedGroupManager.handleTokenPurchase(
          contractAddress!,
          userAddress,
          userInboxId,
          1, // Mock token ID
          tier.name
        );

        await conversation.send(
          `🎉 **Purchase Successful!**\n\n` +
          `✅ NFT minted to your wallet\n` +
          `✅ Added to premium group\n` +
          `✅ Access expires: ${new Date(Date.now() + tier.durationDays * 24 * 60 * 60 * 1000).toLocaleDateString()}\n\n` +
          `Welcome to the premium community! 🚀`
        );
      } catch (error) {
        console.error("Error in simulated purchase:", error);
      }
    }, 5000);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error processing purchase:", errorMessage);
    
    await conversation.send(
      `❌ **Purchase Failed**\n\n` +
      `Error: ${errorMessage}\n\n` +
      `Please try again or contact support.`
    );
  }
}