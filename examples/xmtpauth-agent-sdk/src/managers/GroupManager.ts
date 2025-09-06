import type { Client } from "@xmtp/agent-sdk";
import { JSONDatabase, type GroupRecord } from "../database/JSONDatabase.js";
import type {
  CreateGroupResult,
  EVMAuthManager,
  GroupInfo,
} from "./EVMAuthManager.js";

export class GroupManager {
  private database: JSONDatabase;

  constructor(
    private client: Client,
    private evmAuthManager: EVMAuthManager,
  ) {
    this.database = new JSONDatabase();
  }

  /**
   * Create a new premium group - PRODUCTION VERSION
   */
  async createGroup(
    groupName: string,
    creatorInboxId: string,
  ): Promise<CreateGroupResult> {
    try {
      // Create XMTP groups first (sales and premium)
      console.log("🏗️ Creating XMTP groups...");

      const salesGroup = await this.client.conversations.newGroup([], {
        groupName: `${groupName} - Sales`,
        groupDescription: `Sales and discussion group for ${groupName}`,
      });

      const premiumGroup = await this.client.conversations.newGroup([], {
        groupName: `${groupName} - Premium`,
        groupDescription: `Premium access group for ${groupName} with NFT token-gating`,
      });

      console.log(`✅ XMTP groups created:`);
      console.log(`   Sales: ${salesGroup.id}`);
      console.log(`   Premium: ${premiumGroup.id}`);

      // Create the EVMAuth contract with real group IDs
      const result = await this.evmAuthManager.createGroup(
        groupName,
        creatorInboxId,
      );

      // Get creator address from the contract (it will be the agent's address for now)
      const creatorAddress = "0x0000000000000000000000000000000000000000"; // Placeholder

      // Store group in database
      const groupRecord = await this.database.addGroup({
        name: groupName,
        contractAddress: result.contractAddress,
        creatorInboxId,
        creatorAddress,
        salesGroupId: salesGroup.id,
        premiumGroupId: premiumGroup.id,
        deploymentTxHash: result.transactionHash || "",
        tiers: [], // Will be added later when tiers are set up
      });

      console.log(`📊 Group stored in database: ${groupRecord.id}`);

      return {
        groupId: groupRecord.id,
        contractAddress: result.contractAddress,
        transactionHash: result.transactionHash || "",
        salesGroupId: salesGroup.id,
        premiumGroupId: premiumGroup.id,
      };
    } catch (error) {
      console.error("❌ Failed to create group:", error);
      throw error;
    }
  }

  /**
   * Get groups owned by a user - PRODUCTION VERSION
   */
  async getUserGroups(userInboxId: string): Promise<GroupInfo[]> {
    try {
      // Get groups from database first
      const dbGroups = await this.database.getGroupsByCreator(userInboxId);

      if (dbGroups.length > 0) {
        // Convert database records to GroupInfo format
        const groupInfos: GroupInfo[] = [];

        for (const dbGroup of dbGroups) {
          // Get real-time data from blockchain
          const contractGroups =
            await this.evmAuthManager.getUserGroups(userInboxId);
          const contractGroup = contractGroups.find(
            (g) =>
              g.contractAddress.toLowerCase() ===
              dbGroup.contractAddress.toLowerCase(),
          );

          groupInfos.push({
            id: dbGroup.id,
            name: dbGroup.name,
            contractAddress: dbGroup.contractAddress,
            revenue: contractGroup?.revenue || "0",
            memberCount: contractGroup?.memberCount || 0,
            tiers:
              contractGroup?.tiers ||
              dbGroup.tiers.map((t) => ({
                id: t.id,
                name: t.name,
                description: t.description,
                price: t.priceEth,
                priceUSDC: t.priceUsd.toString(),
                durationDays: t.durationDays,
                imageHash: t.imageHash,
                isActive: t.isActive,
              })),
            salesGroupId: dbGroup.salesGroupId,
            premiumGroupId: dbGroup.premiumGroupId,
            creatorAddress: dbGroup.creatorAddress,
          });
        }

        return groupInfos;
      }

      // Fallback to blockchain-only data if no database records
      console.log("📊 No database records found, querying blockchain...");
      return await this.evmAuthManager.getUserGroups(userInboxId);
    } catch (error) {
      console.error("❌ Failed to get user groups:", error);
      return [];
    }
  }

  /**
   * Get group information by ID - PRODUCTION VERSION
   */
  async getGroupInfo(groupId: string): Promise<GroupInfo | null> {
    try {
      // Try to find by database ID first
      const allGroups = await this.database.getAllGroups();
      let dbGroup = allGroups.find((g) => g.id === groupId);

      // If not found by ID, try by contract address
      if (!dbGroup) {
        dbGroup = await this.database.getGroupByContract(groupId);
      }

      if (dbGroup) {
        // Get real-time blockchain data
        const contractGroups = await this.evmAuthManager.getUserGroups("");
        const contractGroup = contractGroups.find(
          (g) =>
            g.contractAddress.toLowerCase() ===
            dbGroup.contractAddress.toLowerCase(),
        );

        return {
          id: dbGroup.id,
          name: dbGroup.name,
          contractAddress: dbGroup.contractAddress,
          revenue: contractGroup?.revenue || "0",
          memberCount: contractGroup?.memberCount || 0,
          tiers:
            contractGroup?.tiers ||
            dbGroup.tiers.map((t) => ({
              id: t.id,
              name: t.name,
              description: t.description,
              price: t.priceEth,
              priceUSDC: t.priceUsd.toString(),
              durationDays: t.durationDays,
              imageHash: t.imageHash,
              isActive: t.isActive,
            })),
          salesGroupId: dbGroup.salesGroupId,
          premiumGroupId: dbGroup.premiumGroupId,
          creatorAddress: dbGroup.creatorAddress,
        };
      }

      return null;
    } catch (error) {
      console.error("❌ Failed to get group info:", error);
      return null;
    }
  }

  /**
   * Add member to group (when they purchase access)
   */
  async addMemberToGroup(
    groupId: string,
    memberInboxId: string,
  ): Promise<void> {
    try {
      const groupInfo = this.groupDatabase.get(groupId);
      if (!groupInfo) {
        throw new Error("Group not found");
      }

      // Find corresponding XMTP group
      const conversations = await this.client.conversations.list();
      const xmtpGroup = conversations.find(
        (conv) =>
          conv.name === groupInfo.name &&
          conv.description?.includes(groupInfo.contractAddress),
      );

      if (xmtpGroup) {
        // Add member to XMTP group
        await xmtpGroup.addMembers([memberInboxId]);

        // Update member count
        groupInfo.memberCount++;
        this.groupDatabase.set(groupId, groupInfo);

        console.log(`✅ Added member ${memberInboxId} to group ${groupId}`);
      } else {
        console.warn(`⚠️ XMTP group not found for ${groupId}`);
      }
    } catch (error) {
      console.error("❌ Failed to add member to group:", error);
      throw error;
    }
  }

  /**
   * Remove member from group (when access expires)
   */
  async removeMemberFromGroup(
    groupId: string,
    memberInboxId: string,
  ): Promise<void> {
    try {
      const groupInfo = this.groupDatabase.get(groupId);
      if (!groupInfo) {
        throw new Error("Group not found");
      }

      // Find corresponding XMTP group
      const conversations = await this.client.conversations.list();
      const xmtpGroup = conversations.find(
        (conv) =>
          conv.name === groupInfo.name &&
          conv.description?.includes(groupInfo.contractAddress),
      );

      if (xmtpGroup) {
        // Remove member from XMTP group
        await xmtpGroup.removeMembers([memberInboxId]);

        // Update member count
        groupInfo.memberCount = Math.max(0, groupInfo.memberCount - 1);
        this.groupDatabase.set(groupId, groupInfo);

        console.log(`✅ Removed member ${memberInboxId} from group ${groupId}`);
      } else {
        console.warn(`⚠️ XMTP group not found for ${groupId}`);
      }
    } catch (error) {
      console.error("❌ Failed to remove member from group:", error);
      throw error;
    }
  }

  /**
   * Send welcome message to new group member
   */
  async sendWelcomeMessage(
    groupId: string,
    memberInboxId: string,
  ): Promise<void> {
    try {
      const groupInfo = this.groupDatabase.get(groupId);
      if (!groupInfo) {
        return;
      }

      // Find corresponding XMTP group
      const conversations = await this.client.conversations.list();
      const xmtpGroup = conversations.find(
        (conv) =>
          conv.name === groupInfo.name &&
          conv.description?.includes(groupInfo.contractAddress),
      );

      if (xmtpGroup) {
        const welcomeMessage = `🎉 Welcome to **${groupInfo.name}**!

You now have premium access to this group. Your NFT access token ensures secure, time-bound membership.

💎 **Your Benefits:**
• Exclusive group discussions
• Premium content access
• Community networking
• Token-gated privileges

⏰ **Access Duration:** Check your token expiration with \`/my-tokens\`

Enjoy your premium experience! 🚀`;

        await xmtpGroup.send(welcomeMessage);
        console.log(
          `✅ Sent welcome message to ${memberInboxId} in group ${groupId}`,
        );
      }
    } catch (error) {
      console.error("❌ Failed to send welcome message:", error);
    }
  }

  /**
   * Update group revenue when payment is received
   */
  async updateGroupRevenue(groupId: string, amount: string): Promise<void> {
    const groupInfo = this.groupDatabase.get(groupId);
    if (groupInfo) {
      const currentRevenue = parseFloat(groupInfo.revenue);
      const additionalRevenue = parseFloat(amount);
      groupInfo.revenue = (currentRevenue + additionalRevenue).toFixed(6);
      this.groupDatabase.set(groupId, groupInfo);
    }
  }

  /**
   * Get all groups (for admin purposes)
   */
  getAllGroups(): GroupInfo[] {
    return Array.from(this.groupDatabase.values());
  }

  /**
   * Check if user is group creator
   */
  isGroupCreator(groupId: string, userInboxId: string): boolean {
    const userGroups = this.userGroups.get(userInboxId) || [];
    return userGroups.includes(groupId);
  }
}
