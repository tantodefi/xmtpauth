/**
 * Enhanced Group Management with Database Integration
 */

import { Client, type Group, IdentifierKind } from "@xmtp/node-sdk";
import type { EVMAuthHandler } from "../handlers/evmauth-handler";
import type { DualGroupConfig, GroupMetadata } from "../types/types";
import type { JSONDatabase } from "../database/json-database";

// Group configuration interface  
interface GroupSettings {
  // Group metadata
  metadata: {
    name: string;
    description: string;
    image: string;
    tiers: any[];
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

  constructor(client: Client, evmAuthHandler: EVMAuthHandler, database?: JSONDatabase) {
    this.client = client;
    this.evmAuthHandler = evmAuthHandler;
    this.database = database;
    // Set agent address from the known wallet address
    this.agentAddress = "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc";
  }

  /**
   * Create dual-group system for a community
   */
  async createDualGroupSystem(
    groupName: string,
    creatorInboxId: string,
    creatorAddress: string
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
        }
      );

      // 2. Create premium group
      console.log("💎 Creating premium group...");
      const premiumGroup = await this.client.conversations.newGroup(
        [creatorInboxId], // Include creator
        {
          groupName: `💎 ${groupName}`,
          groupDescription: `Premium access group for ${groupName}`,
          groupImageUrlSquare: `https://via.placeholder.com/400x400/6366f1/ffffff?text=${encodeURIComponent(groupName)}`,
        }
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
        `🚀 Stay tuned for more updates!`
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
        `Enjoy your premium experience! 🚀`
      );

      // 4. Deploy EVMAuth contract with actual group IDs
      console.log("📋 Deploying EVMAuth contract with group IDs...");
      const contractAddress = await this.evmAuthHandler.deployGroupContract(
        groupName,
        this.agentAddress, // Pass AGENT address as botAddress (not creator)
        salesGroup.id,  // Pass actual sales group ID
        premiumGroup.id // Pass actual premium group ID
      );

      // 5. Create group configuration
      const groupConfig: DualGroupConfig = {
        groupId: premiumGroup.id, // Use premium group as main ID
        contractAddress,
        creatorInboxId,
        salesGroupId: salesGroup.id,
        premiumGroupId: premiumGroup.id,
        groupName,
        createdAt: new Date(),
        metadata: {
          name: groupName,
          description: `Premium access to ${groupName}`,
          image: `https://via.placeholder.com/400x400/6366f1/ffffff?text=${encodeURIComponent(groupName)}`,
          tiers: [] // Will be populated during tier setup
        },
        salesSettings: {
          welcomeMessage: `Welcome to ${groupName}! 🎉\n\nThis is where you can purchase access to our premium community.\n\nUse /buy-access to get started!`,
          availableTiers: "Premium tiers will be displayed here once configured.",
          helpMessage: "Need help? Contact our support team or use /help for commands."
        },
        premiumSettings: {
          welcomeMessage: `🎉 Welcome to ${groupName} Premium! 🎉\n\nYou now have exclusive access to our premium community.\n\nEnjoy your time here!`,
          description: `Exclusive premium access to ${groupName} with special benefits and content.`
        }
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
          status: 'created'
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
        config: groupConfig
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
    tokenId: number
  ): Promise<void> {
    try {
      const config = this.groupConfigs.get(contractAddress);
      if (!config) {
        throw new Error(`Group configuration not found for contract ${contractAddress}`);
      }

      // 1. Get premium group
      const premiumGroup = await this.client.conversations.getConversationById(
        config.premiumGroupId
      ) as Group;

      if (!premiumGroup) {
        throw new Error(`Premium group not found: ${config.premiumGroupId}`);
      }

      // 2. Add member to premium group
      await premiumGroup.addMembers([userInboxId]);

      // 3. Send welcome message
      const welcomeMsg = 
        `🎉 Welcome to ${config.metadata.name} Premium!\n\n` +
        `✅ Access Tier: ${tierName}\n` +
        `🎫 Token ID: ${tokenId}\n` +
        `💎 NFT: Check your wallet for your access token\n\n` +
        `${config.premiumSettings.welcomeMessage}\n\n` +
        `Need help? Message the bot directly.`;

      await premiumGroup.send(welcomeMsg);

      // 3. Notify sales group (optional)
      const salesGroup = await this.client.conversations.getConversationById(
        config.salesGroupId
      ) as Group;

      if (salesGroup) {
        await salesGroup.send(
          `🎉 New member joined the premium community! Welcome aboard! 🚀`
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
    userInboxId: string
  ): Promise<void> {
    try {
      const config = this.groupConfigs.get(contractAddress);
      if (!config) {
        console.error(`Group configuration not found for contract ${contractAddress}`);
        return;
      }

      const premiumGroup = await this.client.conversations.getConversationById(
        config.premiumGroupId
      ) as Group;

      if (!premiumGroup) {
        console.error(`Premium group not found: ${config.premiumGroupId}`);
        return;
      }

      // Remove member
      await premiumGroup.removeMembers([userInboxId]);
      console.log(`✅ Removed ${userInboxId} from premium group (access expired)`);

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
    updates: Partial<DualGroupConfig>
  ): Promise<void> {
    const existing = this.groupConfigs.get(contractAddress);
    if (!existing) {
      throw new Error(`Group configuration not found for contract ${contractAddress}`);
    }

    const updated = { ...existing, ...updates };
    this.groupConfigs.set(contractAddress, updated);

    // Update database if available
    if (this.database) {
      const dbGroup = await this.database.findGroupByContract(contractAddress);
      if (dbGroup) {
        await this.database.updateGroup(dbGroup.id, {
          status: updates.metadata?.tiers && updates.metadata.tiers.length > 0 ? 'active' : 'tiers_setup'
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
      config => config.creatorInboxId === creatorInboxId
    );
  }
}