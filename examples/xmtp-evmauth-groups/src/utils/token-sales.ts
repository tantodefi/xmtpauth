// Wallet send calls interface (would come from @xmtp/content-type-wallet-send-calls if installed)
interface WalletSendCallsParams {
  version: string;
  from: `0x${string}`;
  chainId: `0x${string}`;
  calls: Array<{
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
    metadata?: Record<string, any>; // Make metadata more flexible
  }>;
}
import { formatUnits, toHex } from "viem";
import { base } from "viem/chains";
import { EVMAuthHandler } from "../handlers/evmauth-handler";
import type { AccessTier } from "../types/types";

export class TokenSalesHandler {
  private evmAuthHandler: EVMAuthHandler;
  private feeRecipient: string;
  private feeBasisPoints: number; // e.g., 250 = 2.5%

  constructor(
    evmAuthHandler: EVMAuthHandler,
    feeRecipient: string,
    feeBasisPoints: number
  ) {
    this.evmAuthHandler = evmAuthHandler;
    this.feeRecipient = feeRecipient;
    this.feeBasisPoints = feeBasisPoints;
  }

  /**
   * Create a purchase transaction for an access token
   */
  async createPurchaseTransaction(
    userAddress: string,
    contractAddress: string,
    tier: AccessTier,
    tokenId: number = 1
  ): Promise<WalletSendCallsParams> {
    try {
      const price = BigInt(tier.priceWei);
      const fee = (price * BigInt(this.feeBasisPoints)) / BigInt(10000);
      const totalPrice = price + fee;

      // Create the main purchase transaction
      const mintTx = await this.evmAuthHandler.createMintTransaction(
        contractAddress,
        userAddress,
        tier,
        tokenId
      );

      const calls = [
        {
          to: mintTx.to as `0x${string}`,
          data: mintTx.data as `0x${string}`,
          value: BigInt(mintTx.value),
          metadata: {
            description: `Purchase ${tier.name} access token`,
            transactionType: "nft-mint" as const,
            currency: "ETH",
            amount: Number(price),
            decimals: 18,
            networkId: "base",
            contractAddress,
            tokenId: tokenId.toString(),
            tierName: tier.name,
            durationDays: tier.durationDays,
          } as Record<string, any>,
        },
      ];

      // Add fee payment if applicable
      if (fee > 0n) {
        calls.push({
          to: this.feeRecipient as `0x${string}`,
          data: "0x" as `0x${string}`,
          value: fee,
          metadata: {
            description: "Platform fee",
            transactionType: "nft-mint" as const, // Keep consistent with main transaction
            currency: "ETH",
            amount: Number(fee),
            decimals: 18,
            networkId: "base",
            isFee: true,
          } as Record<string, any>,
        });
      }

      return {
        version: "1.0",
        from: userAddress as `0x${string}`,
        chainId: toHex(base.id),
        calls,
      };
    } catch (error) {
      console.error("Error creating purchase transaction:", error);
      throw new Error("Failed to create purchase transaction");
    }
  }

  /**
   * Create bulk purchase transaction for multiple tiers
   */
  async createBulkPurchaseTransaction(
    userAddress: string,
    contractAddress: string,
    purchases: Array<{ tier: AccessTier; tokenId: number; quantity?: number }>
  ): Promise<WalletSendCallsParams> {
    try {
      const calls = [];
      let totalValue = 0n;

      for (const purchase of purchases) {
        const quantity = purchase.quantity || 1;
        const price = BigInt(purchase.tier.priceWei) * BigInt(quantity);
        const fee = (price * BigInt(this.feeBasisPoints)) / BigInt(10000);

        const mintTx = await this.evmAuthHandler.createMintTransaction(
          contractAddress,
          userAddress,
          purchase.tier,
          purchase.tokenId
        );

        calls.push({
          to: mintTx.to as `0x${string}`,
          data: mintTx.data as `0x${string}`,
          value: BigInt(mintTx.value) * BigInt(quantity),
          metadata: {
            description: `Purchase ${quantity}x ${purchase.tier.name} access token(s)`,
            transactionType: "nft-mint" as const,
            currency: "ETH",
            amount: Number(price),
            decimals: 18,
            networkId: "base",
            contractAddress,
            tokenId: purchase.tokenId.toString(),
            tierName: purchase.tier.name,
            durationDays: purchase.tier.durationDays,
            quantity,
          },
        });

        totalValue += price + fee;

        // Add fee payment
        if (fee > 0n) {
          calls.push({
            to: this.feeRecipient as `0x${string}`,
            data: "0x" as `0x${string}`,
            value: fee,
            metadata: {
              description: `Platform fee for ${purchase.tier.name}`,
              transactionType: "nft-mint" as const, // Keep consistent with main transaction
              currency: "ETH",
              amount: Number(fee),
              decimals: 18,
              networkId: "base",
              isFee: true,
            } as Record<string, any>,
          });
        }
      }

      return {
        version: "1.0",
        from: userAddress as `0x${string}`,
        chainId: toHex(base.id),
        calls,
      };
    } catch (error) {
      console.error("Error creating bulk purchase transaction:", error);
      throw new Error("Failed to create bulk purchase transaction");
    }
  }

  /**
   * Create a gift transaction (purchase for another user)
   */
  async createGiftTransaction(
    purchaserAddress: string,
    recipientAddress: string,
    contractAddress: string,
    tier: AccessTier,
    tokenId: number = 1,
    message?: string
  ): Promise<WalletSendCallsParams> {
    try {
      const price = BigInt(tier.priceWei);
      const fee = (price * BigInt(this.feeBasisPoints)) / BigInt(10000);

      // Create mint transaction for recipient
      const mintTx = await this.evmAuthHandler.createMintTransaction(
        contractAddress,
        recipientAddress, // Mint to recipient, not purchaser
        tier,
        tokenId
      );

      const calls = [
        {
          to: mintTx.to as `0x${string}`,
          data: mintTx.data as `0x${string}`,
          value: BigInt(mintTx.value),
          metadata: {
            description: message 
              ? `Gift: ${tier.name} access token - "${message}"`
              : `Gift: ${tier.name} access token`,
            transactionType: "nft-gift" as const,
            currency: "ETH",
            amount: Number(price),
            decimals: 18,
            networkId: "base",
            contractAddress,
            tokenId: tokenId.toString(),
            tierName: tier.name,
            durationDays: tier.durationDays,
            recipient: recipientAddress,
            isGift: true,
          } as Record<string, any>,
        },
      ];

      // Add fee payment
      if (fee > 0n) {
        calls.push({
          to: this.feeRecipient as `0x${string}`,
          data: "0x" as `0x${string}`,
          value: fee,
          metadata: {
            description: "Platform fee for gift",
            transactionType: "nft-gift" as const, // Keep consistent with main transaction
            currency: "ETH",
            amount: Number(fee),
            decimals: 18,
            networkId: "base",
            isFee: true,
          } as Record<string, any>,
        });
      }

      return {
        version: "1.0",
        from: purchaserAddress as `0x${string}`,
        chainId: toHex(base.id),
        calls,
      };
    } catch (error) {
      console.error("Error creating gift transaction:", error);
      throw new Error("Failed to create gift transaction");
    }
  }

  /**
   * Calculate pricing breakdown for display
   */
  calculatePricing(tier: AccessTier): {
    basePrice: bigint;
    fee: bigint;
    totalPrice: bigint;
    basePriceFormatted: string;
    feeFormatted: string;
    totalPriceFormatted: string;
    feePercentage: number;
  } {
    const basePrice = BigInt(tier.priceWei);
    const fee = (basePrice * BigInt(this.feeBasisPoints)) / BigInt(10000);
    const totalPrice = basePrice + fee;

    return {
      basePrice,
      fee,
      totalPrice,
      basePriceFormatted: formatUnits(basePrice, 18),
      feeFormatted: formatUnits(fee, 18),
      totalPriceFormatted: formatUnits(totalPrice, 18),
      feePercentage: this.feeBasisPoints / 100,
    };
  }

  /**
   * Create pricing display text
   */
  formatPricingDisplay(tier: AccessTier): string {
    const pricing = this.calculatePricing(tier);
    
    return (
      `💰 **${tier.name}** - ${tier.durationDays} days\n` +
      `   Base Price: ${pricing.basePriceFormatted} ETH\n` +
      `   Platform Fee: ${pricing.feeFormatted} ETH (${pricing.feePercentage}%)\n` +
      `   **Total: ${pricing.totalPriceFormatted} ETH**\n` +
      `   ${tier.description || ""}`
    );
  }

  /**
   * Validate transaction parameters
   */
  validatePurchase(
    userAddress: string,
    contractAddress: string,
    tier: AccessTier
  ): { valid: boolean; error?: string } {
    // Basic validation
    if (!userAddress.startsWith("0x") || userAddress.length !== 42) {
      return { valid: false, error: "Invalid user address" };
    }

    if (!contractAddress.startsWith("0x") || contractAddress.length !== 42) {
      return { valid: false, error: "Invalid contract address" };
    }

    if (!tier.priceWei || BigInt(tier.priceWei) <= 0n) {
      return { valid: false, error: "Invalid tier price" };
    }

    if (tier.durationDays <= 0) {
      return { valid: false, error: "Invalid tier duration" };
    }

    // Check max supply if applicable
    if (tier.maxSupply && tier.maxSupply <= 0) {
      return { valid: false, error: "Tier sold out" };
    }

    return { valid: true };
  }

  /**
   * Create refund transaction (if supported by contract)
   */
  async createRefundTransaction(
    userAddress: string,
    contractAddress: string,
    tokenId: number,
    reason?: string
  ): Promise<WalletSendCallsParams> {
    try {
      // This would require a refund function in the EVMAuth contract
      // Implementation depends on the specific contract design
      
      const calls = [
        {
          to: contractAddress as `0x${string}`,
          data: "0x" as `0x${string}`, // Refund function call data
          value: 0n,
          metadata: {
            description: reason ? `Refund: ${reason}` : "Token refund",
            transactionType: "refund" as const,
            currency: "ETH",
            amount: 0,
            decimals: 18,
            networkId: "base",
            contractAddress,
            tokenId: tokenId.toString(),
          },
        },
      ];

      return {
        version: "1.0",
        from: userAddress as `0x${string}`,
        chainId: toHex(base.id),
        calls,
      };
    } catch (error) {
      console.error("Error creating refund transaction:", error);
      throw new Error("Failed to create refund transaction");
    }
  }

  /**
   * Get sales statistics
   */
  async getSalesStats(contractAddress: string): Promise<{
    totalSales: bigint;
    totalFees: bigint;
    activeMemberships: number;
    expiredMemberships: number;
  }> {
    try {
      // This would require events/logs analysis from the contract
      // For now, return placeholder data
      
      const totalSales = await this.evmAuthHandler.getContractBalance(contractAddress);
      const totalFees = (totalSales * BigInt(this.feeBasisPoints)) / BigInt(10000);

      return {
        totalSales,
        totalFees,
        activeMemberships: 0, // Would need to query contract
        expiredMemberships: 0, // Would need to query contract
      };
    } catch (error) {
      console.error("Error getting sales stats:", error);
      return {
        totalSales: 0n,
        totalFees: 0n,
        activeMemberships: 0,
        expiredMemberships: 0,
      };
    }
  }
}