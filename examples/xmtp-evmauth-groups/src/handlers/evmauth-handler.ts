import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getContract,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { AccessTier } from "../types/types";

// Group Access Contract ABI (v1)
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
] as const;

// Factory Contract ABI (v1)
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

export class EVMAuthHandler {
  private publicClient;
  private walletClient;
  private account;
  private factoryAddress: string;

  constructor(rpcUrl: string, factoryAddress: string, privateKey: string) {
    this.factoryAddress = factoryAddress;
    this.account = privateKeyToAccount(privateKey as `0x${string}`);

    this.publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: baseSepolia,
      transport: http(rpcUrl),
    });
  }

  /**
   * Deploy a new EVMAuth contract for a group
   */
  async deployGroupContract(
    groupName: string,
    botAddress: string,
    salesGroupId: string,
    premiumGroupId: string,
  ): Promise<string> {
    try {
      const factoryContract = getContract({
        address: this.factoryAddress as `0x${string}`,
        abi: FACTORY_ABI,
        client: this.walletClient,
      });

      console.log(`🚀 Deploying contract with parameters:`);
      console.log(`  groupName: ${groupName}`);
      console.log(`  groupDescription: Premium access to ${groupName}`);
      console.log(`  salesGroupId: ${salesGroupId}`);
      console.log(`  premiumGroupId: ${premiumGroupId}`);
      console.log(`  botAddress: ${botAddress}`);

      // Fetch required deployment fee from factory
      const requiredFee = await factoryContract.read.deploymentFee();

      const hash = await factoryContract.write.deployGroupContract(
        [
          groupName, // groupName
          `Premium access to ${groupName}`, // groupDescription
          "https://via.placeholder.com/400x400/6366f1/ffffff?text=Premium+Group", // groupImageUrl
          salesGroupId, // actual salesGroupId
          premiumGroupId, // actual premiumGroupId
          botAddress as `0x${string}`,
        ],
        {
          value: requiredFee,
        },
      );

      // Wait for transaction confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
      });
      if (receipt.status !== "success") {
        throw new Error("Deployment transaction failed");
      }

      // Prefer reading from a public client instance to avoid any wallet RPC caching
      const factoryRead = getContract({
        address: this.factoryAddress as `0x${string}`,
        abi: FACTORY_ABI,
        client: this.publicClient,
      });

      // Try a few times to read the created contract address
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const creatorContracts = await factoryRead.read.getCreatorContracts([
            this.account.address as `0x${string}`,
          ]);
          if (creatorContracts && creatorContracts.length > 0) {
            const deployedContractAddress = creatorContracts[
              creatorContracts.length - 1
            ] as string;
            console.log(`✅ Contract deployed at: ${deployedContractAddress}`);
            return deployedContractAddress;
          }
        } catch {}
        // small backoff
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Fallback: read all contracts and return the last one
      try {
        const getAll = (factoryRead.read as any).getAllContracts
          ? await (factoryRead.read as any).getAllContracts([])
          : [];
        if (Array.isArray(getAll) && getAll.length > 0) {
          const last = getAll[getAll.length - 1] as string;
          console.log(`✅ Contract deployed at (fallback): ${last}`);
          return last;
        }
      } catch {}

      throw new Error("Failed to fetch deployed contracts for creator");
    } catch (error) {
      console.error("Error deploying EVMAuth contract:", error);
      throw error;
    }
  }

  /**
   * Setup access tiers for a group contract
   */
  async setupAccessTiers(
    contractAddress: string,
    tiers: AccessTier[],
  ): Promise<void> {
    try {
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.walletClient,
      });

      console.log(
        `🔧 Setting up ${tiers.length} tiers for contract ${contractAddress}`,
      );

      // Get the agent's address for nonce management
      const agentAddress = this.walletClient.account?.address;
      if (!agentAddress) {
        throw new Error("No wallet address found");
      }

      // If any tier has USD pricing, set USDC token on the contract first
      const anyUsd = tiers.some(
        (t) => typeof t.priceUSD === "number" && t.priceUSD! > 0,
      );
      if (anyUsd) {
        const usdcAddress = (
          process.env.USDC_ADDRESS ||
          "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
        ).toLowerCase();
        console.log(`💵 Setting USDC token address: ${usdcAddress}`);

        // Get current nonce explicitly
        let currentNonce = await this.publicClient.getTransactionCount({
          address: agentAddress,
          blockTag: "pending",
        });
        console.log(`📊 Current nonce for setUSDCToken: ${currentNonce}`);

        const usdcHash = await contract.write.setUSDCToken(
          [usdcAddress as `0x${string}`],
          { nonce: currentNonce },
        );
        await this.publicClient.waitForTransactionReceipt({ hash: usdcHash });
        await new Promise((r) => setTimeout(r, 2000)); // Even longer delay
        console.log(`✅ USDC token set successfully`);
      }

      // Process tiers sequentially with explicit nonce management
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const tokenId = i + 1; // Token IDs start from 1

        console.log(
          `🎯 Setting up tier ${i + 1}/${tiers.length}: ${tier.name}`,
        );

        const ethPrice =
          typeof tier.priceUSD === "number" && tier.priceUSD! > 0
            ? 0n
            : BigInt(tier.priceWei);

        try {
          // Get fresh nonce for each transaction
          let currentNonce = await this.publicClient.getTransactionCount({
            address: agentAddress,
            blockTag: "pending",
          });
          console.log(`📊 Current nonce for setupAccessTier: ${currentNonce}`);

          // Use group image as fallback for NFT image (EVMAuth default logo)
          const defaultImageHash =
            "QmNLei78zWmzUdbeRB3CiUfAizWUrbeeZh5K1rhAQKCh51"; // EVMAuth logo
          const imageHash = tier.metadata?.imageHash || defaultImageHash;

          // Generate proper metadata URI with image field if not provided
          let metadataUri = "";
          if (tier.metadata?.ipfsHash) {
            metadataUri = `ipfs://${tier.metadata.ipfsHash}`;
          } else if (tier.metadataUri) {
            metadataUri = tier.metadataUri;
          } else {
            // Generate basic metadata JSON structure
            const metadata = {
              name: `${tier.name} Access Token`,
              description: `${tier.description || `Access token for ${tier.name} tier`} - Valid for ${tier.durationDays} days`,
              image: `ipfs://${imageHash}`,
              attributes: [
                { trait_type: "Tier", value: tier.name },
                { trait_type: "Duration", value: `${tier.durationDays} days` },
                { trait_type: "Price", value: `$${tier.priceUsd || "N/A"}` },
              ],
            };
            console.log(`📝 Generated metadata for ${tier.name}:`, metadata);
            // Note: In production, this should be uploaded to IPFS
            metadataUri = ""; // Leave empty to use contract's default metadata generation
          }

          const hash = await contract.write.setupAccessTier(
            [
              BigInt(tokenId),
              BigInt(tier.durationDays),
              ethPrice,
              tier.name,
              tier.description ?? "",
              imageHash,
              metadataUri,
            ],
            { nonce: currentNonce },
          );

          // Wait for transaction to be mined
          console.log(`⏳ Waiting for tier setup transaction: ${hash}`);
          await this.publicClient.waitForTransactionReceipt({ hash });
          await new Promise((r) => setTimeout(r, 2000)); // Even longer delay between transactions

          console.log(`✅ Setup tier ${tier.name} (Token ID: ${tokenId})`);

          // If USD price present, set tier USDC price
          if (typeof tier.priceUSD === "number" && tier.priceUSD! > 0) {
            const amountUSDC = BigInt(Math.round(tier.priceUSD! * 1_000_000));
            console.log(
              `💰 Setting USDC price for ${tier.name}: $${tier.priceUSD} (${amountUSDC} wei)`,
            );

            // Get fresh nonce for USDC price transaction
            currentNonce = await this.publicClient.getTransactionCount({
              address: agentAddress,
              blockTag: "pending",
            });
            console.log(
              `📊 Current nonce for setTierUSDCPrice: ${currentNonce}`,
            );

            const setUsdHash = await contract.write.setTierUSDCPrice(
              [BigInt(tokenId), amountUSDC],
              { nonce: currentNonce },
            );

            console.log(`⏳ Waiting for USDC price transaction: ${setUsdHash}`);
            await this.publicClient.waitForTransactionReceipt({
              hash: setUsdHash,
            });
            await new Promise((r) => setTimeout(r, 2000)); // Longer delay
            console.log(
              `💵 Set USDC price for ${tier.name}: ${amountUSDC} (6 decimals)`,
            );
          }
        } catch (tierError) {
          console.error(`❌ Failed to setup tier ${tier.name}:`, tierError);
          throw tierError;
        }
      }

      console.log(`🎉 Successfully configured all ${tiers.length} tiers!`);
    } catch (error) {
      console.error("Error setting up access tiers:", error);
      throw error;
    }
  }

  /**
   * Check if a user has valid (non-expired) access tokens
   */
  async checkTokenAccess(
    contractAddress: string,
    userAddress: string,
  ): Promise<boolean> {
    try {
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.publicClient,
      });

      const hasAccess = await contract.read.hasValidAccess([
        userAddress as `0x${string}`,
      ]);
      return Boolean(hasAccess);
    } catch (error) {
      console.error("Error checking token access:", error);
      return false;
    }
  }

  /**
   * Create mint transaction data for token purchase
   */
  async createMintTransaction(
    contractAddress: string,
    userAddress: string,
    tier: AccessTier,
    tokenId: number,
  ): Promise<{
    to: string;
    data: string;
    value: string;
  }> {
    try {
      // Encode purchaseAccess(tokenId)
      const data = encodeFunctionData({
        abi: GROUP_ABI,
        functionName: "purchaseAccess",
        args: [BigInt(tokenId)],
      });

      // Query on-chain tier price to ensure the correct value is sent
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.publicClient,
      });
      const onchainTier = await contract.read.accessTiers([BigInt(tokenId)]);
      const priceWei =
        onchainTier &&
        Array.isArray(onchainTier) &&
        typeof onchainTier[1] !== "undefined"
          ? (onchainTier[1] as bigint)
          : BigInt(tier.priceWei);

      return {
        to: contractAddress,
        data,
        value: priceWei.toString(),
      };
    } catch (error) {
      console.error("Error creating mint transaction:", error);
      throw error;
    }
  }

  /**
   * Create USDC purchase call for token purchase (no ETH value)
   */
  async createUSDCMintTransaction(
    contractAddress: string,
    tokenId: number,
    amountUSDC: bigint,
  ): Promise<{ to: string; data: string; value: string }> {
    const data = encodeFunctionData({
      abi: GROUP_ABI,
      functionName: "purchaseAccessUSDC",
      args: [BigInt(tokenId), amountUSDC],
    });
    return {
      to: contractAddress,
      data,
      value: "0",
    };
  }

  /** Ensure USDC token configured on contract */
  async ensureUSDCConfigured(contractAddress: string, usdcAddress: string) {
    const contract = getContract({
      address: contractAddress as `0x${string}`,
      abi: GROUP_ABI,
      client: this.walletClient,
    });
    await contract.write.setUSDCToken([usdcAddress as `0x${string}`]);
  }

  /** Set USDC price for a tier */
  async setTierUSDCPrice(
    contractAddress: string,
    tokenId: number,
    amountUSDC: bigint,
  ) {
    const contract = getContract({
      address: contractAddress as `0x${string}`,
      abi: GROUP_ABI,
      client: this.walletClient,
    });
    const hash = await contract.write.setTierUSDCPrice([
      BigInt(tokenId),
      amountUSDC,
    ]);
    await this.publicClient.waitForTransactionReceipt({ hash });
  }

  /**
   * Get token information for a user
   */
  async getUserTokens(
    contractAddress: string,
    userAddress: string,
  ): Promise<
    Array<{
      tokenId: number;
      balance: bigint;
      expiresAt: Date;
    }>
  > {
    try {
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.publicClient,
      });

      const tokens = [];

      for (let tokenId = 1; tokenId <= 10; tokenId++) {
        const balance = await contract.read.balanceOf([
          userAddress as `0x${string}`,
          BigInt(tokenId),
        ]);

        if (balance > 0n) {
          const expiration = await contract.read.userTokenExpiry([
            userAddress as `0x${string}`,
            BigInt(tokenId),
          ]);
          tokens.push({
            tokenId,
            balance,
            expiresAt: new Date(Number(expiration ?? 0n) * 1000),
          });
        }
      }

      return tokens;
    } catch (error) {
      console.error("Error getting user tokens:", error);
      return [];
    }
  }

  /**
   * Get contract balance for fee collection
   */
  async getContractBalance(contractAddress: string): Promise<bigint> {
    try {
      const balance = await this.publicClient.getBalance({
        address: contractAddress as `0x${string}`,
      });
      return balance;
    } catch (error) {
      console.error("Error getting contract balance:", error);
      return 0n;
    }
  }

  /**
   * Read tier info from contract
   */
  async readTierInfo(
    contractAddress: string,
    tokenId: number,
  ): Promise<{
    priceWei: bigint;
    priceUSDC: bigint;
    durationDays: number;
    name: string;
    description: string;
  } | null> {
    try {
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.publicClient,
      });
      const tier = await contract.read.accessTiers([BigInt(tokenId)]);
      // accessTiers returns: [durationDays, priceWei, priceUSDC, name, description, imageHash, metadataUri, isActive, createdAt]
      return {
        durationDays: Number(tier[0]),
        priceWei: tier[1] as unknown as bigint,
        priceUSDC: tier[2] as unknown as bigint,
        name: String(tier[3]),
        description: String(tier[4]),
      };
    } catch {
      return null;
    }
  }

  /**
   * Withdraw fees from contract (only contract owner)
   */
  async withdrawFees(contractAddress: string, amount: bigint): Promise<string> {
    try {
      // This would require a withdraw function in the EVMAuth contract
      // Implementation depends on the specific contract design
      console.log(`Withdrawing ${amount} wei from ${contractAddress}`);

      // Placeholder - implement based on actual contract
      return "0x"; // Transaction hash
    } catch (error) {
      console.error("Error withdrawing fees:", error);
      throw error;
    }
  }

  /**
   * Store user's XMTP inbox ID mapping on-chain (callable by bot)
   */
  async storeUserInboxId(
    contractAddress: string,
    userAddress: string,
    inboxId: string,
  ): Promise<void> {
    const contract = getContract({
      address: contractAddress as `0x${string}`,
      abi: GROUP_ABI,
      client: this.walletClient,
    });
    await contract.write.storeUserInboxId([
      userAddress as `0x${string}`,
      inboxId,
    ]);
  }

  /**
   * Get contract ETH balance for withdrawal
   */
  async getContractBalance(contractAddress: string): Promise<bigint> {
    try {
      return await this.publicClient.getBalance({
        address: contractAddress as `0x${string}`,
      });
    } catch (error) {
      console.error("Error getting contract balance:", error);
      return 0n;
    }
  }

  /**
   * Get contract USDC balance (if any stuck)
   */
  async getContractUSDCBalance(contractAddress: string): Promise<bigint> {
    try {
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.publicClient,
      });

      // Get USDC token address from contract
      const usdcAddress = await contract.read.usdcToken();
      if (
        !usdcAddress ||
        usdcAddress === "0x0000000000000000000000000000000000000000"
      ) {
        return 0n;
      }

      // Get USDC balance of the contract
      const usdcContract = getContract({
        address: usdcAddress as `0x${string}`,
        abi: [
          {
            inputs: [{ name: "account", type: "address" }],
            name: "balanceOf",
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        client: this.publicClient,
      });

      return await usdcContract.read.balanceOf([contractAddress]);
    } catch (error) {
      console.error("Error getting USDC balance:", error);
      return 0n;
    }
  }

  /**
   * Withdraw ETH from contract (creator only)
   */
  async withdrawETH(contractAddress: string): Promise<string> {
    try {
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.walletClient,
      });

      const hash = await contract.write.withdraw();
      console.log(`💰 Withdrawing ETH from ${contractAddress}: ${hash}`);

      await this.publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (error) {
      console.error("Error withdrawing ETH:", error);
      throw error;
    }
  }

  /**
   * Get agent's fee balances (ETH and USDC)
   */
  async getAgentFeeBalances(
    agentAddress: string,
    usdcAddress?: string,
  ): Promise<{
    eth: bigint;
    usdc: bigint;
  }> {
    try {
      const ethBalance = await this.publicClient.getBalance({
        address: agentAddress as `0x${string}`,
      });

      let usdcBalance = 0n;
      if (
        usdcAddress &&
        usdcAddress !== "0x0000000000000000000000000000000000000000"
      ) {
        const usdcContract = getContract({
          address: usdcAddress as `0x${string}`,
          abi: [
            {
              inputs: [{ name: "account", type: "address" }],
              name: "balanceOf",
              outputs: [{ name: "", type: "uint256" }],
              stateMutability: "view",
              type: "function",
            },
          ],
          client: this.publicClient,
        });

        usdcBalance = await usdcContract.read.balanceOf([agentAddress]);
      }

      return { eth: ethBalance, usdc: usdcBalance };
    } catch (error) {
      console.error("Error getting agent fee balances:", error);
      return { eth: 0n, usdc: 0n };
    }
  }
}
