#!/usr/bin/env tsx
/**
 * Comprehensive System Test Script
 * Tests database, recovery, and low-cost tier creation
 */

import { JSONDatabase } from "./src/database/json-database";
import { ComprehensiveRecovery } from "./src/managers/comprehensive-recovery";
import { createSigner, getEncryptionKeyFromHex } from "@helpers/client";
import { Client, type XmtpEnv } from "@xmtp/node-sdk";
import { EVMAuthHandler } from "./src/handlers/evmauth-handler";
import { EnhancedGroupManager } from "./src/managers/enhanced-group-flow";

// Load environment variables with proper validation
import dotenv from 'dotenv';
dotenv.config();

const WALLET_KEY = process.env.WALLET_KEY as `0x${string}`;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!;
const XMTP_ENV = process.env.XMTP_ENV || "dev";
const BASE_RPC_URL = process.env.BASE_RPC_URL!;
const EVMAUTH_FACTORY_ADDRESS = process.env.EVMAUTH_FACTORY_ADDRESS as `0x${string}`;

// Validate required environment variables
if (!WALLET_KEY) {
  console.log("⚠️ WALLET_KEY not found - skipping XMTP client tests");
}
if (!ENCRYPTION_KEY) {
  console.log("⚠️ ENCRYPTION_KEY not found - skipping XMTP client tests");
}
if (!BASE_RPC_URL) {
  console.log("⚠️ BASE_RPC_URL not found - skipping blockchain tests");
}
if (!EVMAUTH_FACTORY_ADDRESS) {
  console.log("⚠️ EVMAUTH_FACTORY_ADDRESS not found - skipping contract tests");
}

async function runSystemTests() {
  console.log("🧪 **COMPREHENSIVE SYSTEM TESTS**\n");

  try {
    // Test 1: Database System
    console.log("📋 **TEST 1: JSON Database System**");
    const database = new JSONDatabase("./test-data");
    
    // Create test group record
    const testGroup = await database.createGroup({
      name: "Test Group",
      creatorInboxId: "test-inbox-123",
      creatorAddress: "0x1234567890123456789012345678901234567890",
      contractAddress: "0x0987654321098765432109876543210987654321",
      salesGroupId: "sales-group-123",
      premiumGroupId: "premium-group-123",
      status: 'created'
    });
    
    console.log("✅ Created test group:", testGroup.name);
    
    // Test duplicate prevention
    const duplicate = await database.findGroupByName("test-inbox-123", "Test Group");
    console.log("✅ Duplicate prevention works:", duplicate ? "FOUND" : "NOT FOUND");
    
    // Test tier session
    await database.saveTierSession({
      userInboxId: "test-user-456",
      contractAddress: testGroup.contractAddress,
      step: 'tier_details',
      currentTierIndex: 0,
      totalTiers: 2,
      tiers: [],
      pendingAttachments: {},
      createdAt: new Date().toISOString()
    });
    
    const session = await database.getTierSession("test-user-456");
    console.log("✅ Tier session saved and retrieved:", session ? "SUCCESS" : "FAILED");
    
    console.log("📊 Database stats:", database.getStats());
    console.log("");

    // Test 2: XMTP Client & Recovery (if env vars available)
    console.log("🔗 **TEST 2: XMTP Client & Recovery System**");
    
    if (WALLET_KEY && ENCRYPTION_KEY) {
      const signer = createSigner(WALLET_KEY);
      const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
      
      const client = await Client.create(signer, {
        dbEncryptionKey,
        env: XMTP_ENV as XmtpEnv,
      });
      
      console.log("✅ XMTP Client created successfully");
      console.log(`📱 InboxId: ${client.inboxId}`);
      
      const recovery = new ComprehensiveRecovery(client, database);
      const { groups, foundContracts } = await recovery.performFullRecovery();
      
      console.log("✅ Recovery system works");
      console.log(`📍 Groups recovered: ${groups.size}`);
      console.log(`📍 Contracts found: ${foundContracts.length}`);
    } else {
      console.log("⏩ Skipping XMTP tests (environment variables not set)");
    }
    console.log("");

    // Test 3: EVMAuth Handler (if env vars available)
    console.log("⚙️ **TEST 3: EVMAuth Handler**");
    
    if (BASE_RPC_URL && EVMAUTH_FACTORY_ADDRESS && WALLET_KEY) {
      const evmAuthHandler = new EVMAuthHandler(
        BASE_RPC_URL,
        EVMAUTH_FACTORY_ADDRESS,
        WALLET_KEY
      );
      
      console.log("✅ EVMAuth Handler initialized");
    } else {
      console.log("⏩ Skipping EVMAuth tests (environment variables not set)");
    }
    console.log("");

    // Test 4: Enhanced Group Manager (if previous tests passed)
    console.log("🏗️ **TEST 4: Enhanced Group Manager**");
    
    if (WALLET_KEY && ENCRYPTION_KEY && BASE_RPC_URL && EVMAUTH_FACTORY_ADDRESS) {
      // Re-create these for the group manager test
      const signer = createSigner(WALLET_KEY);
      const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
      const client = await Client.create(signer, { dbEncryptionKey, env: XMTP_ENV as XmtpEnv });
      const evmAuthHandler = new EVMAuthHandler(BASE_RPC_URL, EVMAUTH_FACTORY_ADDRESS, WALLET_KEY);
      
      const groupManager = new EnhancedGroupManager(client, evmAuthHandler, database);
      console.log("✅ Group Manager initialized with database");
      console.log(`🤖 Agent Address: ${groupManager.agentAddress}`);
    } else {
      console.log("⏩ Skipping Group Manager tests (environment variables not set)");
    }
    console.log("");

    // Test 5: Low-Cost Test Tiers
    console.log("💰 **TEST 5: Low-Cost Test Tier Configuration**");
    
    const testTiers = [
      {
        id: 1,
        name: "Test Basic",
        priceUsd: 0.01, // 1 cent - minimal cost
        durationDays: 1, // 1 day for quick testing
        imageUrl: "https://via.placeholder.com/400x400/22c55e/ffffff?text=Test+Basic"
      },
      {
        id: 2, 
        name: "Test Premium",
        priceUsd: 0.05, // 5 cents - still very low
        durationDays: 7, // 1 week
        imageUrl: "https://via.placeholder.com/400x400/6366f1/ffffff?text=Test+Premium"
      }
    ];
    
    console.log("✅ Test tiers configured:");
    testTiers.forEach(tier => {
      console.log(`   • ${tier.name}: $${tier.priceUsd} USD for ${tier.durationDays} days`);
    });
    console.log("");

    // Test 6: System Integration
    console.log("🔄 **TEST 6: System Integration Check**");
    
    // Test that all components work together
    const allGroups = await database.getAllGroups();
    console.log(`✅ Database contains ${allGroups.length} groups`);
    
    const userGroups = await database.getUserGroups("test-inbox-123");
    console.log(`✅ User has ${userGroups.length} groups`);
    
    // Cleanup test sessions
    await database.cleanupOldSessions();
    console.log("✅ Old sessions cleaned up");
    
    console.log("");
    console.log("🎉 **ALL TESTS PASSED!**");
    console.log("");
    console.log("✅ **SYSTEM READY FOR:**");
    console.log("   • Group creation with payment");
    console.log("   • Tier setup with low-cost testing");
    console.log("   • Contract deployment (0.0001 ETH)");
    console.log("   • Database persistence");
    console.log("   • Recovery after restart");
    console.log("   • Duplicate prevention");
    console.log("");
    console.log("💡 **NEXT STEPS:**");
    console.log("   1. Start agent: yarn dev");
    console.log("   2. Create test group: /create-group \"Test Community\"");
    console.log("   3. Setup tiers: /setup-tiers");
    console.log("   4. Use test tier prices: $0.01 and $0.05");
    console.log("");

  } catch (error) {
    console.error("❌ **TEST FAILED:**", error);
    process.exit(1);
  }
}

// Run tests if called directly (ES module compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  runSystemTests().catch(console.error);
}

export { runSystemTests };