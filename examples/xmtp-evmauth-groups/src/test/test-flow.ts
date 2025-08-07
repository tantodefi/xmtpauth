/**
 * Test flow for end-to-end XMTP EVMAuth Groups functionality
 */

import type { Client } from "@xmtp/node-sdk";
import type { EnhancedGroupManager } from "../managers/enhanced-group-flow";
import type { EventDrivenAccessManager } from "../handlers/event-driven-access";
import type { RecoveryManager } from "../managers/recovery-mechanisms";
import type { DualGroupConfig } from "../types/types";

export class TestFlowManager {
  private client: Client;
  private enhancedGroupManager: EnhancedGroupManager;
  private eventAccessManager: EventDrivenAccessManager;
  private recoveryManager: RecoveryManager;
  private groupConfigs: Map<string, DualGroupConfig>;

  constructor(
    client: Client,
    enhancedGroupManager: EnhancedGroupManager,
    eventAccessManager: EventDrivenAccessManager,
    recoveryManager: RecoveryManager,
    groupConfigs: Map<string, DualGroupConfig>
  ) {
    this.client = client;
    this.enhancedGroupManager = enhancedGroupManager;
    this.eventAccessManager = eventAccessManager;
    this.recoveryManager = recoveryManager;
    this.groupConfigs = groupConfigs;
  }

  /**
   * Run complete end-to-end test
   */
  async runCompleteTest(): Promise<{
    success: boolean;
    results: {
      groupCreation: boolean;
      tierSetup: boolean;
      membershipManagement: boolean;
      eventListening: boolean;
      recovery: boolean;
    };
    errors: string[];
  }> {
    console.log("🧪 Starting complete end-to-end test...");
    
    const results = {
      groupCreation: false,
      tierSetup: false,
      membershipManagement: false,
      eventListening: false,
      recovery: false,
    };
    
    const errors: string[] = [];

    try {
      // Test 1: Group Creation
      console.log("1️⃣ Testing group creation...");
      const groupResult = await this.testGroupCreation();
      results.groupCreation = groupResult.success;
      if (!groupResult.success) {
        errors.push(`Group creation: ${groupResult.error}`);
      }

      // Test 2: Tier Setup
      console.log("2️⃣ Testing tier setup...");
      const tierResult = await this.testTierSetup(groupResult.contractAddress);
      results.tierSetup = tierResult.success;
      if (!tierResult.success) {
        errors.push(`Tier setup: ${tierResult.error}`);
      }

      // Test 3: Membership Management
      console.log("3️⃣ Testing membership management...");
      const membershipResult = await this.testMembershipManagement(groupResult.contractAddress);
      results.membershipManagement = membershipResult.success;
      if (!membershipResult.success) {
        errors.push(`Membership management: ${membershipResult.error}`);
      }

      // Test 4: Event Listening
      console.log("4️⃣ Testing event listening...");
      const eventResult = await this.testEventListening(groupResult.contractAddress);
      results.eventListening = eventResult.success;
      if (!eventResult.success) {
        errors.push(`Event listening: ${eventResult.error}`);
      }

      // Test 5: Recovery Mechanisms
      console.log("5️⃣ Testing recovery mechanisms...");
      const recoveryResult = await this.testRecoveryMechanisms();
      results.recovery = recoveryResult.success;
      if (!recoveryResult.success) {
        errors.push(`Recovery: ${recoveryResult.error}`);
      }

    } catch (error) {
      errors.push(`Test framework error: ${error}`);
    }

    const success = Object.values(results).every(result => result === true);
    
    console.log("🧪 Test Results:");
    console.log(`  Group Creation: ${results.groupCreation ? '✅' : '❌'}`);
    console.log(`  Tier Setup: ${results.tierSetup ? '✅' : '❌'}`);
    console.log(`  Membership Management: ${results.membershipManagement ? '✅' : '❌'}`);
    console.log(`  Event Listening: ${results.eventListening ? '✅' : '❌'}`);
    console.log(`  Recovery: ${results.recovery ? '✅' : '❌'}`);
    console.log(`  Overall: ${success ? '🎉 SUCCESS' : '❌ FAILED'}`);

    if (errors.length > 0) {
      console.log("🐛 Errors:");
      errors.forEach(error => console.log(`  - ${error}`));
    }

    return { success, results, errors };
  }

  /**
   * Test group creation functionality
   */
  private async testGroupCreation(): Promise<{ success: boolean; error?: string; contractAddress?: string }> {
    try {
      const result = await this.enhancedGroupManager.createDualGroupSystem(
        "Test Community",
        this.client.inboxId,
        "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Test wallet address
        {
          name: "Test Community",
          description: "Test community for automated testing",
          image: "https://example.com/test.png",
        }
      );

      // Store in group configs for other tests
      this.groupConfigs.set(result.contractAddress, result.groupConfig);

      // Verify groups were created
      const salesGroup = await this.client.conversations.getConversationById(result.salesGroup.id);
      const premiumGroup = await this.client.conversations.getConversationById(result.premiumGroup.id);

      if (!salesGroup || !premiumGroup) {
        return { success: false, error: "Groups not found after creation" };
      }

      return { success: true, contractAddress: result.contractAddress };

    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Test tier setup functionality
   */
  private async testTierSetup(contractAddress?: string): Promise<{ success: boolean; error?: string }> {
    if (!contractAddress) {
      return { success: false, error: "No contract address provided" };
    }

    try {
      const config = this.groupConfigs.get(contractAddress);
      if (!config) {
        return { success: false, error: "Group config not found" };
      }

      // Mock tier setup (in real implementation, this would go through the interactive process)
      const testTiers = [
        {
          id: "test-basic",
          name: "Test Basic",
          durationDays: 7,
          priceWei: "5000000", // 5 USDC
          priceUSD: 5,
          description: "7 days test access",
          paymentToken: "USDC" as const,
        }
      ];

      await this.enhancedGroupManager.updateGroupConfig(contractAddress, testTiers);

      return { success: true };

    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Test membership management
   */
  private async testMembershipManagement(contractAddress?: string): Promise<{ success: boolean; error?: string }> {
    if (!contractAddress) {
      return { success: false, error: "No contract address provided" };
    }

    try {
      // Test audit functionality
      const auditResults = await this.enhancedGroupManager.auditGroupMembership(contractAddress);
      
      // Should return valid structure even if empty
      if (!auditResults || typeof auditResults.validMembers === 'undefined') {
        return { success: false, error: "Invalid audit results structure" };
      }

      return { success: true };

    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Test event listening functionality
   */
  private async testEventListening(contractAddress?: string): Promise<{ success: boolean; error?: string }> {
    if (!contractAddress) {
      return { success: false, error: "No contract address provided" };
    }

    try {
      // Test that event listener is active
      const isActive = this.eventAccessManager.isEventListenerActive();
      if (!isActive) {
        return { success: false, error: "Event listener not active" };
      }

      // Test processing a mock event
      const config = this.groupConfigs.get(contractAddress);
      if (!config) {
        return { success: false, error: "Group config not found" };
      }

      await this.eventAccessManager.processTestEvent(
        'UserAccessGranted',
        contractAddress,
        {
          user: '0x1234567890123456789012345678901234567890',
          userInboxId: 'test-inbox-id',
          tokenId: 1,
          expiresAt: Math.floor(Date.now() / 1000) + 86400, // 1 day from now
        }
      );

      return { success: true };

    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Test recovery mechanisms
   */
  private async testRecoveryMechanisms(): Promise<{ success: boolean; error?: string }> {
    try {
      // Test contract discovery
      const contractAddresses = await this.recoveryManager.discoverContractAddresses();
      
      // Should be able to discover at least some addresses (even if from env vars)
      if (!Array.isArray(contractAddresses)) {
        return { success: false, error: "Contract discovery returned invalid result" };
      }

      // Test health check
      const healthCheck = await this.recoveryManager.performHealthCheck(this.groupConfigs);
      
      if (!healthCheck || typeof healthCheck.healthy !== 'boolean') {
        return { success: false, error: "Health check returned invalid result" };
      }

      return { success: true };

    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Run stress test with multiple operations
   */
  async runStressTest(numGroups: number = 3): Promise<{ success: boolean; stats: any }> {
    console.log(`🔥 Running stress test with ${numGroups} groups...`);
    
    const stats = {
      groupsCreated: 0,
      tiersConfigured: 0,
      membershipAudits: 0,
      errors: 0,
    };

    try {
      // Create multiple groups concurrently
      const groupPromises = Array.from({ length: numGroups }, (_, i) =>
        this.enhancedGroupManager.createDualGroupSystem(
          `Stress Test Group ${i + 1}`,
          this.client.inboxId,
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Test wallet address
          {
            name: `Stress Test Group ${i + 1}`,
            description: `Stress test group number ${i + 1}`,
            image: `https://example.com/stress-${i + 1}.png`,
          }
        ).then(result => {
          this.groupConfigs.set(result.contractAddress, result.groupConfig);
          stats.groupsCreated++;
          return result;
        }).catch(error => {
          stats.errors++;
          console.error(`Error creating group ${i + 1}:`, error);
          return null;
        })
      );

      const groupResults = await Promise.all(groupPromises);
      const successfulGroups = groupResults.filter(result => result !== null);

      // Configure tiers for each successful group
      for (const result of successfulGroups) {
        try {
          const testTiers = [
            {
              id: `stress-tier-${Math.random().toString(36).substr(2, 9)}`,
              name: "Stress Test Tier",
              durationDays: 7,
              priceWei: "1000000", // 1 USDC
              priceUSD: 1,
              description: "Stress test tier",
              paymentToken: "USDC" as const,
            }
          ];

          await this.enhancedGroupManager.updateGroupConfig(result!.contractAddress, testTiers);
          stats.tiersConfigured++;
        } catch (error) {
          stats.errors++;
          console.error("Error configuring tiers:", error);
        }
      }

      // Run membership audits
      for (const [contractAddress] of this.groupConfigs.entries()) {
        try {
          await this.enhancedGroupManager.auditGroupMembership(contractAddress);
          stats.membershipAudits++;
        } catch (error) {
          stats.errors++;
          console.error("Error in membership audit:", error);
        }
      }

      const success = stats.errors === 0 && stats.groupsCreated === numGroups;
      
      console.log("🔥 Stress Test Results:");
      console.log(`  Groups Created: ${stats.groupsCreated}/${numGroups}`);
      console.log(`  Tiers Configured: ${stats.tiersConfigured}/${stats.groupsCreated}`);
      console.log(`  Membership Audits: ${stats.membershipAudits}`);
      console.log(`  Errors: ${stats.errors}`);
      console.log(`  Success: ${success ? '✅' : '❌'}`);

      return { success, stats };

    } catch (error) {
      console.error("Stress test failed:", error);
      return { success: false, stats };
    }
  }
}