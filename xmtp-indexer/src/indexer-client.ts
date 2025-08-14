/**
 * Client for integrating with the SQD indexer from the XMTP agent
 * Provides GraphQL queries and subscriptions for payment and event data
 */

import { gql, GraphQLClient } from "graphql-request";

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

export interface ContractEventData {
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

export class IndexerClient {
  private client: GraphQLClient;

  constructor(indexerUrl: string = "http://localhost:4350/graphql") {
    this.client = new GraphQLClient(indexerUrl);
  }

  /**
   * Get recent payments to the agent address
   */
  async getRecentPayments(limit: number = 10): Promise<PaymentData[]> {
    const query = gql`
      query GetRecentPayments($limit: Int!) {
        ethTransfers(
          where: { isPayment: { _eq: true } }
          orderBy: [{ timestamp: desc }]
          limit: $limit
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

    const data = (await this.client.request(query, { limit })) as any;
    return data.ethTransfers;
  }

  /**
   * Get payments from a specific address
   */
  async getPaymentsFromAddress(
    fromAddress: string,
    limit: number = 10,
  ): Promise<PaymentData[]> {
    const query = gql`
      query GetPaymentsFromAddress($fromAddress: String!, $limit: Int!) {
        ethTransfers(
          where: { from: { _eq: $fromAddress }, isPayment: { _eq: true } }
          orderBy: [{ timestamp: desc }]
          limit: $limit
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

    const data = (await this.client.request(query, {
      fromAddress,
      limit,
    })) as any;
    return data.ethTransfers;
  }

  /**
   * Get payments since a specific block number
   */
  async getPaymentsSinceBlock(blockNumber: number): Promise<PaymentData[]> {
    const query = gql`
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

    const data = (await this.client.request(query, { blockNumber })) as any;
    return data.ethTransfers;
  }

  /**
   * Get contract events for a specific contract
   */
  async getContractEvents(
    contractAddress: string,
    limit: number = 10,
  ): Promise<ContractEventData[]> {
    const query = gql`
      query GetContractEvents($contractAddress: String!, $limit: Int!) {
        contractEvents(
          where: { contractAddress: { _eq: $contractAddress } }
          orderBy: [{ timestamp: desc }]
          limit: $limit
        ) {
          id
          contractAddress
          eventName
          blockNumber
          timestamp
          transactionHash
          userAddress
          userInboxId
          tokenId
          expiresAt
          reason
          args
        }
      }
    `;

    const data = (await this.client.request(query, {
      contractAddress,
      limit,
    })) as any;
    return data.contractEvents;
  }

  /**
   * Get events for a specific user
   */
  async getUserEvents(
    userAddress: string,
    limit: number = 10,
  ): Promise<ContractEventData[]> {
    const query = gql`
      query GetUserEvents($userAddress: String!, $limit: Int!) {
        contractEvents(
          where: { userAddress: { _eq: $userAddress } }
          orderBy: [{ timestamp: desc }]
          limit: $limit
        ) {
          id
          contractAddress
          eventName
          blockNumber
          timestamp
          transactionHash
          userAddress
          userInboxId
          tokenId
          expiresAt
          reason
          args
        }
      }
    `;

    const data = (await this.client.request(query, {
      userAddress,
      limit,
    })) as any;
    return data.contractEvents;
  }

  /**
   * Check if a payment exists for a specific transaction hash
   */
  async getPaymentByTxHash(txHash: string): Promise<PaymentData | null> {
    const query = gql`
      query GetPaymentByTxHash($txHash: String!) {
        ethTransfers(where: { transactionHash: { _eq: $txHash } }, limit: 1) {
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

    const data = (await this.client.request(query, { txHash })) as any;
    return data.ethTransfers[0] || null;
  }

  /**
   * Get the latest indexed block number
   */
  async getLatestBlock(): Promise<number> {
    const query = gql`
      query GetLatestBlock {
        ethTransfers(orderBy: [{ blockNumber: desc }], limit: 1) {
          blockNumber
        }
      }
    `;

    const data = (await this.client.request(query)) as any;
    return data.ethTransfers[0]?.blockNumber || 0;
  }

  /**
   * Subscribe to new payments (WebSocket subscription)
   * Note: This would require setting up GraphQL subscriptions
   */
  async subscribeToPayments(
    callback: (payment: PaymentData) => void,
  ): Promise<void> {
    // Implementation would depend on your GraphQL subscription setup
    console.log(
      "Payment subscriptions not yet implemented - use polling for now",
    );
  }

  /**
   * Subscribe to new contract events (WebSocket subscription)
   * Note: This would require setting up GraphQL subscriptions
   */
  async subscribeToContractEvents(
    callback: (event: ContractEventData) => void,
  ): Promise<void> {
    // Implementation would depend on your GraphQL subscription setup
    console.log(
      "Event subscriptions not yet implemented - use polling for now",
    );
  }
}

/**
 * Helper function to convert wei string to ETH number
 */
export function weiToEth(wei: string): number {
  return Number(BigInt(wei)) / 1e18;
}

/**
 * Helper function to check if a payment meets the minimum threshold
 */
export function isValidPayment(payment: PaymentData): boolean {
  return payment.isPayment && payment.status === "success";
}
