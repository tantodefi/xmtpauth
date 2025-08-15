#!/usr/bin/env node

/**
 * Test script to verify the indexer integration works with corrected GraphQL syntax
 */

async function testIndexerIntegration() {
  const INDEXER_URL = 'https://8a90b832-68f2-4bb7-a355-f8a0e65cba16.squids.live/xmtp-indexer@v1/api/graphql'\;
  const AGENT_ADDRESS = '0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc';
  const TEST_FROM_ADDRESS = '0x6529b0f882b209a1918fa6935a40c224611cc510';
  const SINCE_TIMESTAMP = new Date('2025-08-15T16:00:00.000Z');

  console.log('🧪 Testing indexer integration...');
  console.log(`🌐 Indexer URL: ${INDEXER_URL}`);
  console.log(`🎯 Agent Address: ${AGENT_ADDRESS}`);
  console.log(`📤 From Address: ${TEST_FROM_ADDRESS}`);
  console.log(`⏰ Since: ${SINCE_TIMESTAMP.toISOString()}`);
  console.log('');

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

  try {
    const response = await fetch(INDEXER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: {
          agentAddress: AGENT_ADDRESS,
          fromAddress: TEST_FROM_ADDRESS,
          sinceTimestamp: SINCE_TIMESTAMP.toISOString()
        }
      })
    });

    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    
    if (data.errors) {
      console.error('❌ GraphQL Errors:', JSON.stringify(data.errors, null, 2));
      return;
    }

    console.log('✅ Query executed successfully!');
    console.log(`📊 Results: ${data.data?.ethTransfers?.length || 0} payments found`);
    
    if (data.data?.ethTransfers?.length > 0) {
      console.log('💰 Payment found:', data.data.ethTransfers[0]);
    } else {
      console.log('ℹ️ No payments found (expected if no recent payments)');
    }

    // Test basic health check too
    console.log('\n🏥 Testing health check...');
    const healthResponse = await fetch(INDEXER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{ ethTransfers(limit: 1) { id } }`
      })
    });

    if (healthResponse.ok) {
      console.log('✅ Health check passed!');
    } else {
      console.error(`❌ Health check failed: ${healthResponse.status}`);
    }

  } catch (error) {
    console.error('❌ Network error:', error.message);
  }
}

testIndexerIntegration().catch(console.error);
