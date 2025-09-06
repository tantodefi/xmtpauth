import { createHash } from "crypto";
import axios from "axios";
import FormData from "form-data";

// IPFS pinning service configuration
interface IPFSConfig {
  gateway: string;
  pinningService: string;
  apiKey?: string;
}

// Default IPFS configuration (using Pinata)
const DEFAULT_IPFS_CONFIG: IPFSConfig = {
  gateway: process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/",
  pinningService: "https://api.pinata.cloud",
  apiKey: process.env.PINATA_JWT, // Pinata JWT token
};

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  external_url?: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

export interface GroupNFTMetadata extends NFTMetadata {
  // Group-specific metadata
  group_id: string;
  group_name: string;
  access_duration_days: number;
  access_tier: string;
  created_at: string;
  creator_address: string;
}

export class IPFSHandler {
  private config: IPFSConfig;

  constructor(config?: Partial<IPFSConfig>) {
    this.config = { ...DEFAULT_IPFS_CONFIG, ...config };
  }

  /**
   * Upload image to IPFS using Pinata and return hash
   */
  async uploadImage(imageBuffer: Buffer, filename: string): Promise<string> {
    try {
      // If no API key is configured, use default image hash
      if (!this.config.apiKey) {
        console.warn(
          "⚠️ No Pinata API key configured, using default image hash",
        );
        return (
          process.env.DEFAULT_NFT_IMAGE_HASH ||
          "bafkreies7jntbufslrlq7524ahrrtjmwssarm3ni3zmbg7nmo6c4toqxne"
        );
      }

      // Create form data for Pinata API
      const formData = new FormData();
      formData.append("file", imageBuffer, {
        filename,
        contentType: "image/png",
      });

      // Add pinata metadata
      const metadata = JSON.stringify({
        name: filename,
        keyvalues: {
          type: "nft-image",
          uploadedAt: new Date().toISOString(),
        },
      });
      formData.append("pinataMetadata", metadata);

      // Upload to Pinata
      const response = await axios.post(
        `${this.config.pinningService}/pinning/pinFileToIPFS`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        },
      );

      const result = response.data as { IpfsHash: string };
      console.log(
        `📁 Uploaded ${filename} to IPFS via Pinata: ${result.IpfsHash}`,
      );

      return result.IpfsHash;
    } catch (error) {
      console.error("Error uploading image to IPFS:", error);
      // Fallback to default image
      return (
        process.env.DEFAULT_NFT_IMAGE_HASH ||
        "bafkreies7jntbufslrlq7524ahrrtjmwssarm3ni3zmbg7nmo6c4toqxne"
      );
    }
  }

  /**
   * Upload JSON metadata to IPFS
   */
  async uploadMetadata(metadata: NFTMetadata): Promise<string> {
    try {
      if (!this.config.apiKey) {
        console.warn(
          "⚠️ No Pinata API key configured, skipping metadata upload",
        );
        return "";
      }

      const metadataJson = JSON.stringify(metadata, null, 2);
      const metadataBuffer = Buffer.from(metadataJson, "utf-8");

      const formData = new FormData();
      formData.append("file", metadataBuffer, {
        filename: "metadata.json",
        contentType: "application/json",
      });

      // Add pinata metadata
      const pinataMetadata = JSON.stringify({
        name: `${metadata.name} - Metadata`,
        keyvalues: {
          type: "nft-metadata",
          name: metadata.name,
          uploadedAt: new Date().toISOString(),
        },
      });
      formData.append("pinataMetadata", pinataMetadata);

      const response = await axios.post(
        `${this.config.pinningService}/pinning/pinFileToIPFS`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        },
      );

      const result = response.data as { IpfsHash: string };
      console.log(`📄 Uploaded metadata to IPFS: ${result.IpfsHash}`);

      return result.IpfsHash;
    } catch (error) {
      console.error("Error uploading metadata to IPFS:", error);
      return "";
    }
  }

  /**
   * Create NFT metadata for access tier
   */
  createAccessTierMetadata(
    groupId: string,
    groupName: string,
    tierName: string,
    tierDescription: string,
    durationDays: number,
    priceUSD: string,
    imageHash: string,
    creatorAddress: string,
  ): GroupNFTMetadata {
    const imageUrl = this.getIPFSUrl(imageHash);

    return {
      name: `${groupName} - ${tierName}`,
      description: `${tierDescription}\n\nAccess Duration: ${durationDays} days\nPrice: $${priceUSD}\n\nThis NFT grants time-bound access to the premium XMTP group "${groupName}". Access expires after ${durationDays} days from purchase.`,
      image: imageUrl,
      external_url: `https://xmtp.chat/groups/${groupId}`,
      attributes: [
        {
          trait_type: "Group Name",
          value: groupName,
        },
        {
          trait_type: "Access Tier",
          value: tierName,
        },
        {
          trait_type: "Duration (Days)",
          value: durationDays,
        },
        {
          trait_type: "Price (USD)",
          value: priceUSD,
        },
        {
          trait_type: "Creator",
          value: creatorAddress,
        },
        {
          trait_type: "Type",
          value: "Time-bound Access Token",
        },
      ],
      // Group-specific fields
      group_id: groupId,
      group_name: groupName,
      access_duration_days: durationDays,
      access_tier: tierName,
      created_at: new Date().toISOString(),
      creator_address: creatorAddress,
    };
  }

  /**
   * Get IPFS URL from hash
   */
  getIPFSUrl(hash: string): string {
    if (!hash) {
      return `${this.config.gateway}${process.env.DEFAULT_NFT_IMAGE_HASH || "bafkreies7jntbufslrlq7524ahrrtjmwssarm3ni3zmbg7nmo6c4toqxne"}`;
    }
    return `${this.config.gateway}${hash}`;
  }

  /**
   * Generate deterministic image hash from text (for consistent default images)
   */
  generateImageHash(text: string): string {
    const hash = createHash("sha256").update(text).digest("hex");
    return hash.slice(0, 16); // Use first 16 chars as pseudo-IPFS hash
  }

  /**
   * Create trial token metadata
   */
  createTrialTokenMetadata(
    groupId: string,
    groupName: string,
    durationDays: number,
    creatorAddress: string,
  ): GroupNFTMetadata {
    const imageHash = this.generateImageHash(`trial-${groupName}`);
    const imageUrl = this.getIPFSUrl(
      process.env.DEFAULT_NFT_IMAGE_HASH || imageHash,
    );

    return {
      name: `${groupName} - Trial Access`,
      description: `Free trial access to "${groupName}"\n\nDuration: ${durationDays} days\nPrice: FREE\n\nThis is a complimentary trial NFT that grants temporary access to the premium XMTP group.`,
      image: imageUrl,
      external_url: `https://xmtp.chat/groups/${groupId}`,
      attributes: [
        {
          trait_type: "Group Name",
          value: groupName,
        },
        {
          trait_type: "Access Tier",
          value: "Trial",
        },
        {
          trait_type: "Duration (Days)",
          value: durationDays,
        },
        {
          trait_type: "Price (USD)",
          value: "FREE",
        },
        {
          trait_type: "Creator",
          value: creatorAddress,
        },
        {
          trait_type: "Type",
          value: "Trial Access Token",
        },
      ],
      // Group-specific fields
      group_id: groupId,
      group_name: groupName,
      access_duration_days: durationDays,
      access_tier: "Trial",
      created_at: new Date().toISOString(),
      creator_address: creatorAddress,
    };
  }

  /**
   * Validate IPFS hash format
   */
  isValidIPFSHash(hash: string): boolean {
    // Basic validation for IPFS hash formats
    const ipfsHashRegex =
      /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[A-Za-z2-7]{58,}|bafy[A-Za-z0-9]{50,})/;
    return ipfsHashRegex.test(hash);
  }

  /**
   * Pin existing content by hash
   */
  async pinByHash(hash: string, name?: string): Promise<boolean> {
    try {
      if (!this.config.apiKey) {
        console.warn("⚠️ No Pinata API key configured, cannot pin by hash");
        return false;
      }

      const response = await axios.post(
        `${this.config.pinningService}/pinning/pinByHash`,
        {
          hashToPin: hash,
          pinataMetadata: {
            name: name || `Pinned content ${hash}`,
            keyvalues: {
              pinnedAt: new Date().toISOString(),
            },
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        },
      );

      console.log(`📌 Pinned content by hash: ${hash}`);
      return response.status === 200;
    } catch (error) {
      console.error("Error pinning by hash:", error);
      return false;
    }
  }
}
