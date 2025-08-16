import { TypeormDatabase } from "@subsquid/typeorm-store";
import { ContractDeployment, ContractEvent, EthTransfer } from "./model";
import {
  AGENT_ADDRESS,
  EVENT_SIGNATURES,
  FACTORY_ADDRESSES,
  processor,
  SMART_WALLET_ADDRESSES,
  TOKEN_ADDRESSES,
} from "./processor";

// Payment thresholds
const MIN_PAYMENT_WEI = 1000000000000000n; // 0.001 ETH
const MIN_USDC_PAYMENT = 1000000n; // 1 USDC (6 decimals)

// Track deployed contracts for dynamic discovery
const knownContracts = new Set<string>(
  FACTORY_ADDRESSES.map((addr) => addr.toLowerCase()),
);

// Database connection
const database = new TypeormDatabase({
  supportHotBlocks: true,
  stateSchema: "processor",
});

// Add error handling for processor startup
const USE_SQD_GATEWAY = process.env.USE_SQD_GATEWAY !== "false";
console.log("🚀 Starting Comprehensive XMTP Indexer...");
console.log(
  `📡 Mode: ${USE_SQD_GATEWAY ? "SQD Network + RPC (recommended)" : "RPC-only (fallback)"}`,
);
console.log(
  `📡 Gateway: ${USE_SQD_GATEWAY ? "https://v2.archive.subsquid.io/network/base-mainnet" : "Disabled"}`,
);
console.log(`🌐 RPC: https://base.llamarpc.com`);
console.log(`🗄️ Database URL: ${process.env.DB_URL ? "Connected" : "Missing"}`);
console.log(`🎯 Agent Address: ${AGENT_ADDRESS}`);
console.log(`🏭 Factory Addresses: ${FACTORY_ADDRESSES.join(", ")}`);
console.log(
  `💰 Token Addresses: ETH (native), USDC: ${TOKEN_ADDRESSES.USDC_MAINNET}, WETH: ${TOKEN_ADDRESSES.WETH}`,
);
console.log(`🔄 Starting processor with database connection...`);

processor.run(database, async (ctx) => {
  const ethTransfers: EthTransfer[] = [];
  const contractDeployments: ContractDeployment[] = [];
  const contractEvents: ContractEvent[] = [];

  // Log processing info
  if (ctx.blocks.length > 0) {
    const blockNumbers = ctx.blocks.map((b) => b.header.height);
    const minBlock = Math.min(...blockNumbers);
    const maxBlock = Math.max(...blockNumbers);
    console.log(
      `🔄 Processing blocks ${minBlock} to ${maxBlock} (${ctx.blocks.length} blocks)`,
    );
  }

  for (const block of ctx.blocks) {
    for (const log of block.logs) {
      try {
        const logAddress = log.address.toLowerCase();
        const topic0 = log.topics[0];

        // Handle Factory ContractDeployed events
        if (
          FACTORY_ADDRESSES.some((addr) => addr.toLowerCase() === logAddress) &&
          topic0 === EVENT_SIGNATURES.CONTRACT_DEPLOYED
        ) {
          const creatorAddress = `0x${log.topics[1].slice(26)}`;
          const contractAddress = `0x${log.topics[2].slice(26)}`;

          // Skip if data is empty or invalid
          if (!log.data || log.data === "0x" || log.data.length < 130) {
            continue;
          }

          // Decode the non-indexed parameters (groupName, timestamp)
          const data = log.data.slice(2); // Remove 0x prefix
          const groupNameOffset = parseInt(data.slice(0, 64), 16) * 2;
          const groupNameLength =
            parseInt(data.slice(groupNameOffset, groupNameOffset + 64), 16) * 2;
          const groupNameHex = data.slice(
            groupNameOffset + 64,
            groupNameOffset + 64 + groupNameLength,
          );
          const groupName = Buffer.from(groupNameHex, "hex").toString("utf8");
          const timestampHex = data.slice(64, 128);
          const timestamp = timestampHex
            ? BigInt("0x" + timestampHex)
            : BigInt(0);

          const deployment = new ContractDeployment({
            id: log.id,
            blockNumber: block.header.height,
            timestamp: new Date(Number(timestamp) * 1000),
            transactionHash: log.transactionHash,
            deployer: creatorAddress.toLowerCase(),
            contractAddress: contractAddress.toLowerCase(),
            contractType: `EVMAuth-${groupName}`,
          });

          contractDeployments.push(deployment);
          knownContracts.add(contractAddress.toLowerCase());

          console.log(
            `🏭 New contract deployed: ${contractAddress} by ${creatorAddress} (${groupName})`,
          );
        }

        // Handle EVMAuth contract events from deployed contracts
        if (knownContracts.has(logAddress)) {
          let eventName = "";
          let userAddress = "";
          let userInboxId = "";
          let tokenId = "";
          let expiresAt: Date | null = null;
          let reason = "";

          if (topic0 === EVENT_SIGNATURES.USER_ACCESS_GRANTED) {
            eventName = "UserAccessGranted";
            userAddress = `0x${log.topics[1].slice(26)}`;
            userInboxId = Buffer.from(log.topics[2].slice(2), "hex").toString(
              "utf8",
            );
            tokenId =
              log.topics[3] &&
              log.topics[3] !== "0x" &&
              log.topics[3].length > 2
                ? BigInt("0x" + log.topics[3].slice(2)).toString()
                : "0";
            if (log.data && log.data.length >= 66) {
              const expiresAtHex = log.data.slice(2, 66);
              const expiresAtTimestamp =
                expiresAtHex &&
                expiresAtHex !==
                  "0000000000000000000000000000000000000000000000000000000000000000" &&
                !expiresAtHex.match(/^0+$/)
                  ? BigInt("0x" + expiresAtHex)
                  : BigInt(0);
              expiresAt =
                expiresAtTimestamp > 0n
                  ? new Date(Number(expiresAtTimestamp) * 1000)
                  : null;
            }
          } else if (topic0 === EVENT_SIGNATURES.USER_ACCESS_REVOKED) {
            eventName = "UserAccessRevoked";
            userAddress = `0x${log.topics[1].slice(26)}`;
            userInboxId = Buffer.from(log.topics[2].slice(2), "hex").toString(
              "utf8",
            );
            tokenId =
              log.topics[3] &&
              log.topics[3] !== "0x" &&
              log.topics[3].length > 2
                ? BigInt("0x" + log.topics[3].slice(2)).toString()
                : "0";
            // Decode reason from data
            if (log.data && log.data.length > 2) {
              const data = log.data.slice(2);
              if (data.length >= 64) {
                const reasonOffset = parseInt(data.slice(0, 64), 16) * 2;
                if (data.length >= reasonOffset + 64) {
                  const reasonLength =
                    parseInt(data.slice(reasonOffset, reasonOffset + 64), 16) *
                    2;
                  if (data.length >= reasonOffset + 64 + reasonLength) {
                    const reasonHex = data.slice(
                      reasonOffset + 64,
                      reasonOffset + 64 + reasonLength,
                    );
                    reason = Buffer.from(reasonHex, "hex").toString("utf8");
                  }
                }
              }
            }
          } else if (topic0 === EVENT_SIGNATURES.ACCESS_TOKEN_EXPIRED) {
            eventName = "AccessTokenExpired";
            userAddress = `0x${log.topics[1].slice(26)}`;
            tokenId =
              log.topics[2] &&
              log.topics[2] !== "0x" &&
              log.topics[2].length > 2
                ? BigInt("0x" + log.topics[2].slice(2)).toString()
                : "0";
          }

          if (eventName) {
            const contractEvent = new ContractEvent({
              id: log.id,
              blockNumber: block.header.height,
              timestamp: new Date(block.header.timestamp),
              transactionHash: log.transactionHash,
              contractAddress: logAddress,
              eventName: eventName,
              userAddress: userAddress.toLowerCase(),
              userInboxId: userInboxId,
              tokenId: tokenId,
              expiresAt: expiresAt,
              reason: reason,
              args: {
                topic0: topic0,
                topic1: log.topics[1] || "",
                topic2: log.topics[2] || "",
                topic3: log.topics[3] || "",
                data: log.data,
              },
            });

            contractEvents.push(contractEvent);
            console.log(
              `📋 ${eventName} event: ${userAddress} (${userInboxId}) token ${tokenId}`,
            );
          }
        }

        // Handle ERC20 transfers (USDC, WETH) to agent address
        if (
          topic0 ===
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        ) {
          const fromAddress = `0x${log.topics[1].slice(26)}`;
          const toAddress = `0x${log.topics[2].slice(26)}`;

          // Skip if data is empty or invalid
          if (!log.data || log.data === "0x" || log.data.length < 4) {
            continue;
          }

          const valueHex = log.data.slice(2);
          if (!valueHex || valueHex.length === 0 || valueHex.match(/^0+$/)) {
            continue;
          }
          const value = BigInt("0x" + valueHex);

          if (toAddress.toLowerCase() === AGENT_ADDRESS.toLowerCase()) {
            let tokenType = "UNKNOWN";
            let isPayment = false;

            if (
              logAddress === TOKEN_ADDRESSES.USDC_MAINNET.toLowerCase() ||
              logAddress === TOKEN_ADDRESSES.USDC_TESTNET.toLowerCase()
            ) {
              tokenType = "USDC";
              isPayment = value >= MIN_USDC_PAYMENT;
            } else if (logAddress === TOKEN_ADDRESSES.WETH.toLowerCase()) {
              tokenType = "WETH";
              isPayment = value >= MIN_PAYMENT_WEI;
            }

            const transfer = new EthTransfer({
              id: log.id,
              blockNumber: block.header.height,
              timestamp: new Date(block.header.timestamp),
              transactionHash: log.transactionHash,
              from: fromAddress.toLowerCase(),
              to: toAddress.toLowerCase(),
              value: value,
              tokenType: tokenType,
              isPayment: isPayment,
              status: "success",
            });

            ethTransfers.push(transfer);

            if (isPayment) {
              console.log(
                `💰 ${tokenType} payment detected: ${value} from ${fromAddress} to ${toAddress}`,
              );
            }
          }
        }

        // Handle native ETH transfers to agent address
        if (log.topics.length === 0 && log.data.length > 2) {
          // This is likely a native ETH transfer, but we need to check transaction receipts
          // For now, we'll skip this as it's complex to detect from logs alone
        }
      } catch (error) {
        console.error(`Error processing log ${log.id}:`, error);
      }
    }

    // Handle native ETH transfers from transaction data
    for (const transaction of block.transactions) {
      try {
        if (
          transaction.to?.toLowerCase() === AGENT_ADDRESS.toLowerCase() &&
          transaction.value &&
          BigInt(transaction.value) > 0n
        ) {
          const value = BigInt(transaction.value);

          // Log all transactions to agent for debugging
          console.log(`📡 Transaction to agent detected: ${transaction.hash}`);
          console.log(`  From: ${transaction.from}`);
          console.log(`  To: ${transaction.to}`);
          console.log(`  Value: ${value} wei`);
          console.log(`  Status: ${transaction.status || "unknown"}`);
          console.log(`  Block: ${block.header.height}`);

          // Check if transaction was successful
          // Status can be number, boolean, string, or undefined
          const status = transaction.status;
          let isSuccessful = true; // Default to success
          if (typeof status === "number" && status === 0) {
            isSuccessful = false;
          } else if (typeof status === "boolean" && status === false) {
            isSuccessful = false;
          } else if (typeof status === "string" && status === "0x0") {
            isSuccessful = false;
          }
          const isPayment = value >= MIN_PAYMENT_WEI && isSuccessful;

          const transfer = new EthTransfer({
            id: `${transaction.hash}-eth`,
            blockNumber: block.header.height,
            timestamp: new Date(block.header.timestamp),
            transactionHash: transaction.hash,
            from: transaction.from.toLowerCase(),
            to: transaction.to.toLowerCase(),
            value: value,
            tokenType: "ETH",
            isPayment: isPayment,
            status: isSuccessful ? "success" : "failed",
          });

          ethTransfers.push(transfer);

          if (isPayment) {
            console.log(
              `💰 ETH PAYMENT CONFIRMED: ${value} wei (${Number(value) / 1e18} ETH) from ${transaction.from} to ${transaction.to}`,
            );
          } else if (!isSuccessful) {
            console.log(`❌ Transaction failed: ${transaction.hash}`);
          } else if (value < MIN_PAYMENT_WEI) {
            console.log(
              `⚠️ Transaction below minimum: ${value} wei (need ${MIN_PAYMENT_WEI})`,
            );
          }
        }
      } catch (error) {
        console.error(
          `Error processing transaction ${transaction.hash}:`,
          error,
        );
      }
    }

    // Handle smart wallet transactions (check for balance changes)
    await handleSmartWalletTransactions(ctx, block, ethTransfers);
  }

  // Save all data to database
  await ctx.store.save(ethTransfers);
  await ctx.store.save(contractDeployments);
  await ctx.store.save(contractEvents);

  // Log summary
  const currentBlock = ctx.blocks[ctx.blocks.length - 1];
  if (currentBlock) {
    const ethPayments = ethTransfers.filter((t) => t.isPayment);
    const ethTransfers_filtered = ethTransfers.filter(
      (t) => t.tokenType === "ETH" || t.tokenType === "ETH-SMART-WALLET",
    );
    const usdcTransfers_filtered = ethTransfers.filter(
      (t) => t.tokenType === "USDC",
    );

    // Calculate total ETH amount
    const totalEthAmount = ethTransfers_filtered.reduce(
      (sum, transfer) => sum + transfer.value,
      0n,
    );
    const ethAmountStr =
      totalEthAmount > 0n ? `${Number(totalEthAmount) / 1e18} ETH` : "0 ETH";

    console.log(
      `📊 Processed blocks ${ctx.blocks[0].header.height} to ${currentBlock.header.height}:`,
    );
    console.log(
      `  💰 ${ethTransfers.length} transfers: ${ethAmountStr}, ${usdcTransfers_filtered.length} USDC (${ethPayments.length} payments >= minimum)`,
    );
    console.log(`  🏭 ${contractDeployments.length} contract deployments`);
    console.log(`  📋 ${contractEvents.length} contract events`);
    console.log(`  🔍 ${knownContracts.size} known contracts`);

    // Log any payments found in detail
    if (ethPayments.length > 0) {
      console.log(`🎯 PAYMENTS DETECTED:`);
      ethPayments.forEach((payment) => {
        const amount =
          payment.tokenType === "ETH"
            ? `${Number(payment.value) / 1e18} ETH`
            : payment.tokenType === "USDC"
              ? `${Number(payment.value) / 1e6} USDC`
              : `${payment.value} ${payment.tokenType}`;
        console.log(
          `  💰 ${amount} from ${payment.from} (block ${payment.blockNumber})`,
        );
      });
    }
  }
});

/**
 * Handle smart wallet transactions by detecting balance changes
 * This catches internal ETH transfers that don't show up as direct transactions
 */
async function handleSmartWalletTransactions(
  ctx: any,
  block: any,
  ethTransfers: EthTransfer[],
): Promise<void> {
  // Check if this block contains any UserOperations to EntryPoint contracts
  let hasUserOperations = false;
  let userOpTransactions: string[] = [];

  for (const log of block.logs) {
    if (
      (log.address.toLowerCase() ===
        SMART_WALLET_ADDRESSES.ENTRYPOINT_V6.toLowerCase() ||
        log.address.toLowerCase() ===
          SMART_WALLET_ADDRESSES.ENTRYPOINT_V7.toLowerCase()) &&
      log.topics[0] === EVENT_SIGNATURES.USER_OPERATION_EVENT
    ) {
      hasUserOperations = true;
      userOpTransactions.push(log.transactionHash);
      console.log(
        `🔍 UserOperation detected in block ${block.header.height}: ${log.transactionHash}`,
      );

      // Process the UserOperation to get sender info
      const userOpInfo = processUserOperation(log);
      if (userOpInfo) {
        console.log(
          `   Sender: ${userOpInfo.sender}, Success: ${userOpInfo.success}`,
        );
      }
    }
  }

  // If we found UserOperations, create investigation entries
  if (hasUserOperations) {
    try {
      console.log(
        `🧠 Smart wallet activity detected in block ${block.header.height}`,
      );
      console.log(
        `   UserOperation transactions: ${userOpTransactions.join(", ")}`,
      );
      console.log(
        `   This block may contain internal ETH transfers to the agent`,
      );

      // Create entry for smart wallet investigation
      // Note: The agent will handle balance change detection using its own viem client
      const smartWalletTransfer = new EthTransfer({
        id: `${block.header.height}-smart-wallet-${userOpTransactions[0]?.slice(-8) || "unknown"}`,
        blockNumber: block.header.height,
        timestamp: new Date(block.header.timestamp),
        transactionHash:
          userOpTransactions[0] || `smart-wallet-block-${block.header.height}`,
        from: "smart-wallet-investigation",
        to: AGENT_ADDRESS.toLowerCase(),
        value: 0n, // Placeholder - agent will verify actual amount via balance checking
        tokenType: "ETH-SMART-WALLET",
        isPayment: false, // Will be updated by agent after balance verification
        status: "investigating",
      });

      // Only add if we haven't already added one for this block
      const existingCheck = ethTransfers.find(
        (t) => t.id === `${block.header.height}-smart-wallet-check`,
      );

      if (!existingCheck) {
        ethTransfers.push(smartWalletTransfer);
        console.log(
          `📝 Added smart wallet investigation entry for block ${block.header.height}`,
        );
      }
    } catch (error) {
      console.error(
        `Error handling smart wallet transactions in block ${block.header.height}:`,
        error,
      );
    }
  }
}

/**
 * Enhanced UserOperation processing
 * Decodes UserOperation events to extract transaction details
 */
function processUserOperation(
  log: any,
): { sender: string; success: boolean } | null {
  try {
    // UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)
    if (log.topics.length >= 3) {
      const sender = `0x${log.topics[2].slice(26)}`; // Extract sender from topic2

      // Decode success from data (5th parameter, boolean)
      let success = true;
      if (log.data && log.data.length > 130) {
        // Ensure we have enough data
        // The success boolean is typically at offset 128 (after nonce uint256)
        const successHex = log.data.slice(130, 132); // Get 1 byte for boolean
        success = successHex !== "00";
      }

      return { sender: sender.toLowerCase(), success };
    }
  } catch (error) {
    console.error("Error processing UserOperation:", error);
  }

  return null;
}
