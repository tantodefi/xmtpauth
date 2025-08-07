import type { WalletSendCallsParams } from "@xmtp/content-type-wallet-send-calls";

/**
 * Create payment transaction for group creation
 * User pays 0.001 ETH to agent for deployment costs
 */
export function createGroupCreationPayment(
  agentAddress: string,
  groupName: string,
  fromAddress: string, // Add the user's address
): WalletSendCallsParams {
  // 0.001 ETH in wei as decimal string (like the working USDC example uses for amounts)
  const deploymentFeeWei = "1000000000000000"; // 0.001 ETH in wei (decimal string)

  return {
    version: "1.0",
    // Remove from field to let XMTP.chat handle wallet connection automatically
    chainId: "0x14a34", // Base Sepolia chain ID (84532 in hex)
    calls: [
      {
        to: agentAddress as `0x${string}`,
        data: "0x" as `0x${string}`,
        value: deploymentFeeWei, // Try decimal string format instead of hex
        metadata: {
          description: `Payment for creating premium group: ${groupName}`,
          transactionType: "premium-group-creation",
          amount: "0.001", // Human readable amount
          currency: "ETH",
        },
      },
    ],
  };
}

/**
 * Create trial access grant transaction (free for creators)
 * Creator grants free access tokens to users
 */
export function createTrialAccessGrant(
  contractAddress: string,
  recipientAddress: string,
  tokenId: number,
  groupName: string,
): WalletSendCallsParams {
  // ABI for mint function
  const mintABI = "0xa0712d68"; // mint(address,uint256,uint256,bytes)

  // Encode function data for minting 1 token to recipient
  const functionData =
    mintABI +
    recipientAddress.slice(2).padStart(64, "0") + // to address
    tokenId.toString(16).padStart(64, "0") + // tokenId
    "0000000000000000000000000000000000000000000000000000000000000001" + // amount (1)
    "0000000000000000000000000000000000000000000000000000000000000080" + // data offset
    "0000000000000000000000000000000000000000000000000000000000000000"; // data length (empty)

  return {
    version: "1.0",
    from: recipientAddress as `0x${string}`, // Creator's address (they pay gas)
    chainId: "0x14a34", // Base Sepolia chain ID
    calls: [
      {
        to: contractAddress as `0x${string}`,
        data: functionData as `0x${string}`,
        value: "0", // Free for creators - no payment required
        metadata: {
          description: `Grant free trial access to ${groupName}`,
          transactionType: "trial-access-grant",
          currency: "ETH",
          amount: "0", // Free
        },
      },
    ],
  };
}

/**
 * Create access purchase transaction
 * User pays for access tokens
 */
export function createAccessPurchase(
  contractAddress: string,
  tokenId: number,
  priceWei: string,
  groupName: string,
  fromAddress: string, // User's address who is purchasing
): WalletSendCallsParams {
  // Similar to trial but with payment
  const mintABI = "0xa0712d68";

  const functionData =
    mintABI +
    "0000000000000000000000000000000000000000000000000000000000000000" + // will be replaced with user address
    tokenId.toString(16).padStart(64, "0") +
    "0000000000000000000000000000000000000000000000000000000000000001" +
    "0000000000000000000000000000000000000000000000000000000000000080" +
    "0000000000000000000000000000000000000000000000000000000000000000";

  return {
    version: "1.0",
    from: fromAddress as `0x${string}`, // User pays for their own access
    chainId: "0x14a34", // Base Sepolia chain ID
    calls: [
      {
        to: contractAddress as `0x${string}`,
        data: functionData as `0x${string}`,
        value: priceWei, // User pays the tier price (should be decimal string format)
        metadata: {
          description: `Purchase access to ${groupName}`,
          transactionType: "access-purchase",
          currency: "ETH",
          amount: (parseInt(priceWei) / 1e18).toString(), // Convert wei to ETH for display
        },
      },
    ],
  };
}
