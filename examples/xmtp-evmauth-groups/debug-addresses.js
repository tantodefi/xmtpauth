import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

// Test addresses
const senderAddress = '0x6529b0f882B209a1918fA6935A40C224611cc510'; // tanto.base.eth
const agentAddress = '0xA14Ce36e7b135b66c3e3cb2584e777f32b15f5DC';

async function debugAddresses() {
  try {
    console.log('🔍 Address Debug Information:');
    console.log('Sender (tanto.base.eth):', senderAddress);
    console.log('Sender lowercase:', senderAddress.toLowerCase());
    console.log('Agent:', agentAddress);
    console.log('Agent lowercase:', agentAddress.toLowerCase());
    
    // Check current balances
    const senderBalance = await client.getBalance({ address: senderAddress });
    const agentBalance = await client.getBalance({ address: agentAddress });
    
    console.log('\n💰 Current Balances:');
    console.log('Sender balance:', formatEther(senderBalance), 'ETH');
    console.log('Agent balance:', formatEther(agentBalance), 'ETH');
    
    // Check recent transactions FROM the sender address
    console.log('\n🔍 Checking recent outgoing transactions from sender...');
    
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock - 100n;
    
    let outgoingTxs = [];
    
    for (let blockNum = currentBlock; blockNum >= fromBlock; blockNum--) {
      const block = await client.getBlock({
        blockNumber: blockNum,
        includeTransactions: true,
      });
      
      if (block.transactions) {
        for (const tx of block.transactions) {
          if (typeof tx === 'object' && 
              tx.from?.toLowerCase() === senderAddress.toLowerCase()) {
            
            outgoingTxs.push({
              block: blockNum,
              hash: tx.hash,
              to: tx.to,
              value: tx.value,
              timestamp: block.timestamp
            });
            
            // Show ETH transactions only
            if (BigInt(tx.value) > 0n) {
              console.log(`📤 Block ${blockNum}: ${tx.hash}`);
              console.log(`   To: ${tx.to}`);
              console.log(`   Value: ${formatEther(tx.value)} ETH`);
              console.log(`   Time: ${new Date(Number(block.timestamp) * 1000).toISOString()}`);
              
              // Check if this is to the agent
              if (tx.to?.toLowerCase() === agentAddress.toLowerCase()) {
                console.log('   🎯 THIS IS TO THE AGENT!');
              }
            }
          }
        }
      }
      
      if ((currentBlock - blockNum) % 25n === 0n) {
        console.log(`📦 Scanned ${Number(currentBlock - blockNum + 1n)} blocks...`);
      }
    }
    
    console.log(`\n📊 Found ${outgoingTxs.length} total outgoing transactions from sender in last 100 blocks`);
    
    // Check recent transactions TO the agent address
    console.log('\n🔍 Checking recent incoming transactions to agent...');
    
    let incomingTxs = [];
    
    for (let blockNum = currentBlock; blockNum >= fromBlock; blockNum--) {
      const block = await client.getBlock({
        blockNumber: blockNum,
        includeTransactions: true,
      });
      
      if (block.transactions) {
        for (const tx of block.transactions) {
          if (typeof tx === 'object' && 
              tx.to?.toLowerCase() === agentAddress.toLowerCase() &&
              BigInt(tx.value) > 0n) {
            
            incomingTxs.push({
              block: blockNum,
              hash: tx.hash,
              from: tx.from,
              value: tx.value,
              timestamp: block.timestamp
            });
            
            console.log(`📥 Block ${blockNum}: ${tx.hash}`);
            console.log(`   From: ${tx.from}`);
            console.log(`   Value: ${formatEther(tx.value)} ETH`);
            console.log(`   Time: ${new Date(Number(block.timestamp) * 1000).toISOString()}`);
            
            // Check if this is from tanto.base.eth
            if (tx.from?.toLowerCase() === senderAddress.toLowerCase()) {
              console.log('   🎯 THIS IS FROM TANTO.BASE.ETH!');
            }
          }
        }
      }
    }
    
    console.log(`\n📊 Found ${incomingTxs.length} incoming ETH transactions to agent in last 100 blocks`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugAddresses();
