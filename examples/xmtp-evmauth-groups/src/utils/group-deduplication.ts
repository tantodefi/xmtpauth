/**
 * Group deduplication utilities to prevent creating duplicate groups
 */

import type { Client, Conversation } from "@xmtp/node-sdk";

interface ExistingGroup {
  id: string;
  name: string;
  createdAt: Date;
}

export class GroupDeduplicationManager {
  private client: Client;
  private existingGroups: Map<string, ExistingGroup> = new Map();

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Check if a group with similar name already exists for this user
   */
  async checkForExistingGroup(
    groupName: string, 
    creatorInboxId: string
  ): Promise<ExistingGroup | null> {
    try {
      // Sync conversations to get latest
      await this.client.conversations.sync();
      
      // Get all conversations and find ones created by this user
      const conversations = await this.client.conversations.list();
      
      for (const conversation of conversations) {
        // Check if this is a group the user created
        const members = await conversation.members();
        const isCreator = members.some(m => 
          m.inboxId.toLowerCase() === creatorInboxId.toLowerCase()
        );
        
        if (isCreator && conversation instanceof Object && 'name' in conversation) {
          const name = (conversation as any).name || '';
          
          // Check for similar names (exact match or contains the group name)
          if (name.toLowerCase().includes(groupName.toLowerCase()) || 
              name.toLowerCase().includes('sales') || 
              name.toLowerCase().includes('premium')) {
            
            const existing: ExistingGroup = {
              id: conversation.id,
              name: name,
              createdAt: new Date()
            };
            
            this.existingGroups.set(conversation.id, existing);
            return existing;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error("Error checking for existing groups:", error);
      return null;
    }
  }

  /**
   * Get all groups for a user that might be duplicates
   */
  async getUserGroups(creatorInboxId: string): Promise<ExistingGroup[]> {
    try {
      await this.client.conversations.sync();
      const conversations = await this.client.conversations.list();
      const userGroups: ExistingGroup[] = [];
      
      for (const conversation of conversations) {
        const members = await conversation.members();
        const isCreator = members.some(m => 
          m.inboxId.toLowerCase() === creatorInboxId.toLowerCase()
        );
        
        if (isCreator && conversation instanceof Object && 'name' in conversation) {
          const name = (conversation as any).name || '';
          
          userGroups.push({
            id: conversation.id,
            name: name,
            createdAt: new Date()
          });
        }
      }
      
      return userGroups;
    } catch (error) {
      console.error("Error getting user groups:", error);
      return [];
    }
  }

  /**
   * Clean up old duplicate groups
   */
  async cleanupDuplicateGroups(groupName: string, keepGroupId: string): Promise<number> {
    try {
      const conversations = await this.client.conversations.list();
      let cleanedCount = 0;
      
      for (const conversation of conversations) {
        if (conversation.id === keepGroupId) continue;
        
        if (conversation instanceof Object && 'name' in conversation) {
          const name = (conversation as any).name || '';
          
          // If this is a duplicate group, try to send a cleanup message
          if (name.toLowerCase().includes(groupName.toLowerCase()) && 
              (name.includes('Sales') || name.includes('Premium'))) {
            
            try {
              await conversation.send(
                `🧹 **Group Cleanup**\n\n` +
                `This appears to be a duplicate group. The main premium community "${groupName}" is now active.\n\n` +
                `Please use the main community instead of this one.`
              );
              cleanedCount++;
            } catch (error) {
              console.error(`Failed to send cleanup message to ${conversation.id}:`, error);
            }
          }
        }
      }
      
      return cleanedCount;
    } catch (error) {
      console.error("Error cleaning up duplicate groups:", error);
      return 0;
    }
  }
}