/**
 * Comprehensive Recovery System
 * Scans all conversations to find contract addresses and rebuild state
 */

import { Client, type Conversation } from "@xmtp/node-sdk";
import { JSONDatabase, type GroupRecord } from "../database/json-database";
import type { DualGroupConfig } from "../types/types";

export class ComprehensiveRecovery {
  constructor(
    private client: Client,
    private database: JSONDatabase
  ) {}

  /**
   * Perform comprehensive recovery by scanning all conversations
   */
  async performFullRecovery(): Promise<{
    groups: Map<string, DualGroupConfig>,
    foundContracts: string[]
  }> {
    console.log("🔍 Starting comprehensive recovery...");
    
    const groups = new Map<string, DualGroupConfig>();
    const foundContracts = new Set<string>();
    
    try {
      // 1. Load existing groups from database
      const existingGroups = await this.database.getAllGroups();
      console.log(`💾 Found ${existingGroups.length} groups in database`);
      
      // 2. Convert database groups to runtime format
      for (const dbGroup of existingGroups) {
        const config: DualGroupConfig = {
          groupId: dbGroup.premiumGroupId,
          contractAddress: dbGroup.contractAddress,
          creatorInboxId: dbGroup.creatorInboxId,
          salesGroupId: dbGroup.salesGroupId,
          premiumGroupId: dbGroup.premiumGroupId,
          groupName: dbGroup.name,
          createdAt: new Date(dbGroup.createdAt),
          metadata: {
            name: dbGroup.name,
            description: `Premium access to ${dbGroup.name}`,
            image: `https://via.placeholder.com/400x400/6366f1/ffffff?text=${encodeURIComponent(dbGroup.name)}`,
            tiers: dbGroup.tiers || []
          },
          salesSettings: {
            welcomeMessage: `Welcome to ${dbGroup.name} sales!`,
            availableTiers: "Check available access tiers below",
            helpMessage: "Need help? Contact support"
          },
          premiumSettings: {
            welcomeMessage: `Welcome to ${dbGroup.name} premium!`,
            description: `Exclusive access to ${dbGroup.name}`
          }
        };
        
        groups.set(dbGroup.contractAddress, config);
        foundContracts.add(dbGroup.contractAddress);
      }
      
      // 3. Scan conversations for any missed contracts
      console.log("🔍 Scanning all conversations for contract addresses...");
      const scannedContracts = await this.scanConversationsForContracts();
      
      for (const contractAddr of scannedContracts) {
        foundContracts.add(contractAddr);
      }
      
      // 4. Update database with any newly discovered contracts
      await this.updateDatabaseWithNewContracts(scannedContracts, existingGroups);
      
      console.log(`✅ Recovery complete: ${foundContracts.size} contracts found`);
      
      return {
        groups,
        foundContracts: Array.from(foundContracts)
      };
      
    } catch (error) {
      console.error("❌ Recovery failed:", error);
      return { groups, foundContracts: [] };
    }
  }

  /**
   * Scan all conversations looking for contract addresses
   */
  private async scanConversationsForContracts(): Promise<string[]> {
    const contractAddresses = new Set<string>();
    const contractRegex = /0x[a-fA-F0-9]{40}/g;
    
    try {
      await this.client.conversations.sync();
      const conversations = await this.client.conversations.list();
      
      console.log(`🔍 Scanning ${conversations.length} conversations for contracts...`);
      
      for (const conversation of conversations) {
        try {
          // Get recent messages from this conversation
          const messages = await conversation.messages({ limit: 50 });
          
          for (const message of messages) {
            if (message.senderInboxId === this.client.inboxId) {
              // Check agent's own messages for contract deployment confirmations
              const content = message.content as string;
              if (typeof content === 'string') {
                // Look for contract deployment messages
                if (content.includes('Contract deployed at:') || 
                    content.includes('contract address') ||
                    content.includes('✅ Contract:')) {
                  
                  const matches = content.match(contractRegex);
                  if (matches) {
                    for (const match of matches) {
                      if (this.isValidContractAddress(match)) {
                        contractAddresses.add(match);
                        console.log(`📍 Found contract address: ${match}`);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error scanning conversation ${conversation.id}:`,error);
          continue;
        }
      }
      
    } catch (error) {
      console.error("Error scanning conversations:", error);
    }
    
    return Array.from(contractAddresses);
  }

  /**
   * Basic validation for contract addresses
   */
  private isValidContractAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address) && address !== '0x0000000000000000000000000000000000000000';
  }

  /**
   * Update database with newly discovered contracts
   */
  private async updateDatabaseWithNewContracts(
    scannedContracts: string[],
    existingGroups: GroupRecord[]
  ): Promise<void> {
    const existingContractAddresses = new Set(existingGroups.map(g => g.contractAddress));
    
    for (const contractAddress of scannedContracts) {
      if (!existingContractAddresses.has(contractAddress)) {
        console.log(`🆕 Found new contract not in database: ${contractAddress}`);
        
        // Try to reconstruct group info from blockchain/conversations
        // For now, create a placeholder entry
        await this.database.createGroup({
          name: `Recovered-${contractAddress.slice(-8)}`,
          creatorInboxId: 'unknown', // Will be updated when we have more info
          creatorAddress: 'unknown',
          contractAddress,
          salesGroupId: 'unknown',
          premiumGroupId: 'unknown',
          status: 'active' // Assume active since we found it
        });
      }
    }
  }

  /**
   * Verify contract exists on blockchain
   */
  async verifyContractExists(contractAddress: string): Promise<boolean> {
    try {
      // This would require a blockchain client to verify
      // For now, assume all found addresses are valid
      return true;
    } catch (error) {
      console.error(`Error verifying contract ${contractAddress}:`, error);
      return false;
    }
  }
}