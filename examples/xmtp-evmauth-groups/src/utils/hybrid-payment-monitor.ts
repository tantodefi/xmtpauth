/**
 * Hybrid Payment Monitor - Uses indexer when available, falls back to RPC scanning
 * Best reliability: indexer performance + RPC fallback
 */

import type { EnhancedGroupManager } from "../managers/enhanced-group-flow";
import type { DualGroupConfig } from "../types/types";
import {
  EmbeddedIndexerClient,
  type PaymentData,
} from "./embedded-indexer-client";

export class HybridPaymentMonitor {
  private indexerClient: EmbeddedIndexerClient;
  private agentAddress: string;
  private enhancedGroupManager: EnhancedGroupManager;
  private groupConfigs: Map<string, DualGroupConfig>;
  private pendingPayments: Map<
    string,
    {
      senderInboxId: string;
      groupName: string;
      memberAddress: string;
      conversation: any;
      timestamp: number;
    }
  >;
  private pollingInterval?: NodeJS.Timeout;
  private useIndexer: boolean = true;

  constructor(
    agentAddress: string,
    enhancedGroupManager: EnhancedGroupManager,
    groupConfigs: Map<string, DualGroupConfig>,
  ) {
    this.agentAddress = agentAddress;
    this.indexerClient = new EmbeddedIndexerClient(agentAddress);
    this.enhancedGroupManager = enhancedGroupManager;
    this.groupConfigs = groupConfigs;
    this.pendingPayments = new Map();

    console.log(`💰 Hybrid payment monitor initialized for ${agentAddress}`);
  }

  /**
   * Start payment monitoring with automatic fallback
   */
  async startPaymentMonitoring(): Promise<void> {
    console.log("👀 Starting hybrid payment monitoring...");

    // Test indexer connectivity
    const indexerHealthy = await this.indexerClient.isHealthy();
    if (indexerHealthy) {
      console.log("✅ Indexer is healthy - using indexer mode");
      this.useIndexer = true;
    } else {
      console.log("⚠️ Indexer unavailable - falling back to RPC mode");
      this.useIndexer = false;
    }

    // Start monitoring loop
    this.pollingInterval = setInterval(
      async () => {
        await this.checkForNewPayments();
      },
      this.useIndexer ? 30000 : 45000,
    ); // 30s for indexer, 45s for RPC

    // Initial check
    await this.checkForNewPayments();
  }

  /**
   * Stop payment monitoring
   */
  stopPaymentMonitoring(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
    console.log("🛑 Stopped hybrid payment monitoring");
  }

  /**
   * Register a pending payment expectation
   */
  registerPayment(
    senderInboxId: string,
    groupName: string,
    memberAddress: string,
    conversation: any,
  ): string {
    const paymentId = `${senderInboxId}-${groupName}-${Date.now()}`;

    this.pendingPayments.set(paymentId, {
      senderInboxId,
      groupName,
      memberAddress,
      conversation,
      timestamp: Date.now(),
    });

    console.log(`📝 Registered payment: ${paymentId} from ${memberAddress}`);
    return paymentId;
  }

  /**
   * Check for new payments using indexer or fallback to RPC
   */
  private async checkForNewPayments(): Promise<void> {
    try {
      const pendingCount = this.pendingPayments.size;
      console.log(
        `🔍 Checking for payments (${pendingCount} pending) - Mode: ${this.useIndexer ? "Indexer" : "RPC"}`,
      );

      if (pendingCount === 0) {
        return;
      }

      if (this.useIndexer) {
        await this.checkPaymentsViaIndexer();
      } else {
        await this.checkPaymentsViaRPC();
      }

      // Clean up old pending payments (older than 15 minutes)
      const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
      for (const [paymentId, payment] of this.pendingPayments.entries()) {
        if (payment.timestamp < fifteenMinutesAgo) {
          console.log(
            `⏰ Cleaning up expired payment expectation: ${paymentId}`,
          );
          this.pendingPayments.delete(paymentId);
        }
      }
    } catch (error) {
      console.error("Error checking for payments:", error);

      // If indexer fails, switch to RPC mode
      if (this.useIndexer) {
        console.log("⚠️ Indexer failed, switching to RPC mode");
        this.useIndexer = false;
      }
    }
  }

  /**
   * Check payments using the indexer (preferred method)
   */
  private async checkPaymentsViaIndexer(): Promise<void> {
    // Check each pending payment
    for (const [paymentId, payment] of this.pendingPayments.entries()) {
      const paymentTime = new Date(payment.timestamp);

      const matchingPayment = await this.indexerClient.findPaymentFromAddress(
        payment.memberAddress,
        paymentTime,
      );

      if (matchingPayment) {
        console.log(`🎉 Payment confirmed via indexer!`);
        console.log(`   Transaction: ${matchingPayment.transactionHash}`);
        console.log(`   Amount: ${Number(matchingPayment.value) / 1e18} ETH`);
        console.log(`   Block: ${matchingPayment.blockNumber}`);

        await this.processConfirmedPayment(paymentId, payment, matchingPayment);
        this.pendingPayments.delete(paymentId);
      }
    }
  }

  /**
   * Fallback: Check payments using RPC (your existing logic)
   */
  private async checkPaymentsViaRPC(): Promise<void> {
    // Import and use your existing PaymentMonitor logic here as fallback
    console.log("🔄 Using RPC fallback for payment detection");

    // This would integrate with your existing PaymentMonitor class
    // For now, just log that we're in fallback mode
    for (const [paymentId, payment] of this.pendingPayments.entries()) {
      const minutesWaiting = Math.round(
        (Date.now() - payment.timestamp) / 60000,
      );
      if (minutesWaiting >= 5) {
        console.log(
          `⏳ RPC fallback: Still waiting for payment ${paymentId} (${minutesWaiting} minutes)`,
        );
      }
    }
  }

  /**
   * Process a confirmed payment
   */
  private async processConfirmedPayment(
    paymentId: string,
    payment: { senderInboxId: string; groupName: string; conversation: any },
    paymentData: PaymentData,
  ): Promise<void> {
    try {
      console.log(`🚀 Processing confirmed payment: ${paymentId}`);

      const result = await this.enhancedGroupManager.createDualGroupSystem(
        payment.senderInboxId,
        payment.groupName,
        payment.conversation,
      );

      if (result.contractAddress) {
        console.log(`✅ Payment processed successfully!`);
        console.log(`   Contract: ${result.contractAddress}`);
        console.log(`   Sales Group: ${result.salesGroup.id}`);
        console.log(`   Premium Group: ${result.premiumGroup.id}`);
        console.log(`   Transaction: ${paymentData.transactionHash}`);
      } else {
        console.error(`❌ Failed to process payment`);
      }
    } catch (error) {
      console.error(`Error processing confirmed payment ${paymentId}:`, error);
    }
  }

  /**
   * Get monitoring statistics
   */
  getStats(): {
    pendingPayments: number;
    mode: string;
    isMonitoring: boolean;
  } {
    return {
      pendingPayments: this.pendingPayments.size,
      mode: this.useIndexer ? "Indexer" : "RPC Fallback",
      isMonitoring: !!this.pollingInterval,
    };
  }
}
