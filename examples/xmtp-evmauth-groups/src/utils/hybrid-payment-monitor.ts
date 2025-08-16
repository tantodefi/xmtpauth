import type { Conversation } from "@xmtp/node-sdk";
import type { EnhancedGroupManager } from "../managers/enhanced-group-flow";
import type { GroupConfig } from "../types/group-config";

/**
 * Hybrid Payment Monitor - Best of both worlds:
 * 1. Instant detection via direct RPC calls for new payments
 * 2. Historical data and reliability via indexer
 * 3. Automatic fallback between methods
 */
export class HybridPaymentMonitor {
  private indexerUrl: string;
  private rpcUrl: string;
  private agentAddress: string;
  private groupManager: EnhancedGroupManager;
  private groupConfigs: Record<string, GroupConfig>;
  private pendingPayments = new Map<string, PendingPayment>();
  private lastCheckedBlock = 0;
  private isRunning = false;

  // Payment thresholds
  private readonly MIN_PAYMENT_WEI = 1000000000000000n; // 0.001 ETH
  private readonly MIN_USDC_PAYMENT = 1000000n; // 1 USDC

  constructor(
    indexerUrl: string,
    rpcUrl: string,
    agentAddress: string,
    groupManager: EnhancedGroupManager,
    groupConfigs: Record<string, GroupConfig>,
  ) {
    this.indexerUrl = indexerUrl;
    this.rpcUrl = rpcUrl;
    this.agentAddress = agentAddress.toLowerCase();
    this.groupManager = groupManager;
    this.groupConfigs = groupConfigs;
  }

  /**
   * Start monitoring with hybrid approach
   */
  async startMonitoring(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log("🚀 Starting Hybrid Payment Monitor...");
    console.log(`📡 Indexer: ${this.indexerUrl}`);
    console.log(`⚡ RPC: ${this.rpcUrl}`);
    console.log(`🎯 Agent: ${this.agentAddress}`);

    // Initialize last checked block
    await this.initializeLastBlock();

    // Start both monitoring loops
    this.startIndexerMonitoring();
    this.startRealTimeMonitoring();
  }

  /**
   * Register a pending payment (from user interaction)
   */
  registerPayment(
    senderInboxId: string,
    groupName: string,
    memberAddress: string,
    conversation: Conversation,
  ): string {
    const paymentId = `${senderInboxId}-${groupName}-${Date.now()}`;

    this.pendingPayments.set(paymentId, {
      id: paymentId,
      senderInboxId,
      groupName,
      memberAddress,
      conversation,
      registeredAt: Date.now(),
      attempts: 0,
    });

    console.log(`📝 Registered pending payment: ${paymentId}`);
    return paymentId;
  }

  /**
   * Initialize last checked block from indexer or RPC
   */
  private async initializeLastBlock(): Promise<void> {
    try {
      // Try to get last processed block from indexer first
      const response = await fetch(this.indexerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "query { squidStatus { height } }",
        }),
      });

      const data = await response.json();
      if (data.data?.squidStatus?.height) {
        this.lastCheckedBlock = data.data.squidStatus.height;
        console.log(`📊 Starting from indexer block: ${this.lastCheckedBlock}`);
        return;
      }
    } catch (error) {
      console.log("⚠️ Indexer unavailable, using RPC for initialization");
    }

    // Fallback to current block from RPC
    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        }),
      });

      const data = await response.json();
      this.lastCheckedBlock = parseInt(data.result, 16);
      console.log(
        `📊 Starting from current RPC block: ${this.lastCheckedBlock}`,
      );
    } catch (error) {
      console.error("❌ Failed to initialize block number:", error);
      this.lastCheckedBlock = 34200000; // Fallback
    }
  }

  /**
   * Monitor via indexer (historical + reliable)
   */
  private startIndexerMonitoring(): void {
    const checkIndexer = async () => {
      if (!this.isRunning) return;

      try {
        const response = await fetch(this.indexerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `
              query GetPaymentsSinceBlock($blockNumber: Int!) {
                ethTransfers(
                  where: { 
                    blockNumber_gte: $blockNumber
                    isPayment_eq: true
                  }
                  orderBy: blockNumber_ASC
                ) {
                  id
                  blockNumber
                  timestamp
                  from
                  to
                  value
                  transactionHash
                  tokenType
                }
              }
            `,
            variables: {
              blockNumber: Math.max(this.lastCheckedBlock - 10, 34200000),
            },
          }),
        });

        const data = await response.json();
        if (data.errors) {
          console.error("⚠️ Indexer query error:", data.errors);
          return;
        }

        const payments = data.data.ethTransfers || [];
        for (const payment of payments) {
          await this.processPayment(payment, "indexer");
        }

        console.log(
          `🔍 Indexer check: ${payments.length} payments found (${this.pendingPayments.size} pending)`,
        );
      } catch (error) {
        console.error("⚠️ Indexer monitoring error:", error);
      }

      // Check every 30 seconds
      setTimeout(checkIndexer, 30000);
    };

    checkIndexer();
  }

  /**
   * Monitor via direct RPC (real-time)
   */
  private startRealTimeMonitoring(): void {
    const checkRealTime = async () => {
      if (!this.isRunning) return;

      try {
        // Get current block
        const blockResponse = await fetch(this.rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_blockNumber",
            params: [],
            id: 1,
          }),
        });

        const blockData = await blockResponse.json();
        const currentBlock = parseInt(blockData.result, 16);

        // Only check recent blocks (last 5 blocks for real-time detection)
        const startBlock = Math.max(currentBlock - 5, this.lastCheckedBlock);

        for (let blockNum = startBlock; blockNum <= currentBlock; blockNum++) {
          await this.checkBlockForPayments(blockNum);
        }

        this.lastCheckedBlock = Math.max(
          this.lastCheckedBlock,
          currentBlock - 3,
        );
        console.log(
          `⚡ Real-time check: blocks ${startBlock}-${currentBlock} (${this.pendingPayments.size} pending)`,
        );
      } catch (error) {
        console.error("⚠️ Real-time monitoring error:", error);
      }

      // Check every 10 seconds for real-time detection
      setTimeout(checkRealTime, 10000);
    };

    checkRealTime();
  }

  /**
   * Check a specific block for payments via RPC
   */
  private async checkBlockForPayments(blockNumber: number): Promise<void> {
    try {
      // Get block with transactions
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBlockByNumber",
          params: [`0x${blockNumber.toString(16)}`, true],
          id: 1,
        }),
      });

      const data = await response.json();
      const block = data.result;

      if (!block?.transactions) return;

      // Check for ETH transfers to agent
      for (const tx of block.transactions) {
        if (
          tx.to?.toLowerCase() === this.agentAddress &&
          tx.value &&
          BigInt(tx.value) >= this.MIN_PAYMENT_WEI
        ) {
          const payment = {
            id: `${tx.hash}-eth`,
            blockNumber: blockNumber,
            timestamp: new Date(
              parseInt(block.timestamp, 16) * 1000,
            ).toISOString(),
            from: tx.from.toLowerCase(),
            to: tx.to.toLowerCase(),
            value: tx.value,
            transactionHash: tx.hash,
            tokenType: "ETH",
          };

          await this.processPayment(payment, "rpc");
        }
      }
    } catch (error) {
      console.error(`⚠️ Error checking block ${blockNumber}:`, error);
    }
  }

  /**
   * Process a detected payment
   */
  private async processPayment(payment: any, source: string): Promise<void> {
    try {
      // Find matching pending payment
      const pendingPayment = Array.from(this.pendingPayments.values()).find(
        (p) => this.matchesPayment(p, payment),
      );

      if (!pendingPayment) {
        console.log(
          `💰 Payment detected (${source}) but no matching pending payment: ${payment.transactionHash}`,
        );
        return;
      }

      console.log(
        `✅ Payment confirmed (${source}): ${payment.value} ${payment.tokenType} from ${payment.from}`,
      );
      console.log(`🎯 Creating group: ${pendingPayment.groupName}`);

      // Process the payment
      await this.groupManager.createGroupWithPayment(
        pendingPayment.senderInboxId,
        pendingPayment.groupName,
        pendingPayment.memberAddress,
        pendingPayment.conversation,
        payment.transactionHash,
        payment.value,
        payment.tokenType || "ETH",
      );

      // Remove from pending
      this.pendingPayments.delete(pendingPayment.id);
      console.log(`🗑️ Removed pending payment: ${pendingPayment.id}`);
    } catch (error) {
      console.error(
        `❌ Error processing payment ${payment.transactionHash}:`,
        error,
      );
    }
  }

  /**
   * Check if a payment matches a pending payment
   */
  private matchesPayment(pending: PendingPayment, payment: any): boolean {
    // For now, match by timing and amount (within last 10 minutes)
    const paymentTime = new Date(payment.timestamp).getTime();
    const timeDiff = Math.abs(paymentTime - pending.registeredAt);

    // Payment should be within 10 minutes of registration
    return timeDiff < 10 * 60 * 1000;
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isRunning = false;
    console.log("🛑 Hybrid Payment Monitor stopped");
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      pendingPayments: this.pendingPayments.size,
      lastCheckedBlock: this.lastCheckedBlock,
      indexerUrl: this.indexerUrl,
      rpcUrl: this.rpcUrl,
    };
  }
}

interface PendingPayment {
  id: string;
  senderInboxId: string;
  groupName: string;
  memberAddress: string;
  conversation: Conversation;
  registeredAt: number;
  attempts: number;
}
