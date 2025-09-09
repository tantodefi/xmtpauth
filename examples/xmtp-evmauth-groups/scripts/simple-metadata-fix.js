#!/usr/bin/env node
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const CONTRACT_ADDRESS = "0x602cA984D7f9C693b6061C8AaE072D6B553b0Aff";

// Simple contract ABI for reading token data
const CONTRACT_ABI = [
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
];

async function checkContractTiers() {
  console.log("🔍 Checking existing tiers in the contract...\n");

  const client = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  console.log(`📋 Contract: ${CONTRACT_ADDRESS}\n`);

  // Check token IDs 1-10
  let foundTiers = 0;
  for (let tokenId = 1; tokenId <= 10; tokenId++) {
    try {
      const tier = await client.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "getAccessTier",
        args: [BigInt(tokenId)],
      });

      if (tier.isActive) {
        foundTiers++;
        console.log(`✅ Token ${tokenId}: ${tier.name}`);
        console.log(`   Description: ${tier.description}`);
        console.log(`   Duration: ${tier.durationDays.toString()} days`);
        console.log(`   Price ETH: ${tier.priceETH.toString()}`);
        console.log(`   Price USDC: ${tier.priceUSDC.toString()}`);
        console.log(`   Image Hash: ${tier.imageIPFSHash || "❌ EMPTY"}`);
        console.log(
          `   Metadata URI: ${tier.metadataURI || "❌ EMPTY - NEEDS FIXING!"}`,
        );
        console.log(`   Status: ${tier.isActive ? "Active" : "Inactive"}`);
        console.log("");
      }
    } catch (error) {
      // Token doesn't exist, skip
    }
  }

  if (foundTiers === 0) {
    console.log("⚠️ No active tiers found in the contract.");
    console.log("💡 This might mean:");
    console.log("   1. No tiers have been set up yet");
    console.log("   2. The contract address is incorrect");
    console.log("   3. The contract hasn't been deployed");
    console.log("\n🔧 Try running '/setup-tiers' in the agent first.");
  } else {
    console.log(`📊 Found ${foundTiers} active tiers`);

    if (foundTiers > 0) {
      console.log("\n💡 Next steps:");
      console.log(
        "1. The startup recovery system will automatically fix empty metadata",
      );
      console.log("2. Deploy the enhanced agent to production");
      console.log("3. The recovery system runs every 30 minutes");
      console.log("4. Check OpenSea after metadata is fixed");
    }
  }
}

// Run the check
checkContractTiers().catch(console.error);








