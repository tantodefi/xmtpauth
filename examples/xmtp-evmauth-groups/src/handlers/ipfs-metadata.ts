import { createHash } from "crypto";

// IPFS pinning service configuration
interface IPFSConfig {
  gateway: string;
  pinningService: string;
  apiKey?: string;
}

// Default IPFS configuration (using public services)
const DEFAULT_IPFS_CONFIG: IPFSConfig = {
  gateway: "https://ipfs.io/ipfs/",
  pinningService: "https://api.pinata.cloud", // You'll need API key for production
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

export class IPFSMetadataHandler {
  private config: IPFSConfig;

  constructor(config?: Partial<IPFSConfig>) {
    this.config = { ...DEFAULT_IPFS_CONFIG, ...config };
  }

  /**
   * Upload image to IPFS and return hash
   */
  async uploadImage(imageBuffer: Buffer, filename: string): Promise<string> {
    try {
      // For demo purposes, we'll create a mock IPFS hash
      // In production, use a service like Pinata, NFT.Storage, or Web3.Storage
      
      const hash = createHash('sha256').update(imageBuffer).digest('hex');
      const mockIPFSHash = `Qm${hash.substring(0, 44)}`;
      
      console.log(`📁 Uploaded ${filename} to IPFS: ${mockIPFSHash}`);
      
      // In production, you'd do:
      // const formData = new FormData();
      // formData.append('file', new Blob([imageBuffer]), filename);
      // const response = await fetch(`${this.config.pinningService}/pinning/pinFileToIPFS`, {
      //   method: 'POST',
      //   headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
      //   body: formData
      // });
      // const result = await response.json();
      // return result.IpfsHash;
      
      return mockIPFSHash;
    } catch (error) {
      console.error("Error uploading image to IPFS:", error);
      throw new Error("Failed to upload image to IPFS");
    }
  }

  /**
   * Create NFT metadata for access tier
   */
  createTierMetadata(
    groupName: string,
    groupId: string,
    tierName: string,
    durationDays: number,
    priceUSD: number,
    creatorAddress: string,
    imageIPFSHash?: string
  ): GroupNFTMetadata {
    const metadata: GroupNFTMetadata = {
      name: `${groupName} - ${tierName}`,
      description: `Access token for ${groupName}. Grants ${durationDays} days of premium group access.`,
      image: imageIPFSHash ? `${this.config.gateway}${imageIPFSHash}` : this.generateDefaultImage(tierName),
      external_url: `https://xmtp.chat/conversations/${groupId}`,
      attributes: [
        {
          trait_type: "Access Duration",
          value: `${durationDays} days`
        },
        {
          trait_type: "Access Tier",
          value: tierName
        },
        {
          trait_type: "Price USD",
          value: priceUSD
        },
        {
          trait_type: "Group Name",
          value: groupName
        },
        {
          trait_type: "Token Type",
          value: "Access Token"
        },
        {
          trait_type: "Platform",
          value: "XMTP"
        }
      ],
      group_id: groupId,
      group_name: groupName,
      access_duration_days: durationDays,
      access_tier: tierName,
      created_at: new Date().toISOString(),
      creator_address: creatorAddress,
    };

    return metadata;
  }

  /**
   * Upload metadata to IPFS
   */
  async uploadMetadata(metadata: GroupNFTMetadata): Promise<string> {
    try {
      const metadataJSON = JSON.stringify(metadata, null, 2);
      const metadataBuffer = Buffer.from(metadataJSON, 'utf-8');
      
      // Create mock IPFS hash for metadata
      const hash = createHash('sha256').update(metadataBuffer).digest('hex');
      const mockIPFSHash = `Qm${hash.substring(0, 44)}`;
      
      console.log(`📄 Uploaded metadata to IPFS: ${mockIPFSHash}`);
      console.log(`📄 Metadata URL: ${this.config.gateway}${mockIPFSHash}`);
      
      // In production:
      // const formData = new FormData();
      // formData.append('file', new Blob([metadataBuffer]), 'metadata.json');
      // const response = await fetch(`${this.config.pinningService}/pinning/pinFileToIPFS`, {
      //   method: 'POST',
      //   headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
      //   body: formData
      // });
      // const result = await response.json();
      // return result.IpfsHash;
      
      return mockIPFSHash;
    } catch (error) {
      console.error("Error uploading metadata to IPFS:", error);
      throw new Error("Failed to upload metadata to IPFS");
    }
  }

  /**
   * Generate default image URL for tier (if no custom image provided)
   */
  private generateDefaultImage(tierName: string): string {
    // In production, you'd have default tier images stored on IPFS
    const tierImages = {
      'basic': 'QmBasicTierImageHash',
      'premium': 'QmPremiumTierImageHash',
      'vip': 'QmVIPTierImageHash',
    };

    const normalizedTier = (tierName && typeof tierName === 'string') ? tierName.toLowerCase() : 'default';
    const imageHash = tierImages[normalizedTier as keyof typeof tierImages] || tierImages.basic;
    
    return `${this.config.gateway}${imageHash}`;
  }

  /**
   * Process attachment from XMTP message
   */
  async processAttachment(attachmentData: Uint8Array, filename: string): Promise<{
    ipfsHash: string;
    url: string;
    size: number;
  }> {
    try {
      // Validate file type (images only)
      const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const fileExtension = (filename && typeof filename === 'string') 
        ? filename.toLowerCase().substring(filename.lastIndexOf('.')) 
        : '.png';
      
      if (!allowedTypes.includes(fileExtension)) {
        throw new Error(`Unsupported file type: ${fileExtension}. Supported: ${allowedTypes.join(', ')}`);
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (attachmentData && attachmentData.length > maxSize) {
        throw new Error(`File too large: ${attachmentData.length} bytes. Max size: ${maxSize} bytes`);
      }

      // Upload to IPFS
      const buffer = Buffer.from(attachmentData);
      const ipfsHash = await this.uploadImage(buffer, filename);
      const url = `${this.config.gateway}${ipfsHash}`;

      return {
        ipfsHash,
        url,
        size: attachmentData?.length || 0,
      };
    } catch (error) {
      console.error("Error processing attachment:", error);
      throw error;
    }
  }

  /**
   * Create complete tier with metadata
   */
  async createTierWithMetadata(
    groupName: string,
    groupId: string,
    tierName: string,
    durationDays: number,
    priceUSD: number,
    creatorAddress: string,
    imageAttachment?: {
      data: Uint8Array;
      filename: string;
    }
  ): Promise<{
    metadata: GroupNFTMetadata;
    metadataIPFSHash: string;
    imageIPFSHash?: string;
  }> {
    try {
      let imageIPFSHash: string | undefined;

      // Process image attachment if provided
      if (imageAttachment) {
        const imageResult = await this.processAttachment(
          imageAttachment.data,
          imageAttachment.filename
        );
        imageIPFSHash = imageResult.ipfsHash;
        console.log(`✅ Image uploaded: ${imageResult.url}`);
      }

      // Create metadata
      const metadata = this.createTierMetadata(
        groupName,
        groupId,
        tierName,
        durationDays,
        priceUSD,
        creatorAddress,
        imageIPFSHash
      );

      // Upload metadata to IPFS
      const metadataIPFSHash = await this.uploadMetadata(metadata);

      return {
        metadata,
        metadataIPFSHash,
        imageIPFSHash,
      };
    } catch (error) {
      console.error("Error creating tier with metadata:", error);
      throw error;
    }
  }

  /**
   * Get metadata from IPFS hash
   */
  async getMetadata(ipfsHash: string): Promise<GroupNFTMetadata> {
    try {
      const url = `${this.config.gateway}${ipfsHash}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }

      const metadata = await response.json();
      return metadata as GroupNFTMetadata;
    } catch (error) {
      console.error("Error fetching metadata from IPFS:", error);
      throw error;
    }
  }
}