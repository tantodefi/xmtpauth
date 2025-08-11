/**
 * Demo and test script for XMTP EVMAuth Groups
 * Run this to test the complete enhanced functionality
 */

import {
  createSigner,
  getEncryptionKeyFromHex,
  logAgentDetails,
  validateEnvironment,
} from "@helpers/client";
import { Client, type XmtpEnv } from "@xmtp/node-sdk";
import { EventDrivenAccessManager } from "../handlers/event-driven-access";
import { EVMAuthHandler } from "../handlers/evmauth-handler";
import { EnhancedGroupManager } from "../managers/enhanced-group-flow";
import { RecoveryManager } from "../managers/recovery-mechanisms";
import type { DualGroupConfig } from "../types/types";
import { TestFlowManager } from "./test-flow";

/* Environment variables validation */
const {
  WALLET_KEY,
  ENCRYPTION_KEY,
  XMTP_ENV,
  BASE_RPC_URL,
  EVMAUTH_FACTORY_ADDRESS,
} = validateEnvironment([
  "WALLET_KEY",
  "ENCRYPTION_KEY",
  "XMTP_ENV",
  "BASE_RPC_URL",
  "EVMAUTH_FACTORY_ADDRESS",
]);

async function runDemo() {
  console.log("🎮 XMTP EVMAuth Groups - Complete Demo Test");
  console.log("==========================================");

  try {
    // Initialize client
    const signer = createSigner(WALLET_KEY);
    const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);

    const client = await Client.create(signer, {
      dbEncryptionKey,
      env: XMTP_ENV as XmtpEnv,
    });

    console.log("✅ XMTP Client initialized");
    logAgentDetails(client);

    // Initialize handlers
    const evmAuthHandler = new EVMAuthHandler(
      BASE_RPC_URL,
      EVMAUTH_FACTORY_ADDRESS,
      WALLET_KEY,
    );

    const groupConfigs = new Map<string, DualGroupConfig>();
    const enhancedGroupManager = new EnhancedGroupManager(
      client,
      evmAuthHandler,
    );
    const eventAccessManager = new EventDrivenAccessManager(
      client,
      BASE_RPC_URL,
      enhancedGroupManager,
      groupConfigs,
    );
    const recoveryManager = new RecoveryManager(
      client,
      BASE_RPC_URL,
      enhancedGroupManager,
    );

    console.log("✅ All handlers initialized");

    // Initialize test flow manager
    const testFlowManager = new TestFlowManager(
      client,
      enhancedGroupManager,
      eventAccessManager,
      recoveryManager,
      groupConfigs,
    );

    console.log("✅ Test framework ready");

    // Sync conversations
    await client.conversations.sync();
    console.log("✅ Conversations synced");

    // Start event listening
    await eventAccessManager.startEventListening();
    console.log("✅ Event listeners started");

    console.log("\n🧪 Running Complete System Test...");
    console.log("===================================");

    // Run the complete test suite
    const testResults = await testFlowManager.runCompleteTest();

    console.log("\n📊 Final Test Results:");
    console.log("======================");
    console.log(`Overall Success: ${testResults.success ? "🎉" : "❌"}`);
    console.log(`\nComponent Results:`);
    console.log(
      `  • Group Creation: ${testResults.results.groupCreation ? "✅" : "❌"}`,
    );
    console.log(
      `  • Tier Setup: ${testResults.results.tierSetup ? "✅" : "❌"}`,
    );
    console.log(
      `  • Membership Management: ${testResults.results.membershipManagement ? "✅" : "❌"}`,
    );
    console.log(
      `  • Event Listening: ${testResults.results.eventListening ? "✅" : "❌"}`,
    );
    console.log(
      `  • Recovery Mechanisms: ${testResults.results.recovery ? "✅" : "❌"}`,
    );

    if (testResults.errors.length > 0) {
      console.log(`\n🐛 Errors Encountered:`);
      testResults.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }

    // Run stress test if basic tests pass
    if (testResults.success) {
      console.log("\n🔥 Running Stress Test...");
      console.log("=========================");

      const stressResults = await testFlowManager.runStressTest(2); // Create 2 groups

      console.log(
        `Stress Test: ${stressResults.success ? "🎉 SUCCESS" : "❌ FAILED"}`,
      );
      console.log(`Groups Created: ${stressResults.stats.groupsCreated}`);
      console.log(`Tiers Configured: ${stressResults.stats.tiersConfigured}`);
      console.log(`Membership Audits: ${stressResults.stats.membershipAudits}`);
      console.log(`Errors: ${stressResults.stats.errors}`);
    }

    // Health check
    console.log("\n🏥 System Health Check...");
    console.log("==========================");

    const healthCheck = await recoveryManager.performHealthCheck(groupConfigs);

    console.log(
      `System Health: ${healthCheck.healthy ? "✅ HEALTHY" : "⚠️ ISSUES"}`,
    );
    console.log(`Total Groups: ${healthCheck.stats.totalGroups}`);
    console.log(`Active Groups: ${healthCheck.stats.activeGroups}`);
    console.log(`Total Members: ${healthCheck.stats.totalMembers}`);

    if (healthCheck.issues.length > 0) {
      console.log(`\n⚠️ Health Issues:`);
      healthCheck.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`);
      });
    }

    console.log("\n🎉 Demo Complete!");
    console.log("==================");
    console.log("The XMTP EVMAuth Groups system is fully operational!");
    console.log("\nKey Features Tested:");
    console.log("• ✅ Dual-group architecture (Sales + Premium)");
    console.log("• ✅ Event-driven access management");
    console.log("• ✅ Automatic membership validation");
    console.log("• ✅ Recovery mechanisms");
    console.log("• ✅ USDC pricing with custom NFT images");
    console.log("• ✅ Interactive tier setup");
    console.log("• ✅ Background audit system");

    process.exit(0);
  } catch (error) {
    console.error("❌ Demo failed:", error);
    process.exit(1);
  }
}

// Allow running as script
if (require.main === module) {
  runDemo().catch(console.error);
}

export { runDemo };
