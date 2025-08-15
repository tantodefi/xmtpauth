/**
 * Simple Indexer Integration - Drop-in replacement for payment detection
 * This integrates with your existing PaymentMonitor without breaking changes
 */

export interface IndexerPaymentData {
  transactionHash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp: string;
  isPayment: boolean;
  status?: string;
}

export class SimpleIndexerClient {
  private indexerUrl: string;
  private agentAddress: string;

  constructor(agentAddress: string) {
    this.agentAddress = agentAddress.toLowerCase();
    this.indexerUrl =
      process.env.INDEXER_URL || "http://localhost:4350/graphql";

    console.log(`🔗 Simple indexer client initialized for ${agentAddress}`);
    console.log(`🌐 Indexer URL: ${this.indexerUrl}`);
  }

  /**
   * Check if a payment exists from a specific address since a timestamp
   * This replaces the blockchain scanning logic
   */
  async findPaymentFromAddress(
    fromAddress: string,
    sinceTimestamp: Date,
  ): Promise<IndexerPaymentData | null> {
    try {
      const query = `
        query FindPayment($agentAddress: String!, $fromAddress: String!, $sinceTimestamp: DateTime!) {
          ethTransfers(
            where: { 
              to_eq: $agentAddress
              from_eq: $fromAddress
              isPayment_eq: true
              status_eq: "success"
              timestamp_gte: $sinceTimestamp
            }
            orderBy: [timestamp_DESC]
            limit: 1
          ) {
            transactionHash
            from
            to
            value
            blockNumber
            timestamp
            isPayment
            status
          }
        }
      `;

      const response = await fetch(this.indexerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        console.warn(
          `Indexer request failed: ${response.status} ${response.statusText}`,
        );
        return null; // Graceful fallback
      }

      const data = (await response.json()) as any;

      if (data.errors) {
        console.warn(`Indexer GraphQL errors:`, data.errors);
        return null; // Graceful fallback
      }

      const payment = data.data?.ethTransfers?.[0];
      return payment || null;
    } catch (error) {
      console.warn("Indexer query failed, will use RPC fallback:", error);
      return null; // Graceful fallback - let RPC scanning take over
    }
  }

  /**
   * Test if the indexer is available and working
   */
  async isAvailable(): Promise<boolean> {
    try {
      const query = `
        query HealthCheck {
          ethTransfers(limit: 1) {
            id
          }
        }
      `;

      const response = await fetch(this.indexerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Enhanced payment detection that tries indexer first, falls back to RPC
 * This can be injected into your existing PaymentMonitor
 */
export async function enhancedPaymentCheck(
  agentAddress: string,
  memberAddress: string,
  paymentTimestamp: Date,
): Promise<{ found: boolean; txHash?: string; amount?: string } | null> {
  const indexerClient = new SimpleIndexerClient(agentAddress);

  // Try indexer first
  const indexerPayment = await indexerClient.findPaymentFromAddress(
    memberAddress,
    paymentTimestamp,
  );

  if (indexerPayment) {
    console.log(
      `🎯 Payment found via indexer: ${indexerPayment.transactionHash}`,
    );
    console.log(`💰 Amount: ${Number(indexerPayment.value) / 1e18} ETH`);

    return {
      found: true,
      txHash: indexerPayment.transactionHash,
      amount: indexerPayment.value,
    };
  }

  // If indexer fails/unavailable, return null to let RPC scanning continue
  console.log(`🔄 Indexer didn't find payment, RPC scanning will continue...`);
  return null;
}
