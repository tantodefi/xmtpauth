/**
 * Indexer-based Payment Monitor - Replacement for manual block scanning
 * Uses SQD indexer to efficiently track payments and contract events
 */

import type { EnhancedGroupManager } from "../managers/enhanced-group-flow";
import type { DualGroupConfig } from "../types/types";

// Import from the indexer client (you'll need to copy this or install as package)
interface PaymentData {
  id: string;
  blockNumber: number;
  timestamp: string;
  from: string;
  to: string;
  value: string;
  transactionHash: string;
  isPayment: boolean;
  status?: string;
}

interface ContractEventData {
  id: string;
  contractAddress: string;
  eventName: string;
  blockNumber: number;
  timestamp: string;
  transactionHash: string;
  userAddress?: string;
  userInboxId?: string;
  tokenId?: string;
  expiresAt?: string;
  reason?: string;
  args: any;
}

class IndexerClient {
  private indexerUrl: string;

  constructor(indexerUrl: string = "http://localhost:4350/graphql") {
    this.indexerUrl = indexerUrl;
  }

  async getPaymentsSinceBlock(blockNumber: number): Promise<PaymentData[]> {
    const query = `
      query GetPaymentsSinceBlock($blockNumber: Int!) {
        ethTransfers(
          where: { 
            blockNumber: { _gte: $blockNumber }
            isPayment: { _eq: true }
          }
          orderBy: [{ blockNumber: asc }]
        ) {
          id
          blockNumber
          timestamp
          from
          to
          value
          transactionHash
          isPayment
          status
        }
      }
    `;

    const response = await fetch(this.indexerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { blockNumber },
      }),
    });

    const data = await response.json();
    return data.data?.ethTransfers || [];
  }

  async getPaymentsFromAddress(
    fromAddress: string,
    sinceTimestamp: string,
  ): Promise<PaymentData[]> {
    const query = `
      query GetPaymentsFromAddress($fromAddress: String!, $sinceTimestamp: String!) {
        ethTransfers(
          where: { 
            from: { _eq: $fromAddress }
            isPayment: { _eq: true }
            timestamp: { _gte: $sinceTimestamp }
          }
          orderBy: [{ timestamp: desc }]
        ) {
          id
          blockNumber
          timestamp
          from
          to
          value
          transactionHash
          isPayment
          status
        }
      }
    `;

    const response = await fetch(this.indexerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { fromAddress, sinceTimestamp },
      }),
    });

    const data = await response.json();
    return data.data?.ethTransfers || [];
  }
}

export class IndexerPaymentMonitor {
  private indexerClient: IndexerClient;
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
  private lastProcessedBlock: number = 0;
  private pollingInterval?: NodeJS.Timeout;

  constructor(
    indexerUrl: string,
    agentAddress: string,
    enhancedGroupManager: EnhancedGroupManager,
    groupConfigs: Map<string, DualGroupConfig>,
  ) {
    this.indexerClient = new IndexerClient(indexerUrl);
    this.agentAddress = agentAddress;
    this.enhancedGroupManager = enhancedGroupManager;
    this.groupConfigs = groupConfigs;
    this.pendingPayments = new Map();

    console.log(`💰 Indexer-based payment monitor initialized`);
    console.log(`🔗 Indexer URL: ${indexerUrl}`);
    console.log(`🎯 Agent address: ${agentAddress}`);
  }

  /**
   * Start monitoring payments using the indexer
   */
  async startPaymentMonitoring(): Promise<void> {
    console.log("👀 Starting indexer-based payment monitoring...");

    // Poll the indexer every 30 seconds (much more efficient than block scanning)
    this.pollingInterval = setInterval(async () => {
      await this.checkForNewPayments();
    }, 30000); // 30 seconds

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
    console.log("🛑 Stopped indexer-based payment monitoring");
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

    console.log(
      `📝 Registered payment: ${paymentId} from ${memberAddress} to ${this.agentAddress}`,
    );

    return paymentId;
  }

  /**
   * Check for new payments using the indexer
   */
  private async checkForNewPayments(): Promise<void> {
    try {
      const pendingCount = this.pendingPayments.size;
      console.log(`🔍 Checking indexer for payments (${pendingCount} pending)`);

      if (pendingCount === 0) {
        return;
      }

      // Get new payments since last check
      const newPayments = await this.indexerClient.getPaymentsSinceBlock(
        this.lastProcessedBlock,
      );

      if (newPayments.length > 0) {
        console.log(`📦 Found ${newPayments.length} new payments in indexer`);

        // Update last processed block
        const maxBlock = Math.max(...newPayments.map((p) => p.blockNumber));
        this.lastProcessedBlock = maxBlock;
      }

      // Check each pending payment
      for (const [paymentId, payment] of this.pendingPayments.entries()) {
        await this.checkSpecificPayment(paymentId, payment, newPayments);
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
    }
  }

  /**
   * Check if a specific payment has been made using indexer data
   */
  private async checkSpecificPayment(
    paymentId: string,
    payment: {
      memberAddress: string;
      timestamp: number;
      senderInboxId: string;
      groupName: string;
      conversation: any;
    },
    recentPayments: PaymentData[],
  ): Promise<void> {
    try {
      const paymentTime = new Date(payment.timestamp);
      const sinceTimestamp = paymentTime.toISOString();

      // First check recent payments from our batch
      let matchingPayment = recentPayments.find(
        (p) =>
          p.from.toLowerCase() === payment.memberAddress.toLowerCase() &&
          p.to.toLowerCase() === this.agentAddress.toLowerCase() &&
          p.isPayment &&
          p.status === "success",
      );

      // If not found in recent batch, query specifically for this address
      if (!matchingPayment) {
        const addressPayments = await this.indexerClient.getPaymentsFromAddress(
          payment.memberAddress,
          sinceTimestamp,
        );

        matchingPayment = addressPayments.find(
          (p) =>
            p.to.toLowerCase() === this.agentAddress.toLowerCase() &&
            p.isPayment &&
            p.status === "success",
        );
      }

      if (matchingPayment) {
        console.log(`🎉 Payment confirmed via indexer!`);
        console.log(`   Transaction: ${matchingPayment.transactionHash}`);
        console.log(`   Amount: ${Number(matchingPayment.value) / 1e18} ETH`);
        console.log(`   Block: ${matchingPayment.blockNumber}`);
        console.log(`   From: ${matchingPayment.from}`);

        // Process the payment
        await this.processConfirmedPayment(paymentId, payment, matchingPayment);

        // Remove from pending
        this.pendingPayments.delete(paymentId);
      } else {
        // Log waiting status
        const minutesWaiting = Math.round(
          (Date.now() - payment.timestamp) / 60000,
        );
        if (minutesWaiting >= 5) {
          // Only log after 5 minutes to avoid spam
          console.log(
            `⏳ Still waiting for payment ${paymentId} (${minutesWaiting} minutes elapsed)`,
          );
        }
      }
    } catch (error) {
      console.error(`Error checking payment ${paymentId}:`, error);
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

      // Create the dual group system using the enhanced group manager
      const result = await this.enhancedGroupManager.createDualGroupSystem(
        payment.senderInboxId,
        payment.groupName,
        payment.conversation,
      );

      if (result.success && result.contractAddress) {
        console.log(`✅ Payment processed successfully!`);
        console.log(`   Contract: ${result.contractAddress}`);
        console.log(`   Creator Group: ${result.creatorGroupId}`);
        console.log(`   Premium Group: ${result.premiumGroupId}`);
        console.log(`   Transaction: ${paymentData.transactionHash}`);
      } else {
        console.error(`❌ Failed to process payment: ${result.error}`);
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
    lastProcessedBlock: number;
    isMonitoring: boolean;
  } {
    return {
      pendingPayments: this.pendingPayments.size,
      lastProcessedBlock: this.lastProcessedBlock,
      isMonitoring: !!this.pollingInterval,
    };
  }
}

/**
 * Helper function to convert wei string to ETH number
 */
function weiToEth(wei: string): number {
  return Number(BigInt(wei)) / 1e18;
}

