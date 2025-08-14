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
  private rpcEndpoints: string[];
  private currentRpcIndex: number;

  constructor(
    rpcUrl: string,
    agentAddress: string,
    enhancedGroupManager: EnhancedGroupManager,
    groupConfigs: Map<string, DualGroupConfig>,
  ) {
    // Define reliable Base mainnet RPC endpoints as fallbacks
    this.rpcEndpoints = [
      rpcUrl, // Use provided URL first
      "https://mainnet.base.org",
      "https://base.blockpi.network/v1/rpc/public",
      "https://1rpc.io/base",
      "https://base-pokt.nodies.app",
      "https://base.meowrpc.com",
    ];
    this.currentRpcIndex = 0;

    this.publicClient = this.createPublicClient();
    this.agentAddress = agentAddress;
    this.enhancedGroupManager = enhancedGroupManager;
    this.groupConfigs = groupConfigs;
    this.pendingPayments = new Map();

    console.log(
      `💰 Payment monitor initialized with ${this.rpcEndpoints.length} RPC endpoints`,
    );
    console.log(`🔗 Primary RPC: ${this.rpcEndpoints[0]}`);
  }

  private createPublicClient() {
    const currentUrl = this.rpcEndpoints[this.currentRpcIndex];
    return createPublicClient({
      chain: base,
      transport: http(currentUrl, {
        timeout: 30000, // 30 second timeout
        retryCount: 2,
        retryDelay: 1000,
      }),
    });
  }

  private async switchToNextRpc(): Promise<boolean> {
    this.currentRpcIndex =
      (this.currentRpcIndex + 1) % this.rpcEndpoints.length;
    const newUrl = this.rpcEndpoints[this.currentRpcIndex];

    console.log(`🔄 Switching to RPC endpoint: ${newUrl}`);

    this.publicClient = this.createPublicClient();

    // Test the new endpoint
    try {
      await this.publicClient.getBlockNumber();
      console.log(`✅ Successfully connected to: ${newUrl}`);
      return true;
    } catch (error) {
      console.log(`❌ Failed to connect to: ${newUrl}`);
      return false;
    }
  }

  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempts = 0;
    const maxAttempts = this.rpcEndpoints.length;

    while (attempts < maxAttempts) {
      try {
        return await operation();
      } catch (error: any) {
        attempts++;

        // Check if it's a rate limiting error
        if (
          error.status === 429 ||
          error.message?.includes("rate limit") ||
          error.message?.includes("Too Many Requests")
        ) {
          console.log(
            `⚠️ Rate limited on ${this.rpcEndpoints[this.currentRpcIndex]}`,
          );

          if (attempts < maxAttempts) {
            const switched = await this.switchToNextRpc();
            if (switched) {
              continue; // Try with new endpoint
            }
          }
        }

        // If it's the last attempt or not a rate limit error, throw
        if (attempts >= maxAttempts) {
          throw error;
        }

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
      }
    }

    throw new Error("All RPC endpoints failed");
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

    // Check for payments every 45 seconds (reduced frequency to avoid rate limits)
    setInterval(async () => {
      await this.checkForPayments();
    }, 45000);

    // Also check immediately
    await this.checkForPayments();
  }

  /**
   * Check for incoming payments and process them
   */
  private async checkForPayments() {
    try {
      // Get current block number with retry mechanism
      const currentBlock = await this.executeWithRetry(() =>
        this.publicClient.getBlockNumber(),
      );

      // Check last 900 blocks for transactions to agent address (Base: ~30 minutes at 2s blocks)
      const fromBlock = currentBlock - 900n;

      console.log(
        `🔍 Checking payments: blocks ${fromBlock} to ${currentBlock} (${this.pendingPayments.size} pending)`,
      );
      console.log(`🔗 Using RPC: ${this.rpcEndpoints[this.currentRpcIndex]}`);

      // Skip the single block check - we'll do comprehensive scanning in checkBlockchainForPayment

      // Check pending payments
      for (const [paymentId, payment] of this.pendingPayments.entries()) {
        // Check if payment is too old (more than 15 minutes to account for 2s block times)
        if (Date.now() - payment.timestamp > 15 * 60 * 1000) {
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

          // Warn user if payment is taking too long (adjusted for 2s blocks)
          if (elapsedMinutes >= 5 && elapsedMinutes % 3 === 2) {
            // Every 3 minutes after 5 minutes
            await payment.conversation.send(
              `⏳ Still waiting for payment...\n\n` +
                `It's been ${elapsedMinutes} minutes since you requested group creation.\n` +
                `If you haven't approved the transaction yet, please check your wallet.\n` +
                `With Base's 2-second blocks, transactions usually confirm within 1-2 minutes.`,
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
   * Optimized for Base's 2-second blocks and larger scan ranges
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

      const totalBlocks = Number(toBlock - fromBlock + 1n);
      console.log(`🔍 Scanning ${totalBlocks} blocks for payment...`);

      // Use chunked scanning for better performance and reliability
      const CHUNK_SIZE = 50; // Scan 50 blocks at a time
      let totalAgentTxs = 0;

      // Scan from newest to oldest blocks (payments more likely in recent blocks)
      for (
        let chunkStart = toBlock;
        chunkStart >= fromBlock;
        chunkStart -= BigInt(CHUNK_SIZE)
      ) {
        const chunkEnd =
          chunkStart - BigInt(CHUNK_SIZE - 1) < fromBlock
            ? fromBlock
            : chunkStart - BigInt(CHUNK_SIZE - 1);

        console.log(`📦 Scanning chunk: blocks ${chunkEnd} to ${chunkStart}`);

        // Process chunk with timeout protection
        const chunkResult = await Promise.race([
          this.scanBlockChunk(chunkEnd, chunkStart, payment),
          new Promise<{ found: boolean; agentTxs: number }>((_, reject) =>
            setTimeout(() => reject(new Error("Chunk scan timeout")), 30000),
          ),
        ]);

        if (chunkResult.found) {
          return true;
        }

        totalAgentTxs += chunkResult.agentTxs;

        // Add delay between chunks to avoid rate limiting
        if (chunkStart - BigInt(CHUNK_SIZE) >= fromBlock) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      console.log(
        `🔍 Finished scanning ${totalBlocks} blocks - found ${totalAgentTxs} transactions to agent, no matching payment`,
      );
      return false;
    } catch (error) {
      console.error("Error checking blockchain for payment:", error);
      return false;
    }
  }

  /**
   * Scan a chunk of blocks for payments
   */
  private async scanBlockChunk(
    fromBlock: bigint,
    toBlock: bigint,
    payment: { memberAddress: string; timestamp: number },
  ): Promise<{ found: boolean; agentTxs: number }> {
    let agentTxs = 0;

    for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
      try {
        const block = await this.executeWithRetry(() =>
          this.publicClient.getBlock({
            blockNumber: blockNum,
            includeTransactions: true,
          }),
        );

        if (block.transactions) {
          // Only log every 10th block to reduce noise
          if ((blockNum - fromBlock) % 10n === 0n) {
            console.log(
              `📦 Block ${blockNum}: ${block.transactions.length} transactions`,
            );
          }

          for (const tx of block.transactions) {
            if (typeof tx === "object" && tx.to && tx.from && tx.value) {
              // Check for transactions to agent address
              if (tx.to?.toLowerCase() === this.agentAddress.toLowerCase()) {
                agentTxs++;
                console.log(
                  `💰 Found tx to agent: ${tx.hash} from ${tx.from} value ${tx.value}`,
                );

                // Check if this is the payment we're looking for
                if (
                  tx.from.toLowerCase() ===
                    payment.memberAddress.toLowerCase() &&
                  BigInt(tx.value) >= parseEther("0.001")
                ) {
                  // Verify transaction was successful
                  const receipt = await this.executeWithRetry(() =>
                    this.publicClient.getTransactionReceipt({
                      hash: tx.hash,
                    }),
                  );

                  if (receipt.status === "success") {
                    console.log(`✅ Found confirmed payment: ${tx.hash}`);
                    return { found: true, agentTxs };
                  } else {
                    console.log(`❌ Transaction failed: ${tx.hash}`);
                  }
                }
              }
            }
          }
        }

        // Small delay every 10 blocks within chunk
        if ((blockNum - fromBlock) % 10n === 0n && blockNum !== toBlock) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.log(`⚠️ Error scanning block ${blockNum}: ${errorMessage}`);
        // Continue with next block instead of failing entire chunk
        continue;
      }
    }

    return { found: false, agentTxs };
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

      // Deploy the contract and create groups
      const result = await this.enhancedGroupManager.createDualGroupSystem(
        payment.groupName,
        payment.senderInboxId,
        payment.memberAddress,
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
