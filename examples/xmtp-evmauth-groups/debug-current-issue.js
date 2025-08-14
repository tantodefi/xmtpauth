import { createPublicClient, formatEther, http } from "viem";
import { base } from "viem/chains";

async function debugCurrentIssue() {
  console.log("🔍 Debugging current payment detection issue...");

  const publicClient = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  const agentAddress = "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc";
  const expectedFromAddress = "0x6529b0f882b209a1918fa6935a40c224611cc510";

  console.log(`🎯 Agent address: ${agentAddress}`);
  console.log(`📧 Expected payment from: ${expectedFromAddress}`);

  // Check current balance
  const balance = await publicClient.getBalance({ address: agentAddress });
  console.log(`💰 Agent balance: ${formatEther(balance)} ETH`);

  // Get current block info
  const currentBlock = await publicClient.getBlockNumber();
  console.log(`📊 Current block: ${currentBlock}`);

  // Check if there are ANY transactions to the agent in recent blocks
  console.log("\n🔍 Scanning last 100 blocks for ANY transactions to agent...");
  let totalTxsToAgent = 0;
  let paymentTxs = [];

  for (let i = 0n; i < 100n; i++) {
    const blockNum = currentBlock - i;
    try {
      const block = await publicClient.getBlock({
        blockNumber: blockNum,
        includeTransactions: true,
      });

      if (block.transactions) {
        for (const tx of block.transactions) {
          if (
            typeof tx === "object" &&
            tx.to?.toLowerCase() === agentAddress.toLowerCase()
          ) {
            totalTxsToAgent++;
            const value = BigInt(tx.value);
            console.log(`💸 Block ${blockNum}: ${tx.hash}`);
            console.log(`   From: ${tx.from}, To: ${tx.to}`);
            console.log(`   Value: ${formatEther(value)} ETH`);
            console.log(
              `   Is from expected: ${tx.from.toLowerCase() === expectedFromAddress.toLowerCase()}`,
            );

            // Check if this is a potential payment (0.001 ETH or more)
            if (value >= BigInt("1000000000000000")) {
              // 0.001 ETH in wei
              paymentTxs.push({
                block: blockNum,
                hash: tx.hash,
                from: tx.from,
                value: formatEther(value),
                timestamp: block.timestamp,
              });
            }
          }
        }
      }
    } catch (error) {
      console.log(`⚠️ Error reading block ${blockNum}:`, error.message);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Total transactions to agent: ${totalTxsToAgent}`);
  console.log(`   Payment transactions (≥0.001 ETH): ${paymentTxs.length}`);

  if (paymentTxs.length > 0) {
    console.log(`\n💰 Recent payment transactions:`);
    paymentTxs.forEach((tx, i) => {
      console.log(
        `   ${i + 1}. Block ${tx.block}: ${tx.value} ETH from ${tx.from}`,
      );
      console.log(`      Hash: ${tx.hash}`);
      console.log(
        `      Time: ${new Date(Number(tx.timestamp) * 1000).toISOString()}`,
      );
    });
  }

  // Check the exact scan window that the payment monitor would use
  const scanFromBlock = currentBlock - 300n;
  const scanToBlock = currentBlock;
  console.log(
    `\n🔍 Payment monitor scan window: ${scanFromBlock} to ${scanToBlock} (${Number(scanToBlock - scanFromBlock + 1n)} blocks)`,
  );
  console.log(
    `⏰ This covers approximately ${((Number(scanToBlock - scanFromBlock + 1n) * 2) / 60).toFixed(1)} minutes`,
  );

  // Check if the payment request time makes sense
  const paymentTimestamp = 1755201837658; // From logs: cd7ffbd4689ed421fad99779ec455394be81a9d1e7fa836dec1af4f4df3b1c14-dstealth-1755201837658
  const paymentTime = new Date(paymentTimestamp);
  const currentTime = new Date();
  const timeDiff = (currentTime.getTime() - paymentTime.getTime()) / 60000;

  console.log(`\n⏰ Payment timing analysis:`);
  console.log(`   Payment registered: ${paymentTime.toISOString()}`);
  console.log(`   Current time: ${currentTime.toISOString()}`);
  console.log(`   Time difference: ${timeDiff.toFixed(1)} minutes ago`);
}

debugCurrentIssue().catch(console.error);

