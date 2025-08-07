/**
 * Dynamic Image Manager - Intelligent image handling for EVMAuth NFTs
 * 
 * Features:
 * - Fallback to XMTP group image when no tier-specific image is set
 * - Dynamic image fetching for NFT metadata
 * - Image update capabilities
 * - Smart caching and fallback logic
 */

import type { Client, Group } from "@xmtp/node-sdk";
import type { DualGroupConfig } from "../types/types";

export interface ImageResolution {
  url: string;
  source: 'tier-specific' | 'group-image' | 'default-placeholder';
  cached?: boolean;
}

export class DynamicImageManager {
  private client: Client;
  private imageCache: Map<string, { url: string; timestamp: number }> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Get the best available image for an NFT tier
   * Priority: tier-specific > group image > default placeholder
   */
  async resolveNFTImage(
    groupConfig: DualGroupConfig,
    tierId?: string,
    tierSpecificImage?: string
  ): Promise<ImageResolution> {
    // 1. Use tier-specific image if provided
    if (tierSpecificImage) {
      return {
        url: tierSpecificImage,
        source: 'tier-specific'
      };
    }

    // 2. Try to get the XMTP group image
    try {
      const groupImage = await this.getGroupImage(groupConfig.premiumGroupId);
      if (groupImage) {
        return {
          url: groupImage,
          source: 'group-image',
          cached: this.imageCache.has(groupConfig.premiumGroupId)
        };
      }
    } catch (error) {
      console.warn(`Could not fetch group image for ${groupConfig.premiumGroupId}:`, error);
    }

    // 3. Fallback to branded default
    return {
      url: this.generateBrandedPlaceholder(groupConfig.groupName || 'Premium', tierId),
      source: 'default-placeholder'
    };
  }

  /**
   * Get the current image set on an XMTP group
   */
  private async getGroupImage(groupId: string): Promise<string | null> {
    try {
      // Check cache first
      const cached = this.imageCache.get(groupId);
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        return cached.url;
      }

      // Fetch fresh data
      const group = await this.client.conversations.getConversationById(groupId) as Group;
      if (!group) return null;

      const imageUrl = group.imageUrl;
      if (imageUrl) {
        // Cache the result
        this.imageCache.set(groupId, {
          url: imageUrl,
          timestamp: Date.now()
        });
        return imageUrl;
      }

      return null;
    } catch (error) {
      console.error(`Error fetching group image for ${groupId}:`, error);
      return null;
    }
  }

  /**
   * Update a group's image (and invalidate cache)
   */
  async updateGroupImage(groupId: string, imageUrl: string): Promise<boolean> {
    try {
      const group = await this.client.conversations.getConversationById(groupId) as Group;
      if (!group) return false;

      await group.updateImageUrl(imageUrl);
      
      // Update cache
      this.imageCache.set(groupId, {
        url: imageUrl,
        timestamp: Date.now()
      });

      console.log(`✅ Updated group image for ${groupId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to update group image for ${groupId}:`, error);
      return false;
    }
  }

  /**
   * Generate a branded placeholder image URL
   */
  private generateBrandedPlaceholder(groupName: string, tierId?: string): string {
    const encodedName = encodeURIComponent(groupName);
    const encodedTier = tierId ? encodeURIComponent(tierId) : 'Access';
    
    // Using a placeholder service with custom branding
    return `https://via.placeholder.com/400x400/6366f1/ffffff?text=${encodedName}+${encodedTier}`;
  }

  /**
   * Batch resolve images for multiple tiers
   */
  async resolveMultipleTierImages(
    groupConfig: DualGroupConfig,
    tiers: Array<{ id: string; name: string; customImage?: string }>
  ): Promise<Map<string, ImageResolution>> {
    const results = new Map<string, ImageResolution>();
    
    // Get group image once for all tiers (efficiency)
    const groupImageUrl = await this.getGroupImage(groupConfig.premiumGroupId);
    
    for (const tier of tiers) {
      if (tier.customImage) {
        results.set(tier.id, {
          url: tier.customImage,
          source: 'tier-specific'
        });
      } else if (groupImageUrl) {
        results.set(tier.id, {
          url: groupImageUrl,
          source: 'group-image',
          cached: true
        });
      } else {
        results.set(tier.id, {
          url: this.generateBrandedPlaceholder(tier.name, tier.id),
          source: 'default-placeholder'
        });
      }
    }
    
    return results;
  }

  /**
   * Clear cache for a specific group
   */
  clearGroupCache(groupId: string): void {
    this.imageCache.delete(groupId);
  }

  /**
   * Clear all cached images
   */
  clearAllCache(): void {
    this.imageCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.imageCache.size,
      entries: Array.from(this.imageCache.keys())
    };
  }
}

/**
 * Helper function to create enhanced NFT metadata with smart image resolution
 */
export async function createEnhancedNFTMetadata(
  imageManager: DynamicImageManager,
  groupConfig: DualGroupConfig,
  tier: {
    id: string;
    name: string;
    description: string;
    durationDays: number;
    priceUSD: number;
    customImage?: string;
  }
): Promise<{
  name: string;
  description: string;
  image: string;
  imageSource: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
}> {
  const imageResolution = await imageManager.resolveNFTImage(
    groupConfig,
    tier.id,
    tier.customImage
  );

  return {
    name: `${groupConfig.groupName} - ${tier.name}`,
    description: `${tier.description}\n\nDuration: ${tier.durationDays} days\nPrice: $${tier.priceUSD} USD\n\nThis NFT grants time-limited access to the ${groupConfig.groupName} premium community.`,
    image: imageResolution.url,
    imageSource: imageResolution.source,
    attributes: [
      { trait_type: "Community", value: groupConfig.groupName || "Premium Group" },
      { trait_type: "Tier", value: tier.name },
      { trait_type: "Duration (Days)", value: tier.durationDays },
      { trait_type: "Price (USD)", value: tier.priceUSD },
      { trait_type: "Image Source", value: imageResolution.source },
      { trait_type: "Access Type", value: "Time-Limited" },
      { trait_type: "Network", value: "Base" },
      { trait_type: "Standard", value: "EVMAuth ERC-1155" }
    ]
  };
}