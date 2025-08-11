import type { WalletSendCallsParams } from "@xmtp/content-type-wallet-send-calls";
import { encodeFunctionData } from "viem";

/**
 * Create payment transaction for group creation
 * User pays 0.001 ETH to agent for deployment costs
 */
export function createGroupCreationPayment(
  agentAddress: string,
  groupName: string,
  fromAddress: string, // Add the user's address
): WalletSendCallsParams {
  // 0.001 ETH in wei as hex string (wallet-send-calls expects hex strings for numeric fields)
  const deploymentFeeWeiHex = "0x38d7ea4c68000"; // 1e15 wei

  return {
    version: "1.0",
    from: fromAddress as `0x${string}`,
    chainId: "0x14a34", // Base Sepolia chain ID (84532 in hex)
    calls: [
      {
        to: agentAddress as `0x${string}`,
        data: "0x" as `0x${string}`,
        value: deploymentFeeWeiHex as `0x${string}`,
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
        value: "0x0", // Free for creators - no payment required
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
        value: `0x${BigInt(priceWei).toString(16)}`,
        metadata: {
          description: `Purchase access to ${groupName}`,
          transactionType: "access-purchase",
          currency: "ETH",
          amount: (Number(BigInt(priceWei)) / 1e18).toString(), // Display only (not used onchain)
        },
      },
    ],
  };
}

// USDC and Purchase ABI
const USDC_PURCHASE_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "amountUSDC", type: "uint256" },
    ],
    name: "purchaseAccessUSDC",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export function createUSDCApprovalAndPurchase(
  usdcAddress: string,
  spenderContract: string,
  amountUSDC: string,
  contractAddress: string,
  tokenId: number,
  groupName: string,
  fromAddress: string,
): WalletSendCallsParams {
  // USDC approve call
  const approveData = encodeFunctionData({
    abi: USDC_PURCHASE_ABI,
    functionName: "approve",
    args: [spenderContract as `0x${string}`, BigInt(amountUSDC)],
  });

  // purchaseAccessUSDC call
  const purchaseData = encodeFunctionData({
    abi: USDC_PURCHASE_ABI,
    functionName: "purchaseAccessUSDC",
    args: [BigInt(tokenId), BigInt(amountUSDC)],
  });

  return {
    version: "1.0",
    from: fromAddress as `0x${string}`,
    chainId: "0x14a34",
    calls: [
      {
        to: usdcAddress as `0x${string}`,
        data: approveData,
        value: "0x0" as `0x${string}`,
        metadata: {
          description: `Approve USDC for ${groupName}`,
          transactionType: "usdc-approve",
          currency: "USDC",
        },
      },
      {
        to: contractAddress as `0x${string}`,
        data: purchaseData,
        value: "0x0" as `0x${string}`,
        metadata: {
          description: `Purchase access to ${groupName} (USDC)`,
          transactionType: "usdc-purchase",
          currency: "USDC",
        },
      },
    ],
  };
}

// Contract ABI for tier setup functions
const TIER_SETUP_ABI = [
  {
    inputs: [{ name: "token", type: "address" }],
    name: "setUSDCToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "durationDays", type: "uint256" },
      { name: "priceWei", type: "uint256" },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "imageHash", type: "string" },
      { name: "metadataUri", type: "string" },
    ],
    name: "setupAccessTier",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "priceUSDC", type: "uint256" },
    ],
    name: "setTierUSDCPrice",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * Create tier setup transaction bundle
 * Owner sets up access tiers with USDC support
 */
export function createTierSetupBundle(
  contractAddress: string,
  tiers: Array<{
    name: string;
    description?: string;
    durationDays: number;
    priceWei: string;
    priceUSD?: number;
    metadata?: {
      imageHash?: string;
      ipfsHash?: string;
    };
  }>,
  groupName: string,
  fromAddress: string,
): WalletSendCallsParams {
  const calls: Array<{
    to: `0x${string}`;
    data: `0x${string}`;
    value: `0x${string}`;
    metadata?: {
      description: string;
      transactionType: string;
    } & Record<string, any>;
  }> = [];

  // Check if any tier has USD pricing - if so, add setUSDCToken call first
  const hasUsdPricing = tiers.some(
    (t) => typeof t.priceUSD === "number" && t.priceUSD > 0,
  );

  if (hasUsdPricing) {
    const usdcAddress = (
      process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    ).toLowerCase();

    const setUSDCData = encodeFunctionData({
      abi: TIER_SETUP_ABI,
      functionName: "setUSDCToken",
      args: [usdcAddress as `0x${string}`],
    });

    calls.push({
      to: contractAddress as `0x${string}`,
      data: setUSDCData,
      value: "0x0" as `0x${string}`,
      metadata: {
        description: `Set USDC token for ${groupName}`,
        transactionType: "set-usdc-token",
      },
    });
  }

  // Add setupAccessTier calls for each tier
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const tokenId = i + 1;

    // For tiers with USD pricing, set priceWei to 0
    const ethPrice =
      typeof tier.priceUSD === "number" && tier.priceUSD > 0
        ? 0n
        : BigInt(tier.priceWei);

    const setupTierData = encodeFunctionData({
      abi: TIER_SETUP_ABI,
      functionName: "setupAccessTier",
      args: [
        BigInt(tokenId),
        BigInt(tier.durationDays),
        ethPrice,
        tier.name,
        tier.description ?? "",
        tier.metadata?.imageHash ?? "",
        tier.metadata?.ipfsHash ? `ipfs://${tier.metadata.ipfsHash}` : "",
      ],
    });

    calls.push({
      to: contractAddress as `0x${string}`,
      data: setupTierData,
      value: "0x0" as `0x${string}`,
      metadata: {
        description: `Setup tier: ${tier.name}`,
        transactionType: "setup-access-tier",
        tierName: tier.name,
      },
    });

    // If tier has USD pricing, add setTierUSDCPrice call
    if (typeof tier.priceUSD === "number" && tier.priceUSD > 0) {
      const usdcAmount = Math.round(tier.priceUSD * 1e6); // USDC has 6 decimals
      const setPriceData = encodeFunctionData({
        abi: TIER_SETUP_ABI,
        functionName: "setTierUSDCPrice",
        args: [BigInt(tokenId), BigInt(usdcAmount)],
      });

      calls.push({
        to: contractAddress as `0x${string}`,
        data: setPriceData,
        value: "0x0" as `0x${string}`,
        metadata: {
          description: `Set USDC price for ${tier.name}: $${tier.priceUSD}`,
          transactionType: "set-tier-usdc-price",
          tierName: tier.name,
          priceUSD: tier.priceUSD.toString(),
        },
      });
    }
  }

  return {
    version: "1.0",
    from: fromAddress as `0x${string}`,
    chainId: "0x14a34",
    calls,
  };
}
