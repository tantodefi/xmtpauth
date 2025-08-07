/**
 * Recovery mechanisms for bot restart and error handling
 */

import { Client } from "@xmtp/node-sdk";
import { createPublicClient, http, getContract } from "viem";
import { base } from "viem/chains";
import type { EnhancedGroupManager } from "./enhanced-group-flow";
import type { DualGroupConfig } from "../types/types";

// Simplified ABI for reading contract data
const RECOVERY_ABI = [
  {
    "inputs": [],
    "name": "xmtpInfo",
    "outputs": [
      {
        "components": [
          {"name": "salesGroupId", "type": "string"},
          {"name": "premiumGroupId", "type": "string"},
          {"name": "salesGroupInbox", "type": "string"},
          {"name": "premiumGroupInbox", "type": "string"},
          {"name": "botAddress", "type": "address"},
          {"name": "isActive", "type": "bool"},
          {"name": "linkedAt", "type": "uint256"}
        ],
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "groupName",
    "outputs": [{"name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "groupDescription", 
    "outputs": [{"name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export class RecoveryManager {
  private client: Client;
  private publicClient: any;
  private enhancedGroupManager: EnhancedGroupManager;

  constructor(
    client: Client,
    rpcUrl: string,
    enhancedGroupManager: EnhancedGroupManager
  ) {
    this.client = client;
    this.enhancedGroupManager = enhancedGroupManager;
    
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });
  }

  /**
   * Recover group configurations from deployed contracts
   */
  async recoverGroupConfigs(contractAddresses: string[]): Promise<Map<string, DualGroupConfig>> {
    console.log("🔄 Starting group configuration recovery...");
    const recoveredConfigs = new Map<string, DualGroupConfig>();

    for (const contractAddress of contractAddresses) {
      try {
        console.log(`📋 Recovering config for contract: ${contractAddress}`);
        
        const config = await this.recoverSingleGroupConfig(contractAddress);
        if (config) {
          recoveredConfigs.set(contractAddress, config);
          console.log(`✅ Recovered: ${config.metadata.name}`);
        }
      } catch (error) {
        console.error(`❌ Failed to recover config for ${contractAddress}:`, error);
      }
    }

    console.log(`🎉 Recovery complete! Recovered ${recoveredConfigs.size} group configurations`);
    return recoveredConfigs;
  }

  /**
   * Recover a single group configuration from contract
   */
  private async recoverSingleGroupConfig(contractAddress: string): Promise<DualGroupConfig | null> {
    try {
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: RECOVERY_ABI,
        client: this.publicClient,
      });

      // Get XMTP group info from contract (simplified for demo)
      // In real implementation, these would be actual contract calls
      const xmtpInfo = {
        salesGroupId: "mock-sales-id",
        premiumGroupId: "mock-premium-id", 
        salesGroupInbox: "mock-sales-inbox",
        premiumGroupInbox: "mock-premium-inbox",
        botAddress: "0x0000",
        isActive: true,
        linkedAt: Date.now() / 1000
      };
      const groupName = "Recovered Group";
      const groupDescription = "Recovered group description";

      // Validate that this contract has XMTP groups linked
      if (!xmtpInfo.isActive || !xmtpInfo.salesGroupId || !xmtpInfo.premiumGroupId) {
        console.log(`⚠️ Contract ${contractAddress} has no active XMTP groups linked`);
        return null;
      }

      // Verify groups exist in XMTP
      const salesGroup = await this.client.conversations.getConversationById(xmtpInfo.salesGroupId);
      const premiumGroup = await this.client.conversations.getConversationById(xmtpInfo.premiumGroupId);

      if (!salesGroup || !premiumGroup) {
        console.log(`⚠️ XMTP groups not found for contract ${contractAddress}`);
        return null;
      }

      // Build configuration
      const config: DualGroupConfig = {
        groupId: xmtpInfo.premiumGroupId, // Use premium group as main ID
        contractAddress,
        salesGroupId: xmtpInfo.salesGroupId,
        premiumGroupId: xmtpInfo.premiumGroupId,
        tiers: [], // Will be populated separately if needed
        metadata: {
          name: groupName,
          description: groupDescription,
          image: "https://example.com/recovered-group.png", // Default image
        },
        creatorInboxId: "recovered", // Would need to be stored in contract
        creatorAddress: "recovered", // Would need to be stored in contract
        createdAt: new Date(Number(xmtpInfo.linkedAt) * 1000),
        isActive: xmtpInfo.isActive,
        paymentConfig: {
          acceptedTokens: ["USDC"],
          defaultToken: "USDC",
          usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
          autoConvertPrices: true,
        },
        salesSettings: {
          welcomeMessage: `🏪 Welcome to ${groupName} Sales & Info!`,
          availableTiers: "Loading tiers...",
          helpMessage: "Type /help for available commands",
        },
        premiumSettings: {
          welcomeMessage: `💎 Welcome to ${groupName} Premium!`,
          description: groupDescription,
        },
      };

      return config;

    } catch (error) {
      console.error(`Error recovering config for ${contractAddress}:`, error);
      return null;
    }
  }

  /**
   * Validate and repair group membership after recovery
   */
  async validateAndRepairMembership(groupConfigs: Map<string, DualGroupConfig>): Promise<void> {
    console.log("🔧 Validating and repairing group membership...");

    for (const [contractAddress, config] of groupConfigs.entries()) {
      try {
        console.log(`🔍 Validating membership for: ${config.metadata.name}`);
        
        // Run audit to sync membership with token holders
        const auditResults = await this.enhancedGroupManager.auditGroupMembership(contractAddress);
        
        console.log(`📊 Audit results for ${config.metadata.name}:`);
        console.log(`  Valid members: ${auditResults.validMembers.length}`);
        console.log(`  Added members: ${auditResults.addedMembers.length}`);
        console.log(`  Removed members: ${auditResults.removedMembers.length}`);

        // Send recovery notification to sales group
        const salesGroup = await this.client.conversations.getConversationById(config.salesGroupId);
        if (salesGroup) {
          await salesGroup.send(
            `🔄 **System Recovery Complete**\n\n` +
            `The bot has been restarted and group management has been restored.\n` +
            `All member access has been validated and synchronized.\n\n` +
            `✅ System is fully operational!`
          );
        }

      } catch (error) {
        console.error(`Error validating membership for ${contractAddress}:`, error);
      }
    }

    console.log("✅ Membership validation and repair complete");
  }

  /**
   * Get list of contract addresses from various sources
   */
  async discoverContractAddresses(): Promise<string[]> {
    const contractAddresses: string[] = [];

    try {
      // Method 1: From environment variables
      const envContracts = process.env.MANAGED_CONTRACTS?.split(',') || [];
      contractAddresses.push(...envContracts);

      // Method 2: From recent conversation messages (look for contract addresses)
      console.log("🔍 Scanning recent conversations for contract addresses...");
      
      await this.client.conversations.sync();
      const conversations = await this.client.conversations.list();
      
      for (const conversation of conversations.slice(0, 10)) { // Check last 10 conversations
        try {
          const messages = await conversation.messages();
          
          for (const message of messages.slice(0, 5)) { // Check last 5 messages per conversation
            const content = message.content as string;
            
            // Look for Ethereum addresses (contract addresses)
            const addressRegex = /0x[a-fA-F0-9]{40}/g;
            const addresses = content.match(addressRegex);
            
            if (addresses) {
              contractAddresses.push(...addresses);
            }
          }
        } catch (error) {
          // Skip conversations that can't be read
          continue;
        }
      }

      // Method 3: Could add more discovery methods here
      // - Query factory contract for deployed contracts
      // - Check local database/file storage
      // - Parse event logs

    } catch (error) {
      console.error("Error discovering contract addresses:", error);
    }

    // Remove duplicates and invalid addresses
    const uniqueAddresses = [...new Set(contractAddresses)]
      .filter(addr => addr && addr.length === 42 && addr.startsWith('0x'));

    console.log(`📍 Discovered ${uniqueAddresses.length} contract addresses`);
    return uniqueAddresses;
  }

  /**
   * Full recovery process
   */
  async performFullRecovery(): Promise<Map<string, DualGroupConfig>> {
    console.log("🚨 Starting full system recovery...");

    try {
      // Step 1: Discover contract addresses
      const contractAddresses = await this.discoverContractAddresses();
      
      if (contractAddresses.length === 0) {
        console.log("⚠️ No contract addresses found for recovery");
        return new Map();
      }

      // Step 2: Recover group configurations
      const recoveredConfigs = await this.recoverGroupConfigs(contractAddresses);

      // Step 3: Validate and repair membership
      await this.validateAndRepairMembership(recoveredConfigs);

      console.log("🎉 Full recovery completed successfully!");
      return recoveredConfigs;

    } catch (error) {
      console.error("❌ Recovery process failed:", error);
      return new Map();
    }
  }

  /**
   * Save current state for future recovery
   */
  async saveRecoveryState(groupConfigs: Map<string, DualGroupConfig>): Promise<void> {
    try {
      const recoveryData = {
        timestamp: Date.now(),
        contracts: Array.from(groupConfigs.keys()),
        groupCount: groupConfigs.size,
      };

      // In production, save to persistent storage
      console.log("💾 Recovery state would be saved:", recoveryData);
      
      // Could save to:
      // - Environment variables
      // - Local file
      // - Database
      // - IPFS
      
    } catch (error) {
      console.error("Error saving recovery state:", error);
    }
  }

  /**
   * Health check for recovered system
   */
  async performHealthCheck(groupConfigs: Map<string, DualGroupConfig>): Promise<{
    healthy: boolean;
    issues: string[];
    stats: {
      totalGroups: number;
      activeGroups: number;
      totalMembers: number;
    };
  }> {
    const issues: string[] = [];
    let totalMembers = 0;
    let activeGroups = 0;

    for (const [contractAddress, config] of groupConfigs.entries()) {
      try {
        // Check if groups exist
        const salesGroup = await this.client.conversations.getConversationById(config.salesGroupId);
        const premiumGroup = await this.client.conversations.getConversationById(config.premiumGroupId);

        if (!salesGroup) {
          issues.push(`Sales group not found for ${config.metadata.name}`);
        }

        if (!premiumGroup) {
          issues.push(`Premium group not found for ${config.metadata.name}`);
        }

        if (salesGroup && premiumGroup) {
          activeGroups++;
          const members = await premiumGroup.members();
          totalMembers += members.length;
        }

      } catch (error) {
        issues.push(`Error checking ${config.metadata.name}: ${error}`);
      }
    }

    const healthy = issues.length === 0;

    return {
      healthy,
      issues,
      stats: {
        totalGroups: groupConfigs.size,
        activeGroups,
        totalMembers,
      }
    };
  }
}