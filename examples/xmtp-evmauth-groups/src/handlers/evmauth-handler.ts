import { createPublicClient, createWalletClient, http, getContract, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { AccessTier } from "../types/types";

// EVMAuth Contract ABI (simplified for demo - include full ABI in production)
const EVMAUTH_ABI = [
  {
    "inputs": [
      {"name": "to", "type": "address"},
      {"name": "tokenId", "type": "uint256"},
      {"name": "amount", "type": "uint256"},
      {"name": "data", "type": "bytes"}
    ],
    "name": "mint",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "account", "type": "address"},
      {"name": "id", "type": "uint256"}
    ],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "tokenId", "type": "uint256"}
    ],
    "name": "getTokenExpiration",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "tokenId", "type": "uint256"},
      {"name": "price", "type": "uint256"},
      {"name": "ttl", "type": "uint256"}
    ],
    "name": "setTokenMetadata",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// Factory Contract ABI (updated to match deployed contract)
const FACTORY_ABI = [
  {
    "inputs": [
      {"name": "groupName", "type": "string"},
      {"name": "groupDescription", "type": "string"},
      {"name": "groupImageUrl", "type": "string"},
      {"name": "salesGroupId", "type": "string"},
      {"name": "premiumGroupId", "type": "string"},
      {"name": "botAddress", "type": "address"}
    ],
    "name": "deployGroupContract",
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "payable",
    "type": "function"
  }
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
    botAddress: string, // Changed from ownerAddress to be clearer  
    salesGroupId: string, 
    premiumGroupId: string
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

      const hash = await factoryContract.write.deployGroupContract([
        groupName, // groupName
        `Premium access to ${groupName}`, // groupDescription
        "https://via.placeholder.com/400x400/6366f1/ffffff?text=Premium+Group", // groupImageUrl  
        salesGroupId, // actual salesGroupId
        premiumGroupId, // actual premiumGroupId
        botAddress as `0x${string}`, // botAddress (agent's wallet, NOT creator)
      ], {
        value: parseEther("0.0001"), // Send 0.0001 ETH as deployment fee
      });

      // Wait for transaction confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      
      console.log(`📋 Transaction receipt:`, receipt);
      
      // For factory deployments, contract address is in logs, not receipt.contractAddress
      // Look for ContractDeployed event in logs
      let deployedContractAddress: string | null = null;
      
      if (receipt.logs && receipt.logs.length > 0) {
        // ContractDeployed event should be the last log
        const deployLog = receipt.logs[receipt.logs.length - 1];
        if (deployLog && deployLog.address) {
          deployedContractAddress = deployLog.address;
        }
      }
      
      if (!deployedContractAddress) {
        console.error("❌ No contract address found in logs:", receipt.logs);
        throw new Error("Failed to extract deployed contract address from transaction logs");
      }

      console.log(`✅ Contract deployed at: ${deployedContractAddress}`);
      return deployedContractAddress;
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
        abi: EVMAUTH_ABI,
        client: this.walletClient,
      });

      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const tokenId = i + 1; // Token IDs start from 1
        const ttlSeconds = tier.durationDays * 24 * 60 * 60;

        await contract.write.setTokenMetadata([
          BigInt(tokenId),
          BigInt(tier.priceWei),
          BigInt(ttlSeconds),
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
        abi: EVMAUTH_ABI,
        client: this.publicClient,
      });

      // Check all possible token IDs (in production, you'd track these better)
      for (let tokenId = 1; tokenId <= 10; tokenId++) {
        const balance = await contract.read.balanceOf([
          userAddress as `0x${string}`,
          BigInt(tokenId),
        ]);

        if (balance > 0n) {
          // Check if token is not expired
          const expiration = await contract.read.getTokenExpiration([BigInt(tokenId)]);
          const now = Math.floor(Date.now() / 1000);
          
          if (expiration > now) {
            return true; // User has at least one valid token
          }
        }
      }

      return false;
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
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: EVMAUTH_ABI,
        client: this.publicClient,
      });

      // Create the mint function data (in a real implementation, you'd use encodeFunctionData from viem)
      // For now, we'll create a placeholder that includes the essential transaction info
      const data = "0x" + 
        "40c10f19" + // mint function selector
        userAddress.slice(2).padStart(64, "0") + // to address
        tokenId.toString(16).padStart(64, "0") + // token ID
        "0".repeat(64) + // amount (1)
        "0".repeat(64); // data offset

      return {
        to: contractAddress,
        data,
        value: tier.priceWei,
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
    balance: bigint;
    expiresAt: Date;
  }>> {
    try {
      const contract = getContract({
        address: contractAddress as `0x${string}`,
        abi: EVMAUTH_ABI,
        client: this.publicClient,
      });

      const tokens = [];

      for (let tokenId = 1; tokenId <= 10; tokenId++) {
        const balance = await contract.read.balanceOf([
          userAddress as `0x${string}`,
          BigInt(tokenId),
        ]);

        if (balance > 0n) {
          const expiration = await contract.read.getTokenExpiration([BigInt(tokenId)]);
          tokens.push({
            tokenId,
            balance,
            expiresAt: new Date(Number(expiration) * 1000),
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
}