/**
 * Event-driven access management for XMTP EVMAuth Groups
 * Listens to smart contract events and manages group membership accordingly
 */

import { Client } from "@xmtp/node-sdk";
import { createPublicClient, getContract, http, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";
import type { EnhancedGroupManager } from "../managers/enhanced-group-flow";
import type { DualGroupConfig } from "../types/types";

// Contract events we listen for
const CONTRACT_EVENTS = [
  parseAbiItem(
    "event UserAccessGranted(address indexed user, string indexed userInboxId, uint256 indexed tokenId, uint256 expiresAt)",
  ),
  parseAbiItem(
    "event UserAccessRevoked(address indexed user, string indexed userInboxId, uint256 indexed tokenId, string reason)",
  ),
  parseAbiItem(
    "event AccessTokenExpired(address indexed user, uint256 indexed tokenId)",
  ),
] as const;

export class EventDrivenAccessManager {
  private client: Client;
  private publicClient: any;
  private enhancedGroupManager: EnhancedGroupManager;
  private groupConfigs: Map<string, DualGroupConfig>;
  private isListening: boolean = false;
  private pollingIntervals = new Map<string, NodeJS.Timeout>();
  private lastProcessedBlocks = new Map<string, bigint>();

  constructor(
    client: Client,
    rpcUrl: string,
    enhancedGroupManager: EnhancedGroupManager,
    groupConfigs: Map<string, DualGroupConfig>,
  ) {
    this.client = client;
    this.enhancedGroupManager = enhancedGroupManager;
    this.groupConfigs = groupConfigs;

    this.publicClient = createPublicClient({
      chain: baseSepolia,
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

    // Start polling for events from all managed contracts
    for (const [contractAddress, config] of this.groupConfigs.entries()) {
      await this.startContractPolling(contractAddress);
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
    config: DualGroupConfig,
  ): Promise<void> {
    try {
      console.log(
        `🎧 Setting up event listeners for contract: ${contractAddress}`,
      );

      // OLD WATCHERS DISABLED - using polling instead to avoid "filter not found" errors
      console.log(
        `⚠️ Old watchContractEvent calls disabled for ${contractAddress}`,
      );

      console.log(`✅ Event listeners active for: ${config.metadata.name}`);
    } catch (error) {
      console.error(
        `Error setting up event listeners for ${contractAddress}:`,
        error,
      );
    }
  }

  /**
   * Handle UserAccessGranted event - add user to premium group
   */
  private async handleUserAccessGranted(
    log: any,
    config: DualGroupConfig,
  ): Promise<void> {
    try {
      const { user, userInboxId, tokenId, expiresAt } = log.args;

      console.log(
        `🎉 UserAccessGranted: ${userInboxId} (${user}) - Token ${tokenId}`,
      );

      // Get tier information
      const tier =
        config.tiers.find((t: any) => t.id === tokenId.toString()) ||
        config.tiers[0]; // Fallback to first tier

      // Try to add user to premium group (don't let this block confirmation)
      try {
        // Ensure the group manager has the config
        this.enhancedGroupManager.addGroupConfig(log.address, config);

        await this.enhancedGroupManager.handleTokenPurchase(
          log.address,
          user,
          userInboxId,
          Number(tokenId),
          tier?.name || `Token ${tokenId}`,
        );
        console.log(`✅ Successfully added user to premium group`);
      } catch (groupError) {
        console.warn(`⚠️ Failed to add user to premium group:`, groupError);
        // Continue to send confirmation message regardless
      }

      // CRITICAL: Send direct confirmation message to the user (ALWAYS)
      try {
        console.log(
          `🎉 NFT PURCHASE CONFIRMED for ${user} - Token ID ${tokenId}`,
        );
        console.log(`📋 Contract: ${log.address}`);
        console.log(
          `🔗 BaseScan: https://basescan.org/token/${log.address}?a=${tokenId}`,
        );
        console.log(
          `📅 Expires: ${new Date(Number(expiresAt) * 1000).toLocaleDateString()}`,
        );

        // Fix XMTP client issues with proper inbox ID formatting and sync
        const cleanInboxId = userInboxId.startsWith("0x")
          ? userInboxId.slice(2)
          : userInboxId;
        console.log(`📧 Creating DM for inbox ID: ${cleanInboxId}`);

        // Sync conversations first to ensure database is up to date
        await this.client.conversations.sync();

        // Try to find existing DM first to avoid SequenceId errors
        let userDM;
        try {
          const conversations = await this.client.conversations.list();
          userDM = conversations.find((conv) => {
            if (conv.constructor.name === "Dm") {
              const dm = conv as any;
              return dm.peerInboxId === cleanInboxId;
            }
            return false;
          });

          if (!userDM) {
            console.log(`📧 Creating new DM for: ${cleanInboxId}`);
            userDM = await this.client.conversations.newDm(cleanInboxId);
          } else {
            console.log(`📧 Using existing DM for: ${cleanInboxId}`);
          }
        } catch (dmError) {
          console.warn(
            `Failed to create/find DM, will log confirmation instead:`,
            dmError,
          );
          userDM = null;
        }

        const expiryDate = new Date(Number(expiresAt) * 1000);
        const baseScanUrl = `https://basescan.org/token/${log.address}?a=${tokenId}`;
        const contractUrl = `https://basescan.org/address/${log.address}`;

        const confirmationMessage =
          `🎉 NFT Purchase Successful!\n\n` +
          `✅ Access Token: ${tier?.name || `Token ${tokenId}`}\n` +
          `🎫 Token ID: ${tokenId}\n` +
          `💎 Contract: ${log.address}\n` +
          `👤 Owner: ${user}\n` +
          `⏰ Valid Until: ${expiryDate.toLocaleDateString()}\n\n` +
          `🔓 You now have access to ${config.metadata.name} Premium!\n\n` +
          `🔍 View on BaseScan:\n${baseScanUrl}\n\n` +
          `📋 Contract Details:\n${contractUrl}\n\n` +
          `💡 Note: NFT images may take time to appear on BaseScan. Your access token is visible in your wallet immediately!\n\n` +
          `Welcome to the premium community! 🚀`;

        if (userDM) {
          await userDM.send(confirmationMessage);
          console.log(`✅ Sent purchase confirmation DM to ${cleanInboxId}`);
        } else {
          // Fallback: Send to sales group as a notification
          console.log(
            `📢 DM failed, sending notification to sales group instead`,
          );
          const salesGroup =
            await this.client.conversations.getConversationById(
              config.salesGroupId,
            );
          if (salesGroup) {
            await salesGroup.send(
              `🎉 NFT Purchase Confirmed!\n\n` +
                `User ${user} successfully purchased ${tier?.name || `Token ${tokenId}`}!\n\n` +
                `Please check your wallet for your NFT: ${baseScanUrl}`,
            );
          }
        }
      } catch (dmError) {
        console.warn("Failed to send confirmation DM:", dmError);
      }

      // Send notification to sales group
      const salesGroup = await this.client.conversations.getConversationById(
        config.salesGroupId,
      );
      if (salesGroup) {
        await salesGroup.send(
          `🎉 New Premium Member!\n\n` +
            `Someone just purchased ${tier?.name || "access"} and joined our premium community! 🚀\n\n` +
            `Welcome to the family! 💎`,
        );
      }
    } catch (error) {
      console.error("Error handling UserAccessGranted:", error);
    }
  }

  /**
   * Handle UserAccessRevoked event - remove user from premium group
   */
  private async handleUserAccessRevoked(
    log: any,
    config: DualGroupConfig,
  ): Promise<void> {
    try {
      const { user, userInboxId, tokenId, reason } = log.args;

      console.log(
        `❌ UserAccessRevoked: ${userInboxId} (${user}) - Reason: ${reason}`,
      );

      // Remove user from premium group
      await this.enhancedGroupManager.removeExpiredMember(
        log.address,
        userInboxId,
        reason,
      );
    } catch (error) {
      console.error("Error handling UserAccessRevoked:", error);
    }
  }

  /**
   * Handle AccessTokenExpired event - remove user from premium group
   */
  private async handleAccessTokenExpired(
    log: any,
    config: DualGroupConfig,
  ): Promise<void> {
    try {
      const { user, tokenId } = log.args;

      console.log(`⏰ AccessTokenExpired: ${user} - Token ${tokenId}`);

      // Get user's inbox ID from contract (would need to call contract method)
      // For now, we'll let the background audit handle this
      console.log(
        `Token ${tokenId} expired for user ${user} - will be handled by background audit`,
      );
    } catch (error) {
      console.error("Error handling AccessTokenExpired:", error);
    }
  }

  /**
   * Add contract to event listening
   */
  async addContractToListen(
    contractAddress: string,
    config: DualGroupConfig,
  ): Promise<void> {
    if (!this.isListening) {
      console.log("Event listener not running, start it first");
      return;
    }

    console.log(`➕ Adding contract to event polling: ${contractAddress}`);

    // Store config and start polling for this contract
    this.groupConfigs.set(contractAddress, config);
    await this.startContractPolling(contractAddress);

    console.log(`✅ Started event polling for ${contractAddress}`);
  }

  /**
   * Get listening status
   */
  isEventListenerActive(): boolean {
    return this.isListening;
  }

  /**
   * Start polling for events from a specific contract
   */
  private async startContractPolling(contractAddress: string): Promise<void> {
    // Clear existing interval if any
    const existingInterval = this.pollingIntervals.get(contractAddress);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Initialize last processed block to current block
    try {
      const currentBlock = await this.publicClient.getBlockNumber();
      this.lastProcessedBlocks.set(contractAddress, currentBlock);
    } catch (error) {
      console.warn(
        `Failed to get current block for ${contractAddress}:`,
        error,
      );
      return;
    }

    // Poll every 15 seconds for new events
    const interval = setInterval(async () => {
      await this.pollContractEvents(contractAddress);
    }, 15000);

    this.pollingIntervals.set(contractAddress, interval);
    console.log(`🔄 Started polling ${contractAddress} every 15 seconds`);
  }

  /**
   * Poll for recent events from a contract
   */
  private async pollContractEvents(contractAddress: string): Promise<void> {
    try {
      const config = this.groupConfigs.get(contractAddress);
      if (!config) return;

      const currentBlock = await this.publicClient.getBlockNumber();
      const lastProcessedBlock =
        this.lastProcessedBlocks.get(contractAddress) || currentBlock - 100n;

      // Only check if there are new blocks
      if (currentBlock <= lastProcessedBlock) {
        return;
      }

      // Get UserAccessGranted events since last processed block
      const grantedLogs = await this.publicClient.getContractEvents({
        address: contractAddress as `0x${string}`,
        abi: [CONTRACT_EVENTS[0]], // UserAccessGranted event
        eventName: "UserAccessGranted",
        fromBlock: lastProcessedBlock + 1n,
        toBlock: currentBlock,
      });

      // Process each event
      for (const log of grantedLogs) {
        console.log(`🎉 Found UserAccessGranted event:`, log);
        await this.handleUserAccessGranted(log, config);
      }

      // Update last processed block
      this.lastProcessedBlocks.set(contractAddress, currentBlock);

      if (grantedLogs.length > 0) {
        console.log(
          `✅ Processed ${grantedLogs.length} events for ${contractAddress}`,
        );
      }
    } catch (error) {
      // Only log non-trivial errors to avoid spam
      if (
        error instanceof Error &&
        !error.message.includes("filter not found")
      ) {
        console.warn(
          `Event polling error for ${contractAddress}:`,
          error.message,
        );
      }
    }
  }

  /**
   * Stop polling for a specific contract
   */
  private stopContractPolling(contractAddress: string): void {
    const interval = this.pollingIntervals.get(contractAddress);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(contractAddress);
      this.lastProcessedBlocks.delete(contractAddress);
      console.log(`🛑 Stopped polling for ${contractAddress}`);
    }
  }

  /**
   * Manually check for recent purchases and send confirmations
   */
  async checkRecentPurchases(
    contractAddress: string,
    userAddress: string,
    userInboxId: string,
  ): Promise<void> {
    try {
      const config = this.groupConfigs.get(contractAddress);
      if (!config) {
        console.error(`Config not found for contract: ${contractAddress}`);
        return;
      }

      console.log(
        `🔍 Checking recent purchases for ${userAddress} on ${contractAddress}`,
      );

      // Check last 1000 blocks for UserAccessGranted events for this user
      const currentBlock = await this.publicClient.getBlockNumber();
      const fromBlock = currentBlock - 1000n;

      const grantedLogs = await this.publicClient.getContractEvents({
        address: contractAddress as `0x${string}`,
        abi: [CONTRACT_EVENTS[0]], // UserAccessGranted event
        eventName: "UserAccessGranted",
        args: {
          user: userAddress as `0x${string}`,
        },
        fromBlock,
        toBlock: currentBlock,
      });

      console.log(
        `Found ${grantedLogs.length} recent purchase events for ${userAddress}`,
      );

      // Process the most recent event
      if (grantedLogs.length > 0) {
        const mostRecentLog = grantedLogs[grantedLogs.length - 1];
        console.log(`🎉 Processing recent purchase event:`, mostRecentLog);
        await this.handleUserAccessGranted(mostRecentLog, config);
      } else {
        console.log(`No recent purchases found for ${userAddress}`);
      }
    } catch (error) {
      console.error(`Error checking recent purchases:`, error);
    }
  }

  /**
   * Manual event processing for testing
   */
  async processTestEvent(
    eventType: "UserAccessGranted" | "UserAccessRevoked" | "AccessTokenExpired",
    contractAddress: string,
    eventData: any,
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
      case "UserAccessGranted":
        await this.handleUserAccessGranted(mockLog, config);
        break;
      case "UserAccessRevoked":
        await this.handleUserAccessRevoked(mockLog, config);
        break;
      case "AccessTokenExpired":
        await this.handleAccessTokenExpired(mockLog, config);
        break;
    }
  }
}
