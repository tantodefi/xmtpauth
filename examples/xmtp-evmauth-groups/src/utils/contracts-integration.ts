/**
 * Real contract integration for EVMAuth Groups Agent
 * This replaces the mock implementation with actual contract calls
 */

import { createPublicClient, createWalletClient, http, getContract, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { AccessTier } from "../types/types";

// Factory Contract ABI (essential functions only)
const FACTORY_ABI = [
  {
    "inputs": [
      {"name": "name", "type": "string"},
      {"name": "symbol", "type": "string"},
      {"name": "groupName", "type": "string"},
      {"name": "groupDescription", "type": "string"},
      {"name": "baseURI", "type": "string"}
    ],
    "name": "deployGroupContract",
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "deploymentFee",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// Group Contract ABI (essential functions only)  
const GROUP_ABI = [
  {
    "inputs": [
      {"name": "tokenId", "type": "uint256"},
      {"name": "price", "type": "uint256"},
      {"name": "durationDays", "type": "uint256"},
      {"name": "maxSupply", "type": "uint256"},
      {"name": "tierName", "type": "string"},
      {"name": "description", "type": "string"},
      {"name": "imageURI", "type": "string"}
    ],
    "name": "createTier",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "tokenId", "type": "uint256"}
    ],
    "name": "purchaseAccess",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "user", "type": "address"}
    ],
    "name": "hasValidAccess",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "user", "type": "address"},
      {"name": "tokenId", "type": "uint256"}
    ],
    "name": "hasValidAccessForTier",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "user", "type": "address"},
      {"name": "tokenId", "type": "uint256"}
    ],
    "name": "getUserTokenExpiration",
    "outputs": [
      {"name": "expiresAt", "type": "uint256"},
      {"name": "exists", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "tokenId", "type": "uint256"}
    ],
    "name": "getTier",
    "outputs": [
      {
        "components": [
          {"name": "price", "type": "uint256"},
          {"name": "duration", "type": "uint256"},
          {"name": "maxSupply", "type": "uint256"},
          {"name": "totalMinted", "type": "uint256"},
          {"name": "active", "type": "bool"},
          {"name": "name", "type": "string"},
          {"name": "description", "type": "string"},
          {"name": "imageURI", "type": "string"}
        ],
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export class RealEVMAuthHandler {
  private publicClient;
  private walletClient;
  private account;
  private factoryAddress: string;

  constructor(rpcUrl: string, factoryAddress: string, privateKey: string) {
    this.factoryAddress = factoryAddress;
    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    
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
   * Deploy a new EVMAuth contract for a group
   */
  async deployGroupContract(groupName: string, ownerAddress: string): Promise<string> {
    try {
      const factoryContract = getContract({
        address: this.factoryAddress as `0x${string}`,
        abi: FACTORY_ABI,
        client: this.walletClient,
      });

      // Get deployment fee
      const deploymentFee = await factoryContract.read.deploymentFee();

      // Deploy contract
      const hash = await factoryContract.write.deployGroupContract([
        `${groupName} Access`,  // name
        "ACCESS",               // symbol
        groupName,              // groupName
        `Premium access to ${groupName}`, // groupDescription
        "https://example.com/metadata/",  // baseURI
      ], {
        value: deploymentFee,
      });

      // Wait for transaction and get receipt
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      
      // Parse logs to get the deployed contract address
      // In a real implementation, you'd decode the ContractDeployed event
      // For now, we'll extract from transaction logs
      const deployedAddress = receipt.logs[0]?.address || receipt.contractAddress;
      
      if (!deployedAddress) {
        throw new Error("Failed to get deployed contract address");
      }

      console.log(`✅ EVMAuth contract deployed: ${deployedAddress}`);
      return deployedAddress;
    } catch (error) {
      console.error("Error deploying EVMAuth contract:", error);
      throw error;
    }
  }

  /**
   * Setup access tiers for a group contract
   */
  async setupAccessTiers(contractAddress: string, tiers: AccessTier[]): Promise<void> {
    try {
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.walletClient,
      });

      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const tokenId = i + 1; // Token IDs start from 1
        
        await contract.write.createTier([
          BigInt(tokenId),
          BigInt(tier.priceWei),
          BigInt(tier.durationDays),
          BigInt(tier.maxSupply || 0), // 0 = unlimited
          tier.name,
          tier.description || "",
          tier.imageUrl || "",
        ]);

        console.log(`✅ Setup tier ${tier.name} (Token ID: ${tokenId})`);
      }
    } catch (error) {
      console.error("Error setting up access tiers:", error);
      throw error;
    }
  }

  /**
   * Check if a user has valid (non-expired) access tokens
   */
  async checkTokenAccess(contractAddress: string, userAddress: string): Promise<boolean> {
    try {
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.publicClient,
      });

      const hasAccess = await contract.read.hasValidAccess([userAddress as `0x${string}`]);
      return hasAccess;
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
    tokenId: number
  ): Promise<{
    to: string;
    data: string;
    value: string;
  }> {
    try {
      // Encode the purchaseAccess function call
      const data = encodeFunctionData({
        abi: GROUP_ABI,
        functionName: "purchaseAccess",
        args: [BigInt(tokenId)],
      });

      // Get the actual tier info from contract to get current price
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.publicClient,
      });

      const tierInfo = await contract.read.getTier([BigInt(tokenId)]);
      const price = tierInfo.price;

      return {
        to: contractAddress,
        data,
        value: price.toString(),
      };
    } catch (error) {
      console.error("Error creating mint transaction:", error);
      throw error;
    }
  }

  /**
   * Get token information for a user
   */
  async getUserTokens(contractAddress: string, userAddress: string): Promise<Array<{
    tokenId: number;
    expiresAt: Date;
    isActive: boolean;
  }>> {
    try {
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.publicClient,
      });

      const tokens = [];

      // Check tokens 1-10 (in a real implementation, you'd track available token IDs)
      for (let tokenId = 1; tokenId <= 10; tokenId++) {
        try {
          const [expiresAt, exists] = await contract.read.getUserTokenExpiration([
            userAddress as `0x${string}`,
            BigInt(tokenId),
          ]);

          if (exists) {
            const isActive = await contract.read.hasValidAccessForTier([
              userAddress as `0x${string}`,
              BigInt(tokenId),
            ]);

            tokens.push({
              tokenId,
              expiresAt: new Date(Number(expiresAt) * 1000),
              isActive,
            });
          }
        } catch {
          // Token doesn't exist or other error, continue
          continue;
        }
      }

      return tokens;
    } catch (error) {
      console.error("Error getting user tokens:", error);
      return [];
    }
  }

  /**
   * Get tier information from contract
   */
  async getTierInfo(contractAddress: string, tokenId: number): Promise<{
    price: string;
    duration: number;
    name: string;
    description: string;
    maxSupply: number;
    totalMinted: number;
    active: boolean;
  } | null> {
    try {
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: GROUP_ABI,
        client: this.publicClient,
      });

      const tier = await contract.read.getTier([BigInt(tokenId)]);
      
      return {
        price: tier.price.toString(),
        duration: Number(tier.duration),
        name: tier.name,
        description: tier.description,
        maxSupply: Number(tier.maxSupply),
        totalMinted: Number(tier.totalMinted),
        active: tier.active,
      };
    } catch (error) {
      console.error("Error getting tier info:", error);
      return null;
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
}