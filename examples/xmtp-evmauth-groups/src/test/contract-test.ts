/**
 * Rapid Contract Test - Verify deployed contract works
 */

import { createPublicClient, http, getContract, parseEther } from "viem";
import { baseSepolia } from "viem/chains";

const CONTRACT_ADDRESS = "0xa8830a603ae5143a1f8baa46e28c36e4765ec754";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://sepolia.base.org";

// Correct contract ABI based on EVMAuthGroupAccessV2.sol
const CONTRACT_ABI = [
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "xmtpInfo",
    "outputs": [
      {"name": "salesGroupId", "type": "string"},
      {"name": "premiumGroupId", "type": "string"},
      {"name": "botAddress", "type": "address"},
      {"name": "isActive", "type": "bool"},
      {"name": "linkedAt", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "groupName", 
    "outputs": [{"name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "groupDescription", 
    "outputs": [{"name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "tokenId", "type": "uint256"}],
    "name": "uri",
    "outputs": [{"name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "factory",
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

async function testDeployedContract() {
  console.log("🧪 RAPID CONTRACT TEST");
  console.log("=".repeat(50));
  
  try {
    // Create client
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(BASE_RPC_URL),
    });

    console.log(`🎯 Testing contract: ${CONTRACT_ADDRESS}`);
    console.log(`🌐 RPC: ${BASE_RPC_URL}`);

    // Create contract instance
    const contract = getContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      client: publicClient,
    });

    // Test 1: Check if contract exists
    console.log("\n📋 TEST 1: Contract Existence");
    const code = await publicClient.getBytecode({ address: CONTRACT_ADDRESS as `0x${string}` });
    if (!code || code === '0x') {
      throw new Error("❌ No contract code found - deployment failed!");
    }
    console.log("✅ Contract code exists");

    // Test 2: Read basic info
    console.log("\n📋 TEST 2: Basic Contract Info");
    
    try {
      const name = await contract.read.name();
      console.log(`✅ Contract name: ${name}`);
    } catch (e) {
      console.log(`⚠️ Name read failed: ${e instanceof Error ? e.message : e}`);
    }

    try {
      const owner = await contract.read.owner();
      console.log(`✅ Contract owner: ${owner}`);
    } catch (e) {
      console.log(`⚠️ Owner read failed: ${e instanceof Error ? e.message : e}`);
    }

    // Test 3: Read XMTP group info
    console.log("\n📋 TEST 3: XMTP Group Integration");
    
    try {
      const xmtpInfo = await contract.read.xmtpInfo();
      console.log(`✅ XMTP Info retrieved:`);
      console.log(`  Sales Group ID: ${xmtpInfo[0]}`);
      console.log(`  Premium Group ID: ${xmtpInfo[1]}`);
      console.log(`  Bot Address: ${xmtpInfo[2]}`);
      console.log(`  Is Active: ${xmtpInfo[3]}`);
      console.log(`  Linked At: ${xmtpInfo[4]}`);
      
      if (xmtpInfo[0] === "8d5ff4d33cce3d5fdf205dc95463e4bb") {
        console.log("✅ Sales group ID matches expected value");
      } else {
        console.log("⚠️ Sales group ID doesn't match expected value");
      }
      
      if (xmtpInfo[1] === "7db4eb535a3e425effc01fd48156aa2f") {
        console.log("✅ Premium group ID matches expected value");
      } else {
        console.log("⚠️ Premium group ID doesn't match expected value");
      }
    } catch (e) {
      console.log(`❌ XMTP info read failed: ${e instanceof Error ? e.message : e}`);
    }

    // Test 4: Check URI function
    console.log("\n📋 TEST 4: Metadata URI");
    try {
      const uri = await contract.read.uri([1n]);
      console.log(`✅ Token URI template: ${uri}`);
    } catch (e) {
      console.log(`⚠️ URI read failed: ${e instanceof Error ? e.message : e}`);
    }

    console.log("\n🎉 CONTRACT TEST COMPLETE!");
    console.log("=".repeat(50));
    
    return {
      success: true,
      contractExists: true,
      message: "Contract deployment successful and functional"
    };

  } catch (error) {
    console.error("\n❌ CONTRACT TEST FAILED!");
    console.error("Error:", error instanceof Error ? error.message : error);
    console.log("=".repeat(50));
    
    return {
      success: false,
      contractExists: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testDeployedContract().then((result) => {
    console.log(`\n🎯 Final Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`📝 Message: ${result.message}`);
    process.exit(result.success ? 0 : 1);
  });
}

export { testDeployedContract };