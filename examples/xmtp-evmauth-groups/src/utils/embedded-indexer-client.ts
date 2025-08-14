/**
 * Embedded Indexer Client - Connects to hosted SQD Cloud indexer
 * This is the simplest integration option - no separate deployment needed
 */

export interface PaymentData {
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

export class EmbeddedIndexerClient {
  private indexerUrl: string;
  private agentAddress: string;

  constructor(agentAddress: string) {
    this.agentAddress = agentAddress.toLowerCase();

    // Option 1: Use SQD Cloud hosted indexer (recommended)
    this.indexerUrl =
      process.env.INDEXER_URL || "https://your-sqd-app.sqd.dev/graphql";

    // Option 2: Use self-hosted indexer
    // this.indexerUrl = process.env.INDEXER_URL || 'https://your-indexer.onrender.com/graphql';

    console.log(`🔗 Indexer client connecting to: ${this.indexerUrl}`);
  }

  /**
   * Check for recent payments to the agent address
   */
  async checkForPayments(sinceBlock?: number): Promise<PaymentData[]> {
    const query = `
      query GetRecentPayments($agentAddress: String!, $sinceBlock: Int) {
        ethTransfers(
          where: { 
            to: { _eq: $agentAddress }
            isPayment: { _eq: true }
            status: { _eq: "success" }
            ${sinceBlock ? "blockNumber: { _gte: $sinceBlock }" : ""}
          }
          orderBy: [{ blockNumber: desc }]
          limit: 50
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

    try {
      const response = await fetch(this.indexerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: {
            agentAddress: this.agentAddress,
            ...(sinceBlock && { sinceBlock }),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as any;

      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      return data.data?.ethTransfers || [];
    } catch (error) {
      console.error("Error fetching payments from indexer:", error);
      return []; // Graceful fallback - return empty array
    }
  }

  /**
   * Check if a specific payment exists
   */
  async findPaymentFromAddress(
    fromAddress: string,
    sinceTimestamp: Date,
  ): Promise<PaymentData | null> {
    const query = `
      query FindPaymentFromAddress($agentAddress: String!, $fromAddress: String!, $sinceTimestamp: String!) {
        ethTransfers(
          where: { 
            to: { _eq: $agentAddress }
            from: { _eq: $fromAddress }
            isPayment: { _eq: true }
            status: { _eq: "success" }
            timestamp: { _gte: $sinceTimestamp }
          }
          orderBy: [{ timestamp: desc }]
          limit: 1
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

    try {
      const response = await fetch(this.indexerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: {
            agentAddress: this.agentAddress,
            fromAddress: fromAddress.toLowerCase(),
            sinceTimestamp: sinceTimestamp.toISOString(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as any;

      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      return data.data?.ethTransfers[0] || null;
    } catch (error) {
      console.error("Error finding payment from indexer:", error);
      return null; // Graceful fallback
    }
  }

  /**
   * Get the latest indexed block number
   */
  async getLatestIndexedBlock(): Promise<number> {
    const query = `
      query GetLatestBlock {
        ethTransfers(
          orderBy: [{ blockNumber: desc }]
          limit: 1
        ) {
          blockNumber
        }
      }
    `;

    try {
      const response = await fetch(this.indexerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as any;

      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      return data.data?.ethTransfers[0]?.blockNumber || 0;
    } catch (error) {
      console.error("Error getting latest block from indexer:", error);
      return 0; // Graceful fallback
    }
  }

  /**
   * Health check for the indexer
   */
  async isHealthy(): Promise<boolean> {
    try {
      const latestBlock = await this.getLatestIndexedBlock();
      return latestBlock > 0;
    } catch (error) {
      console.error("Indexer health check failed:", error);
      return false;
    }
  }
}

/**
 * Helper function to convert wei string to ETH number
 */
export function weiToEth(wei: string): number {
  return Number(BigInt(wei)) / 1e18;
}
