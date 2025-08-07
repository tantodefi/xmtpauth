/**
 * Access tier configuration for group memberships
 */
export interface AccessTier {
  /** Unique identifier for the tier */
  id: string;
  /** Display name for the tier */
  name: string;
  /** Duration in days for access */
  durationDays: number;
  /** Price in wei (for ETH) or smallest unit (for USDC) */
  priceWei: string;
  /** Price in USD (for user display) */
  priceUSD?: number;
  /** Maximum number of tokens that can be minted for this tier */
  maxSupply?: number;
  /** Description of what this tier includes */
  description?: string;
  /** Image URL for the tier/NFT */
  imageUrl?: string;
  /** Additional benefits or features */
  benefits?: string[];
  /** Whether this tier is currently active for purchase */
  isActive?: boolean;
  /** Payment token type */
  paymentToken?: 'ETH' | 'USDC';
  /** IPFS metadata information */
  metadata?: {
    ipfsHash?: string;
    imageHash?: string;
    animationHash?: string;
  };
}

/**
 * Group metadata configuration
 */
export interface GroupMetadata {
  /** Group name */
  name: string;
  /** Group description */
  description: string;
  /** Group image URL */
  image?: string;
  /** Associated website or social link */
  website?: string;
  /** Category or tags for the group */
  category?: string;
  /** Custom banner image */
  banner?: string;
  /** Social media links */
  socials?: {
    twitter?: string;
    discord?: string;
    telegram?: string;
    website?: string;
  };
  /** Additional custom metadata */
  customData?: Record<string, any>;
}

/**
 * Complete group configuration
 */
export interface GroupConfig {
  /** XMTP group ID */
  groupId: string;
  /** EVMAuth contract address */
  contractAddress: string;
  /** Available access tiers */
  tiers: AccessTier[];
  /** Group metadata */
  metadata: GroupMetadata;
  /** Creator's inbox ID */
  creatorInboxId: string;
  /** Creator's wallet address */
  creatorAddress: string;
  /** Timestamp when group was created */
  createdAt: Date;
  /** Whether the group is currently active */
  isActive: boolean;
  /** Payment configuration */
  paymentConfig: PaymentConfig;
  /** Custom settings */
  settings?: GroupSettings;
}

/**
 * Payment configuration
 */
export interface PaymentConfig {
  /** Accepted payment tokens */
  acceptedTokens: ('ETH' | 'USDC')[];
  /** Default payment token */
  defaultToken: 'ETH' | 'USDC';
  /** USDC contract address */
  usdcAddress?: string;
  /** Automatic price conversion */
  autoConvertPrices?: boolean;
}

/**
 * Group-specific settings
 */
export interface GroupSettings {
  /** Whether to automatically remove expired members */
  autoRemoveExpired: boolean;
  /** Welcome message for new members */
  welcomeMessage?: string;
  /** Whether to allow member invites */
  allowMemberInvites: boolean;
  /** Maximum number of members */
  maxMembers?: number;
  /** Require approval for new members */
  requireApproval: boolean;
  /** Custom fee percentage (overrides global) */
  customFeePercentage?: number;
  /** Allow file attachments in tier setup */
  allowCustomImages: boolean;
  /** Notification preferences */
  notifications: {
    newPurchases: boolean;
    expiringTokens: boolean;
    memberJoined: boolean;
    memberLeft: boolean;
  };
}

/**
 * User token information
 */
export interface UserToken {
  /** Token ID from the contract */
  tokenId: string;
  /** Group this token provides access to */
  groupId: string;
  /** Contract address */
  contractAddress: string;
  /** When the token expires */
  expiresAt: Date;
  /** Token balance (usually 1 for access tokens) */
  balance: bigint;
  /** Tier information */
  tier: AccessTier;
  /** When the token was purchased */
  purchasedAt: Date;
  /** Purchase price and currency */
  purchasePrice: {
    amount: string;
    currency: 'ETH' | 'USDC';
    usdAmount?: number;
  };
  /** Transaction hash of the purchase */
  purchaseTransactionHash?: string;
  /** Whether the token is currently active */
  isActive: boolean;
  /** Token metadata URI */
  metadataURI?: string;
}

/**
 * Purchase transaction details
 */
export interface PurchaseDetails {
  /** User making the purchase */
  userAddress: string;
  /** Group being purchased */
  groupId: string;
  /** Contract address */
  contractAddress: string;
  /** Tier being purchased */
  tier: AccessTier;
  /** Token ID (if specific) */
  tokenId?: number;
  /** Number of tokens to purchase */
  quantity?: number;
  /** Payment configuration */
  payment: {
    token: 'ETH' | 'USDC';
    amount: string;
    usdAmount?: number;
  };
  /** If this is a gift purchase */
  isGift?: boolean;
  /** Recipient address (for gifts) */
  recipientAddress?: string;
  /** Custom message (for gifts) */
  giftMessage?: string;
}

/**
 * File attachment information
 */
export interface FileAttachment {
  /** File data */
  data: Uint8Array;
  /** Original filename */
  filename: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType?: string;
  /** IPFS hash after upload */
  ipfsHash?: string;
  /** Public URL */
  url?: string;
}

/**
 * IPFS upload result
 */
export interface IPFSUploadResult {
  /** IPFS hash */
  hash: string;
  /** Public gateway URL */
  url: string;
  /** File size */
  size: number;
  /** Upload timestamp */
  uploadedAt: Date;
}

/**
 * Tier creation session
 */
export interface TierCreationSession {
  /** Session ID */
  id: string;
  /** Group ID being configured */
  groupId: string;
  /** Creator inbox ID */
  creatorInboxId: string;
  /** Current step in the process */
  step: 'count' | 'details' | 'image' | 'confirm' | 'complete';
  /** Current tier being configured */
  currentTierIndex: number;
  /** Total number of tiers */
  totalTiers: number;
  /** Tier data being built */
  tiers: Partial<AccessTier>[];
  /** Pending file attachments */
  attachments: Map<number, FileAttachment>;
  /** Session start time */
  startedAt: Date;
  /** Session expiry time */
  expiresAt: Date;
}

/**
 * Sales statistics
 */
export interface SalesStats {
  /** Total revenue generated in USD */
  totalRevenueUSD: number;
  /** Total revenue in ETH */
  totalRevenueETH: string;
  /** Total revenue in USDC */
  totalRevenueUSDC: string;
  /** Total platform fees collected */
  totalFeesUSD: number;
  /** Number of active memberships */
  activeMemberships: number;
  /** Number of expired memberships */
  expiredMemberships: number;
  /** Total tokens sold */
  tokensSold: number;
  /** Revenue by tier */
  revenueByTier: Record<string, {
    usd: number;
    eth?: string;
    usdc?: string;
    count: number;
  }>;
  /** Revenue by payment method */
  revenueByPayment: {
    eth: { amount: string; usd: number; count: number };
    usdc: { amount: string; usd: number; count: number };
  };
  /** Most popular tier */
  mostPopularTier?: string;
  /** Average purchase amount */
  averagePurchaseUSD: number;
}

/**
 * Group analytics
 */
export interface GroupAnalytics {
  /** Group ID */
  groupId: string;
  /** Total members (current) */
  totalMembers: number;
  /** New members this period */
  newMembers: number;
  /** Member retention rate */
  retentionRate: number;
  /** Total messages sent */
  totalMessages: number;
  /** Active members (recently participated) */
  activeMembers: number;
  /** Revenue statistics */
  salesStats: SalesStats;
  /** Average membership duration */
  avgMembershipDuration: number;
  /** Member geography (if available) */
  memberGeography?: Record<string, number>;
  /** Popular purchase times */
  purchasePatterns?: {
    hourly: number[];
    daily: number[];
    monthly: number[];
  };
}

/**
 * Membership audit result
 */
export interface MembershipAudit {
  /** Group ID audited */
  groupId: string;
  /** Contract address */
  contractAddress: string;
  /** Valid members with active tokens */
  validMembers: Array<{
    inboxId: string;
    address: string;
    tokenIds: number[];
    expiresAt: Date;
  }>;
  /** Members with expired tokens */
  expiredMembers: Array<{
    inboxId: string;
    address: string;
    expiredTokenIds: number[];
  }>;
  /** Members that were removed */
  removedMembers: Array<{
    inboxId: string;
    address: string;
    reason: string;
  }>;
  /** Timestamp of audit */
  auditTimestamp: Date;
  /** Any errors encountered */
  errors: string[];
  /** Summary statistics */
  summary: {
    totalChecked: number;
    validCount: number;
    expiredCount: number;
    removedCount: number;
    errorCount: number;
  };
}

/**
 * Fee configuration
 */
export interface FeeConfig {
  /** Fee recipient address */
  recipient: string;
  /** Fee in basis points (e.g., 250 = 2.5%) */
  basisPoints: number;
  /** Minimum fee amount in wei */
  minimumFee?: string;
  /** Maximum fee amount in wei */
  maximumFee?: string;
  /** Different fees for different payment methods */
  paymentMethodFees?: {
    eth: number;    // basis points
    usdc: number;   // basis points
  };
}

/**
 * Contract deployment parameters
 */
export interface ContractDeploymentParams {
  /** Contract name */
  name: string;
  /** Contract symbol */
  symbol: string;
  /** Contract owner address */
  owner: string;
  /** Initial tiers to setup */
  initialTiers?: AccessTier[];
  /** Base URI for token metadata */
  baseURI?: string;
  /** Payment token configuration */
  paymentTokens?: {
    eth: boolean;
    usdc: {
      enabled: boolean;
      address: string;
    };
  };
}

/**
 * Transaction metadata
 */
export interface TransactionMetadata {
  /** Type of transaction */
  type: "purchase" | "gift" | "refund" | "fee-payment";
  /** User involved */
  userAddress: string;
  /** Group involved */
  groupId: string;
  /** Amount in original currency */
  amount: string;
  /** USD equivalent */
  amountUSD?: number;
  /** Payment currency */
  currency: 'ETH' | 'USDC';
  /** Token tier */
  tier?: AccessTier;
  /** Additional details */
  details?: Record<string, any>;
  /** Timestamp */
  timestamp: Date;
  /** Transaction hash */
  txHash?: string;
}

/**
 * Event types for the agent
 */
export type AgentEvent = 
  | { type: "GROUP_CREATED"; data: GroupConfig }
  | { type: "TOKEN_PURCHASED"; data: PurchaseDetails }
  | { type: "MEMBER_ADDED"; data: { groupId: string; userInboxId: string; tierName: string } }
  | { type: "MEMBER_REMOVED"; data: { groupId: string; userInboxId: string; reason: string } }
  | { type: "TOKEN_EXPIRED"; data: { groupId: string; userAddress: string; tokenId: string } }
  | { type: "TIER_UPDATED"; data: { groupId: string; tier: AccessTier } }
  | { type: "GROUP_SETTINGS_UPDATED"; data: { groupId: string; settings: GroupSettings } }
  | { type: "IMAGE_UPLOADED"; data: { groupId: string; ipfsHash: string; url: string } }
  | { type: "METADATA_CREATED"; data: { groupId: string; tierId: string; metadataHash: string } };

/**
 * Command handler result
 */
export interface CommandResult {
  /** Whether the command was successful */
  success: boolean;
  /** Response message to send */
  message: string;
  /** Additional data */
  data?: any;
  /** Error details if failed */
  error?: string;
  /** Whether to continue processing */
  continueProcessing?: boolean;
}

/**
 * Dual-group configuration (extends GroupConfig)
 */
export interface DualGroupConfig extends GroupConfig {
  // XMTP Group IDs
  salesGroupId: string;      // Public sales/info group
  premiumGroupId: string;    // Private premium group
  
  // Group settings
  salesSettings: {
    welcomeMessage: string;
    availableTiers: string;
    helpMessage: string;
  };
  
  premiumSettings: {
    welcomeMessage: string;
    rules?: string;
    description: string;
  };
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Base RPC URL */
  baseRpcUrl: string;
  /** EVMAuth factory contract address */
  factoryAddress: string;
  /** Fee configuration */
  feeConfig: FeeConfig;
  /** Default group settings */
  defaultGroupSettings: GroupSettings;
  /** Payment configuration */
  paymentConfig: PaymentConfig;
  /** Maximum groups per creator */
  maxGroupsPerCreator?: number;
  /** Audit interval in minutes */
  auditIntervalMinutes: number;
  /** IPFS configuration */
  ipfsConfig: {
    gateway: string;
    pinningService: string;
    apiKey?: string;
  };
  /** File upload limits */
  fileUploadLimits: {
    maxSize: number;        // bytes
    allowedTypes: string[]; // file extensions
  };
}