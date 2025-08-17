/**
 * Comprehensive Indexer Client - Full integration with SQD indexer
 * 
 * This replaces the simple indexer integration with comprehensive tracking of:
 * - ETH and USDC payments to agent
 * - Factory contract deployments 
 * - EVMAuth contract events (access granted/revoked/expired)
 * - Dynamic contract discovery
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
  tokenType: string; // ETH, USDC, WETH
}

export interface IndexerContractEvent {
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
  args: {
    topics: string[];
    data: string;
  };
}

export interface IndexerContractDeployment {
  id: string;
  contractAddress: string;
  deployer: string;
  blockNumber: number;
  timestamp: string;
  transactionHash: string;
  contractType: string;
}

export class ComprehensiveIndexerClient {
  private indexerUrl: string;
  private agentAddress: string;

  constructor(agentAddress: string) {
    this.agentAddress = agentAddress.toLowerCase();
    this.indexerUrl =
      process.env.INDEXER_URL || "http://localhost:4350/graphql";

    console.log(`🔗 Comprehensive indexer client initialized for ${agentAddress}`);
    console.log(`🌐 Indexer URL: ${this.indexerUrl}`);
  }

  /**
   * Find payment from a specific address since a timestamp
   * Supports ETH, USDC, and WETH payments
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
              status_not_eq: "failed"
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
            tokenType
          }
        }
      `;

      const response = await this.executeQuery(query, {
        agentAddress: this.agentAddress,
        fromAddress: fromAddress.toLowerCase(),
        sinceTimestamp: sinceTimestamp.toISOString(),
      });

      return response.data?.ethTransfers?.[0] || null;
    } catch (error) {
      console.warn("Payment query failed:", error);
      return null;
    }
  }

  /**
   * Get all recent payments to the agent
   */
  async getRecentPayments(limit: number = 10): Promise<IndexerPaymentData[]> {
    try {
      const query = `
        query GetRecentPayments($agentAddress: String!, $limit: Int!) {
          ethTransfers(
            where: { 
              to_eq: $agentAddress
              isPayment_eq: true
              status_not_eq: "failed"
            }
            orderBy: [timestamp_DESC]
            limit: $limit
          ) {
            transactionHash
            from
            to
            value
            blockNumber
            timestamp
            isPayment
            status
            tokenType
          }
        }
      `;

      const response = await this.executeQuery(query, {
        agentAddress: this.agentAddress,
        limit,
      });

      return response.data?.ethTransfers || [];
    } catch (error) {
      console.warn("Recent payments query failed:", error);
      return [];
    }
  }

  /**
   * Get contract deployments (new EVMAuth contracts)
   */
  async getRecentDeployments(limit: number = 10): Promise<IndexerContractDeployment[]> {
    try {
      const query = `
        query GetRecentDeployments($limit: Int!) {
          contractDeployments(
            orderBy: [timestamp_DESC]
            limit: $limit
          ) {
            id
            contractAddress
            deployer
            blockNumber
            timestamp
            transactionHash
            contractType
          }
        }
      `;

      const response = await this.executeQuery(query, { limit });
      return response.data?.contractDeployments || [];
    } catch (error) {
      console.warn("Deployments query failed:", error);
      return [];
    }
  }

  /**
   * Get contract events for a specific contract
   */
  async getContractEvents(
    contractAddress: string,
    eventTypes?: string[],
    limit: number = 50,
  ): Promise<IndexerContractEvent[]> {
    try {
      let whereClause = `contractAddress_eq: $contractAddress`;
      if (eventTypes && eventTypes.length > 0) {
        whereClause += `, eventName_in: $eventTypes`;
      }

      const query = `
        query GetContractEvents($contractAddress: String!, $eventTypes: [String!], $limit: Int!) {
          contractEvents(
            where: { ${whereClause} }
            orderBy: [timestamp_DESC]
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

      const response = await this.executeQuery(query, {
        contractAddress: contractAddress.toLowerCase(),
        eventTypes,
        limit,
      });

      return response.data?.contractEvents || [];
    } catch (error) {
      console.warn("Contract events query failed:", error);
      return [];
    }
  }

  /**
   * Get all UserAccessGranted events for a user
   */
  async getUserAccessEvents(
    userAddress: string,
    contractAddress?: string,
  ): Promise<IndexerContractEvent[]> {
    try {
      let whereClause = `eventName_eq: "UserAccessGranted", userAddress_eq: $userAddress`;
      if (contractAddress) {
        whereClause += `, contractAddress_eq: $contractAddress`;
      }

      const query = `
        query GetUserAccessEvents($userAddress: String!, $contractAddress: String) {
          contractEvents(
            where: { ${whereClause} }
            orderBy: [timestamp_DESC]
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

      const response = await this.executeQuery(query, {
        userAddress: userAddress.toLowerCase(),
        contractAddress: contractAddress?.toLowerCase(),
      });

      return response.data?.contractEvents || [];
    } catch (error) {
      console.warn("User access events query failed:", error);
      return [];
    }
  }

  /**
   * Get all known EVMAuth contracts
   */
  async getKnownContracts(): Promise<string[]> {
    try {
      const query = `
        query GetKnownContracts {
          contractDeployments(
            where: { contractType_eq: "EVMAuth" }
            orderBy: [timestamp_DESC]
          ) {
            contractAddress
          }
        }
      `;

      const response = await this.executeQuery(query, {});
      return response.data?.contractDeployments?.map((d: any) => d.contractAddress) || [];
    } catch (error) {
      console.warn("Known contracts query failed:", error);
      return [];
    }
  }

  /**
   * Health check and basic stats
   */
  async getIndexerStats(): Promise<{
    totalPayments: number;
    totalContracts: number;
    totalEvents: number;
    isHealthy: boolean;
  }> {
    try {
      const query = `
        query GetIndexerStats {
          ethTransfers(where: { isPayment_eq: true }) {
            id
          }
          contractDeployments {
            id
          }
          contractEvents {
            id
          }
        }
      `;

      const response = await this.executeQuery(query, {});
      
      return {
        totalPayments: response.data?.ethTransfers?.length || 0,
        totalContracts: response.data?.contractDeployments?.length || 0,
        totalEvents: response.data?.contractEvents?.length || 0,
        isHealthy: true,
      };
    } catch (error) {
      console.warn("Stats query failed:", error);
      return {
        totalPayments: 0,
        totalContracts: 0,
        totalEvents: 0,
        isHealthy: false,
      };
    }
  }

  /**
   * Execute GraphQL query with error handling
   */
  private async executeQuery(query: string, variables: Record<string, any>): Promise<any> {
    const response = await fetch(this.indexerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as any;

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    return data;
  }

  /**
   * Test if the indexer is available and working
   */
  async isAvailable(): Promise<boolean> {
    try {
      const query = `{ ethTransfers(limit: 1) { id } }`;
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
 * Enhanced payment detection with comprehensive indexer support
 */
export async function comprehensivePaymentCheck(
  agentAddress: string,
  memberAddress: string,
  paymentTimestamp: Date,
): Promise<{ found: boolean; txHash?: string; amount?: string; tokenType?: string } | null> {
  const indexerClient = new ComprehensiveIndexerClient(agentAddress);

  // Try indexer first
  const indexerPayment = await indexerClient.findPaymentFromAddress(
    memberAddress,
    paymentTimestamp,
  );

  if (indexerPayment) {
    console.log(`🎯 Payment found via indexer: ${indexerPayment.transactionHash}`);
    
    const displayAmount = indexerPayment.tokenType === "USDC" 
      ? `${Number(indexerPayment.value) / 1e6} USDC`
      : `${Number(indexerPayment.value) / 1e18} ${indexerPayment.tokenType}`;
    
    console.log(`💰 Amount: ${displayAmount}`);

    return {
      found: true,
      txHash: indexerPayment.transactionHash,
      amount: indexerPayment.value,
      tokenType: indexerPayment.tokenType,
    };
  }

  // If indexer fails/unavailable, return null to let RPC scanning continue
  console.log(`🔄 Indexer didn't find payment, RPC scanning will continue...`);
  return null;
}

