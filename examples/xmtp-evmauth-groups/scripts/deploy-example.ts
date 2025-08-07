/**
 * Example deployment script for EVMAuth Groups Agent
 * This demonstrates how to set up the agent for production use
 */

import { EVMAuthHandler } from "../src/handlers/evmauth-handler";
import type { AccessTier, GroupConfig } from "../src/types/types";

// Example configuration for a production deployment
const PRODUCTION_CONFIG = {
  // Base Mainnet configuration
  baseRpcUrl: "https://mainnet.base.org",
  factoryAddress: "0x1234567890123456789012345678901234567890", // Replace with actual factory
  feeRecipient: "0x1234567890123456789012345678901234567890", // Replace with your address
  feeBasisPoints: 250, // 2.5% platform fee
};

// Example access tiers for different use cases
export const EXAMPLE_TIERS = {
  // Content creator tiers
  CREATOR_TIERS: [
    {
      id: "supporter",
      name: "Supporter",
      durationDays: 30,
      priceWei: "10000000000000000", // 0.01 ETH
      description: "Monthly supporter access",
      imageUrl: "https://example.com/supporter-badge.png",
    },
    {
      id: "premium",
      name: "Premium Fan",
      durationDays: 90,
      priceWei: "25000000000000000", // 0.025 ETH
      description: "Quarterly premium access with exclusive content",
      imageUrl: "https://example.com/premium-badge.png",
    },
    {
      id: "vip",
      name: "VIP Member",
      durationDays: 365,
      priceWei: "80000000000000000", // 0.08 ETH
      description: "Annual VIP access with all benefits",
      imageUrl: "https://example.com/vip-badge.png",
    },
  ] as AccessTier[],

  // DAO/Project tiers
  DAO_TIERS: [
    {
      id: "contributor",
      name: "Contributor Access",
      durationDays: 14,
      priceWei: "5000000000000000", // 0.005 ETH
      description: "2-week contributor trial",
      maxSupply: 100,
    },
    {
      id: "member",
      name: "DAO Member",
      durationDays: 180,
      priceWei: "50000000000000000", // 0.05 ETH
      description: "6-month governance participation",
    },
  ] as AccessTier[],

  // Educational tiers
  EDUCATION_TIERS: [
    {
      id: "course",
      name: "Course Access",
      durationDays: 60,
      priceWei: "100000000000000000", // 0.1 ETH
      description: "Complete course access for 2 months",
    },
    {
      id: "mentorship",
      name: "Mentorship Program",
      durationDays: 30,
      priceWei: "200000000000000000", // 0.2 ETH
      description: "1-on-1 mentorship access",
      maxSupply: 10,
    },
  ] as AccessTier[],
};

/**
 * Example deployment function
 */
export async function deployExample() {
  console.log("🚀 EVMAuth Groups Agent Deployment Example");
  console.log("==========================================");
  
  // Initialize the EVMAuth handler
  const evmAuthHandler = new EVMAuthHandler(
    PRODUCTION_CONFIG.baseRpcUrl,
    PRODUCTION_CONFIG.factoryAddress,
    process.env.WALLET_KEY || "0x1234..." // Use actual private key
  );

  console.log("✅ EVMAuth handler initialized");
  console.log(`📡 RPC URL: ${PRODUCTION_CONFIG.baseRpcUrl}`);
  console.log(`🏭 Factory: ${PRODUCTION_CONFIG.factoryAddress}`);
  console.log(`💰 Fee: ${PRODUCTION_CONFIG.feeBasisPoints / 100}%`);

  // Example: Deploy a content creator group
  try {
    console.log("\n📦 Example: Deploying Content Creator Group...");
    
    const contractAddress = await evmAuthHandler.deployGroupContract(
      "Premium Creator Community",
      "0x1234567890123456789012345678901234567890" // Creator address
    );

    console.log(`✅ Contract deployed: ${contractAddress}`);

    // Setup tiers
    console.log("⚙️ Setting up access tiers...");
    await evmAuthHandler.setupAccessTiers(contractAddress, EXAMPLE_TIERS.CREATOR_TIERS);
    
    console.log("✅ Tiers configured successfully!");

    // Example group configuration
    const exampleGroup: GroupConfig = {
      groupId: "example-group-id",
      contractAddress,
      tiers: EXAMPLE_TIERS.CREATOR_TIERS,
      metadata: {
        name: "Premium Creator Community",
        description: "Exclusive access to creator content and community",
        image: "https://example.com/group-image.png",
      },
      creatorInboxId: "creator-inbox-id",
      creatorAddress: "0x1234567890123456789012345678901234567890",
      createdAt: new Date(),
      isActive: true,
      paymentConfig: {
        acceptedTokens: ["USDC"],
        defaultToken: "USDC",
        usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
        autoConvertPrices: true,
      },
    };

    console.log("\n📊 Example Group Configuration:");
    console.log(JSON.stringify(exampleGroup, null, 2));

  } catch (error) {
    console.error("❌ Deployment failed:", error);
  }
}

/**
 * Utility functions for common operations
 */
export class DeploymentUtils {
  /**
   * Calculate total cost for access tiers
   */
  static calculateTierCosts(tiers: AccessTier[]): {
    tierCosts: Array<{ tier: string; costETH: number; durationDays: number }>;
    totalRevenuePotential: number;
  } {
    const tierCosts = tiers.map(tier => ({
      tier: tier.name,
      costETH: parseFloat(tier.priceWei) / 1e18,
      durationDays: tier.durationDays,
    }));

    const totalRevenuePotential = tierCosts.reduce((sum, tier) => sum + tier.costETH, 0);

    return { tierCosts, totalRevenuePotential };
  }

  /**
   * Validate tier configuration
   */
  static validateTiers(tiers: AccessTier[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (tiers.length === 0) {
      errors.push("At least one tier is required");
    }

    for (const tier of tiers) {
      if (!tier.id || tier.id.trim() === "") {
        errors.push(`Tier missing ID: ${tier.name}`);
      }

      if (!tier.name || tier.name.trim() === "") {
        errors.push(`Tier missing name: ${tier.id}`);
      }

      if (tier.durationDays <= 0) {
        errors.push(`Invalid duration for tier ${tier.name}: ${tier.durationDays}`);
      }

      if (!tier.priceWei || BigInt(tier.priceWei) <= 0n) {
        errors.push(`Invalid price for tier ${tier.name}: ${tier.priceWei}`);
      }
    }

    // Check for duplicate IDs
    const ids = tiers.map(t => t.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0) {
      errors.push(`Duplicate tier IDs: ${duplicates.join(", ")}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Generate markdown documentation for tiers
   */
  static generateTierDocs(tiers: AccessTier[]): string {
    let docs = "# Access Tiers\n\n";
    
    tiers.forEach((tier, index) => {
      const priceETH = (parseFloat(tier.priceWei) / 1e18).toFixed(4);
      docs += `## ${index + 1}. ${tier.name}\n\n`;
      docs += `- **Duration**: ${tier.durationDays} days\n`;
      docs += `- **Price**: ${priceETH} ETH\n`;
      if (tier.description) {
        docs += `- **Description**: ${tier.description}\n`;
      }
      if (tier.maxSupply) {
        docs += `- **Max Supply**: ${tier.maxSupply}\n`;
      }
      docs += "\n";
    });

    return docs;
  }
}

// Run deployment example if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  deployExample().catch(console.error);
}