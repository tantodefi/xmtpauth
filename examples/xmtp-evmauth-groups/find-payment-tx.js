import { createPublicClient, formatEther, http } from "viem";
import { base } from "viem/chains";

async function findPaymentTransaction() {
  console.log("🔍 Searching for the actual payment transaction...");

  const publicClient = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  const agentAddress = "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc";
  const expectedFromAddress = "0x6529b0f882b209a1918fa6935a40c224611cc510";

  // Get current block info
  const currentBlock = await publicClient.getBlockNumber();
  console.log(`📊 Current block: ${currentBlock}`);

  // The payment was registered at 2025-08-14T20:03:57.658Z (16 minutes ago)
  // Let's search back further - maybe 1000 blocks (~33 minutes)
  console.log("\n🔍 Scanning last 1000 blocks for transactions to agent...");

  let totalTxsToAgent = 0;
  let paymentTxs = [];

  // Search in chunks to avoid overwhelming the RPC
  const CHUNK_SIZE = 50;

  for (
    let chunkStart = 0n;
    chunkStart < 1000n;
    chunkStart += BigInt(CHUNK_SIZE)
  ) {
    const chunkEnd = chunkStart + BigInt(CHUNK_SIZE - 1);
    console.log(
      `📦 Scanning blocks ${currentBlock - chunkEnd} to ${currentBlock - chunkStart}`,
    );

    for (let i = chunkStart; i <= chunkEnd && i < 1000n; i++) {
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

              console.log(`💸 FOUND! Block ${blockNum}: ${tx.hash}`);
              console.log(`   From: ${tx.from}`);
              console.log(`   Value: ${formatEther(value)} ETH`);
              console.log(
                `   Time: ${new Date(Number(block.timestamp) * 1000).toISOString()}`,
              );
              console.log(
                `   Is from expected EOA: ${tx.from.toLowerCase() === expectedFromAddress.toLowerCase()}`,
              );

              // Check if this is a payment (0.001 ETH or more)
              if (value >= BigInt("1000000000000000")) {
                // 0.001 ETH in wei
                paymentTxs.push({
                  block: blockNum,
                  hash: tx.hash,
                  from: tx.from,
                  value: formatEther(value),
                  timestamp: block.timestamp,
                  blockAge: Number(i),
                });

                // Get transaction receipt for more details
                try {
                  const receipt = await publicClient.getTransactionReceipt({
                    hash: tx.hash,
                  });
                  console.log(`   Status: ${receipt.status}`);
                  console.log(`   Gas used: ${receipt.gasUsed}`);
                } catch (receiptError) {
                  console.log(`   Receipt error: ${receiptError.message}`);
                }
              }
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ Error reading block ${blockNum}:`, error.message);
      }
    }

    // Small delay to be nice to the RPC
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`\n📊 Final Summary:`);
  console.log(`   Total transactions to agent: ${totalTxsToAgent}`);
  console.log(`   Payment transactions (≥0.001 ETH): ${paymentTxs.length}`);

  if (paymentTxs.length > 0) {
    console.log(`\n💰 Payment transactions found:`);
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

      // Calculate if this would be within the payment monitor's scan window
      const blocksFromCurrent = tx.blockAge;
      const inScanWindow = blocksFromCurrent <= 300; // Payment monitor scans 300 blocks
      console.log(
        `      In scan window (≤300 blocks): ${inScanWindow ? "✅ YES" : "❌ NO"}`,
      );
    });
  }

  // Show the payment monitor's current scan window
  const scanFromBlock = currentBlock - 300n;
  const scanToBlock = currentBlock;
  console.log(
    `\n🔍 Payment monitor would scan: ${scanFromBlock} to ${scanToBlock}`,
  );
  console.log(`   This covers blocks that are 0-300 blocks old (0-10 minutes)`);
}

findPaymentTransaction().catch(console.error);

