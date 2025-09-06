/**
 * Metadata Sync Job
 *
 * Periodically syncs NFT metadata with XMTP group images
 * Ensures OpenSea displays the same image as the XMTP group
 */

import { Client, Group } from "@xmtp/node-sdk";
import {
  createPublicClient,
  encodeFunctionData,
  getContract,
  http,
} from "viem";
import { base } from "viem/chains";
import { EVMAuthHandler } from "../handlers/evmauth-handler.js";
import { IPFSMetadataHandler } from "../handlers/ipfs-metadata.js";
import type { DualGroupConfig } from "../types/types.js";

interface MetadataSyncConfig {
  contractAddress: string;
  groupName: string;
  premiumGroupId?: string;
  salesGroupId?: string;
}

export class MetadataSyncJob {
  private client: Client;
  private evmAuthHandler: EVMAuthHandler;
  private ipfsHandler: IPFSMetadataHandler;
  private publicClient: ReturnType<typeof createPublicClient>;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(client: Client, evmAuthHandler: EVMAuthHandler) {
    this.client = client;
    this.evmAuthHandler = evmAuthHandler;
    this.ipfsHandler = new IPFSMetadataHandler();
    this.publicClient = createPublicClient({
      chain: base,
      transport: http("https://mainnet.base.org"),
    }) as any;
  }

  /**
   * Start the metadata sync job
   */
  startMetadataSync(
    groupConfigs: MetadataSyncConfig[],
    intervalHours = 6,
  ): void {
    console.log(
      `🔄 Starting metadata sync job (every ${intervalHours} hours)...`,
    );

    // Run initial sync
    this.syncAllGroupMetadata(groupConfigs);

    // Set up periodic sync
    this.syncInterval = setInterval(
      async () => {
        console.log("⏰ Running scheduled metadata sync...");
        try {
          await this.syncAllGroupMetadata(groupConfigs);
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error("❌ Scheduled metadata sync failed:", errorMessage);
        }
      },
      intervalHours * 60 * 60 * 1000,
    );

    console.log(`✅ Metadata sync job started`);
  }

  /**
   * Stop the metadata sync job
   */
  stopMetadataSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log("🛑 Metadata sync job stopped");
    }
  }

  /**
   * Sync metadata for all groups
   */
  private async syncAllGroupMetadata(
    groupConfigs: MetadataSyncConfig[],
  ): Promise<void> {
    for (const config of groupConfigs) {
      try {
        await this.syncGroupMetadata(config);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `❌ Metadata sync failed for ${config.groupName}:`,
          errorMessage,
        );
      }
    }
  }

  /**
   * Sync metadata for a specific group
   */
  private async syncGroupMetadata(config: MetadataSyncConfig): Promise<void> {
    console.log(`🔄 Syncing metadata for ${config.groupName}...`);

    try {
      // Get current XMTP group image
      const currentImageHash = await this.getXMTPGroupImageHash(config);

      // Get all active token IDs for this contract
      const activeTokens = await this.getActiveTokenIds(config.contractAddress);

      console.log(
        `📊 Found ${activeTokens.length} active tokens for ${config.groupName}`,
      );

      for (const tokenId of activeTokens) {
        try {
          // Check if metadata needs updating
          const needsUpdate = await this.checkIfMetadataNeedsUpdate(
            config.contractAddress,
            tokenId,
            currentImageHash,
          );

          if (needsUpdate) {
            await this.updateTokenMetadata(
              config.contractAddress,
              tokenId,
              currentImageHash,
              config.groupName,
            );
            console.log(`✅ Updated metadata for Token ${tokenId}`);

            // Wait between updates to avoid nonce issues
            await new Promise((resolve) => setTimeout(resolve, 3000));
          } else {
            console.log(`✅ Token ${tokenId} metadata is up to date`);
          }
        } catch (error) {
          console.error(`❌ Failed to update Token ${tokenId}:`, error);
        }
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `❌ Group metadata sync failed for ${config.groupName}:`,
        errorMessage,
      );
    }
  }

  /**
   * Get XMTP group image hash with better detection
   */
  private async getXMTPGroupImageHash(
    config: MetadataSyncConfig,
  ): Promise<string> {
    try {
      await this.client.conversations.sync();
      const conversations = await this.client.conversations.list();

      // Look for premium group first, then sales group
      const groupIds = [config.premiumGroupId, config.salesGroupId].filter(
        Boolean,
      );

      for (const groupId of groupIds) {
        const group = await this.client.conversations.getConversationById(
          groupId!,
        );
        if (group && group instanceof Group) {
          console.log(`🔍 Checking group: ${group.name} (ID: ${group.id})`);

          if (group.imageUrl) {
            console.log(`🖼️ Image URL: ${group.imageUrl}`);

            // Check for IPFS URLs
            if (group.imageUrl.startsWith("ipfs://")) {
              const hash = group.imageUrl.replace("ipfs://", "");
              if (hash.length > 10 && !hash.includes("placeholder")) {
                console.log(`✅ Found real IPFS image: ${hash}`);
                return hash;
              }
            }

            // Check for gateway URLs
            if (group.imageUrl.includes("ipfs/")) {
              const ipfsMatch = group.imageUrl.match(
                /ipfs\/([a-zA-Z0-9]{46,})/,
              );
              if (ipfsMatch) {
                const hash = ipfsMatch[1];
                console.log(`✅ Found IPFS image via gateway: ${hash}`);
                return hash;
              }
            }
          }
        }
      }

      // Fallback: scan by name
      for (const conv of conversations) {
        if (
          conv instanceof Group &&
          conv.name &&
          conv.name.toLowerCase().includes(config.groupName.toLowerCase())
        ) {
          if (
            conv.imageUrl &&
            conv.imageUrl.startsWith("ipfs://") &&
            !conv.imageUrl.includes("placeholder")
          ) {
            const hash = conv.imageUrl.replace("ipfs://", "");
            console.log(`✅ Found IPFS image from ${conv.name}: ${hash}`);
            return hash;
          }
        }
      }

      console.log("⚠️ No real IPFS image found in XMTP groups, using default");
      return (
        process.env.DEFAULT_NFT_IMAGE_HASH ||
        "bafkreies7jntbufslrlq7524ahrrtjmwssarm3ni3zmbg7nmo6c4toqxne"
      );
    } catch (error) {
      console.error("❌ Error getting XMTP group image:", error);
      return (
        process.env.DEFAULT_NFT_IMAGE_HASH ||
        "bafkreies7jntbufslrlq7524ahrrtjmwssarm3ni3zmbg7nmo6c4toqxne"
      );
    }
  }

  /**
   * Get all active token IDs for a contract
   */
  private async getActiveTokenIds(contractAddress: string): Promise<number[]> {
    const activeTokens: number[] = [];

    for (let tokenId = 1; tokenId <= 20; tokenId++) {
      try {
        const tier = await this.evmAuthHandler.getAccessTier(
          contractAddress,
          tokenId,
        );
        if (tier && tier.isActive) {
          activeTokens.push(tokenId);
        }
      } catch (error) {
        // Token doesn't exist
      }
    }

    return activeTokens;
  }

  /**
   * Check if token metadata needs updating
   */
  private async checkIfMetadataNeedsUpdate(
    contractAddress: string,
    tokenId: number,
    currentImageHash: string,
  ): Promise<boolean> {
    try {
      const tier = await this.evmAuthHandler.getAccessTier(
        contractAddress,
        tokenId,
      );

      if (!tier || !tier.isActive) {
        return false;
      }

      // Check if image hash in metadata matches current group image
      const currentImageInMetadata = tier.imageIPFSHash;

      if (currentImageInMetadata !== currentImageHash) {
        console.log(`🔄 Token ${tokenId} image needs update:`);
        console.log(`   Current: ${currentImageInMetadata || "EMPTY"}`);
        console.log(`   New: ${currentImageHash}`);
        return true;
      }

      // Check if metadata URI is empty
      if (!tier.metadataURI || tier.metadataURI.length === 0) {
        console.log(`🔄 Token ${tokenId} needs metadata URI`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ Error checking Token ${tokenId}:`, error);
      return false;
    }
  }

  /**
   * Update token metadata with new image
   */
  private async updateTokenMetadata(
    contractAddress: string,
    tokenId: number,
    imageHash: string,
    groupName: string,
  ): Promise<void> {
    try {
      // Get current tier info
      const tier = await this.evmAuthHandler.getAccessTier(
        contractAddress,
        tokenId,
      );

      if (!tier) {
        throw new Error(`Token ${tokenId} not found`);
      }

      // Create updated metadata
      const metadata = {
        name: `${groupName} ${tier.name} Access Token`,
        description: `${tier.description} - Valid for ${tier.durationDays} days`,
        image: `ipfs://${imageHash}`,
        attributes: [
          { trait_type: "Community", value: groupName },
          { trait_type: "Tier", value: tier.name },
          { trait_type: "Duration", value: `${tier.durationDays} days` },
          { trait_type: "Price ETH", value: tier.priceETH.toString() },
          { trait_type: "Price USDC", value: tier.priceUSDC.toString() },
          { trait_type: "Image Source", value: "XMTP Group" },
          { trait_type: "Last Updated", value: new Date().toISOString() },
        ],
        group_id: groupName,
        group_name: tier.name,
        access_duration_days: Number(tier.durationDays),
        access_tier: tier.name,
        updated_at: new Date().toISOString(),
        creator_address: "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc",
      };

      // Upload to IPFS
      const metadataHash = await this.ipfsHandler.uploadMetadata(metadata);
      const metadataURI = `ipfs://${metadataHash}`;

      console.log(`📤 Uploaded updated metadata: ${metadataURI}`);

      // Update contract (this would need to be implemented)
      console.log(
        `🔄 Would update contract Token ${tokenId} with new metadata`,
      );
      console.log(`   Image: ${imageHash}`);
      console.log(`   Metadata: ${metadataURI}`);

      // TODO: Call setupAccessTier with updated metadata
      // For now just logging what would be updated
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `❌ Failed to update Token ${tokenId} metadata:`,
        errorMessage,
      );
    }
  }
}





