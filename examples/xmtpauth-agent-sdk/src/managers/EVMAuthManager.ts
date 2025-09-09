import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  getContract,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

// Complete Group Access Contract ABI (v1) - Production
const GROUP_ABI = [
  // purchase access
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "purchaseAccess",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  // purchase access via USDC
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "amountUSDC", type: "uint256" },
    ],
    name: "purchaseAccessUSDC",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // setup access tier (owner only)
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "durationDays", type: "uint256" },
      { name: "priceWei", type: "uint256" },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "imageHash", type: "string" },
      { name: "metadataUri", type: "string" },
    ],
    name: "setupAccessTier",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // set USDC token (owner only)
  {
    inputs: [{ name: "token", type: "address" }],
    name: "setUSDCToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // set tier USDC price (owner only)
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "priceUSDC", type: "uint256" },
    ],
    name: "setTierUSDCPrice",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // get USDC token address
  {
    inputs: [],
    name: "usdcToken",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  // withdraw ETH (owner only)
  {
    inputs: [],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // owner (Ownable)
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  // balanceOf (ERC1155)
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
  // public mapping accessTiers(tokenId) -> AccessTier struct
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "accessTiers",
    outputs: [
      { name: "durationDays", type: "uint256" },
      { name: "priceWei", type: "uint256" },
      { name: "priceUSDC", type: "uint256" },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "imageHash", type: "string" },
      { name: "metadataUri", type: "string" },
      { name: "isActive", type: "bool" },
      { name: "createdAt", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // userTokenExpiry (public mapping getter)
  {
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "uint256" },
    ],
    name: "userTokenExpiry",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // hasValidAccess(address)
  {
    inputs: [{ name: "user", type: "address" }],
    name: "hasValidAccess",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // storeUserInboxId(address,string)
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "inboxId", type: "string" },
    ],
    name: "storeUserInboxId",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // getUserInboxId(address) -> string
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getUserInboxId",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Factory Contract ABI (v1) - Production
const FACTORY_ABI = [
  {
    inputs: [
      { name: "groupName", type: "string" },
      { name: "groupDescription", type: "string" },
      { name: "groupImageUrl", type: "string" },
      { name: "salesGroupId", type: "string" },
      { name: "premiumGroupId", type: "string" },
      { name: "botAddress", type: "address" },
    ],
    name: "deployGroupContract",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "deploymentFee",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "creator", type: "address" }],
    name: "getCreatorContracts",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface GroupInfo {
  id: string;
  name: string;
  contractAddress: string;
  revenue: string;
  memberCount: number;
  tiers: AccessTier[];
  salesGroupId: string;
  premiumGroupId: string;
  creatorAddress: string;
}

export interface AccessTier {
  id: number;
  name: string;
  description: string;
  price: string;
  priceUSDC: string;
  durationDays: number;
  imageHash?: string;
  isActive: boolean;
}

export interface CreateGroupResult {
  groupId: string;
  contractAddress: string;
  transactionHash: string;
  salesGroupId: string;
  premiumGroupId: string;
}

export class EVMAuthManager {
  private publicClient;
  private walletClient;
  private account;
  private factoryContract;
  private agentAddress: string;

  constructor(
    private rpcUrl: string,
    private factoryAddress: string,
    private privateKey: string,
  ) {
    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    this.agentAddress = this.account.address;

    this.publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: base,
      transport: http(rpcUrl),
    });

    this.factoryContract = getContract({
      address: factoryAddress as `0x${string}`,
      abi: FACTORY_ABI,
      client: this.publicClient,
    });
  }

  /**
   * Get the public client for external use
   */
  get publicClientInstance() {
    return this.publicClient;
  }

  /**
   * Deploy a new EVMAuth contract for a group - PRODUCTION VERSION
   */
  async deployGroupContract(
    groupName: string,
    salesGroupId: string,
    premiumGroupId: string,
  ): Promise<string> {
    try {
      console.log(`🚀 Deploying contract with parameters:`);
      console.log(`  groupName: ${groupName}`);
      console.log(`  groupDescription: Premium access to ${groupName}`);
      console.log(`  salesGroupId: ${salesGroupId}`);
      console.log(`  premiumGroupId: ${premiumGroupId}`);
      console.log(`  botAddress: ${this.agentAddress}`);

      // Fetch required deployment fee from factory
      const requiredFee =
        (await this.factoryContract.read.deploymentFee()) as bigint;
      console.log(`💰 Deployment fee: ${formatEther(requiredFee)} ETH`);

      const factoryWrite = getContract({
        address: this.factoryAddress as `0x${string}`,
        abi: FACTORY_ABI,
        client: this.walletClient,
      });

      const hash = await factoryWrite.write.deployGroupContract(
        [
          groupName, // groupName
          `Premium access to ${groupName}`, // groupDescription
          "https://via.placeholder.com/400x400/6366f1/ffffff?text=Premium+Group", // groupImageUrl
          salesGroupId, // actual salesGroupId
          premiumGroupId, // actual premiumGroupId
          this.agentAddress as `0x${string}`,
        ],
        {
          value: requiredFee,
        },
      );

      console.log(`📝 Transaction submitted: ${hash}`);

      // Wait for transaction confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
      });

      if (receipt.status !== "success") {
        throw new Error("Deployment transaction failed");
      }

      // Get the deployed contract address by querying the factory
      const creatorContracts =
        (await this.factoryContract.read.getCreatorContracts([
          this.agentAddress as `0x${string}`,
        ])) as string[];

      // The newest contract should be the last one in the array
      const deployedContractAddress =
        creatorContracts[creatorContracts.length - 1];

      console.log(`✅ Contract deployed successfully!`);
      console.log(`   Contract: ${deployedContractAddress}`);
      console.log(`   Transaction: ${hash}`);

      return deployedContractAddress;
    } catch (error) {
      console.error("❌ Failed to deploy group contract:", error);
      throw new Error(
        `Group contract deployment failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Create a new premium group with EVMAuth contract - PRODUCTION VERSION
   */
  async createGroup(
    groupName: string,
    creatorInboxId: string,
  ): Promise<CreateGroupResult> {
    try {
      console.log(
        `🏗️ Creating group "${groupName}" for creator ${creatorInboxId}`,
      );

      // For now, use placeholder group IDs - in production these would be real XMTP group IDs
      const salesGroupId = `sales-${Date.now()}`;
      const premiumGroupId = `premium-${Date.now()}`;

      // Deploy the EVMAuth contract
      const contractAddress = await this.deployGroupContract(
        groupName,
        salesGroupId,
        premiumGroupId,
      );

      const groupId = `${contractAddress.slice(2, 10)}-${Date.now().toString(36)}`;

      return {
        groupId,
        contractAddress,
        transactionHash: "", // Would be filled from deployment
        salesGroupId,
        premiumGroupId,
      };
    } catch (error) {
      console.error("❌ Failed to create group:", error);
      throw error;
    }
  }

  /**
   * Get groups created by a user - PRODUCTION VERSION
   */
  async getUserGroups(userInboxId: string): Promise<GroupInfo[]> {
    try {
      // Get all contracts deployed by this agent (since we're the bot)
      const creatorContracts =
        (await this.factoryContract.read.getCreatorContracts([
          this.agentAddress as `0x${string}`,
        ])) as string[];

      console.log(
        `🔍 Found ${creatorContracts.length} contracts deployed by agent`,
      );

      const groups: GroupInfo[] = [];

      // Query each contract for details
      for (const contractAddress of creatorContracts) {
        try {
          const groupContract = getContract({
            address: contractAddress as `0x${string}`,
            abi: GROUP_ABI,
            client: this.publicClient,
          });

          // Get contract owner to determine if this user is the creator
          const owner = (await groupContract.read.owner()) as string;

          // For now, we'll show all groups. In production, you'd filter by actual creator
          // or store creator mapping in database

          // Get basic group info - you'd need to store group names in database
          // or emit events to track them
          const groupName = `Group ${contractAddress.slice(2, 8)}`;

          // Get tier information
          const tiers: AccessTier[] = [];

          // Try to get first few tiers (most groups have 1-3 tiers)
          for (let i = 1; i <= 5; i++) {
            try {
              const tierData = (await groupContract.read.accessTiers([
                BigInt(i),
              ])) as [
                bigint,
                bigint,
                bigint,
                string,
                string,
                string,
                string,
                boolean,
                bigint,
              ];

              if (tierData[7]) {
                // isActive
                tiers.push({
                  id: i,
                  name: tierData[3] || `Tier ${i}`,
                  description: tierData[4] || "",
                  price: formatEther(tierData[1]), // priceWei
                  priceUSDC: (Number(tierData[2]) / 1000000).toString(), // priceUSDC (6 decimals)
                  durationDays: Number(tierData[0]),
                  imageHash: tierData[5],
                  isActive: tierData[7],
                });
              }
            } catch (tierError) {
              // Tier doesn't exist or isn't active, continue
              break;
            }
          }

          groups.push({
            id: `${contractAddress.slice(2, 10)}-${Date.now().toString(36)}`,
            name: groupName,
            contractAddress,
            revenue: "0", // Would need to calculate from events or contract balance
            memberCount: 0, // Would need to count from events or XMTP group
            tiers,
            salesGroupId: "", // Would be stored in database
            premiumGroupId: "", // Would be stored in database
            creatorAddress: owner,
          });
        } catch (contractError) {
          console.warn(
            `⚠️ Error querying contract ${contractAddress}:`,
            contractError,
          );
          continue;
        }
      }

      return groups;
    } catch (error) {
      console.error("❌ Failed to fetch user groups:", error);
      return [];
    }
  }

  /**
   * Setup access tier for a group - PRODUCTION VERSION
   */
  async setupAccessTier(
    contractAddress: string,
    tokenId: number,
    tier: AccessTier,
  ): Promise<string> {
    try {
      const groupContract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.walletClient,
      });

      const priceWei = parseEther(tier.price);
      const priceUSDC = BigInt(
        Math.round(parseFloat(tier.priceUSDC) * 1000000),
      ); // Convert to 6 decimals
      const imageHash = tier.imageHash || "";
      const metadataUri = imageHash
        ? `https://gateway.pinata.cloud/ipfs/${imageHash}`
        : "";

      const txHash = await groupContract.write.setupAccessTier([
        BigInt(tokenId),
        BigInt(tier.durationDays),
        priceWei,
        tier.name,
        tier.description,
        imageHash,
        metadataUri,
      ]);

      console.log(`⚙️ Tier ${tokenId} setup transaction: ${txHash}`);

      // Also set USDC price if specified
      if (tier.priceUSDC && parseFloat(tier.priceUSDC) > 0) {
        const usdcTxHash = await groupContract.write.setTierUSDCPrice([
          BigInt(tokenId),
          priceUSDC,
        ]);
        console.log(`💰 USDC price set transaction: ${usdcTxHash}`);
      }

      return txHash;
    } catch (error) {
      console.error("❌ Failed to setup access tier:", error);
      throw error;
    }
  }

  /**
   * Generate OpenSea URLs for NFT collections and assets
   */
  generateOpenSeaUrls(contractAddress: string, tokenId?: number) {
    const baseUrl = "https://opensea.io/assets/base";
    const collectionUrl = `https://opensea.io/collection/${contractAddress.toLowerCase()}`;
    const assetUrl = tokenId
      ? `${baseUrl}/${contractAddress.toLowerCase()}/${tokenId}`
      : `${baseUrl}/${contractAddress.toLowerCase()}`;

    return {
      collection: collectionUrl,
      asset: assetUrl,
      baseScan: `https://basescan.org/address/${contractAddress}`,
    };
  }

  /**
   * Purchase access to a group - PRODUCTION VERSION
   */
  async purchaseAccess(
    contractAddress: string,
    tokenId: number,
    paymentMethod: "ETH" | "USDC" = "ETH",
  ): Promise<string> {
    try {
      const groupContract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.walletClient,
      });

      if (paymentMethod === "ETH") {
        // Get tier price from contract
        const tierData = (await groupContract.read.accessTiers([
          BigInt(tokenId),
        ])) as [
          bigint,
          bigint,
          bigint,
          string,
          string,
          string,
          string,
          boolean,
          bigint,
        ];

        const tierPrice = tierData[1]; // priceWei

        const txHash = await groupContract.write.purchaseAccess(
          [BigInt(tokenId)],
          {
            value: tierPrice,
          },
        );

        console.log(`💰 ETH purchase transaction: ${txHash}`);
        return txHash;
      } else {
        // USDC payment
        const tierData = (await groupContract.read.accessTiers([
          BigInt(tokenId),
        ])) as [
          bigint,
          bigint,
          bigint,
          string,
          string,
          string,
          string,
          boolean,
          bigint,
        ];

        const usdcAmount = tierData[2]; // priceUSDC

        const txHash = await groupContract.write.purchaseAccessUSDC([
          BigInt(tokenId),
          usdcAmount,
        ]);

        console.log(`💰 USDC purchase transaction: ${txHash}`);
        return txHash;
      }
    } catch (error) {
      console.error("❌ Failed to purchase access:", error);
      throw error;
    }
  }

  /**
   * Purchase access and potentially trigger MegaPot ticket purchase
   */
  async purchaseAccessWithMegaPot(
    contractAddress: string,
    tokenId: number,
    purchaserInboxId: string,
    megaPotManager?: any,
    paymentMethod: "ETH" | "USDC" = "ETH",
  ): Promise<{
    txHash: string;
    megaPotResult?: { boughtTickets: boolean; tickets?: number; cost?: string };
  }> {
    try {
      // Execute the purchase
      const txHash = await this.purchaseAccess(
        contractAddress,
        tokenId,
        paymentMethod,
      );

      // Get tier information for MegaPot calculation
      const groupContract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.walletClient,
      });

      const tierData = (await groupContract.read.accessTiers([
        BigInt(tokenId),
      ])) as readonly [
        bigint,
        bigint,
        bigint,
        string,
        string,
        string,
        string,
        boolean,
        bigint,
      ];
      const tierPrice = paymentMethod === "ETH" ? tierData[1] : tierData[2];

      // Convert to USDC amount for MegaPot processing (USDC has 6 decimals)
      const purchaseAmount =
        paymentMethod === "ETH"
          ? (Number(tierPrice) / 10 ** 18).toString() // Convert ETH to readable
          : (Number(tierPrice) / 10 ** 6).toString(); // Convert USDC to readable

      // Trigger MegaPot purchase if manager is provided and auto-purchase is enabled
      let megaPotResult;
      if (megaPotManager) {
        // Get group info for tracking
        const groups = await this.getUserGroups("");
        const group = groups.find(
          (g) =>
            g.contractAddress.toLowerCase() === contractAddress.toLowerCase(),
        );

        if (group) {
          megaPotResult = await megaPotManager.processNFTPurchase(
            purchaseAmount,
            {
              groupId: group.id,
              groupName: group.name,
              contractAddress: group.contractAddress,
              purchaserInboxId: purchaserInboxId,
            },
          );
        }
      }

      return { txHash, megaPotResult };
    } catch (error) {
      console.error("❌ Failed to purchase access:", error);
      throw error;
    }
  }

  /**
   * Check if user has valid access token - PRODUCTION VERSION
   */
  async hasValidAccess(
    contractAddress: string,
    userAddress: string,
    tokenId: number,
  ): Promise<boolean> {
    try {
      const groupContract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.publicClient,
      });

      // Check balance
      const balance = (await groupContract.read.balanceOf([
        userAddress as `0x${string}`,
        BigInt(tokenId),
      ])) as bigint;

      if (balance === 0n) {
        return false;
      }

      // Check expiration
      const expiration = (await groupContract.read.userTokenExpiry([
        userAddress as `0x${string}`,
        BigInt(tokenId),
      ])) as bigint;

      const now = BigInt(Math.floor(Date.now() / 1000));
      return expiration > now;
    } catch (error) {
      console.error("❌ Failed to check access:", error);
      return false;
    }
  }

  /**
   * Get user's access tokens - PRODUCTION VERSION
   */
  async getUserTokens(userAddress: string): Promise<
    Array<{
      contractAddress: string;
      tokenId: number;
      groupName: string;
      expiresAt: Date;
    }>
  > {
    try {
      const tokens: Array<{
        contractAddress: string;
        tokenId: number;
        groupName: string;
        expiresAt: Date;
      }> = [];

      // Get all contracts deployed by this agent
      const creatorContracts =
        (await this.factoryContract.read.getCreatorContracts([
          this.agentAddress as `0x${string}`,
        ])) as string[];

      // Check each contract for user's tokens
      for (const contractAddress of creatorContracts) {
        try {
          const groupContract = getContract({
            address: contractAddress as `0x${string}`,
            abi: GROUP_ABI,
            client: this.publicClient,
          });

          // Check tokens 1-10 (most groups won't have more than 10 tiers)
          for (let tokenId = 1; tokenId <= 10; tokenId++) {
            try {
              const balance = (await groupContract.read.balanceOf([
                userAddress as `0x${string}`,
                BigInt(tokenId),
              ])) as bigint;

              if (balance > 0n) {
                // Get expiration
                const expiration = (await groupContract.read.userTokenExpiry([
                  userAddress as `0x${string}`,
                  BigInt(tokenId),
                ])) as bigint;

                // Get tier info for group name
                const tierData = (await groupContract.read.accessTiers([
                  BigInt(tokenId),
                ])) as [
                  bigint,
                  bigint,
                  bigint,
                  string,
                  string,
                  string,
                  string,
                  boolean,
                  bigint,
                ];

                tokens.push({
                  contractAddress,
                  tokenId,
                  groupName:
                    tierData[3] || `Group ${contractAddress.slice(2, 8)}`,
                  expiresAt: new Date(Number(expiration) * 1000),
                });
              }
            } catch (tokenError) {
              // Token doesn't exist, continue
              continue;
            }
          }
        } catch (contractError) {
          console.warn(
            `⚠️ Error checking tokens for contract ${contractAddress}:`,
            contractError,
          );
          continue;
        }
      }

      return tokens;
    } catch (error) {
      console.error("❌ Failed to get user tokens:", error);
      return [];
    }
  }

  /**
   * Get all contracts deployed by this agent
   */
  async getAllAgentContracts(): Promise<string[]> {
    try {
      const creatorContracts =
        (await this.factoryContract.read.getCreatorContracts([
          this.agentAddress as `0x${string}`,
        ])) as string[];

      console.log(
        `🔍 Found ${creatorContracts.length} contracts deployed by agent:`,
      );
      creatorContracts.forEach((contract, index) => {
        console.log(`  ${index + 1}. ${contract}`);
      });

      return creatorContracts;
    } catch (error) {
      console.error("Error fetching agent contracts:", error);
      return [];
    }
  }

  /**
   * Format ETH amount for display
   */
  formatEth(amountWei: bigint): string {
    return formatEther(amountWei);
  }

  /**
   * Parse ETH amount from string
   */
  parseEth(amount: string): bigint {
    return parseEther(amount);
  }

  /**
   * Get deployment fee from factory
   */
  async getDeploymentFee(): Promise<bigint> {
    return (await this.factoryContract.read.deploymentFee()) as bigint;
  }

  /**
   * Withdraw earnings from a contract (owner only)
   */
  async withdrawEarnings(contractAddress: string): Promise<string> {
    try {
      const groupContract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.walletClient,
      });

      const txHash = await groupContract.write.withdraw();
      console.log(`💰 Withdrawal transaction: ${txHash}`);
      return txHash;
    } catch (error) {
      console.error("❌ Failed to withdraw earnings:", error);
      throw error;
    }
  }
}
