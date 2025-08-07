import { createPublicClient, createWalletClient, http, getContract, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

// USDC Contract ABI (essential functions)
const USDC_ABI = [
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "to", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "name": "transfer",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "spender", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// Base network USDC addresses
const USDC_ADDRESSES = {
  mainnet: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet USDC
  testnet: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
} as const;

export interface USDCPriceConfig {
  amountUSD: number;        // Price in USD (e.g., 5.99)
  amountUSDC: string;       // Price in USDC wei (e.g., "5990000")
  formattedUSDC: string;    // Human readable (e.g., "5.99 USDC")
}

export class USDCHandler {
  private publicClient;
  private walletClient;
  private usdcAddress: string;
  private account;

  constructor(
    rpcUrl: string,
    privateKey: string,
    isMainnet: boolean = false
  ) {
    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    this.usdcAddress = isMainnet ? USDC_ADDRESSES.mainnet : USDC_ADDRESSES.testnet;
    
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: base,
      transport: http(rpcUrl),
    });
  }

  /**
   * Convert USD amount to USDC price configuration
   */
  convertUSDToUSDC(amountUSD: number): USDCPriceConfig {
    // USDC has 6 decimals
    const amountUSDC = parseUnits(amountUSD.toString(), 6).toString();
    const formattedUSDC = `${amountUSD.toFixed(2)} USDC`;

    return {
      amountUSD,
      amountUSDC,
      formattedUSDC,
    };
  }

  /**
   * Get USDC balance for an address
   */
  async getUSDCBalance(address: string): Promise<{
    balance: string;
    formatted: string;
  }> {
    try {
      const contract = getContract({
        address: this.usdcAddress as `0x${string}`,
        abi: USDC_ABI,
        client: this.publicClient,
      });

      const balance = await contract.read.balanceOf([address as `0x${string}`]);
      const formatted = formatUnits(balance, 6);

      return {
        balance: balance.toString(),
        formatted: `${formatted} USDC`,
      };
    } catch (error) {
      console.error("Error getting USDC balance:", error);
      return { balance: "0", formatted: "0 USDC" };
    }
  }

  /**
   * Create USDC transfer transaction data
   */
  createUSDCTransferData(toAddress: string, amountUSDC: string): {
    to: string;
    data: string;
    value: string; // Always "0" for USDC transfers
  } {
    try {
      // For USDC transfers, we need to encode the transfer function call
      // This is a simplified version - in production, use encodeFunctionData from viem
      const transferSelector = "0xa9059cbb"; // transfer(address,uint256)
      const paddedAddress = toAddress.slice(2).padStart(64, "0");
      const paddedAmount = BigInt(amountUSDC).toString(16).padStart(64, "0");
      
      const data = transferSelector + paddedAddress + paddedAmount;

      return {
        to: this.usdcAddress,
        data,
        value: "0", // No ETH value for USDC transfers
      };
    } catch (error) {
      console.error("Error creating USDC transfer data:", error);
      throw error;
    }
  }

  /**
   * Parse user input for USD pricing
   * Supports formats: "$5", "5.99", "$10.50", "5"
   */
  parseUSDInput(input: string): number | null {
    try {
      // Remove $ symbol and whitespace
      const cleaned = input.replace(/[$\s]/g, "");
      const amount = parseFloat(cleaned);
      
      if (isNaN(amount) || amount <= 0) {
        return null;
      }
      
      return amount;
    } catch {
      return null;
    }
  }

  /**
   * Validate USD amount for tier pricing
   */
  validateUSDAmount(amount: number): { valid: boolean; error?: string } {
    if (amount < 0.01) {
      return { valid: false, error: "Minimum price is $0.01" };
    }
    
    if (amount > 1000) {
      return { valid: false, error: "Maximum price is $1000" };
    }
    
    // Check for reasonable decimal places (max 2)
    if (Number((amount % 0.01).toFixed(2)) !== 0) {
      return { valid: false, error: "Price can only have 2 decimal places" };
    }
    
    return { valid: true };
  }

  /**
   * Get current USDC/USD rate (simplified - in production, use price oracle)
   */
  async getUSDCRate(): Promise<number> {
    // For Base network, USDC is typically 1:1 with USD
    // In production, you'd fetch from a price oracle
    return 1.0;
  }

  /**
   * Format price display for users
   */
  formatPriceDisplay(usdAmount: number, duration: number): string {
    const priceConfig = this.convertUSDToUSDC(usdAmount);
    const timeUnit = duration === 1 ? "day" : "days";
    
    return `💰 **$${usdAmount.toFixed(2)} USD** (${priceConfig.formattedUSDC})\n⏰ **${duration} ${timeUnit}** access`;
  }

  /**
   * Create approval transaction for USDC spending
   */
  createUSDCApprovalData(spenderAddress: string, amount: string): {
    to: string;
    data: string;
    value: string;
  } {
    try {
      const approveSelector = "0x095ea7b3"; // approve(address,uint256)
      const paddedSpender = spenderAddress.slice(2).padStart(64, "0");
      const paddedAmount = BigInt(amount).toString(16).padStart(64, "0");
      
      const data = approveSelector + paddedSpender + paddedAmount;

      return {
        to: this.usdcAddress,
        data,
        value: "0",
      };
    } catch (error) {
      console.error("Error creating USDC approval data:", error);
      throw error;
    }
  }
}