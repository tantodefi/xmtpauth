import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getContract,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { AccessTier } from "../types/types";
import { IPFSMetadataHandler } from "./ipfs-metadata.js";

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
  private agentAddress: string;

  constructor(rpcUrl: string, factoryAddress: string, privateKey: string) {
    this.factoryAddress = factoryAddress;
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
  }

  /**
   * Get the public client for external use (e.g., address resolution)
   */
  get publicClientInstance() {
    return this.publicClient;
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

        // Get fresh nonce and gas price
        const latestNonce = await this.publicClient.getTransactionCount({
          address: this.walletClient.account.address,
          blockTag: "pending",
        });

        const gasPrice = await this.publicClient.getGasPrice();
        const bufferedGasPrice = (gasPrice * 110n) / 100n;

        const usdcHash = await contract.write.setUSDCToken(
          [usdcAddress as `0x${string}`],
          {
            nonce: latestNonce,
            gasPrice: bufferedGasPrice,
            gas: 100000n,
          },
        );
        await this.publicClient.waitForTransactionReceipt({ hash: usdcHash });
        await new Promise((r) => setTimeout(r, 3000)); // Wait before next transaction
        console.log(`✅ USDC token set successfully`);
      }

      // Find available token IDs first
      const availableTokenIds: number[] = [];
      for (let id = 1; id <= 20; id++) {
        try {
          const existingTier = await this.getAccessTier(contractAddress, id);
          if (!existingTier || !existingTier.isActive) {
            availableTokenIds.push(id);
          }
        } catch (error) {
          // Token doesn't exist, it's available
          availableTokenIds.push(id);
        }

        if (availableTokenIds.length >= tiers.length) {
          break; // Found enough slots
        }
      }

      if (availableTokenIds.length < tiers.length) {
        throw new Error(
          `Not enough available token IDs. Need ${tiers.length}, found ${availableTokenIds.length}`,
        );
      }

      console.log(
        `🎯 Using token IDs: ${availableTokenIds.slice(0, tiers.length).join(", ")}`,
      );

      // Process tiers sequentially with explicit nonce management
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const tokenId = availableTokenIds[i]; // Use dynamically found token ID

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

          // Use group image as fallback for NFT image (updated default)
          const defaultImageHash =
            "bafkreies7jntbufslrlq7524ahrrtjmwssarm3ni3zmbg7nmo6c4toqxne"; // Updated default NFT image
          const imageHash = tier.metadata?.imageHash || defaultImageHash;

          // Generate proper metadata URI with image field if not provided
          let metadataUri = "";
          if (tier.metadata?.ipfsHash) {
            metadataUri = `ipfs://${tier.metadata.ipfsHash}`;
          } else {
            // Generate basic metadata JSON structure
            const metadata = {
              name: `${tier.name} Access Token`,
              description: `${tier.description || `Access token for ${tier.name} tier`} - Valid for ${tier.durationDays} days`,
              image: `ipfs://${imageHash}`,
              attributes: [
                { trait_type: "Tier", value: tier.name },
                { trait_type: "Duration", value: `${tier.durationDays} days` },
                { trait_type: "Price", value: `$${tier.priceUSD || "N/A"}` },
              ],
            };
            console.log(`📝 Generated metadata for ${tier.name}:`, metadata);

            // Upload metadata to IPFS for proper OpenSea display
            try {
              const ipfsHandler = new IPFSMetadataHandler();
              const metadataHash = await ipfsHandler.uploadMetadata({
                name: metadata.name,
                description: metadata.description,
                image: metadata.image,
                attributes: metadata.attributes,
                group_id: "unknown", // We don't have group ID context here
                group_name: tier.name,
                access_duration_days: tier.durationDays,
                access_tier: tier.name,
                created_at: new Date().toISOString(),
                creator_address: this.walletClient.account.address,
              });
              metadataUri = `ipfs://${metadataHash}`;
              console.log(`📄 Uploaded metadata to IPFS: ${metadataUri}`);
            } catch (uploadError) {
              console.warn("Failed to upload metadata to IPFS:", uploadError);
              metadataUri = ""; // Fallback to empty string
            }
          }

          // Get fresh nonce and gas price for each transaction
          const latestNonce = await this.publicClient.getTransactionCount({
            address: this.walletClient.account.address,
            blockTag: "pending",
          });

          // Get current gas price and add 10% buffer
          const gasPrice = await this.publicClient.getGasPrice();
          const bufferedGasPrice = (gasPrice * 110n) / 100n;

          console.log(
            `🔧 Using nonce: ${latestNonce}, gas price: ${Number(bufferedGasPrice) / 1e9} gwei`,
          );

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
            {
              nonce: latestNonce,
              gasPrice: bufferedGasPrice,
              gas: 200000n, // Set reasonable gas limit
            },
          );

          // Wait for transaction to be mined
          console.log(`⏳ Waiting for tier setup transaction: ${hash}`);
          await this.publicClient.waitForTransactionReceipt({ hash });

          // Add delay between transactions to prevent nonce conflicts
          console.log(`⏳ Waiting 3 seconds before next transaction...`);
          await new Promise((r) => setTimeout(r, 3000));

          console.log(`✅ Setup tier ${tier.name} (Token ID: ${tokenId})`);

          // If USD price present, set tier USDC price
          if (typeof tier.priceUSD === "number" && tier.priceUSD! > 0) {
            const amountUSDC = BigInt(Math.round(tier.priceUSD! * 1_000_000));
            console.log(
              `💰 Setting USDC price for ${tier.name}: $${tier.priceUSD} (${amountUSDC} wei)`,
            );

            // Get fresh nonce and gas price for USDC price transaction
            const usdcNonce = await this.publicClient.getTransactionCount({
              address: this.walletClient.account.address,
              blockTag: "pending",
            });

            const usdcGasPrice = await this.publicClient.getGasPrice();
            const usdcBufferedGasPrice = (usdcGasPrice * 110n) / 100n;

            console.log(
              `🔧 USDC price tx - nonce: ${usdcNonce}, gas price: ${Number(usdcBufferedGasPrice) / 1e9} gwei`,
            );

            const setUsdHash = await contract.write.setTierUSDCPrice(
              [BigInt(tokenId), amountUSDC],
              {
                nonce: usdcNonce,
                gasPrice: usdcBufferedGasPrice,
                gas: 100000n,
              },
            );

            console.log(`⏳ Waiting for USDC price transaction: ${setUsdHash}`);
            await this.publicClient.waitForTransactionReceipt({
              hash: setUsdHash,
            });
            await new Promise((r) => setTimeout(r, 3000)); // Wait before next transaction
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

  // Removed duplicate getContractBalance (defined later)

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

      return await usdcContract.read.balanceOf([
        contractAddress as `0x${string}`,
      ]);
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

        usdcBalance = await usdcContract.read.balanceOf([
          agentAddress as `0x${string}`,
        ]);
      }

      return { eth: ethBalance, usdc: usdcBalance };
    } catch (error) {
      console.error("Error getting agent fee balances:", error);
      return { eth: 0n, usdc: 0n };
    }
  }

  /**
   * Compute lifetime USDC payouts to the contract owner by scanning
   * UserAccessGranted events and summing USDC Transfer logs to owner
   */
  async getTotalUSDCCreatorPayouts(
    contractAddress: string,
  ): Promise<{ total: bigint; ok: boolean }> {
    try {
      const groupContract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.publicClient,
      });

      // Read USDC token and owner address
      const usdcAddressRaw = await groupContract.read.usdcToken();
      const usdcAddress = (usdcAddressRaw ??
        "0x0000000000000000000000000000000000000000") as `0x${string}`;
      if (
        !usdcAddress ||
        usdcAddress === "0x0000000000000000000000000000000000000000"
      ) {
        return { total: 0n, ok: true };
      }
      const ownerAddressRaw = await groupContract.read.owner();
      const ownerAddress = (ownerAddressRaw ??
        "0x0000000000000000000000000000000000000000") as `0x${string}`;

      // Fetch all UserAccessGranted events for this contract
      let events: any[] = [];
      let fetched = false;
      for (let attempt = 0; attempt < 3 && !fetched; attempt++) {
        try {
          events = (await this.publicClient.getContractEvents({
            address: contractAddress as `0x${string}`,
            abi: [
              {
                inputs: [
                  { indexed: true, name: "user", type: "address" },
                  { indexed: true, name: "userInboxId", type: "string" },
                  { indexed: true, name: "tokenId", type: "uint256" },
                  { indexed: false, name: "expiresAt", type: "uint256" },
                ],
                name: "UserAccessGranted",
                type: "event",
              },
            ] as const,
            fromBlock: 0n,
            toBlock: "latest",
          })) as any[];
          fetched = true;
        } catch {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 750));
          }
        }
      }

      if (!events || events.length === 0) {
        return { total: 0n, ok: fetched };
      }

      const TRANSFER_TOPIC =
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // keccak256(Transfer(address,address,uint256))
      const ownerTopic = ("0x" +
        (ownerAddress as string)
          .toLowerCase()
          .slice(2)
          .padStart(64, "0")) as `0x${string}`;

      let total: bigint = 0n;
      for (const ev of events) {
        const txHash = (ev as any).transactionHash as `0x${string}` | undefined;
        if (!txHash) continue;

        try {
          const receipt = await this.publicClient.getTransactionReceipt({
            hash: txHash,
          });

          const logs = (receipt as any).logs as Array<any> | undefined;
          for (const log of logs ?? []) {
            if (
              (log.address as string).toLowerCase() !==
              (usdcAddress as string).toLowerCase()
            )
              continue;
            if (log.topics && (log.topics as string[]).length >= 3) {
              if (
                (log.topics[0] as string).toLowerCase() === TRANSFER_TOPIC &&
                (log.topics[2] as string).toLowerCase() ===
                  (ownerTopic as string)
              ) {
                // data is value (uint256) encoded
                try {
                  const value = BigInt(log.data as string);
                  total += value;
                } catch {}
              }
            }
          }
        } catch {}
      }

      return { total, ok: true };
    } catch (error) {
      console.error("Error computing total USDC payouts:", error);
      return { total: 0n, ok: false };
    }
  }

  /**
   * Send a transaction using the agent wallet
   */
  async sendTransaction(params: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
  }): Promise<`0x${string}`> {
    try {
      const hash = await this.walletClient.sendTransaction({
        to: params.to,
        data: params.data,
        value: params.value,
      });
      return hash;
    } catch (error) {
      console.error("Error sending transaction:", error);
      throw error;
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(hash: `0x${string}`): Promise<void> {
    try {
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
      });
      if (receipt.status !== "success") {
        throw new Error("Transaction failed");
      }
    } catch (error) {
      console.error("Error waiting for transaction:", error);
      throw error;
    }
  }

  /**
   * Directly mint trial NFT using agent wallet (owner privilege)
   */
  async mintTrialNFT(
    contractAddress: string,
    recipientAddress: string,
    tokenId: number,
    durationDays: number,
  ): Promise<`0x${string}`> {
    try {
      // Check which contract version we're dealing with
      const isV2Contract = await this.isV2Contract(contractAddress);

      let data: `0x${string}`;

      if (isV2Contract) {
        // Use extMint function for V2 contracts
        data = encodeFunctionData({
          abi: [
            {
              inputs: [
                { name: "to", type: "address" },
                { name: "id", type: "uint256" },
                { name: "amount", type: "uint256" },
                { name: "data", type: "bytes" },
              ],
              name: "extMint",
              outputs: [],
              stateMutability: "nonpayable",
              type: "function",
            },
          ],
          functionName: "extMint",
          args: [
            recipientAddress as `0x${string}`,
            BigInt(tokenId),
            BigInt(1), // amount
            "0x", // empty data
          ],
        });

        const hash = await this.sendTransaction({
          to: contractAddress as `0x${string}`,
          data,
          value: 0n, // Free trial
        });

        await this.waitForTransaction(hash);
        return hash;
      } else {
        // For V1 contracts, we need to use purchaseAccess with 0 price
        // This will mint to the agent, then we transfer to the recipient
        const purchaseData = encodeFunctionData({
          abi: [
            {
              inputs: [{ name: "tokenId", type: "uint256" }],
              name: "purchaseAccess",
              outputs: [],
              stateMutability: "payable",
              type: "function",
            },
          ],
          functionName: "purchaseAccess",
          args: [BigInt(tokenId)],
        });

        // Step 1: Purchase access (mints to agent)
        const purchaseHash = await this.sendTransaction({
          to: contractAddress as `0x${string}`,
          data: purchaseData,
          value: 0n, // Free trial
        });

        await this.waitForTransaction(purchaseHash);

        // Step 2: Transfer the NFT to the recipient
        const transferData = encodeFunctionData({
          abi: [
            {
              inputs: [
                { name: "from", type: "address" },
                { name: "to", type: "address" },
                { name: "id", type: "uint256" },
                { name: "amount", type: "uint256" },
                { name: "data", type: "bytes" },
              ],
              name: "safeTransferFrom",
              outputs: [],
              stateMutability: "nonpayable",
              type: "function",
            },
          ],
          functionName: "safeTransferFrom",
          args: [
            this.agentAddress as `0x${string}`, // from (agent)
            recipientAddress as `0x${string}`, // to (recipient)
            BigInt(tokenId),
            BigInt(1), // amount
            "0x", // empty data
          ],
        });

        const transferHash = await this.sendTransaction({
          to: contractAddress as `0x${string}`,
          data: transferData,
          value: 0n,
        });

        await this.waitForTransaction(transferHash);
        return transferHash; // Return the transfer hash as the final transaction
      }
    } catch (error) {
      console.error("Error minting trial NFT:", error);
      throw error;
    }
  }

  /**
   * Find or create a token ID for a specific trial duration
   * This ensures each trial length gets its own token ID with consistent metadata
   */
  async findOrCreateTrialTokenId(
    contractAddress: string,
    durationDays: number,
  ): Promise<number> {
    try {
      // First, check if a token with this exact duration already exists
      for (let id = 1; id <= 20; id++) {
        try {
          const tier = await this.getAccessTier(contractAddress, id);
          if (
            tier &&
            tier.isActive &&
            tier.durationDays === BigInt(durationDays)
          ) {
            console.log(
              `🎯 Found existing trial token ID ${id} for ${durationDays} days`,
            );
            return id;
          }
        } catch (error) {
          // Token doesn't exist, continue checking
        }
      }

      // If no existing token found, find the next available token ID
      let nextTokenId = 1;
      for (let id = 1; id <= 20; id++) {
        try {
          const tier = await this.getAccessTier(contractAddress, id);
          if (!tier || !tier.isActive) {
            nextTokenId = id;
            break;
          }
        } catch (error) {
          // Token doesn't exist, use this ID
          nextTokenId = id;
          break;
        }
      }

      // Try to create new trial tier
      console.log(
        `🆕 Creating new trial token ID ${nextTokenId} for ${durationDays} days`,
      );

      try {
        const contract = getContract({
          address: contractAddress as `0x${string}`,
          abi: GROUP_ABI,
          client: this.walletClient,
        });

        // Generate metadata for the trial
        const metadata = {
          name: `Trial ${durationDays} Days`,
          description: `Trial access token - Valid for ${durationDays} days`,
          image: `ipfs://bafkreies7jntbufslrlq7524ahrrtjmwssarm3ni3zmbg7nmo6c4toqxne`,
          attributes: [
            { trait_type: "Tier", value: `Trial ${durationDays} Days` },
            { trait_type: "Duration", value: `${durationDays} days` },
            { trait_type: "Type", value: "Trial Access" },
          ],
        };

        // Upload metadata to IPFS
        const ipfsHandler = new IPFSMetadataHandler();
        const metadataHash = await ipfsHandler.uploadMetadata({
          name: metadata.name,
          description: metadata.description,
          image: metadata.image,
          attributes: metadata.attributes,
          group_id: "trial",
          group_name: `Trial ${durationDays} Days`,
          access_duration_days: durationDays,
          access_tier: `Trial ${durationDays} Days`,
          created_at: new Date().toISOString(),
          creator_address: this.walletClient.account.address,
        });

        const metadataUri = `ipfs://${metadataHash}`;

        // Setup the new trial tier
        const hash = await contract.write.setupAccessTier(
          [
            BigInt(nextTokenId),
            BigInt(durationDays),
            0n, // Free trial
            `Trial ${durationDays} Days`,
            `Trial access token - Valid for ${durationDays} days`,
            "bafkreies7jntbufslrlq7524ahrrtjmwssarm3ni3zmbg7nmo6c4toqxne",
            metadataUri,
          ],
          {
            gas: 200000n,
          },
        );

        await this.publicClient.waitForTransactionReceipt({ hash });
        console.log(
          `✅ Created trial token ID ${nextTokenId} with metadata: ${metadataUri}`,
        );

        return nextTokenId;
      } catch (createError) {
        console.warn(
          `⚠️ Failed to create new trial token, falling back to existing token: ${createError}`,
        );

        // Fallback: use the first available active token
        for (let id = 1; id <= 10; id++) {
          try {
            const tier = await this.getAccessTier(contractAddress, id);
            if (tier && tier.isActive) {
              console.log(`🔄 Using fallback token ID ${id}: ${tier.name}`);
              return id;
            }
          } catch (error) {
            // Continue checking
          }
        }

        // Last resort: use token ID 1
        console.log(`🔄 Using last resort token ID 1`);
        return 1;
      }
    } catch (error) {
      console.error("Error finding or creating trial token ID:", error);
      // Last resort: return token ID 1
      return 1;
    }
  }

  /**
   * Get access tier information from contract
   */
  async getAccessTier(contractAddress: string, tokenId: number): Promise<any> {
    try {
      const result = await this.publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: [
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
        ],
        functionName: "getAccessTier",
        args: [BigInt(tokenId)],
      });
      return result;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if contract is V2 by looking for extMint function
   */
  private async isV2Contract(contractAddress: string): Promise<boolean> {
    try {
      // Try calling a V2-specific view function to determine version
      const result = await this.publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: [
          {
            inputs: [{ name: "extension", type: "address" }],
            name: "isAuthorizedExtension",
            outputs: [{ name: "", type: "bool" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "isAuthorizedExtension",
        args: [contractAddress as `0x${string}`],
      });
      return true; // If this succeeds, it's a V2 contract
    } catch (error) {
      return false; // If this fails, it's likely a V1 contract
    }
  }
}
