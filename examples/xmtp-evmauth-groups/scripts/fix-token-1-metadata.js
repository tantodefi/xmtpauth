#!/usr/bin/env node
import { createSigner, getEncryptionKeyFromHex } from "@helpers/client";
import { Client } from "@xmtp/node-sdk";
import dotenv from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getContract,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

// Load environment variables
dotenv.config();

const WALLET_KEY = process.env.WALLET_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const XMTP_ENV = process.env.XMTP_ENV || "production";
const CONTRACT_ADDRESS = "0x602cA984D7f9C693b6061C8AaE072D6B553b0Aff";
const DEFAULT_IMAGE_HASH =
  "bafkreies7jntbufslrlq7524ahrrtjmwssarm3ni3zmbg7nmo6c4toqxne";

if (!WALLET_KEY || !ENCRYPTION_KEY) {
  console.error(
    "❌ WALLET_KEY and ENCRYPTION_KEY environment variables are required",
  );
  process.exit(1);
}

// Get XMTP group image
async function getXMTPGroupImage() {
  try {
    console.log("🔍 Connecting to XMTP to get group image...");

    const signer = createSigner(WALLET_KEY);
    const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);

    const client = await Client.create(signer, {
      dbEncryptionKey,
      env: XMTP_ENV,
    });

    await client.conversations.sync();
    const conversations = await client.conversations.list();

    // Find the dstealth premium group (priority) or sales group
    let premiumGroup = null;
    let salesGroup = null;

    for (const conv of conversations) {
      if (conv.name && conv.name.toLowerCase().includes("dstealth")) {
        console.log(`📍 Found group: ${conv.name} (ID: ${conv.id})`);

        // Prioritize premium group for image
        if (
          conv.name.includes("💎") ||
          conv.name.toLowerCase().includes("premium")
        ) {
          premiumGroup = conv;
          console.log(`🏆 Premium group found: ${conv.name}`);
        } else if (
          conv.name.includes("🏪") ||
          conv.name.toLowerCase().includes("sales")
        ) {
          salesGroup = conv;
          console.log(`🏪 Sales group found: ${conv.name}`);
        }

        if (conv.imageUrl) {
          console.log(`🖼️ Group image URL: ${conv.imageUrl}`);

          // Check for real IPFS URLs (not placeholder)
          if (
            conv.imageUrl.startsWith("ipfs://") &&
            !conv.imageUrl.includes("placeholder")
          ) {
            const imageHash = conv.imageUrl.replace("ipfs://", "");
            console.log(
              `✅ Using real IPFS image from ${conv.name}: ${imageHash}`,
            );
            return imageHash;
          } else if (
            conv.imageUrl.startsWith("https://") &&
            conv.imageUrl.includes("ipfs")
          ) {
            // Handle gateway URLs like https://gateway.pinata.cloud/ipfs/QmXXX
            const ipfsMatch = conv.imageUrl.match(/ipfs\/([a-zA-Z0-9]+)/);
            if (ipfsMatch) {
              const imageHash = ipfsMatch[1];
              console.log(`✅ Using IPFS image from gateway URL: ${imageHash}`);
              return imageHash;
            }
          }
        }
      }
    }

    // If no real IPFS image found, check if we have group IDs to work with
    const targetGroup = premiumGroup || salesGroup;
    if (targetGroup) {
      console.log(
        `🎯 Using group: ${targetGroup.name} (ID: ${targetGroup.id})`,
      );
      console.log(`📋 Group image URL: ${targetGroup.imageUrl || "None"}`);

      // TODO: Could upload the group's current image to IPFS here
      // For now, using default but logging the group info
      console.log(
        `💡 Consider updating ${targetGroup.name} to use an IPFS image`,
      );
    }

    console.log("⚠️ No XMTP group image found, using default");
    return DEFAULT_IMAGE_HASH;
  } catch (error) {
    console.error("❌ Error getting XMTP group image:", error.message);
    console.log("⚠️ Using default image hash");
    return DEFAULT_IMAGE_HASH;
  }
}

// Simple metadata upload to Pinata
async function uploadMetadataToIPFS(metadata) {
  const PINATA_JWT = process.env.PINATA_JWT;

  if (!PINATA_JWT) {
    console.log("⚠️ No PINATA_JWT found, using mock hash");
    return "QmXe14bDdEybt2XsKDUfGin8TaYcSSKbC2AaLszD8Hu9wH"; // Mock hash
  }

  try {
    const response = await fetch(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PINATA_JWT}`,
        },
        body: JSON.stringify({
          pinataContent: metadata,
          pinataMetadata: {
            name: "NFT Metadata",
            keyvalues: { type: "nft-metadata" },
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.IpfsHash;
  } catch (error) {
    console.error("Failed to upload to IPFS:", error);
    return "QmXe14bDdEybt2XsKDUfGin8TaYcSSKbC2AaLszD8Hu9wH"; // Fallback
  }
}

async function fixToken1Metadata() {
  console.log("🔧 Fixing Token ID 1 metadata for OpenSea...\n");

  // Setup clients
  const account = privateKeyToAccount(WALLET_KEY);
  const publicClient = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  console.log(`📋 Contract: ${CONTRACT_ADDRESS}`);
  console.log(`👤 Agent: ${account.address}`);
  console.log(`🎯 Fixing Token ID 1 metadata\n`);

  // Check current state
  try {
    const balance = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: [
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
      ],
      functionName: "balanceOf",
      args: [account.address, 1n],
    });

    console.log(`📊 Current Token 1 balance: ${balance}`);

    if (balance === 0n) {
      console.log("❌ Agent has no Token 1 balance - nothing to fix");
      return;
    }
  } catch (error) {
    console.error("❌ Error checking balance:", error.message);
    return;
  }

  // Get the XMTP group image
  console.log("🖼️ Getting XMTP group image...");
  const imageHash = await getXMTPGroupImage();

  // Create metadata for Token 1 using XMTP group image
  const metadata = {
    name: "dstealth Trial Access Token",
    description:
      "Trial access to dstealth premium community - Valid for 7 days",
    image: `ipfs://${imageHash}`,
    attributes: [
      { trait_type: "Community", value: "dstealth" },
      { trait_type: "Tier", value: "Trial" },
      { trait_type: "Duration", value: "7 days" },
      { trait_type: "Type", value: "Trial Access" },
      {
        trait_type: "Image Source",
        value: imageHash === DEFAULT_IMAGE_HASH ? "Default" : "XMTP Group",
      },
    ],
    group_id: "dstealth",
    group_name: "Trial",
    access_duration_days: 7,
    access_tier: "Trial",
    created_at: new Date().toISOString(),
    creator_address: account.address,
  };

  console.log("📤 Uploading metadata to IPFS...");
  console.log(`🖼️ Using image: ipfs://${imageHash}`);
  const metadataHash = await uploadMetadataToIPFS(metadata);
  const metadataURI = `ipfs://${metadataHash}`;
  console.log(`✅ Metadata uploaded: ${metadataURI}`);

  // Call setupAccessTier for Token ID 1
  console.log("🔄 Setting up Token ID 1 tier configuration...");

  try {
    const data = encodeFunctionData({
      abi: [
        {
          inputs: [
            { name: "tokenId", type: "uint256" },
            { name: "durationDays", type: "uint256" },
            { name: "priceETH", type: "uint256" },
            { name: "tierName", type: "string" },
            { name: "tierDescription", type: "string" },
            { name: "imageIPFSHash", type: "string" },
            { name: "metadataURI", type: "string" },
          ],
          name: "setupAccessTier",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function",
        },
      ],
      functionName: "setupAccessTier",
      args: [
        1n, // tokenId
        7n, // durationDays
        0n, // priceETH (free trial)
        "Trial Access",
        "7-day trial access to dstealth premium community",
        imageHash,
        metadataURI,
      ],
    });

    // Send transaction
    const hash = await walletClient.sendTransaction({
      to: CONTRACT_ADDRESS,
      data,
      value: 0n,
    });

    console.log(`⏳ Transaction sent: ${hash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === "success") {
      console.log(`✅ Token ID 1 metadata fixed successfully!`);
      console.log(`🔗 Transaction: https://basescan.org/tx/${hash}`);
      console.log(
        `🖼️ OpenSea: https://opensea.io/assets/base/${CONTRACT_ADDRESS}/1`,
      );
      console.log(`\n💡 Wait 5-10 minutes, then refresh metadata on OpenSea`);
    } else {
      console.log(`❌ Transaction failed`);
    }
  } catch (error) {
    console.error("❌ Error setting up tier:", error.message);
  }
}

// Run the script
fixToken1Metadata().catch(console.error);
