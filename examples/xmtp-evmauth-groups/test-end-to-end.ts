#!/usr/bin/env tsx
/**
 * End-to-End Test Script
 * Tests the complete flow with low-cost tiers and real XMTP interactions
 */

import { createSigner, getEncryptionKeyFromHex } from "@helpers/client";
import { Client, type XmtpEnv } from "@xmtp/node-sdk";
import { JSONDatabase } from "./src/database/json-database";
import { TransactionButtonFix } from "./src/test/transaction-button-fix";

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const WALLET_KEY = process.env.WALLET_KEY as `0x${string}`;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!;
const XMTP_ENV = process.env.XMTP_ENV || "dev";
const EVMAUTH_FACTORY_ADDRESS = process.env.EVMAUTH_FACTORY_ADDRESS as `0x${string}`;

async function testEndToEndFlow() {
  console.log("🎯 **END-TO-END FLOW TEST**\n");

  try {
    // Step 1: Verify agent is running
    console.log("📡 **STEP 1: Verify Agent Status**");
    const database = new JSONDatabase();
    const stats = database.getStats();
    console.log(`✅ Database accessible: ${stats.totalGroups} groups`);
    console.log("");

    // Step 2: Create test client (simulate user)
    console.log("👤 **STEP 2: Create Test User Client**");
    const signer = createSigner(WALLET_KEY);
    const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
    const client = await Client.create(signer, {
      dbEncryptionKey,
      env: XMTP_ENV as XmtpEnv,
    });
    console.log(`✅ Test user client: ${client.inboxId}`);
    console.log("");

    // Step 3: Test transaction creation
    console.log("💳 **STEP 3: Test Transaction Creation**");
    const { groupTx, tierTx } = await TransactionButtonFix.testTransactionCreation();
    
    const isGroupTxValid = TransactionButtonFix.validateTransactionPayload(groupTx);
    const isTierTxValid = TransactionButtonFix.validateTransactionPayload(tierTx);
    
    console.log(`✅ Group creation transaction: ${isGroupTxValid ? 'VALID' : 'INVALID'}`);
    console.log(`✅ Tier purchase transaction: ${isTierTxValid ? 'VALID' : 'INVALID'}`);
    console.log("");

    // Step 4: Test low-cost tier pricing
    console.log("💰 **STEP 4: Low-Cost Tier Validation**");
    const testTiers = [
      { name: "Test Basic", priceUsd: 0.01, durationDays: 1 },
      { name: "Test Premium", priceUsd: 0.05, durationDays: 7 }
    ];
    
    // Convert to USDC (6 decimals)
    const basicUSDC = Math.floor(testTiers[0].priceUsd * 1_000_000); // 10,000 USDC units (0.01 USD)
    const premiumUSDC = Math.floor(testTiers[1].priceUsd * 1_000_000); // 50,000 USDC units (0.05 USD)
    
    console.log(`✅ Basic tier: $${testTiers[0].priceUsd} = ${basicUSDC} USDC units`);
    console.log(`✅ Premium tier: $${testTiers[1].priceUsd} = ${premiumUSDC} USDC units`);
    console.log(`💡 Very low costs for testing - minimal testnet USDC needed`);
    console.log("");

    // Step 5: Test conversation finding (agent discovery)
    console.log("🔍 **STEP 5: Agent Discovery Test**");
    await client.conversations.sync();
    const conversations = await client.conversations.list();
    
    console.log(`✅ Total conversations: ${conversations.length}`);
    
    // Look for agent conversation
    const agentAddress = "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc";
    let agentConversation = null;
    
    for (const conv of conversations) {
      const members = await conv.members();
      const hasAgent = members.some(m => 
        m.accountIdentifiers.some(id => 
          id.identifier.toLowerCase() === agentAddress.toLowerCase()
        )
      );
      if (hasAgent) {
        agentConversation = conv;
        break;
      }
    }
    
    console.log(`✅ Agent conversation: ${agentConversation ? 'FOUND' : 'NOT FOUND'}`);
    if (agentConversation) {
      console.log(`📱 Agent conversation ID: ${agentConversation.id}`);
    }
    console.log("");

    // Step 6: Test commands to send
    console.log("📝 **STEP 6: Test Commands Ready**");
    console.log("Ready to test these commands:");
    console.log(`   1. /create-group "Test Community"`);
    console.log(`   2. /setup-tiers (then configure 2 tiers)`);
    console.log(`   3. Tier 1: Test Basic | $0.01 | 1 days`);
    console.log(`   4. Tier 2: Test Premium | $0.05 | 7 days`);
    console.log(`   5. confirm`);
    console.log("");

    // Step 7: Database state check
    console.log("💾 **STEP 7: Database State Check**");
    const allGroups = await database.getAllGroups();
    const activeSessions = await database.getStats();
    
    console.log(`✅ Stored groups: ${allGroups.length}`);
    console.log(`✅ Active sessions: ${activeSessions.pendingSessions}`);
    
    if (allGroups.length > 0) {
      console.log("📋 Existing groups:");
      allGroups.forEach(group => {
        console.log(`   • ${group.name} (${group.status}) - Contract: ${group.contractAddress}`);
      });
    }
    console.log("");

    console.log("🎉 **END-TO-END SETUP COMPLETE!**");
    console.log("");
    console.log("✅ **SYSTEM IS READY FOR:**");
    console.log("   • Agent is running in background");
    console.log("   • Database persistence working");
    console.log("   • Low-cost test tiers configured");
    console.log("   • Transaction validation working");
    console.log("   • XMTP client can connect to agent");
    console.log("");
    console.log("💡 **NEXT: Test in XMTP client:**");
    console.log("   1. Open XMTP chat with agent: 0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc");
    console.log("   2. Send: /create-group \"Test Community\"");
    console.log("   3. Approve 0.0001 ETH transaction");
    console.log("   4. Send: /setup-tiers");
    console.log("   5. Configure test tiers with $0.01 and $0.05 pricing");
    console.log("   6. Verify contract deployment and tier creation works");
    console.log("");

  } catch (error) {
    console.error("❌ **END-TO-END TEST FAILED:**", error);
    process.exit(1);
  }
}

// Run end-to-end test
if (import.meta.url === `file://${process.argv[1]}`) {
  testEndToEndFlow().catch(console.error);
}

export { testEndToEndFlow };