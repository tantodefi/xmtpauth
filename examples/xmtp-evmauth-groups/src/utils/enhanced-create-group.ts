/**
 * Enhanced group creation with dual-group architecture
 */

import { ContentTypeWalletSendCalls } from "@xmtp/content-type-wallet-send-calls";
import type { JSONDatabase } from "../database/json-database";
import { EVMAuthHandler } from "../handlers/evmauth-handler";
import type { EnhancedGroupManager } from "../managers/enhanced-group-flow";
import type { DualGroupConfig, GroupMetadata } from "../types/types";
import { addressResolver } from "./address-resolver";
import {
  createGroupCreationPayment,
  createUSDCApprovalAndPurchase,
} from "./payment-transactions";

export async function handleEnhancedCreateGroup(
  conversation: any,
  memberAddress: string,
  senderInboxId: string,
  messageContent: string,
  enhancedGroupManager: EnhancedGroupManager,
  groupConfigs: Map<string, DualGroupConfig>,
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

    if (!groupName || groupName.length < 3) {
      await conversation.send(
        "❌ Group name must be at least 3 characters long.",
      );
      return;
    }

    if (!memberAddress || memberAddress === "Unknown") {
      await conversation.send(
        "❌ Unable to create group\n\nI couldn't determine your wallet address. Please make sure you're messaging from a wallet-connected XMTP client.",
      );
      return;
    }

    await conversation.send(
      `🏗️ Creating Premium Community System\n\n` +
        `📋 Group Name: ${groupName}\n` +
        `⚙️ Setting up dual-group architecture...\n\n` +
        `This may take 30-60 seconds:`,
    );

    // Create group metadata
    const metadata: GroupMetadata = {
      name: groupName,
      description: `Premium community for ${groupName} with token-gated access`,
      image:
        "https://via.placeholder.com/400x400/6366f1/ffffff?text=Premium+Group", // Default group image
    };

    // Create dual-group system
    const result = await enhancedGroupManager.createDualGroupSystem(
      groupName,
      senderInboxId,
      memberAddress, // Pass the actual wallet address for contract deployment
    );

    // Store the enhanced group configuration
    groupConfigs.set(result.contractAddress, result.config);

    // Send success message with details
    await conversation.send(
      `🎉 Premium Community Created Successfully!\n\n` +
        `📋 Contract: \`${result.contractAddress}\`\n` +
        `🏪 Sales Group: Join to browse and purchase access\n` +
        `💎 Premium Group: Exclusive content for token holders\n\n` +
        `Next Steps:\n` +
        `1️⃣ Setup custom tiers: \`/setup-tiers ${result.contractAddress.slice(0, 8)}...\`\n` +
        `2️⃣ Configure pricing in USD\n` +
        `3️⃣ Upload custom NFT images\n` +
        `4️⃣ Start selling access!\n\n` +
        `Sales Group Link: Share this for discovery\n` +
        `Premium Group: Automatic access after purchase\n\n` +
        `🚀 Your monetized community is ready!`,
    );

    console.log(`✅ Enhanced dual-group system created for: ${groupName}`);
    console.log(`📋 Contract: ${result.contractAddress}`);
    console.log(`🏪 Sales: ${result.salesGroup.id}`);
    console.log(`💎 Premium: ${result.premiumGroup.id}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error creating enhanced group:", errorMessage);

    await conversation.send(
      `❌ Failed to create premium community\n\n` +
        `Error: ${errorMessage}\n\n` +
        `Please try again or contact support if the issue persists.`,
    );
  }
}

export async function handleEnhancedBuyAccess(
  conversation: any,
  userAddress: string,
  userInboxId: string,
  messageContent: string,
  enhancedGroupManager: EnhancedGroupManager,
  groupConfigs: Map<string, DualGroupConfig>,
  database?: JSONDatabase,
): Promise<void> {
  try {
    const parts = messageContent.split(" ");
    if (parts.length < 2) {
      await conversation.send(
        "Usage: /buy-access <tier_id> OR /buy-access <group_or_contract> <tier_id>\n" +
          "Tip: When used inside the sales group, you can omit the contract and just provide the tier name.",
      );
      return;
    }

    // Allow omitting group identifier if used inside the sales group
    let idx = 1;
    let groupIdOrContract: string | undefined;
    let tierId: string | undefined;
    if (parts.length >= 3) {
      groupIdOrContract = parts[1];
      tierId = parts[2];
    } else {
      // Single-arg form: /buy-access <tier_id>
      groupIdOrContract = undefined;
      tierId = parts[1];
    }

    // Determine group by context if not provided
    if (!groupIdOrContract) {
      const salesGroupId = conversation.id as string;
      const found = Array.from(groupConfigs.values()).find(
        (cfg) => cfg.salesGroupId.toLowerCase() === salesGroupId.toLowerCase(),
      );
      if (found) {
        groupIdOrContract = found.contractAddress;
      }
    }

    if (!groupIdOrContract || !tierId) {
      await conversation.send(
        "❌ Missing parameters. Use: /buy-access <tier_id> (in sales group) or /buy-access <group_or_contract> <tier_id>",
      );
      return;
    }

    // Find group config by contract address, sales or premium group ID
    let config: DualGroupConfig | undefined;
    let contractAddress: string | undefined;

    for (const [addr, cfg] of groupConfigs.entries()) {
      if (
        addr.toLowerCase() === groupIdOrContract.toLowerCase() ||
        cfg.salesGroupId.toLowerCase() === groupIdOrContract.toLowerCase() ||
        cfg.premiumGroupId.toLowerCase() === groupIdOrContract.toLowerCase()
      ) {
        config = cfg;
        contractAddress = addr;
        break;
      }
    }

    if (!config || !contractAddress) {
      // Fallback to persistent DB to hydrate memory by contract/group IDs
      if (database) {
        try {
          const all = await database.getAllGroups();
          const found = all.find(
            (g) =>
              g.contractAddress.toLowerCase() ===
                groupIdOrContract!.toLowerCase() ||
              g.salesGroupId.toLowerCase() ===
                groupIdOrContract!.toLowerCase() ||
              g.premiumGroupId.toLowerCase() ===
                groupIdOrContract!.toLowerCase(),
          );
          if (found) {
            contractAddress = found.contractAddress;
            const restored = {
              groupId: found.premiumGroupId,
              contractAddress: found.contractAddress,
              creatorInboxId: found.creatorInboxId,
              salesGroupId: found.salesGroupId,
              premiumGroupId: found.premiumGroupId,
              metadata: { name: found.name, description: "" },
              tiers: (found.tiers || []).map((t: any, idx: number) => ({
                id: String(t.id ?? idx + 1),
                name: t.name,
                durationDays: t.durationDays,
                priceUSD:
                  typeof t.priceUsd === "number" ? t.priceUsd : undefined,
                priceWei: "0",
                description: "",
              })),
            } as unknown as DualGroupConfig;
            groupConfigs.set(found.contractAddress, restored);
            config = restored;
          }
        } catch {}
      }

      if (!config || !contractAddress) {
        await conversation.send(
          `❌ Group not found: ${groupIdOrContract}\n\n` +
            `Make sure you're using the correct group ID or contract address.`,
        );
        return;
      }
    }

    // Find the requested tier
    const tier = config.tiers.find(
      (t: any) =>
        (t.id && String(t.id).toLowerCase() === tierId!.toLowerCase()) ||
        (t.name && t.name.toLowerCase() === tierId!.toLowerCase()),
    );
    if (!tier) {
      const availableTiers = (config.tiers || [])
        .map((t: any) => t.id)
        .join(", ");
      await conversation.send(
        `❌ Tier "${tierId}" not found.\n\n` +
          `Available tiers: ${availableTiers}\n` +
          `Use: \`/group-info ${groupIdOrContract}\` to see details`,
      );
      return;
    }

    // Announce purchase details
    const priceLine =
      typeof (tier as any).priceUSD === "number"
        ? `💎 Price: $${(tier as any).priceUSD.toFixed(2)} USD`
        : `💎 Price: ${Number(tier.priceWei) / 1e18} ETH`;
    // Removed duplicate message - only send the detailed purchase message below

    // Resolve tokenId by tier index
    const tokenIndex = config.tiers.findIndex(
      (t: any) =>
        (t.id && String(t.id).toLowerCase() === tierId!.toLowerCase()) ||
        (t.name && t.name.toLowerCase() === tierId!.toLowerCase()),
    );
    const tokenId = tokenIndex >= 0 ? tokenIndex + 1 : 1;

    // If tier has USD price (or contract has USDC price set), route via USDC (approve + purchase)
    // Read on-chain tier to decide even if local memory lacks priceUSD
    let preferUSDC = false;
    try {
      const evmProbe = new EVMAuthHandler(
        process.env.BASE_RPC_URL || "",
        process.env.EVMAUTH_FACTORY_ADDRESS ||
          "0x0000000000000000000000000000000000000000",
        process.env.WALLET_KEY || "0x",
      );
      const onchainTier = await evmProbe.readTierInfo(
        contractAddress!,
        tokenId,
      );
      if (onchainTier && onchainTier.priceUSDC && onchainTier.priceUSDC > 0n) {
        preferUSDC = true;
      }
    } catch {}

    if (
      preferUSDC ||
      (typeof tier.priceUSD === "number" && tier.priceUSD! > 0)
    ) {
      // Determine USDC amount: prefer on-chain configured price, else local USD
      let amountUSDC = 0n;
      if (preferUSDC) {
        const on = await new EVMAuthHandler(
          process.env.BASE_RPC_URL || "",
          process.env.EVMAUTH_FACTORY_ADDRESS ||
            "0x0000000000000000000000000000000000000000",
          process.env.WALLET_KEY || "0x",
        ).readTierInfo(contractAddress!, tokenId);
        amountUSDC = on?.priceUSDC && on.priceUSDC > 0n ? on.priceUSDC : 0n;
      }
      if (amountUSDC === 0n && typeof tier.priceUSD === "number") {
        amountUSDC = BigInt(Math.round(tier.priceUSD * 1_000_000));
      }
      // CRITICAL: Store user's inbox ID BEFORE purchase so the contract event includes it
      try {
        console.log(
          `📝 Pre-storing inbox ID for ${userAddress}: ${userInboxId}`,
        );
        const evmAuthHandler = new EVMAuthHandler(
          process.env.BASE_RPC_URL || "",
          process.env.EVMAUTH_FACTORY_ADDRESS ||
            "0x0000000000000000000000000000000000000000",
          process.env.WALLET_KEY || "0x",
        );
        await evmAuthHandler.storeUserInboxId(
          contractAddress!,
          userAddress,
          userInboxId,
        );
        console.log(`✅ Inbox ID pre-stored successfully`);
      } catch (error) {
        console.warn("Failed to pre-store inbox ID (non-fatal):", error);
        // Continue with purchase - the event listener will handle it without inbox ID
      }

      const usdcAddress =
        process.env.USDC_ADDRESS ||
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia

      // Use the proper USDC approval and purchase function
      const walletSendCalls = createUSDCApprovalAndPurchase(
        usdcAddress,
        contractAddress!,
        amountUSDC.toString(),
        contractAddress!,
        tokenId,
        config.metadata?.name || "Premium Group",
        userAddress,
      );

      await conversation.send(
        `💰 USDC Purchase: ${tier.name}\n\n` +
          `Price: $${(Number(amountUSDC) / 1_000_000).toFixed(2)} USD\n` +
          `Duration: ${tier.durationDays} days\n\n` +
          `Please approve the transaction to:\n` +
          `• Approve USDC spending\n` +
          `• Purchase and mint your access NFT\n` +
          `• Gain access to the premium group\n\n` +
          `🔄 You'll receive a confirmation message once complete!`,
      );

      await conversation.send(walletSendCalls, ContentTypeWalletSendCalls);

      // Send immediate confirmation since event listeners are temporarily disabled
      await conversation.send(
        `🎉 Transaction Sent Successfully!\n\n` +
          `Your ${tier.name} access purchase is being processed.\n` +
          `Once confirmed on-chain, you will:\n` +
          `• Receive your EVMAuth NFT\n` +
          `• Be added to the premium group\n` +
          `• Get access for ${tier.durationDays} days\n\n` +
          `⏰ This usually takes 1-2 minutes on Base Sepolia.`,
      );
      return;
    }

    // Build WalletSendCalls for purchaseAccess(tokenId) with ETH
    const evm = new EVMAuthHandler(
      process.env.BASE_RPC_URL || "",
      process.env.EVMAUTH_FACTORY_ADDRESS ||
        "0x0000000000000000000000000000000000000000",
      process.env.WALLET_KEY || "0x",
    );
    const tx = await evm.createMintTransaction(
      contractAddress!,
      userAddress,
      tier as any,
      tokenId,
    );

    const walletSendCalls = {
      version: "1.0",
      chainId: "0x14a34",
      calls: [
        {
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: `0x${BigInt(tx.value).toString(16)}`,
          metadata: {
            description: `Purchase ${tier.name} access token`,
            transactionType: "nft-mint",
            currency: "ETH",
            amount: Number(BigInt(tx.value)) / 1e18,
            decimals: 18,
            networkId: "base-sepolia",
          } as Record<string, any>,
        },
      ],
    };

    await conversation.send(walletSendCalls, ContentTypeWalletSendCalls);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error processing purchase:", errorMessage);

    await conversation.send(
      `❌ Purchase Failed\n\n` +
        `Error: ${errorMessage}\n\n` +
        `Please try again or contact support.`,
    );
  }
}
