import { createPublicClient, formatEther, http } from "viem";
import { base } from "viem/chains";

async function deepSearchPayments() {
  console.log("🔍 Deep search for payment transactions to agent...");

  const publicClient = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  const agentAddress = "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc";

  // Get current block info
  const currentBlock = await publicClient.getBlockNumber();
  console.log(`📊 Current block: ${currentBlock}`);

  // Check balance again
  const balance = await publicClient.getBalance({ address: agentAddress });
  console.log(`💰 Agent balance: ${formatEther(balance)} ETH`);

  // Let's search back 5000 blocks (~2.7 hours) in larger chunks
  console.log("\n🔍 Scanning last 5000 blocks for transactions to agent...");

  let totalTxsToAgent = 0;
  let paymentTxs = [];

  // Search in larger chunks
  const CHUNK_SIZE = 100;

  for (
    let chunkStart = 0n;
    chunkStart < 5000n;
    chunkStart += BigInt(CHUNK_SIZE)
  ) {
    const chunkEnd = chunkStart + BigInt(CHUNK_SIZE - 1);
    const fromBlock = currentBlock - chunkEnd;
    const toBlock = currentBlock - chunkStart;

    console.log(
      `📦 Scanning blocks ${fromBlock} to ${toBlock} (${chunkStart}-${chunkEnd} blocks ago)`,
    );

    // Use a different approach - check each block individually but with less detail logging
    for (let i = chunkStart; i <= chunkEnd && i < 5000n; i++) {
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

              console.log(
                `💸 FOUND TRANSACTION! Block ${blockNum} (${i} blocks ago):`,
              );
              console.log(`   Hash: ${tx.hash}`);
              console.log(`   From: ${tx.from}`);
              console.log(`   Value: ${formatEther(value)} ETH`);
              console.log(
                `   Time: ${new Date(Number(block.timestamp) * 1000).toISOString()}`,
              );

              // All transactions to agent are interesting, record them
              paymentTxs.push({
                block: blockNum,
                hash: tx.hash,
                from: tx.from,
                value: formatEther(value),
                timestamp: block.timestamp,
                blockAge: Number(i),
              });

              // Get transaction receipt
              try {
                const receipt = await publicClient.getTransactionReceipt({
                  hash: tx.hash,
                });
                console.log(`   Status: ${receipt.status}`);
              } catch (receiptError) {
                console.log(`   Receipt error: ${receiptError.message}`);
              }
            }
          }
        }
      } catch (error) {
        // Only log errors every 500 blocks to avoid spam
        if (i % 500n === 0n) {
          console.log(`⚠️ Error reading block ${blockNum}:`, error.message);
        }
      }
    }

    // Show progress and small delay
    if (chunkStart % 1000n === 0n) {
      console.log(`   Progress: ${chunkStart}/5000 blocks searched...`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log(`\n📊 Deep Search Results:`);
  console.log(`   Total transactions to agent: ${totalTxsToAgent}`);
  console.log(`   All transactions found: ${paymentTxs.length}`);

  if (paymentTxs.length > 0) {
    console.log(`\n💰 All transactions to agent:`);
    paymentTxs.forEach((tx, i) => {
      console.log(
        `   ${i + 1}. Block ${tx.block} (${tx.blockAge} blocks ago):`,
      );
      console.log(`      Amount: ${tx.value} ETH`);
      console.log(`      From: ${tx.from}`);
      console.log(`      Hash: ${tx.hash}`);
      console.log(
        `      Time: ${new Date(Number(tx.timestamp) * 1000).toISOString()}`,
      );

      // Is this within payment monitor scan window?
      const inScanWindow = tx.blockAge <= 300;
      console.log(
        `      In payment monitor window: ${inScanWindow ? "✅ YES" : "❌ NO"}`,
      );

      // Is this >= 0.001 ETH?
      const isPayment = parseFloat(tx.value) >= 0.001;
      console.log(
        `      Is payment (≥0.001 ETH): ${isPayment ? "✅ YES" : "❌ NO"}`,
      );
    });
  } else {
    console.log(`\n❌ NO TRANSACTIONS FOUND to agent address ${agentAddress}`);
    console.log(
      `   This is very strange given the agent has a balance of ${formatEther(balance)} ETH`,
    );
    console.log(`   Possible issues:`);
    console.log(`   1. Payments are older than 5000 blocks (~2.7 hours)`);
    console.log(`   2. Agent address derivation issue`);
    console.log(`   3. Payments went to a different address`);
  }
}

deepSearchPayments().catch(console.error);

