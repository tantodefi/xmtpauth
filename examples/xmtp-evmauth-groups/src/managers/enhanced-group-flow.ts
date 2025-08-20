/**
 * Enhanced Group Management with Database Integration
 */

import { Client, IdentifierKind, type Group } from "@xmtp/node-sdk";
import type { JSONDatabase } from "../database/json-database";
import type { EVMAuthHandler } from "../handlers/evmauth-handler";
import type { DualGroupConfig, GroupMetadata } from "../types/types";

// Group configuration interface
interface GroupSettings {
  // Group metadata
  metadata: {
    name: string;
    description: string;
    image: string;
  };

  // Group settings
  salesSettings: {
    welcomeMessage: string;
    availableTiers: string;
    helpMessage: string;
  };

  premiumSettings: {
    welcomeMessage: string;
    rules?: string;
    description: string;
  };
}

export class EnhancedGroupManager {
  private client: Client;
  private evmAuthHandler: EVMAuthHandler;
  private groupConfigs = new Map<string, DualGroupConfig>();
  public agentAddress: string;
  private database?: JSONDatabase;

  constructor(
    client: Client,
    evmAuthHandler: EVMAuthHandler,
    database?: JSONDatabase,
  ) {
    this.client = client;
    this.evmAuthHandler = evmAuthHandler;
    this.database = database;
    // Set agent address from the known wallet address
    this.agentAddress = "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc";
  }

  /**
   * Get the XMTP client instance
   */
  getClient(): Client {
    return this.client;
  }

  /**
   * Add a group configuration to the manager
   */
  addGroupConfig(contractAddress: string, config: DualGroupConfig): void {
    this.groupConfigs.set(contractAddress, config);
    console.log(
      `📋 Added group config for ${contractAddress}: ${config.metadata?.name}`,
    );
  }

  /**
   * Create dual-group system for a community
   */
  async createDualGroupSystem(
    groupName: string,
    creatorInboxId: string,
    creatorAddress: string,
  ): Promise<{
    contractAddress: string;
    salesGroup: Group;
    premiumGroup: Group;
    config: DualGroupConfig;
  }> {
    try {
      console.log("🏗️ Creating dual-group system for:", groupName);

      // 1. Create public sales group
      console.log("🏪 Creating public sales group...");
      const salesGroup = await this.client.conversations.newGroup(
        [creatorInboxId], // Include creator
        {
          groupName: `🏪 ${groupName} - Sales`,
          groupDescription: `Public group for ${groupName} access sales and information`,
          groupImageUrlSquare: `https://via.placeholder.com/400x400/22c55e/ffffff?text=${encodeURIComponent(groupName)}+Sales`,
        },
      );

      // 2. Create premium group
      console.log("💎 Creating premium group...");
      const premiumGroup = await this.client.conversations.newGroup(
        [creatorInboxId], // Include creator
        {
          groupName: `💎 ${groupName}`,
          groupDescription: `Premium access group for ${groupName}`,
          groupImageUrlSquare: `https://via.placeholder.com/400x400/6366f1/ffffff?text=${encodeURIComponent(groupName)}`,
        },
      );

      // 3. Send welcome messages to both groups
      console.log("📝 Setting up welcome messages...");

      // Sales group welcome message
      await salesGroup.send(
        `🎉 Welcome to ${groupName} Sales! 🎉\n\n` +
          `This is where you can:\n` +
          `🛒 Purchase access to our premium community\n` +
          `📋 Learn about available tiers and pricing\n` +
          `💬 Get support from our team\n\n` +
          `Once tier setup is complete, you'll be able to use:\n` +
          `• /buy-access to purchase premium access\n` +
          `• /group-info to see pricing details\n\n` +
          `🚀 Stay tuned for more updates!`,
      );

      // Premium group welcome message
      await premiumGroup.send(
        `💎 Welcome to ${groupName} Premium! 💎\n\n` +
          `🎉 Congratulations! You now have exclusive access to our premium community.\n\n` +
          `✨ Premium Benefits:\n` +
          `• Exclusive content and discussions\n` +
          `• Priority support\n` +
          `• Special member privileges\n` +
          `• Early access to new features\n\n` +
          `Enjoy your premium experience! 🚀`,
      );

      // 4. Deploy EVMAuth contract with actual group IDs
      console.log("📋 Deploying EVMAuth contract with group IDs...");
      const contractAddress = await this.evmAuthHandler.deployGroupContract(
        groupName,
        creatorAddress, // Pass CREATOR address as contract owner (receives payments)
        salesGroup.id, // Pass actual sales group ID
        premiumGroup.id, // Pass actual premium group ID
      );

      // 4.5. Automatically setup trial token (Token ID 1)
      console.log("🎫 Setting up trial access token...");
      try {
        await this.evmAuthHandler.setupAccessTiers(contractAddress, [
          {
            id: "1",
            name: "Trial Access",
            description: `24-hour trial access to ${groupName}`,
            imageUrl:
              "https://via.placeholder.com/400x400/22c55e/ffffff?text=Trial+Access",
            durationDays: 1,
            priceWei: "1", // 1 wei - minimal price allowed by contract
            isActive: true,
          },
        ]);
        console.log("✅ Trial token setup complete");
      } catch (error) {
        console.error(
          "⚠️ Warning: Failed to setup trial token:",
          error instanceof Error ? error.message : String(error),
        );
        // Don't fail the entire deployment if trial setup fails
      }

      // 5. Create group configuration
      const groupConfig: DualGroupConfig = {
        groupId: premiumGroup.id, // Use premium group as main ID
        contractAddress,
        creatorInboxId,
        salesGroupId: salesGroup.id,
        premiumGroupId: premiumGroup.id,
        createdAt: new Date(),
        metadata: {
          name: groupName,
          description: `Premium access to ${groupName}`,
          image: `https://via.placeholder.com/400x400/6366f1/ffffff?text=${encodeURIComponent(groupName)}`,
        },
        tiers: [],
        creatorAddress,
        isActive: true,
        paymentConfig: {
          acceptedTokens: ["ETH"],
          defaultToken: "ETH",
        },
        salesSettings: {
          welcomeMessage: `Welcome to ${groupName}! 🎉\n\nThis is where you can purchase access to our premium community.\n\nUse /buy-access to get started!`,
          availableTiers:
            "Premium tiers will be displayed here once configured.",
          helpMessage:
            "Need help? Contact our support team or use /help for commands.",
        },
        premiumSettings: {
          welcomeMessage: `🎉 Welcome to ${groupName} Premium! 🎉\n\nYou now have exclusive access to our premium community.\n\nEnjoy your time here!`,
          description: `Exclusive premium access to ${groupName} with special benefits and content.`,
        },
      };

      // 6. Store in in-memory config for immediate access
      this.groupConfigs.set(contractAddress, groupConfig);

      // 7. Store in database for persistence
      if (this.database) {
        await this.database.createGroup({
          name: groupName,
          creatorInboxId,
          creatorAddress,
          contractAddress,
          salesGroupId: salesGroup.id,
          premiumGroupId: premiumGroup.id,
          status: "created",
        });
        console.log("💾 Saved group to database");
      }

      console.log("✅ Dual-group system created successfully!");
      console.log("📋 Contract:", contractAddress);
      console.log("🏪 Sales Group:", salesGroup.id);
      console.log("💎 Premium Group:", premiumGroup.id);

      return {
        contractAddress,
        salesGroup,
        premiumGroup,
        config: groupConfig,
      };
    } catch (error) {
      console.error("Error creating dual-group system:", error);
      throw error;
    }
  }

  /**
   * Add member to premium group with welcome message
   */
  async addMemberToPremiumGroup(
    contractAddress: string,
    userInboxId: string,
    tierName: string,
    tokenId: number,
  ): Promise<void> {
    try {
      const config = this.groupConfigs.get(contractAddress);
      if (!config) {
        throw new Error(
          `Group configuration not found for contract ${contractAddress}`,
        );
      }

      // 1. Get premium group with retry and sync
      console.log(`🔍 Finding premium group: ${config.premiumGroupId}`);

      // First, sync conversations to ensure we have the latest state
      await this.client.conversations.sync();

      let premiumGroup = (await this.client.conversations.getConversationById(
        config.premiumGroupId,
      )) as Group;

      if (!premiumGroup) {
        console.log(`⚠️ Premium group not found, attempting recovery...`);
        // Try to find by iterating all conversations
        const allConversations = await this.client.conversations.list();
        const foundGroup = allConversations.find(
          (conv) => conv.id === config.premiumGroupId,
        );

        if (foundGroup && foundGroup.constructor.name === "Group") {
          premiumGroup = foundGroup as Group;
          console.log(`✅ Found premium group via conversation list`);
        } else {
          throw new Error(`Premium group not found: ${config.premiumGroupId}`);
        }
      }

      // 2. Add member to premium group with retry logic
      const cleanInboxId = userInboxId.startsWith("0x")
        ? userInboxId.slice(2)
        : userInboxId;
      console.log(`➕ Adding member to premium group: ${cleanInboxId}`);

      // Check if user is already a member first
      const members = await premiumGroup.members();
      const isAlreadyMember = members.some(
        (member) => member.inboxId.toLowerCase() === cleanInboxId.toLowerCase(),
      );

      if (isAlreadyMember) {
        console.log(`✅ User ${cleanInboxId} is already a member`);
      } else {
        try {
          await premiumGroup.addMembers([cleanInboxId]);
          console.log(`✅ Successfully added ${cleanInboxId} to premium group`);
        } catch (addError) {
          console.error(`❌ Failed to add member: ${addError}`);
          // Try one more time after a short delay
          await new Promise((resolve) => setTimeout(resolve, 2000));
          try {
            await this.client.conversations.sync();
            await premiumGroup.addMembers([cleanInboxId]);
            console.log(`✅ Successfully added ${cleanInboxId} on retry`);
          } catch (retryError) {
            console.error(`❌ Failed to add member on retry: ${retryError}`);
            throw retryError;
          }
        }
      }

      // 3. Get user's address and try to resolve ENS/Basename
      const inboxState = await this.client.preferences.inboxStateFromInboxIds([
        cleanInboxId,
      ]);
      const userAddress =
        inboxState[0]?.identifiers[0]?.identifier || "Unknown";

      // Try to resolve ENS/Basename (simplified - in production you'd use a proper resolver)
      let userTag = userAddress;
      if (userAddress !== "Unknown") {
        // Format as @address for now - could be enhanced with ENS/Basename resolution
        const shortAddress = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
        userTag = `@${shortAddress}`;
      }

      // 4. Send welcome message with user tag
      const welcomeMsg =
        `🎉 Welcome to ${config.metadata.name} Premium, ${userTag}!\n\n` +
        `✅ Access Tier: ${tierName}\n` +
        `🎫 Token ID: ${tokenId}\n` +
        `💎 NFT: Check your wallet for your access token\n` +
        `⏰ Access expires: Check your NFT for expiry date\n\n` +
        `${config.premiumSettings?.welcomeMessage || "Enjoy your premium access!"}\n\n` +
        `Need help? Message me directly or ask in this group! 🚀`;

      await premiumGroup.send(welcomeMsg);

      // 3. Notify sales group (optional)
      const salesGroup = (await this.client.conversations.getConversationById(
        config.salesGroupId,
      )) as Group;

      if (salesGroup) {
        await salesGroup.send(
          `🎉 New member joined the premium community! Welcome aboard! 🚀`,
        );
      }

      console.log(`✅ Successfully added ${userInboxId} to premium group`);
    } catch (error) {
      console.error(`Error adding member to premium group:`, error);
      throw error;
    }
  }

  /**
   * Remove member from premium group (when access expires)
   */
  async removeMemberFromPremiumGroup(
    contractAddress: string,
    userInboxId: string,
  ): Promise<void> {
    try {
      const config = this.groupConfigs.get(contractAddress);
      if (!config) {
        console.error(
          `Group configuration not found for contract ${contractAddress}`,
        );
        return;
      }

      const premiumGroup = (await this.client.conversations.getConversationById(
        config.premiumGroupId,
      )) as Group;

      if (!premiumGroup) {
        console.error(`Premium group not found: ${config.premiumGroupId}`);
        return;
      }

      // Remove member
      await premiumGroup.removeMembers([userInboxId]);
      console.log(
        `✅ Removed ${userInboxId} from premium group (access expired)`,
      );
    } catch (error) {
      console.error(`Error removing member from premium group:`, error);
    }
  }

  /**
   * Get group configuration
   */
  getGroupConfig(contractAddress: string): DualGroupConfig | undefined {
    return this.groupConfigs.get(contractAddress);
  }

  /**
   * Update group configuration
   */
  async updateGroupConfig(
    contractAddress: string,
    updates: Partial<DualGroupConfig>,
  ): Promise<void> {
    const existing = this.groupConfigs.get(contractAddress);
    if (!existing) {
      throw new Error(
        `Group configuration not found for contract ${contractAddress}`,
      );
    }

    const updated = { ...existing, ...updates };
    this.groupConfigs.set(contractAddress, updated);

    // Update database if available
    if (this.database) {
      const dbGroup = await this.database.findGroupByContract(contractAddress);
      if (dbGroup) {
        await this.database.updateGroup(dbGroup.id, {
          status: "tiers_setup",
        });
      }
    }
  }

  /**
   * List all managed groups
   */
  getAllGroups(): DualGroupConfig[] {
    return Array.from(this.groupConfigs.values());
  }

  /**
   * Get groups for a specific creator
   */
  getGroupsForCreator(creatorInboxId: string): DualGroupConfig[] {
    return Array.from(this.groupConfigs.values()).filter(
      (config) => config.creatorInboxId === creatorInboxId,
    );
  }

  /**
   * Handle a successful token purchase by linking inboxId and adding to premium group
   */
  async handleTokenPurchase(
    contractAddress: string,
    userAddress: string,
    userInboxId: string,
    tokenId: number,
    tierName: string,
  ): Promise<void> {
    // Persist inbox mapping on-chain so contract can validate by inboxId later
    try {
      await this.evmAuthHandler.storeUserInboxId(
        contractAddress,
        userAddress,
        userInboxId,
      );
    } catch (error) {
      // Non-fatal; continue to add to group
      console.warn("storeUserInboxId failed (non-fatal):", error);
    }

    await this.addMemberToPremiumGroup(
      contractAddress,
      userInboxId,
      tierName,
      tokenId,
    );
  }

  /**
   * Remove an expired member with an optional reason
   */
  async removeExpiredMember(
    contractAddress: string,
    userInboxId: string,
    reason: string = "Access expired",
  ): Promise<void> {
    await this.removeMemberFromPremiumGroup(contractAddress, userInboxId);
  }

  /**
   * Audit premium group membership against on-chain token validity
   */
  async auditGroupMembership(contractAddress: string): Promise<{
    addedMembers: string[];
    removedMembers: string[];
    validMembers: string[];
  }> {
    const config = this.groupConfigs.get(contractAddress);
    const addedMembers: string[] = [];
    const removedMembers: string[] = [];
    const validMembers: string[] = [];

    if (!config) {
      return { addedMembers, removedMembers, validMembers };
    }

    const premiumGroup = (await this.client.conversations.getConversationById(
      config.premiumGroupId,
    )) as Group;
    if (!premiumGroup) {
      return { addedMembers, removedMembers, validMembers };
    }

    const members = await premiumGroup.members();
    for (const member of members) {
      // Skip bot and admins
      if (
        member.inboxId.toLowerCase() === this.client.inboxId.toLowerCase() ||
        premiumGroup.isSuperAdmin(member.inboxId) ||
        premiumGroup.isAdmin(member.inboxId)
      ) {
        validMembers.push(member.inboxId);
        continue;
      }

      // Resolve wallet address from identifiers (prefer Ethereum)
      const ethIdentifier = member.accountIdentifiers.find(
        (id) => id.identifierKind === IdentifierKind.Ethereum,
      );
      const userAddress = ethIdentifier ? ethIdentifier.identifier : undefined;
      if (!userAddress) {
        // Cannot validate; remove conservatively or skip. We'll skip.
        continue;
      }

      const hasAccess = await this.evmAuthHandler.checkTokenAccess(
        contractAddress,
        userAddress,
      );
      if (hasAccess) {
        validMembers.push(member.inboxId);
      } else {
        await premiumGroup.removeMembers([member.inboxId]);
        removedMembers.push(member.inboxId);
      }
    }

    return { addedMembers, removedMembers, validMembers };
  }
}
