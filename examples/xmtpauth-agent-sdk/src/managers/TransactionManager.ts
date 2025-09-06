import type { AgentContext } from "@xmtp/agent-sdk";
import type { TransactionReferenceContent } from "@xmtp/content-type-transaction-reference";
import {
  ContentTypeActions,
  type ActionsContent,
} from "../types/ActionsContent.js";

export interface PendingTransaction {
  id: string;
  type: "group_creation" | "access_purchase" | "tier_setup";
  groupId?: string;
  userInboxId: string;
  amount: string;
  status: "pending" | "confirmed" | "failed";
  createdAt: Date;
  txHash?: string;
}

export class TransactionManager {
  private pendingTransactions = new Map<string, PendingTransaction>();
  private transactionTimeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Handle transaction reference messages with inline confirmations
   */
  async handleTransactionReference(ctx: AgentContext): Promise<void> {
    try {
      const txRef = ctx.message.content as TransactionReferenceContent;
      console.log(`💳 Processing transaction reference: ${txRef.reference}`);

      // Create transaction confirmation with inline actions
      const confirmActions: ActionsContent = {
        id: `tx-confirm-${Date.now()}`,
        description: `🔍 Transaction Detected

📝 Reference: ${txRef.reference}
💰 Amount: ${this.formatAmount(txRef.amount || "0")}
⛽ Network: ${txRef.networkId || "Base"}

Please confirm this transaction:`,
        actions: [
          {
            id: `confirm-tx-${txRef.reference}`,
            label: "✅ Confirm Transaction",
            style: "primary",
          },
          {
            id: `reject-tx-${txRef.reference}`,
            label: "❌ Reject Transaction",
            style: "danger",
          },
          {
            id: "view-explorer",
            label: "🔍 View on Explorer",
            style: "secondary",
          },
        ],
      };

      await ctx.conversation.send(confirmActions, ContentTypeActions);

      // Store pending transaction
      const pendingTx: PendingTransaction = {
        id: txRef.reference,
        type: this.inferTransactionType(txRef),
        userInboxId: ctx.message.senderInboxId,
        amount: txRef.amount || "0",
        status: "pending",
        createdAt: new Date(),
        txHash: txRef.reference,
      };

      this.pendingTransactions.set(txRef.reference, pendingTx);

      // Set timeout for transaction (5 minutes)
      const timeout = setTimeout(
        () => {
          this.handleTransactionTimeout(txRef.reference);
        },
        5 * 60 * 1000,
      );

      this.transactionTimeouts.set(txRef.reference, timeout);
    } catch (error) {
      console.error("❌ Error handling transaction reference:", error);
      await ctx.sendTextReply("❌ Failed to process transaction reference.");
    }
  }

  /**
   * Confirm a transaction
   */
  async confirmTransaction(txId: string, ctx: AgentContext): Promise<void> {
    try {
      const pendingTx = this.pendingTransactions.get(txId);
      if (!pendingTx) {
        await ctx.sendTextReply(
          "❌ Transaction not found or already processed.",
        );
        return;
      }

      // Clear timeout
      const timeout = this.transactionTimeouts.get(txId);
      if (timeout) {
        clearTimeout(timeout);
        this.transactionTimeouts.delete(txId);
      }

      // Update transaction status
      pendingTx.status = "confirmed";
      this.pendingTransactions.set(txId, pendingTx);

      // Process based on transaction type
      await this.processConfirmedTransaction(pendingTx, ctx);

      // Generate OpenSea links if applicable
      let openSeaLinks = "";
      if (pendingTx.groupId) {
        // For now, we'll need to get contract address from groupId
        // This would ideally come from the group manager or be stored in pendingTx
        openSeaLinks = `\n\n🔗 NFT Collection:\n🌊 View on OpenSea (check your groups for link)`;
      }

      // Send confirmation with next steps
      const successActions: ActionsContent = {
        id: `tx-success-${Date.now()}`,
        description: `✅ Transaction Confirmed!

📝 ID: ${txId}
💰 Amount: ${this.formatAmount(pendingTx.amount)}
🎯 Type: ${this.formatTransactionType(pendingTx.type)}${openSeaLinks}

${this.getNextStepsMessage(pendingTx)}`,
        actions: this.getNextStepActions(pendingTx),
      };

      await ctx.conversation.send(successActions, ContentTypeActions);
    } catch (error) {
      console.error("❌ Error confirming transaction:", error);
      await ctx.sendTextReply("❌ Failed to confirm transaction.");
    }
  }

  /**
   * Reject a transaction
   */
  async rejectTransaction(txId: string, ctx: AgentContext): Promise<void> {
    try {
      const pendingTx = this.pendingTransactions.get(txId);
      if (!pendingTx) {
        await ctx.sendTextReply(
          "❌ Transaction not found or already processed.",
        );
        return;
      }

      // Clear timeout
      const timeout = this.transactionTimeouts.get(txId);
      if (timeout) {
        clearTimeout(timeout);
        this.transactionTimeouts.delete(txId);
      }

      // Update transaction status
      pendingTx.status = "failed";
      this.pendingTransactions.set(txId, pendingTx);

      const rejectActions: ActionsContent = {
        id: `tx-reject-${Date.now()}`,
        description: `❌ Transaction Rejected

📝 ID: ${txId}
💰 Amount: ${this.formatAmount(pendingTx.amount)}

The transaction has been marked as rejected. You can try again if needed.`,
        actions: [
          {
            id: "help",
            label: "❓ Get Help",
            style: "secondary",
          },
          {
            id: "retry-tx",
            label: "🔄 Try Again",
            style: "primary",
          },
        ],
      };

      await ctx.conversation.send(rejectActions, ContentTypeActions);
    } catch (error) {
      console.error("❌ Error rejecting transaction:", error);
      await ctx.sendTextReply("❌ Failed to reject transaction.");
    }
  }

  /**
   * Handle transaction timeout
   */
  private async handleTransactionTimeout(txId: string): Promise<void> {
    const pendingTx = this.pendingTransactions.get(txId);
    if (pendingTx && pendingTx.status === "pending") {
      pendingTx.status = "failed";
      this.pendingTransactions.set(txId, pendingTx);
      console.log(`⏰ Transaction ${txId} timed out`);
    }
    this.transactionTimeouts.delete(txId);
  }

  /**
   * Process confirmed transaction based on type
   */
  private async processConfirmedTransaction(
    tx: PendingTransaction,
    ctx: AgentContext,
  ): Promise<void> {
    switch (tx.type) {
      case "group_creation":
        console.log(`🏗️ Processing group creation transaction: ${tx.id}`);
        // Group creation logic would be handled by GroupManager
        break;

      case "access_purchase":
        console.log(`💰 Processing access purchase transaction: ${tx.id}`);
        // Access purchase logic would be handled by EVMAuthManager
        break;

      case "tier_setup":
        console.log(`⚙️ Processing tier setup transaction: ${tx.id}`);
        // Tier setup logic would be handled by EVMAuthManager
        break;

      default:
        console.log(`❓ Unknown transaction type: ${tx.type}`);
    }
  }

  /**
   * Infer transaction type from transaction reference
   */
  private inferTransactionType(
    txRef: TransactionReferenceContent,
  ): PendingTransaction["type"] {
    // Simple heuristics based on amount or metadata
    // In production, this would be more sophisticated
    const amount = parseFloat(txRef.amount || "0");

    if (amount === 0.001) {
      return "group_creation"; // 0.001 ETH is group creation fee
    } else if (amount > 0) {
      return "access_purchase";
    } else {
      return "tier_setup";
    }
  }

  /**
   * Format amount for display
   */
  private formatAmount(amount: string): string {
    const num = parseFloat(amount);
    if (num === 0) return "0 ETH";
    if (num < 0.001) return `${num.toFixed(6)} ETH`;
    return `${num.toFixed(3)} ETH`;
  }

  /**
   * Format transaction type for display
   */
  private formatTransactionType(type: PendingTransaction["type"]): string {
    switch (type) {
      case "group_creation":
        return "Group Creation";
      case "access_purchase":
        return "Access Purchase";
      case "tier_setup":
        return "Tier Setup";
      default:
        return "Unknown";
    }
  }

  /**
   * Get next steps message based on transaction type
   */
  private getNextStepsMessage(tx: PendingTransaction): string {
    switch (tx.type) {
      case "group_creation":
        return "Your premium group has been created! Set up pricing tiers to start monetizing.";
      case "access_purchase":
        return "Access granted! You can now participate in the premium group.";
      case "tier_setup":
        return "Pricing tier configured! Users can now purchase access.";
      default:
        return "Transaction processed successfully.";
    }
  }

  /**
   * Get next step actions based on transaction type
   */
  private getNextStepActions(
    tx: PendingTransaction,
  ): ActionsContent["actions"] {
    switch (tx.type) {
      case "group_creation":
        return [
          {
            id: `setup-tiers-${tx.groupId}`,
            label: "⚙️ Setup Pricing Tiers",
            style: "primary",
          },
          {
            id: "list-groups",
            label: "📋 View My Groups",
            style: "secondary",
          },
        ];
      case "access_purchase":
        return [
          {
            id: "my-tokens",
            label: "🎫 View My Tokens",
            style: "primary",
          },
          {
            id: "help",
            label: "❓ Get Help",
            style: "secondary",
          },
        ];
      default:
        return [
          {
            id: "help",
            label: "🏠 Main Menu",
            style: "primary",
          },
        ];
    }
  }

  /**
   * Get pending transactions for a user
   */
  getPendingTransactions(userInboxId: string): PendingTransaction[] {
    return Array.from(this.pendingTransactions.values()).filter(
      (tx) => tx.userInboxId === userInboxId && tx.status === "pending",
    );
  }

  /**
   * Get transaction by ID
   */
  getTransaction(txId: string): PendingTransaction | undefined {
    return this.pendingTransactions.get(txId);
  }

  /**
   * Clean up old transactions
   */
  cleanup(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    for (const [txId, tx] of this.pendingTransactions.entries()) {
      if (tx.createdAt < oneHourAgo) {
        this.pendingTransactions.delete(txId);

        const timeout = this.transactionTimeouts.get(txId);
        if (timeout) {
          clearTimeout(timeout);
          this.transactionTimeouts.delete(txId);
        }
      }
    }
  }
}
