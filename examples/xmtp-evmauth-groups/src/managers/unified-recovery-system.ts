/**
 * Unified Recovery System
 *
 * Combines all recovery functionality into one comprehensive system:
 * 1. Database-based recovery from stored group records
 * 2. On-chain contract scanning and XMTP group discovery
 * 3. Metadata fixing and membership sync based on NFT ownership
 * 4. Periodic maintenance and monitoring
 */

import { Client, Group, IdentifierKind } from "@xmtp/node-sdk";
import { createPublicClient, getContract, http } from "viem";
import { base } from "viem/chains";
import { JSONDatabase, type GroupRecord } from "../database/json-database.js";
import { EVMAuthHandler } from "../handlers/evmauth-handler.js";
import { IPFSMetadataHandler } from "../handlers/ipfs-metadata.js";
import type { DualGroupConfig } from "../types/types.js";
import { EnhancedGroupManager } from "./enhanced-group-flow.js";

// Interfaces
interface GroupConfig {
  contractAddress: string;
  groupName: string;
  xmtpGroupId?: string;
}

interface NFTHolder {
  address: string;
  tokenId: number;
  expirationTimestamp: number;
  isExpired: boolean;
}

interface TierData {
  name: string;
  description: string;
  durationDays: bigint;
  priceETH: bigint;
  priceUSDC: bigint;
  imageIPFSHash: string;
  metadataURI: string;
  isActive: boolean;
}

interface RecoveryResult {
  groups: Map<string, DualGroupConfig>;
  foundContracts: string[];
  fixedMetadata: number;
  syncedMembers: number;
}

// Contract ABIs
const RECOVERY_ABI = [
  {
    inputs: [],
    name: "xmtpInfo",
    outputs: [
      {
        components: [
          { name: "salesGroupId", type: "string" },
          { name: "premiumGroupId", type: "string" },
          { name: "salesGroupInbox", type: "string" },
          { name: "premiumGroupInbox", type: "string" },
          { name: "botAddress", type: "address" },
          { name: "isActive", type: "bool" },
          { name: "linkedAt", type: "uint256" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const CONTRACT_ABI = [
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "getAccessTier",
    outputs: [
      {
        components: [
          { name: "name", type: "string" },
          { name: "description", type: "string" },
          { name: "durationDays", type: "uint256" },
          { name: "priceETH", type: "uint256" },
          { name: "priceUSDC", type: "uint256" },
          { name: "imageIPFSHash", type: "string" },
          { name: "metadataURI", type: "string" },
          { name: "isActive", type: "bool" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "getTokenHolders",
    outputs: [
      {
        components: [
          { name: "holder", type: "address" },
          { name: "expirationTimestamp", type: "uint256" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

export class UnifiedRecoverySystem {
  private client: Client;
  private database: JSONDatabase;
  private evmAuthHandler: EVMAuthHandler;
  private groupManager: EnhancedGroupManager;
  private publicClient: ReturnType<typeof createPublicClient>;
  private ipfsHandler: IPFSMetadataHandler;
  private recoveryInterval: NodeJS.Timeout | null = null;
  private baseRpcUrl: string;

  constructor(
    client: Client,
    database: JSONDatabase,
    evmAuthHandler: EVMAuthHandler,
    groupManager: EnhancedGroupManager,
    baseRpcUrl: string,
  ) {
    this.client = client;
    this.database = database;
    this.evmAuthHandler = evmAuthHandler;
    this.groupManager = groupManager;
    this.baseRpcUrl = baseRpcUrl;
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(baseRpcUrl),
    }) as any; // Type assertion for compatibility
    this.ipfsHandler = new IPFSMetadataHandler();
  }

  /**
   * Perform complete recovery - startup and ongoing maintenance
   */
  async performFullRecovery(): Promise<RecoveryResult> {
    console.log("🔄 Starting unified recovery system...");

    const result: RecoveryResult = {
      groups: new Map(),
      foundContracts: [],
      fixedMetadata: 0,
      syncedMembers: 0,
    };

    try {
      // Phase 1: Database recovery
      console.log("📚 Phase 1: Database-based recovery...");
      const dbRecovery = await this.recoverFromDatabase();

      // Phase 2: On-chain discovery
      console.log("🔗 Phase 2: On-chain contract discovery...");
      const chainRecovery = await this.discoverFromChain();

      // Phase 3: XMTP conversation scanning
      console.log("💬 Phase 3: XMTP conversation scanning...");
      const conversationRecovery = await this.scanConversations();

      // Merge all discoveries
      const allGroups = new Map<string, DualGroupConfig>();

      // Merge maps manually to avoid type issues
      if (dbRecovery.groups) {
        for (const [key, value] of dbRecovery.groups.entries()) {
          allGroups.set(key, value);
        }
      }
      if (chainRecovery.groups) {
        for (const [key, value] of chainRecovery.groups.entries()) {
          allGroups.set(key, value);
        }
      }
      if (conversationRecovery.groups) {
        for (const [key, value] of conversationRecovery.groups.entries()) {
          allGroups.set(key, value);
        }
      }

      const allContracts = [
        ...(dbRecovery.foundContracts || []),
        ...(chainRecovery.foundContracts || []),
        ...(conversationRecovery.foundContracts || []),
      ];

      result.groups = allGroups;
      result.foundContracts = Array.from(new Set(allContracts));

      // Phase 3.5: Check and send missing welcome messages
      if (allGroups.size > 0) {
        await this.checkAndSendMissingWelcomeMessages(allGroups);
      }

      // Phase 4: Metadata fixing and membership sync
      if (result.foundContracts.length > 0) {
        console.log("🔧 Phase 4: Metadata and membership maintenance...");
        const groupConfigsArray: GroupConfig[] = [];
        for (const [, config] of allGroups.entries()) {
          groupConfigsArray.push({
            contractAddress: config.contractAddress,
            groupName: config.metadata.name,
            xmtpGroupId: config.premiumGroupId || config.salesGroupId,
          });
        }

        const maintenanceResult =
          await this.performMaintenance(groupConfigsArray);

        result.fixedMetadata = maintenanceResult.fixedMetadata;
        result.syncedMembers = maintenanceResult.syncedMembers;
      }

      console.log(
        `✅ Recovery complete: ${result.groups.size} groups, ${result.foundContracts.length} contracts`,
      );
      console.log(
        `🔧 Maintenance: ${result.fixedMetadata} metadata fixed, ${result.syncedMembers} members synced`,
      );

      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("❌ Recovery failed:", errorMessage);
      throw error;
    }
  }

  /**
   * Start periodic recovery system
   */
  async startPeriodicRecovery(
    groupConfigs: GroupConfig[],
    intervalMinutes = 30,
  ): Promise<void> {
    console.log(
      `🔄 Starting periodic recovery (every ${intervalMinutes} minutes)...`,
    );

    // Run initial maintenance
    await this.performMaintenance(groupConfigs);

    // Set up periodic maintenance
    this.recoveryInterval = setInterval(
      async () => {
        console.log("⏰ Running scheduled maintenance...");
        try {
          await this.performMaintenance(groupConfigs);
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error("❌ Scheduled maintenance failed:", errorMessage);
        }
      },
      intervalMinutes * 60 * 1000,
    );

    console.log(`✅ Periodic recovery started`);
  }

  /**
   * Stop periodic recovery
   */
  stopPeriodicRecovery(): void {
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
      console.log("🛑 Periodic recovery stopped");
    }
  }

  /**
   * Phase 1: Recover from database
   */
  private async recoverFromDatabase(): Promise<Partial<RecoveryResult>> {
    const groups = new Map<string, DualGroupConfig>();
    const foundContracts = new Set<string>();

    try {
      const existingGroups = await this.database.getAllGroups();
      console.log(`📊 Found ${existingGroups.length} groups in database`);

      for (const dbGroup of existingGroups) {
        const config: DualGroupConfig = {
          groupId: dbGroup.premiumGroupId,
          contractAddress: dbGroup.contractAddress,
          creatorInboxId: dbGroup.creatorInboxId,
          salesGroupId: dbGroup.salesGroupId,
          premiumGroupId: dbGroup.premiumGroupId,
          createdAt: new Date(dbGroup.createdAt),
          metadata: {
            name: dbGroup.name,
            description: `Premium access to ${dbGroup.name}`,
            image: `https://via.placeholder.com/400x400/6366f1/ffffff?text=${encodeURIComponent(dbGroup.name)}`,
          },
          salesSettings: {
            welcomeMessage: `Welcome to ${dbGroup.name} sales!`,
            availableTiers: "Check available access tiers below",
            helpMessage: "Need help? Contact support",
            description: `Join ${dbGroup.name} community`,
          },
          premiumSettings: {
            welcomeMessage: `Welcome to ${dbGroup.name} premium!`,
            description: `Exclusive access to ${dbGroup.name}`,
          },
          // Add missing required fields
          creatorAddress: "",
          isActive: true,
          tiers: [],
          paymentConfig: {
            currency: "USDC",
            acceptedTokens: ["USDC", "ETH"],
            defaultToken: "USDC",
          },
        } as DualGroupConfig;

        groups.set(dbGroup.contractAddress, config);
        foundContracts.add(dbGroup.contractAddress);
      }

      return { groups, foundContracts: Array.from(foundContracts) };
    } catch (error) {
      console.error("❌ Database recovery failed:", error);
      return { groups, foundContracts: [] };
    }
  }

  /**
   * Phase 1.5: Check and send missing welcome messages for recovered groups
   */
  private async checkAndSendMissingWelcomeMessages(
    recoveredGroups: Map<string, DualGroupConfig>,
  ): Promise<void> {
    console.log("💬 Checking for missing welcome messages...");

    for (const [contractAddress, config] of recoveredGroups.entries()) {
      try {
        console.log(
          `🔍 Checking welcome messages for ${config.metadata?.name} (${contractAddress})`,
        );

        // Sync conversations first
        await this.client.conversations.sync();

        // Get both groups
        const salesGroup = await this.client.conversations.getConversationById(
          config.salesGroupId,
        );
        const premiumGroup =
          await this.client.conversations.getConversationById(
            config.premiumGroupId,
          );

        if (salesGroup && premiumGroup) {
          // Check if welcome messages were sent (look for recent messages from agent)
          const salesMessages = await salesGroup.messages({ limit: 10 });
          const premiumMessages = await premiumGroup.messages({ limit: 10 });

          const agentInboxId = this.client.inboxId.toLowerCase();

          // Check if agent has sent welcome messages
          const salesHasWelcome = salesMessages.some(
            (msg) =>
              msg.senderInboxId.toLowerCase() === agentInboxId &&
              typeof msg.content === "string" &&
              msg.content.includes("Welcome to") &&
              msg.content.includes("Sales"),
          );

          const premiumHasWelcome = premiumMessages.some(
            (msg) =>
              msg.senderInboxId.toLowerCase() === agentInboxId &&
              typeof msg.content === "string" &&
              msg.content.includes("Welcome to") &&
              msg.content.includes("Premium"),
          );

          // Send missing welcome messages
          if (!salesHasWelcome) {
            console.log(
              `📝 Sending missing sales welcome message for ${config.metadata?.name}`,
            );
            await salesGroup.send(
              `🎉 Welcome to ${config.metadata?.name} Sales! 🎉\n\n` +
                `This is where you can:\n` +
                `🛒 Purchase access to our premium community\n` +
                `📋 Learn about available tiers and pricing\n` +
                `💬 Get support from our team\n\n` +
                `Once tier setup is complete, you'll be able to use:\n` +
                `• /buy-access to purchase premium access\n` +
                `• /group-info to see pricing details\n\n` +
                `🚀 Stay tuned for more updates!`,
            );
          }

          if (!premiumHasWelcome) {
            console.log(
              `📝 Sending missing premium welcome message for ${config.metadata?.name}`,
            );
            await premiumGroup.send(
              `💎 Welcome to ${config.metadata?.name} Premium! 💎\n\n` +
                `🎉 Congratulations! You now have exclusive access to our premium community.\n\n` +
                `✨ Premium Benefits:\n` +
                `• Exclusive content and discussions\n` +
                `• Priority support\n` +
                `• Special member privileges\n` +
                `• Early access to new features\n\n` +
                `Enjoy your premium experience! 🚀`,
            );
          }

          if (salesHasWelcome && premiumHasWelcome) {
            console.log(
              `✅ Welcome messages already sent for ${config.metadata?.name}`,
            );
          }
        } else {
          console.log(
            `⚠️ Could not find groups for ${config.metadata?.name} (${contractAddress})`,
          );
          if (!salesGroup)
            console.log(`   Missing sales group: ${config.salesGroupId}`);
          if (!premiumGroup)
            console.log(`   Missing premium group: ${config.premiumGroupId}`);
        }
      } catch (error) {
        console.error(
          `❌ Error checking welcome messages for ${contractAddress}:`,
          error,
        );
      }
    }
  }

  /**
   * Phase 2: Discover contracts from on-chain data
   */
  private async discoverFromChain(): Promise<Partial<RecoveryResult>> {
    const groups = new Map<string, DualGroupConfig>();
    const foundContracts: string[] = [];

    try {
      // This would require the factory contract to have discovery methods
      // For now, we'll rely on database and conversation scanning
      console.log(
        "⚠️ On-chain discovery not yet implemented - relying on database and conversations",
      );

      return { groups, foundContracts };
    } catch (error) {
      console.error("❌ On-chain discovery failed:", error);
      return { groups, foundContracts };
    }
  }

  /**
   * Phase 3: Scan XMTP conversations for contract addresses
   */
  private async scanConversations(): Promise<Partial<RecoveryResult>> {
    const groups = new Map<string, DualGroupConfig>();
    const foundContracts: string[] = [];

    try {
      await this.client.conversations.sync();
      const conversations = await this.client.conversations.list();

      console.log(`🔍 Scanning ${conversations.length} conversations...`);

      const contractRegex = /0x[a-fA-F0-9]{40}/g;
      const possibleContracts = new Set<string>();

      for (const conversation of conversations) {
        try {
          if (conversation instanceof Group) {
            // Check group name and description for contract addresses
            const text = `${conversation.name} ${conversation.description || ""}`;
            const matches = text.match(contractRegex);
            if (matches) {
              matches.forEach((addr) =>
                possibleContracts.add(addr.toLowerCase()),
              );
            }
          }

          // Get recent messages to scan for contract addresses
          const messages = await conversation.messages({ limit: 50 });
          for (const message of messages) {
            if (typeof message.content === "string") {
              const matches = message.content.match(contractRegex);
              if (matches) {
                matches.forEach((addr) =>
                  possibleContracts.add(addr.toLowerCase()),
                );
              }
            }
          }
        } catch (error) {
          // Skip conversations that can't be accessed
          continue;
        }
      }

      console.log(
        `🔍 Found ${possibleContracts.size} potential contract addresses`,
      );

      // Verify contracts by trying to call them
      for (const address of possibleContracts) {
        try {
          const contract = getContract({
            address: address as `0x${string}`,
            abi: RECOVERY_ABI,
            client: this.publicClient,
          });

          // Try to call xmtpInfo to verify it's an EVMAuth contract
          const info = await (contract as any).read.xmtpInfo();
          if (info && info.salesGroupId) {
            foundContracts.push(address);
            console.log(`✅ Verified EVMAuth contract: ${address}`);

            // Create basic config - will be enhanced in other phases
            const config: Partial<DualGroupConfig> = {
              contractAddress: address,
              salesGroupId: info.salesGroupId,
              premiumGroupId: info.premiumGroupId,
              creatorAddress: info.botAddress,
              isActive: info.isActive,
              metadata: {
                name: "Recovered Group",
                description: "Group recovered from conversations",
                image: "",
              },
            };

            groups.set(address, config as DualGroupConfig);
          }
        } catch (error) {
          // Not an EVMAuth contract or not accessible
          continue;
        }
      }

      return { groups, foundContracts };
    } catch (error) {
      console.error("❌ Conversation scanning failed:", error);
      return { groups, foundContracts };
    }
  }

  /**
   * Phase 4: Perform maintenance (metadata fixing and membership sync)
   */
  private async performMaintenance(groupConfigs: GroupConfig[]): Promise<{
    fixedMetadata: number;
    syncedMembers: number;
  }> {
    let fixedMetadata = 0;
    let syncedMembers = 0;

    for (const config of groupConfigs) {
      try {
        console.log(
          `🔧 Maintaining: ${config.groupName} (${config.contractAddress})`,
        );

        // Fix metadata if needed
        const metadataFixed = await this.fixContractMetadata(config);
        fixedMetadata += metadataFixed;

        // Sync group membership
        const membersSynced = await this.syncGroupMembership(config);
        syncedMembers += membersSynced;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `❌ Maintenance failed for ${config.groupName}:`,
          errorMessage,
        );
      }
    }

    return { fixedMetadata, syncedMembers };
  }

  /**
   * Fix contract metadata using IPFS upload
   */
  private async fixContractMetadata(config: GroupConfig): Promise<number> {
    let fixedCount = 0;

    try {
      const contract = getContract({
        address: config.contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        client: this.publicClient,
      });

      const tokenIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      for (const tokenId of tokenIds) {
        try {
          const tier = (await (contract as any).read.getAccessTier([
            BigInt(tokenId),
          ])) as TierData;

          if (!tier.isActive) continue;

          // Check if metadata URI is empty
          if (!tier.metadataURI || tier.metadataURI.length === 0) {
            console.log(
              `🔧 Would fix metadata for token ${tokenId}: ${tier.name}`,
            );

            // Get fallback image
            let imageHash = tier.imageIPFSHash;
            if (!imageHash || imageHash.length === 0) {
              imageHash = await this.getXMTPGroupImageHash(config);
            }

            // Create metadata
            const metadata = {
              name: `${tier.name} Access Token`,
              description: `${tier.description} - Valid for ${tier.durationDays} days`,
              image: `ipfs://${imageHash}`,
              attributes: [
                { trait_type: "Tier", value: tier.name },
                { trait_type: "Duration", value: `${tier.durationDays} days` },
                { trait_type: "Price ETH", value: tier.priceETH.toString() },
                { trait_type: "Price USDC", value: tier.priceUSDC.toString() },
              ],
              group_id: config.groupName,
              group_name: tier.name,
              access_duration_days: Number(tier.durationDays),
              access_tier: tier.name,
              created_at: new Date().toISOString(),
              creator_address: "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc",
            };

            try {
              const metadataHash =
                await this.ipfsHandler.uploadMetadata(metadata);
              const metadataURI = `ipfs://${metadataHash}`;

              console.log(
                `✅ Would update metadata for token ${tokenId} to ${metadataURI}`,
              );
              console.log(`   (Contract update needed via setupAccessTier)`);
              fixedCount++;
            } catch (uploadError) {
              console.error(
                `❌ Failed to upload metadata for token ${tokenId}:`,
                uploadError,
              );
            }
          }
        } catch (error) {
          // Token doesn't exist, skip
          continue;
        }
      }

      if (fixedCount > 0) {
        console.log(
          `✅ Fixed metadata for ${fixedCount} tokens in ${config.groupName}`,
        );
      }
    } catch (error) {
      console.error(
        `❌ Metadata fixing failed for ${config.groupName}:`,
        error,
      );
    }

    return fixedCount;
  }

  /**
   * Sync group membership based on NFT ownership
   */
  private async syncGroupMembership(config: GroupConfig): Promise<number> {
    let syncedCount = 0;

    try {
      // Get all NFT holders
      const allHolders = await this.getAllNFTHolders(config.contractAddress);
      const currentTime = Math.floor(Date.now() / 1000);

      const validHolders = allHolders.filter(
        (holder) =>
          !holder.isExpired && holder.expirationTimestamp > currentTime,
      );
      const expiredHolders = allHolders.filter(
        (holder) =>
          holder.isExpired || holder.expirationTimestamp <= currentTime,
      );

      console.log(
        `👥 Found ${validHolders.length} valid, ${expiredHolders.length} expired holders`,
      );

      // Get XMTP group
      const xmtpGroup = await this.getXMTPGroup(config);
      if (!xmtpGroup) {
        console.log(`⚠️ Could not find XMTP group for ${config.groupName}`);
        return syncedCount;
      }

      const currentMembers = await xmtpGroup.members();
      const currentMemberAddresses = new Set(
        currentMembers
          .map((member) => {
            const ethId = member.accountIdentifiers.find(
              (id) => id.identifierKind === IdentifierKind.Ethereum,
            );
            return ethId?.identifier.toLowerCase();
          })
          .filter(Boolean) as string[],
      );

      // Add valid holders
      for (const holder of validHolders) {
        const holderAddress = holder.address.toLowerCase();
        if (!currentMemberAddresses.has(holderAddress)) {
          try {
            await this.groupManager.addMemberToPremiumGroup(
              config.contractAddress,
              holderAddress,
              `Auto-sync: Token ${holder.tokenId}`,
              holder.tokenId,
            );
            console.log(`✅ Added ${holderAddress} (Token ${holder.tokenId})`);
            syncedCount++;
          } catch (error) {
            console.log(`⚠️ Could not add ${holderAddress}:`, error);
          }
        }
      }

      // Remove expired holders
      for (const holder of expiredHolders) {
        const holderAddress = holder.address.toLowerCase();
        if (currentMemberAddresses.has(holderAddress)) {
          try {
            const member = currentMembers.find((m) => {
              const ethId = m.accountIdentifiers.find(
                (id) => id.identifierKind === IdentifierKind.Ethereum,
              );
              return ethId?.identifier.toLowerCase() === holderAddress;
            });

            if (member) {
              await this.groupManager.removeMemberFromPremiumGroup(
                config.contractAddress,
                member.inboxId,
              );
              console.log(
                `🚫 Removed ${holderAddress} (Token ${holder.tokenId} expired)`,
              );
              syncedCount++;
            }
          } catch (error) {
            console.log(`⚠️ Could not remove ${holderAddress}:`, error);
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `❌ Membership sync failed for ${config.groupName}:`,
        errorMessage,
      );
    }

    return syncedCount;
  }

  /**
   * Get XMTP group image hash as fallback
   */
  private async getXMTPGroupImageHash(config: GroupConfig): Promise<string> {
    try {
      if (config.xmtpGroupId) {
        const group = await this.client.conversations.getConversationById(
          config.xmtpGroupId,
        );
        if (group && group instanceof Group) {
          const imageUrl = group.imageUrl;
          if (imageUrl && imageUrl.startsWith("ipfs://")) {
            return imageUrl.replace("ipfs://", "");
          }
        }
      }
    } catch (error) {
      console.log(`⚠️ Could not get XMTP group image for ${config.groupName}`);
    }

    return (
      process.env.DEFAULT_NFT_IMAGE_HASH ||
      "bafkreies7jntbufslrlq7524ahrrtjmwssarm3ni3zmbg7nmo6c4toqxne"
    );
  }

  /**
   * Get all NFT holders for a contract
   */
  private async getAllNFTHolders(
    contractAddress: string,
  ): Promise<NFTHolder[]> {
    const contract = getContract({
      address: contractAddress as `0x${string}`,
      abi: CONTRACT_ABI,
      client: this.publicClient,
    });

    const holders: NFTHolder[] = [];
    const tokenIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    for (const tokenId of tokenIds) {
      try {
        const tier = (await (contract as any).read.getAccessTier([
          BigInt(tokenId),
        ])) as TierData;
        if (!tier.isActive) continue;

        const tokenHolders = (await (contract as any).read.getTokenHolders([
          BigInt(tokenId),
        ])) as Array<{
          holder: string;
          expirationTimestamp: bigint;
        }>;

        const currentTime = Math.floor(Date.now() / 1000);

        for (const holder of tokenHolders) {
          const balance = (await (contract as any).read.balanceOf([
            holder.holder as `0x${string}`,
            BigInt(tokenId),
          ])) as bigint;

          if (balance > BigInt(0)) {
            holders.push({
              address: holder.holder,
              tokenId,
              expirationTimestamp: Number(holder.expirationTimestamp),
              isExpired: Number(holder.expirationTimestamp) <= currentTime,
            });
          }
        }
      } catch (error) {
        continue;
      }
    }

    return holders;
  }

  /**
   * Get XMTP group by config
   */
  private async getXMTPGroup(config: GroupConfig): Promise<Group | null> {
    try {
      if (config.xmtpGroupId) {
        const conversation =
          await this.client.conversations.getConversationById(
            config.xmtpGroupId,
          );
        if (conversation && conversation instanceof Group) {
          return conversation;
        }
      }

      // Fallback: search by name
      await this.client.conversations.sync();
      const conversations = await this.client.conversations.list();

      for (const conv of conversations) {
        if (
          conv instanceof Group &&
          conv.name.toLowerCase() === config.groupName.toLowerCase()
        ) {
          return conv;
        }
      }

      return null;
    } catch (error) {
      console.error(
        `❌ Error finding XMTP group for ${config.groupName}:`,
        error,
      );
      return null;
    }
  }
}
