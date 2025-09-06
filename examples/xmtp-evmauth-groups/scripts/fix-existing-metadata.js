#!/usr/bin/env node

import { createPublicClient, createWalletClient, http, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { IPFSMetadataHandler } from "../src/handlers/ipfs-metadata.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const WALLET_KEY = process.env.WALLET_KEY;
const CONTRACT_ADDRESS = "0x602cA984D7f9C693b6061C8AaE072D6B553b0Aff";

if (!WALLET_KEY) {
  console.error("❌ WALLET_KEY environment variable is required");
  process.exit(1);
}

// Contract ABI for setupAccessTier
const CONTRACT_ABI = [
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "durationDays", type: "uint256" },
      { name: "priceETH", type: "uint256" },
      { name: "tierName", type: "string" },
      { name: "tierDescription", type: "string" },
      { name: "imageIPFSHash", type: "string" },
      { name: "metadataURI", type: "string" }
    ],
    name: "setupAccessTier",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
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
          { name: "isActive", type: "bool" }
        ],
        name: "",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  }
];

async function fixExistingMetadata() {
  console.log("🔧 Fixing existing NFT metadata...\n");

  // Setup clients
  const account = privateKeyToAccount(WALLET_KEY);
  const publicClient = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org")
  });
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http("https://mainnet.base.org")
  });

  const contract = getContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    client: { public: publicClient, wallet: walletClient }
  });

  const ipfsHandler = new IPFSMetadataHandler();

  // Token IDs to fix (adjust based on your existing tiers)
  const tokenIds = [1]; // Add more token IDs if you have multiple tiers

  console.log(`📋 Contract: ${CONTRACT_ADDRESS}`);
  console.log(`👤 Agent: ${account.address}`);
  console.log(`🎯 Token IDs to fix: ${tokenIds.join(", ")}\n`);

  for (const tokenId of tokenIds) {
    try {
      console.log(`🔍 Checking token ID ${tokenId}...`);
      
      // Get existing tier data
      const tier = await contract.read.getAccessTier([BigInt(tokenId)]);
      
      if (!tier.isActive) {
        console.log(`⏭️ Token ${tokenId} is not active, skipping\n`);
        continue;
      }

      console.log(`📄 Current tier: ${tier.name}`);
      console.log(`📝 Description: ${tier.description}`);
      console.log(`📅 Duration: ${tier.durationDays} days`);
      console.log(`💰 Price ETH: ${tier.priceETH}`);
      console.log(`🖼️ Image Hash: ${tier.imageIPFSHash || "None"}`);
      console.log(`🔗 Metadata URI: ${tier.metadataURI || "EMPTY - THIS IS THE PROBLEM!"}`);

      if (tier.metadataURI && tier.metadataURI.length > 0) {
        console.log(`✅ Token ${tokenId} already has metadata URI, skipping\n`);
        continue;
      }

      // Use default image hash if none exists
      const imageHash = tier.imageIPFSHash || "bafkreies7jntbufslrlq7524ahrrtjmwssarm3ni3zmbg7nmo6c4toqxne";

      // Create and upload new metadata
      const metadata = {
        name: `${tier.name} Access Token`,
        description: `${tier.description} - Valid for ${tier.durationDays} days`,
        image: `ipfs://${imageHash}`,
        attributes: [
          { trait_type: "Tier", value: tier.name },
          { trait_type: "Duration", value: `${tier.durationDays} days` },
          { trait_type: "Price", value: `${tier.priceETH} ETH` },
        ],
        group_id: "dstealth",
        group_name: tier.name,
        access_duration_days: Number(tier.durationDays),
        access_tier: tier.name,
        created_at: new Date().toISOString(),
        creator_address: account.address,
      };

      console.log(`📤 Uploading metadata to IPFS...`);
      const metadataHash = await ipfsHandler.uploadMetadata(metadata);
      const metadataURI = `ipfs://${metadataHash}`;
      
      console.log(`✅ Metadata uploaded: ${metadataURI}`);

      // Update the tier with new metadata
      console.log(`🔄 Updating contract with new metadata...`);
      
      const hash = await contract.write.setupAccessTier([
        BigInt(tokenId),
        tier.durationDays,
        tier.priceETH,
        tier.name,
        tier.description,
        imageHash,
        metadataURI
      ]);

      console.log(`⏳ Transaction sent: ${hash}`);
      
      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === "success") {
        console.log(`✅ Token ${tokenId} metadata fixed successfully!`);
        console.log(`🔗 Transaction: https://basescan.org/tx/${hash}`);
      } else {
        console.log(`❌ Transaction failed for token ${tokenId}`);
      }

      console.log(""); // Empty line for readability
      
      // Wait a bit between transactions
      if (tokenIds.indexOf(tokenId) < tokenIds.length - 1) {
        console.log("⏳ Waiting 5 seconds before next transaction...\n");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

    } catch (error) {
      console.error(`❌ Error fixing token ${tokenId}:`, error.message);
      console.log(""); // Empty line for readability
    }
  }

  console.log("🎉 Metadata fix complete!");
  console.log("\n💡 Next steps:");
  console.log("1. Wait a few minutes for blockchain confirmation");
  console.log("2. Go to OpenSea and click 'Refresh Metadata' on your NFTs");
  console.log("3. Images and attributes should now display correctly!");
}

// Run the script
fixExistingMetadata().catch(console.error);






