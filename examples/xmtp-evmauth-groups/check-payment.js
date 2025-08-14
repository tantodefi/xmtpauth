import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

const senderAddress = '0x6529b0f882B209a1918fA6935A40C224611cc510'; // tanto.base.eth
const agentAddress = '0xA14Ce36e7b135b66c3e3cb2584e777f32b15f5DC';

async function checkRecentPayment() {
  try {
    console.log('🔍 Checking recent transactions from tanto.base.eth...');
    
    const currentBlock = await client.getBlockNumber();
    console.log('📦 Current block:', currentBlock);
    
    // Check last 200 blocks for the payment
    const fromBlock = currentBlock - 200n;
    console.log('🔍 Scanning blocks', fromBlock, 'to', currentBlock);
    
    let foundPayment = false;
    
    for (let blockNum = currentBlock; blockNum >= fromBlock; blockNum--) {
      const block = await client.getBlock({
        blockNumber: blockNum,
        includeTransactions: true,
      });
      
      if (block.transactions) {
        for (const tx of block.transactions) {
          if (typeof tx === 'object' && 
              tx.from?.toLowerCase() === senderAddress.toLowerCase() &&
              tx.to?.toLowerCase() === agentAddress.toLowerCase()) {
            
            foundPayment = true;
            console.log('💰 FOUND PAYMENT:');
            console.log('  Block:', blockNum);
            console.log('  Hash:', tx.hash);
            console.log('  From:', tx.from);
            console.log('  To:', tx.to);
            console.log('  Value:', formatEther(tx.value), 'ETH');
            console.log('  Gas Price:', tx.gasPrice);
            console.log('  Gas Limit:', tx.gas);
            
            // Get transaction receipt
            const receipt = await client.getTransactionReceipt({
              hash: tx.hash,
            });
            
            console.log('  Status:', receipt.status);
            console.log('  Gas Used:', receipt.gasUsed);
            console.log('  Block Timestamp:', new Date(Number(block.timestamp) * 1000).toISOString());
            
            // Check if >= 0.001 ETH
            if (BigInt(tx.value) >= BigInt('1000000000000000')) {
              console.log('  ✅ Meets 0.001 ETH minimum');
            } else {
              console.log('  ❌ Below 0.001 ETH minimum');
            }
            
            return; // Exit after finding payment
          }
        }
      }
      
      // Progress indicator every 50 blocks
      if ((currentBlock - blockNum) % 50n === 0n) {
        console.log('📦 Checked', Number(currentBlock - blockNum + 1n), 'blocks...');
      }
    }
    
    if (!foundPayment) {
      console.log('❌ No payment found from tanto.base.eth to agent in last 200 blocks');
      
      // Check agent balance to see if it changed
      const balance = await client.getBalance({ address: agentAddress });
      console.log('💰 Current agent balance:', formatEther(balance), 'ETH');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkRecentPayment();
