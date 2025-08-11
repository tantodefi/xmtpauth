/**
 * Payment monitoring and contract deployment workflow
 */

import { createPublicClient, http, parseEther } from "viem";
import { base } from "viem/chains";
import type { EnhancedGroupManager } from "../managers/enhanced-group-flow";
import type { DualGroupConfig } from "../types/types";

export class PaymentMonitor {
  private publicClient;
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

  constructor(
    rpcUrl: string,
    agentAddress: string,
    enhancedGroupManager: EnhancedGroupManager,
    groupConfigs: Map<string, DualGroupConfig>,
  ) {
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });
    this.agentAddress = agentAddress;
    this.enhancedGroupManager = enhancedGroupManager;
    this.groupConfigs = groupConfigs;
    this.pendingPayments = new Map();
  }

  /**
   * Register a pending payment for monitoring
   */
  registerPendingPayment(
    paymentId: string,
    senderInboxId: string,
    groupName: string,
    memberAddress: string,
    conversation: any,
  ) {
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

    console.log(
      `📝 Registered pending payment: ${paymentId} for group: ${groupName}`,
    );
  }

  /**
   * Start monitoring for payments
   */
  async startPaymentMonitoring() {
    console.log("👀 Starting payment monitoring...");

    // Check for payments every 30 seconds
    setInterval(async () => {
      await this.checkForPayments();
    }, 30000);

    // Also check immediately
    await this.checkForPayments();
  }

  /**
   * Check for incoming payments and process them
   */
  private async checkForPayments() {
    try {
      // Get current block number
      const currentBlock = await this.publicClient.getBlockNumber();

      // Check last 200 blocks for transactions to agent address (Base: ~6.7 minutes)
      const fromBlock = currentBlock - 200n;

      console.log(
        `🔍 Checking payments: blocks ${fromBlock} to ${currentBlock} (${this.pendingPayments.size} pending)`,
      );

      // Get recent transactions to agent address
      const block = await this.publicClient.getBlock({
        blockNumber: currentBlock,
        includeTransactions: true,
      });

      // Check pending payments
      for (const [paymentId, payment] of this.pendingPayments.entries()) {
        // Check if payment is too old (more than 10 minutes)
        if (Date.now() - payment.timestamp > 10 * 60 * 1000) {
          console.log(`⏰ Payment ${paymentId} expired, removing...`);
          this.pendingPayments.delete(paymentId);

          // Send timeout message
          await payment.conversation.send(
            `⏰ Payment Timeout\n\n` +
              `Your group creation request for "${payment.groupName}" has expired.\n` +
              `Please try again with /create-group ${payment.groupName}`,
          );
          continue;
        }

        // Check actual blockchain transactions for this payment
        const hasPayment = await this.checkBlockchainForPayment(
          payment,
          fromBlock,
          currentBlock,
        );

        if (hasPayment) {
          console.log(`💰 Payment confirmed on blockchain for ${paymentId}!`);
          await this.processPayment(paymentId, payment);
        } else {
          // Still waiting for payment - NO FALLBACK, only process on actual blockchain confirmation
          const elapsedMinutes = Math.round(
            (Date.now() - payment.timestamp) / 60000,
          );
          console.log(
            `⏳ Still waiting for payment ${paymentId} (${elapsedMinutes} minutes elapsed)`,
          );

          // Warn user if payment is taking too long
          if (elapsedMinutes >= 3 && elapsedMinutes % 2 === 1) {
            // Every 2 minutes after 3 minutes
            await payment.conversation.send(
              `⏳ Still waiting for payment...\n\n` +
                `It's been ${elapsedMinutes} minutes since you requested group creation.\n` +
                `If you haven't approved the transaction yet, please check your wallet.\n` +
                `If you approved it, the blockchain confirmation may take a few more minutes.`,
            );
          }
        }
      }
    } catch (error) {
      console.error("Error checking for payments:", error);
    }
  }

  /**
   * Check blockchain for actual payment transactions
   */
  private async checkBlockchainForPayment(
    payment: { memberAddress: string; timestamp: number },
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<boolean> {
    try {
      console.log(
        `🔍 Checking blockchain payment from ${payment.memberAddress} to ${this.agentAddress}`,
      );

      // Look for transactions from the payer to the agent
      // This is a simplified check - in production you'd want more robust verification

      // Get transaction history for the last few blocks
      console.log(
        `🔍 Scanning ${Number(toBlock - fromBlock + 1n)} blocks for payment...`,
      );

      for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
        const block = await this.publicClient.getBlock({
          blockNumber: blockNum,
          includeTransactions: true,
        });

        if (block.transactions) {
          console.log(
            `📦 Block ${blockNum}: ${block.transactions.length} transactions`,
          );

          let agentTxCount = 0;
          for (const tx of block.transactions) {
            if (typeof tx === "object" && tx.to && tx.from && tx.value) {
              // Debug: Log all transactions to agent address
              if (tx.to?.toLowerCase() === this.agentAddress.toLowerCase()) {
                agentTxCount++;
                console.log(
                  `💰 Found tx to agent: ${tx.hash} from ${tx.from} value ${tx.value}`,
                );
              }

              // Check if transaction is to agent address with expected amount
              if (
                tx.to.toLowerCase() === this.agentAddress.toLowerCase() &&
                tx.from.toLowerCase() === payment.memberAddress.toLowerCase() &&
                BigInt(tx.value) >= parseEther("0.001") // At least 0.001 ETH
              ) {
                // Get transaction receipt to confirm it was successful
                const receipt = await this.publicClient.getTransactionReceipt({
                  hash: tx.hash,
                });

                if (receipt.status === "success") {
                  console.log(`✅ Found confirmed payment: ${tx.hash}`);
                  return true;
                }
              }
            }
          }

          if (agentTxCount === 0) {
            console.log(
              `📦 Block ${blockNum}: No transactions to agent address`,
            );
          }
        } else {
          console.log(`📦 Block ${blockNum}: No transactions in block`);
        }
      }

      console.log(
        `🔍 Finished scanning blocks ${fromBlock} to ${toBlock} - no payment found`,
      );
      return false;
    } catch (error) {
      console.error("Error checking blockchain for payment:", error);
      return false;
    }
  }

  /**
   * Process a confirmed payment by deploying the contract
   */
  private async processPayment(
    paymentId: string,
    payment: {
      senderInboxId: string;
      groupName: string;
      memberAddress: string;
      conversation: any;
    },
  ) {
    // Check if already processed (extra safety)
    if (!this.pendingPayments.has(paymentId)) {
      console.log(`⚠️ Payment ${paymentId} already processed, skipping...`);
      return;
    }

    // Remove from pending payments IMMEDIATELY to prevent double processing
    this.pendingPayments.delete(paymentId);

    try {
      console.log(`🚀 Processing payment for group: ${payment.groupName}`);

      await payment.conversation.send(
        `✅ PAYMENT CONFIRMED!\n\n` +
          `💰 Received 0.001 ETH payment\n` +
          `🏗️ Deploying your premium community...\n\n` +
          `⏳ This may take 30-60 seconds...`,
      );

      // Create metadata for the group
      const metadata = {
        name: payment.groupName,
        description: `Premium community for ${payment.groupName} with token-gated access`,
        image:
          "https://via.placeholder.com/400x400/6366f1/ffffff?text=Premium+Group",
      };

      // Deploy the contract and create groups
      const result = await this.enhancedGroupManager.createDualGroupSystem(
        payment.groupName,
        payment.senderInboxId,
        payment.memberAddress,
        metadata,
      );

      // Store the group configuration returned by manager (already complete)
      this.groupConfigs.set(result.contractAddress, result.config);

      // Send success message
      await payment.conversation.send(
        `🎉 PREMIUM COMMUNITY CREATED!\n\n` +
          `📋 Group Details:\n` +
          `• Name: ${payment.groupName}\n` +
          `• Contract: ${result.contractAddress.slice(0, 10)}...${result.contractAddress.slice(-8)}\n` +
          `• Sales Group: ${result.salesGroup.id}\n` +
          `• Premium Group: ${result.premiumGroup.id}\n\n` +
          `🎯 Next Steps:\n` +
          `• Use /setup-tiers ${payment.groupName} to configure pricing\n` +
          `• Use /grant-trial ${payment.groupName} <address> <days> to give free access\n` +
          `• Share your premium community with others!\n\n` +
          `✅ Your premium community is now live on Base Sepolia!`,
      );

      console.log(
        `✅ Successfully created premium community: ${payment.groupName}`,
      );
    } catch (error) {
      console.error(
        `❌ Error processing payment for ${payment.groupName}:`,
        error,
      );

      await payment.conversation.send(
        `❌ Deployment Failed\n\n` +
          `Your payment was received, but we encountered an error deploying the contract:\n\n` +
          `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
          `Please contact support for assistance. Your payment will be refunded if the issue cannot be resolved.`,
      );
    }
  }

  /**
   * Get pending payments count
   */
  getPendingPaymentsCount(): number {
    return this.pendingPayments.size;
  }

  /**
   * Get pending payments for a specific sender
   */
  getPendingPaymentsForSender(senderInboxId: string): string[] {
    const payments: string[] = [];
    for (const [paymentId, payment] of this.pendingPayments.entries()) {
      if (payment.senderInboxId === senderInboxId) {
        payments.push(payment.groupName);
      }
    }
    return payments;
  }
}
