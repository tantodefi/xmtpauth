/**
 * Enhanced address resolver for various formats including smart contract wallets
 */

export interface AddressResolution {
  address: string | null;
  error: string | null;
  source: string;
  isSmartContract?: boolean;
}

// Common smart contract wallet patterns
const SMART_CONTRACT_PATTERNS = {
  // Coinbase Wallet (Base)
  COINBASE_BASE: /^0x[a-fA-F0-9]{40}$/, // Will be detected by checking if it's a contract

  // Safe (formerly Gnosis Safe)
  SAFE: /^0x[a-fA-F0-9]{40}$/,

  // Argent
  ARGENT: /^0x[a-fA-F0-9]{40}$/,

  // Rainbow
  RAINBOW: /^0x[a-fA-F0-9]{40}$/,
};

// Known contract addresses (Base mainnet)
const KNOWN_CONTRACTS = {
  // Add known contract addresses here
  // Example: "0x1234...": "Coinbase Wallet",
};

export const addressResolver = {
  /**
   * Check if an address is a smart contract
   */
  async isSmartContract(address: string, publicClient?: any): Promise<boolean> {
    if (!publicClient) return false;

    try {
      const code = await publicClient.getBytecode({
        address: address as `0x${string}`,
      });
      return code !== undefined && code !== "0x";
    } catch (error) {
      console.warn(`Could not check if ${address} is a contract:`, error);
      return false;
    }
  },

  /**
   * Resolve address from various formats
   */
  async resolveAddress(
    input: string,
    publicClient?: any,
  ): Promise<AddressResolution> {
    const cleanInput = input.trim();

    // Direct Ethereum address
    if (cleanInput.match(/^0x[a-fA-F0-9]{40}$/)) {
      const address = cleanInput.toLowerCase();

      // Check if it's a smart contract
      const isContract = await this.isSmartContract(address, publicClient);

      return {
        address,
        error: null,
        source: "direct",
        isSmartContract: isContract,
      };
    }

    // Basename format (@username.base.eth)
    if (cleanInput.match(/^@[a-zA-Z0-9-]+\.base\.eth$/)) {
      // For now, return error but could be enhanced with actual resolution
      return {
        address: null,
        error:
          "Basename resolution temporarily disabled. Please use a direct Ethereum address.",
        source: "basename",
      };
    }

    // ENS format (@username.eth)
    if (cleanInput.match(/^@[a-zA-Z0-9-]+\.eth$/)) {
      return {
        address: null,
        error:
          "ENS resolution temporarily disabled. Please use a direct Ethereum address.",
        source: "ens",
      };
    }

    // Farcaster format (@handle)
    if (cleanInput.match(/^@[a-zA-Z0-9-]+$/)) {
      return {
        address: null,
        error:
          "Farcaster resolution temporarily disabled. Please use a direct Ethereum address.",
        source: "farcaster",
      };
    }

    // Invalid format
    return {
      address: null,
      error: `Invalid address format: ${cleanInput}`,
      source: "invalid",
    };
  },

  /**
   * Format resolution for display
   */
  formatResolution(resolution: AddressResolution): string {
    if (resolution.address) {
      let display = `${resolution.address} (${resolution.source})`;
      if (resolution.isSmartContract) {
        display += " [Smart Contract]";
      }
      return display;
    }
    return `Unresolved (${resolution.source})`;
  },

  /**
   * Get wallet type information
   */
  getWalletType(address: string, isSmartContract: boolean = false): string {
    if (!isSmartContract) {
      return "EOA (Externally Owned Account)";
    }

    // Could be enhanced with more specific contract detection
    return "Smart Contract Wallet";
  },
};
