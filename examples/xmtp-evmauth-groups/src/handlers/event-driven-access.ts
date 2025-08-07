/**
 * Event-driven access management for XMTP EVMAuth Groups
 * Listens to smart contract events and manages group membership accordingly
 */

import { Client } from "@xmtp/node-sdk";
import { createPublicClient, http, parseAbiItem, getContract } from "viem";
import { base } from "viem/chains";
import type { EnhancedGroupManager } from "../managers/enhanced-group-flow";
import type { DualGroupConfig } from "../types/types";

// Contract events we listen for
const CONTRACT_EVENTS = [
  parseAbiItem('event UserAccessGranted(address indexed user, string indexed userInboxId, uint256 indexed tokenId, uint256 expiresAt)'),
  parseAbiItem('event UserAccessRevoked(address indexed user, string indexed userInboxId, uint256 indexed tokenId, string reason)'),
  parseAbiItem('event AccessTokenExpired(address indexed user, uint256 indexed tokenId)'),
] as const;

export class EventDrivenAccessManager {
  private client: Client;
  private publicClient: any;
  private enhancedGroupManager: EnhancedGroupManager;
  private groupConfigs: Map<string, DualGroupConfig>;
  private isListening: boolean = false;

  constructor(
    client: Client,
    rpcUrl: string,
    enhancedGroupManager: EnhancedGroupManager,
    groupConfigs: Map<string, DualGroupConfig>
  ) {
    this.client = client;
    this.enhancedGroupManager = enhancedGroupManager;
    this.groupConfigs = groupConfigs;
    
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });
  }

  /**
   * Start listening for contract events
   */
  async startEventListening(): Promise<void> {
    if (this.isListening) {
      console.log("⚠️ Event listener already running");
      return;
    }

    console.log("🎧 Starting event-driven access management...");
    this.isListening = true;

    // Listen for events from all managed contracts
    for (const [contractAddress, config] of this.groupConfigs.entries()) {
      await this.listenToContractEvents(contractAddress, config);
    }

    console.log("✅ Event listeners started for all managed contracts");
  }

  /**
   * Stop event listeners
   */
  stopEventListening(): void {
    console.log("🛑 Stopping event listeners...");
    this.isListening = false;
  }

  /**
   * Listen to events from a specific contract
   */
  private async listenToContractEvents(
    contractAddress: string,
    config: DualGroupConfig
  ): Promise<void> {
    try {
      console.log(`🎧 Setting up event listeners for contract: ${contractAddress}`);

      // Listen for UserAccessGranted events
      this.publicClient.watchContractEvent({
        address: contractAddress as `0x${string}`,
        abi: [CONTRACT_EVENTS[0]],
        eventName: 'UserAccessGranted',
        onLogs: async (logs: any[]) => {
          for (const log of logs) {
            await this.handleUserAccessGranted(log, config);
          }
        },
        onError: (error: any) => {
          console.error(`Error listening for UserAccessGranted events:`, error);
        }
      });

      // Listen for UserAccessRevoked events
      this.publicClient.watchContractEvent({
        address: contractAddress as `0x${string}`,
        abi: [CONTRACT_EVENTS[1]],
        eventName: 'UserAccessRevoked',
        onLogs: async (logs: any[]) => {
          for (const log of logs) {
            await this.handleUserAccessRevoked(log, config);
          }
        },
        onError: (error: any) => {
          console.error(`Error listening for UserAccessRevoked events:`, error);
        }
      });

      // Listen for AccessTokenExpired events
      this.publicClient.watchContractEvent({
        address: contractAddress as `0x${string}`,
        abi: [CONTRACT_EVENTS[2]],
        eventName: 'AccessTokenExpired',
        onLogs: async (logs: any[]) => {
          for (const log of logs) {
            await this.handleAccessTokenExpired(log, config);
          }
        },
        onError: (error: any) => {
          console.error(`Error listening for AccessTokenExpired events:`, error);
        }
      });

      console.log(`✅ Event listeners active for: ${config.metadata.name}`);

    } catch (error) {
      console.error(`Error setting up event listeners for ${contractAddress}:`, error);
    }
  }

  /**
   * Handle UserAccessGranted event - add user to premium group
   */
  private async handleUserAccessGranted(log: any, config: DualGroupConfig): Promise<void> {
    try {
      const { user, userInboxId, tokenId, expiresAt } = log.args;
      
      console.log(`🎉 UserAccessGranted: ${userInboxId} (${user}) - Token ${tokenId}`);

      // Get tier information
      const tier = config.tiers.find((t: any) => t.id === tokenId.toString()) || 
                   config.tiers[0]; // Fallback to first tier

      // Add user to premium group
      await this.enhancedGroupManager.handleTokenPurchase(
        log.address,
        user,
        userInboxId,
        Number(tokenId),
        tier?.name || `Token ${tokenId}`
      );

      // Send notification to sales group
      const salesGroup = await this.client.conversations.getConversationById(config.salesGroupId);
      if (salesGroup) {
        await salesGroup.send(
          `🎉 **New Premium Member!**\n\n` +
          `Someone just purchased ${tier?.name || 'access'} and joined our premium community! 🚀\n\n` +
          `Welcome to the family! 💎`
        );
      }

    } catch (error) {
      console.error("Error handling UserAccessGranted:", error);
    }
  }

  /**
   * Handle UserAccessRevoked event - remove user from premium group  
   */
  private async handleUserAccessRevoked(log: any, config: DualGroupConfig): Promise<void> {
    try {
      const { user, userInboxId, tokenId, reason } = log.args;
      
      console.log(`❌ UserAccessRevoked: ${userInboxId} (${user}) - Reason: ${reason}`);

      // Remove user from premium group
      await this.enhancedGroupManager.removeExpiredMember(
        log.address,
        userInboxId,
        reason
      );

    } catch (error) {
      console.error("Error handling UserAccessRevoked:", error);
    }
  }

  /**
   * Handle AccessTokenExpired event - remove user from premium group
   */
  private async handleAccessTokenExpired(log: any, config: DualGroupConfig): Promise<void> {
    try {
      const { user, tokenId } = log.args;
      
      console.log(`⏰ AccessTokenExpired: ${user} - Token ${tokenId}`);

      // Get user's inbox ID from contract (would need to call contract method)
      // For now, we'll let the background audit handle this
      console.log(`Token ${tokenId} expired for user ${user} - will be handled by background audit`);

    } catch (error) {
      console.error("Error handling AccessTokenExpired:", error);
    }
  }

  /**
   * Add contract to event listening
   */
  async addContractToListen(contractAddress: string, config: DualGroupConfig): Promise<void> {
    if (!this.isListening) {
      console.log("Event listener not running, start it first");
      return;
    }

    console.log(`➕ Adding contract to event listeners: ${contractAddress}`);
    await this.listenToContractEvents(contractAddress, config);
  }

  /**
   * Get listening status
   */
  isEventListenerActive(): boolean {
    return this.isListening;
  }

  /**
   * Manual event processing for testing
   */
  async processTestEvent(
    eventType: 'UserAccessGranted' | 'UserAccessRevoked' | 'AccessTokenExpired',
    contractAddress: string,
    eventData: any
  ): Promise<void> {
    const config = this.groupConfigs.get(contractAddress);
    if (!config) {
      console.error(`Config not found for contract: ${contractAddress}`);
      return;
    }

    const mockLog = {
      address: contractAddress,
      args: eventData,
    };

    switch (eventType) {
      case 'UserAccessGranted':
        await this.handleUserAccessGranted(mockLog, config);
        break;
      case 'UserAccessRevoked':
        await this.handleUserAccessRevoked(mockLog, config);
        break;
      case 'AccessTokenExpired':
        await this.handleAccessTokenExpired(mockLog, config);
        break;
    }
  }
}