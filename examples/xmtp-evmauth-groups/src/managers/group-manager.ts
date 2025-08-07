import { Client, type Group } from "@xmtp/node-sdk";
import { EVMAuthHandler } from "../handlers/evmauth-handler";
import type { AccessTier, GroupMetadata } from "../types/types";

interface CreateGroupParams {
  name: string;
  description: string;
  creatorInboxId: string;
  image?: string;
  website?: string;
}

interface CreateGroupResult {
  groupId: string;
  contractAddress: string;
  group: Group;
}

export class GroupManager {
  private client: Client;
  private evmAuthHandler: EVMAuthHandler;

  constructor(client: Client, evmAuthHandler: EVMAuthHandler) {
    this.client = client;
    this.evmAuthHandler = evmAuthHandler;
  }

  /**
   * Create a new paid group with EVMAuth integration
   */
  async createPaidGroup(params: CreateGroupParams): Promise<CreateGroupResult> {
    try {
      console.log(`🔄 Creating paid group: ${params.name}`);

      // Get creator's address for contract ownership
      const creatorInboxState = await this.client.preferences.inboxStateFromInboxIds([
        params.creatorInboxId,
      ]);
      const creatorAddress = creatorInboxState[0].identifiers[0].identifier;

      // 1. Deploy EVMAuth contract
      console.log("📦 Deploying EVMAuth contract...");
      const contractAddress = await this.evmAuthHandler.deployGroupContract(
        params.name,
        creatorAddress
      );

      // 2. Create XMTP group with creator as initial member and admin
      console.log("💬 Creating XMTP group...");
      const group = await this.client.conversations.newGroup([params.creatorInboxId], {
        groupName: params.name,
        groupDescription: params.description,
        groupImageUrlSquare: params.image,
      });

      // 3. Make creator a super admin
      await group.addSuperAdmin(params.creatorInboxId);

      // 4. Send welcome message to creator
      await group.send(
        `🎉 **Welcome to your Premium Group!**\n\n` +
        `Your group "${params.name}" has been created with EVMAuth integration.\n\n` +
        `**Next Steps:**\n` +
        `1. Setup access tiers with \`/setup-tiers ${group.id}\`\n` +
        `2. Configure your pricing and access duration\n` +
        `3. Share your group link to start selling access!\n\n` +
        `**Group Details:**\n` +
        `🆔 Group ID: \`${group.id}\`\n` +
        `🔗 Contract: \`${contractAddress}\`\n` +
        `📱 Share: https://xmtp.chat/conversations/${group.id}\n\n` +
        `This group is now protected by time-bound NFT access tokens!`
      );

      console.log(`✅ Paid group created successfully: ${group.id}`);

      return {
        groupId: group.id,
        contractAddress,
        group,
      };
    } catch (error) {
      console.error("Error creating paid group:", error);
      throw new Error(`Failed to create paid group: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Add a user to a group after token purchase
   */
  async addUserToGroup(
    groupId: string,
    userInboxId: string,
    contractAddress: string
  ): Promise<boolean> {
    try {
      const group = await this.client.conversations.getConversationById(groupId) as Group;
      if (!group) {
        throw new Error("Group not found");
      }

      // Get user's address to verify token ownership
      const userInboxState = await this.client.preferences.inboxStateFromInboxIds([userInboxId]);
      const userAddress = userInboxState[0].identifiers[0].identifier;

      // Verify user has valid access token
      const hasAccess = await this.evmAuthHandler.checkTokenAccess(contractAddress, userAddress);
      if (!hasAccess) {
        console.log(`❌ User ${userInboxId} does not have valid access token`);
        return false;
      }

      // Check if user is already a member
      const members = await group.members();
      const isAlreadyMember = members.some(
        member => member.inboxId.toLowerCase() === userInboxId.toLowerCase()
      );

      if (isAlreadyMember) {
        console.log(`✅ User ${userInboxId} is already a member of group ${groupId}`);
        return true;
      }

      // Add user to group
      await group.addMembers([userInboxId]);

      // Send welcome message
      await group.send(
        `🎉 **Welcome to the group!**\n\n` +
        `A new member has joined with valid access token.\n` +
        `Welcome to our premium community! 🚀`
      );

      console.log(`✅ Added user ${userInboxId} to group ${groupId}`);
      return true;
    } catch (error) {
      console.error("Error adding user to group:", error);
      return false;
    }
  }

  /**
   * Remove a user from a group when their token expires
   */
  async removeUserFromGroup(
    groupId: string,
    userInboxId: string,
    reason: string = "Access token expired"
  ): Promise<boolean> {
    try {
      const group = await this.client.conversations.getConversationById(groupId) as Group;
      if (!group) {
        throw new Error("Group not found");
      }

      // Check if user is a member
      const members = await group.members();
      const isMember = members.some(
        member => member.inboxId.toLowerCase() === userInboxId.toLowerCase()
      );

      if (!isMember) {
        console.log(`User ${userInboxId} is not a member of group ${groupId}`);
        return true;
      }

      // Don't remove super admins or admins (group creators/managers)
      if (group.isSuperAdmin(userInboxId) || group.isAdmin(userInboxId)) {
        console.log(`Cannot remove admin/super admin ${userInboxId} from group ${groupId}`);
        return false;
      }

      // Remove user from group
      await group.removeMembers([userInboxId]);

      // Send notification (optional)
      console.log(`🔄 Removed user ${userInboxId} from group ${groupId}: ${reason}`);
      return true;
    } catch (error) {
      console.error("Error removing user from group:", error);
      return false;
    }
  }

  /**
   * Update group metadata
   */
  async updateGroupMetadata(
    groupId: string,
    metadata: Partial<GroupMetadata>
  ): Promise<boolean> {
    try {
      const group = await this.client.conversations.getConversationById(groupId) as Group;
      if (!group) {
        throw new Error("Group not found");
      }

      if (metadata.name) {
        await group.updateName(metadata.name);
      }

      if (metadata.description) {
        await group.updateDescription(metadata.description);
      }

      if (metadata.image) {
        await group.updateImageUrl(metadata.image);
      }

      console.log(`✅ Updated metadata for group ${groupId}`);
      return true;
    } catch (error) {
      console.error("Error updating group metadata:", error);
      return false;
    }
  }

  /**
   * Get group information including member count and activity
   */
  async getGroupInfo(groupId: string): Promise<{
    group: Group;
    memberCount: number;
    isActive: boolean;
  } | null> {
    try {
      const group = await this.client.conversations.getConversationById(groupId) as Group;
      if (!group) {
        return null;
      }

      const members = await group.members();
      const memberCount = members.length;

      return {
        group,
        memberCount,
        isActive: true, // Could implement activity checking logic
      };
    } catch (error) {
      console.error("Error getting group info:", error);
      return null;
    }
  }

  /**
   * Bulk manage group memberships based on token validity
   */
  async auditGroupMembership(
    groupId: string,
    contractAddress: string
  ): Promise<{
    validMembers: string[];
    expiredMembers: string[];
    removedMembers: string[];
  }> {
    try {
      const group = await this.client.conversations.getConversationById(groupId) as Group;
      if (!group) {
        throw new Error("Group not found");
      }

      const members = await group.members();
      const validMembers: string[] = [];
      const expiredMembers: string[] = [];
      const removedMembers: string[] = [];

      for (const member of members) {
        // Skip bot and admins
        if (
          member.inboxId.toLowerCase() === this.client.inboxId.toLowerCase() ||
          group.isSuperAdmin(member.inboxId) ||
          group.isAdmin(member.inboxId)
        ) {
          validMembers.push(member.inboxId);
          continue;
        }

        // Check token validity
        const userAddress = member.accountIdentifiers[0].identifier;
        const hasAccess = await this.evmAuthHandler.checkTokenAccess(contractAddress, userAddress);

        if (hasAccess) {
          validMembers.push(member.inboxId);
        } else {
          expiredMembers.push(member.inboxId);
          
          // Remove expired member
          const removed = await this.removeUserFromGroup(
            groupId,
            member.inboxId,
            "Access token expired during audit"
          );
          
          if (removed) {
            removedMembers.push(member.inboxId);
          }
        }
      }

      console.log(`📊 Group ${groupId} audit complete:`);
      console.log(`  Valid members: ${validMembers.length}`);
      console.log(`  Expired members: ${expiredMembers.length}`);
      console.log(`  Removed members: ${removedMembers.length}`);

      return {
        validMembers,
        expiredMembers,
        removedMembers,
      };
    } catch (error) {
      console.error("Error auditing group membership:", error);
      return {
        validMembers: [],
        expiredMembers: [],
        removedMembers: [],
      };
    }
  }

  /**
   * Send announcement to all group members
   */
  async sendGroupAnnouncement(groupId: string, message: string): Promise<boolean> {
    try {
      const group = await this.client.conversations.getConversationById(groupId) as Group;
      if (!group) {
        throw new Error("Group not found");
      }

      await group.send(`📢 **Announcement**\n\n${message}`);
      console.log(`📢 Sent announcement to group ${groupId}`);
      return true;
    } catch (error) {
      console.error("Error sending group announcement:", error);
      return false;
    }
  }
}