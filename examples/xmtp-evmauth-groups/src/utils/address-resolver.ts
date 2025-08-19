/**
 * Enhanced address resolver for various formats including smart contract wallets
 */
import { createPublicClient, http } from "viem";
import { base, mainnet } from "viem/chains";

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
   * Create a public client for name resolution
   */
  createPublicClient(chainId: number = 8453) {
    const chain = chainId === 1 ? mainnet : base;
    return createPublicClient({
      chain,
      transport: http(),
    });
  },

  /**
   * Resolve Basename using Base L2 Resolver
   */
  async resolveBasename(
    name: string,
    publicClient?: any,
  ): Promise<string | null> {
    try {
      console.log(`🔍 Resolving Basename: ${name}`);

      // Remove @ prefix if present
      const cleanName = name.startsWith("@") ? name.slice(1) : name;

      // Use the provided client or create a Base client
      const client = publicClient || this.createPublicClient(8453); // Base mainnet

      // Resolve the name using viem's built-in ENS resolution on Base
      const address = await client.getEnsAddress({
        name: cleanName,
      });

      if (address) {
        console.log(`✅ Basename resolved: ${cleanName} -> ${address}`);
        return address.toLowerCase();
      }

      console.log(`⚠️ Basename not found: ${cleanName}`);
      return null;
    } catch (error) {
      console.warn(`❌ Basename resolution failed for ${name}:`, error);
      return null;
    }
  },

  /**
   * Resolve ENS name using Ethereum mainnet
   */
  async resolveENS(name: string, publicClient?: any): Promise<string | null> {
    try {
      console.log(`🔍 Resolving ENS: ${name}`);

      // Remove @ prefix if present
      const cleanName = name.startsWith("@") ? name.slice(1) : name;

      // Create mainnet client for ENS resolution
      const client = createPublicClient({
        chain: mainnet,
        transport: http(),
      });

      // Resolve the ENS name
      const address = await client.getEnsAddress({
        name: cleanName,
      });

      if (address) {
        console.log(`✅ ENS resolved: ${cleanName} -> ${address}`);
        return address.toLowerCase();
      }

      console.log(`⚠️ ENS not found: ${cleanName}`);
      return null;
    } catch (error) {
      console.warn(`❌ ENS resolution failed for ${name}:`, error);
      return null;
    }
  },

  /**
   * Resolve Farcaster handle using Airstack API
   * Note: This requires an API key and is currently disabled
   */
  async resolveFarcaster(handle: string): Promise<string | null> {
    try {
      console.log(`🔍 Resolving Farcaster handle: ${handle}`);

      // Remove @ prefix if present
      const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;

      // For now, return null - can be enhanced with Airstack API
      console.log(
        `⚠️ Farcaster resolution not implemented for: ${cleanHandle}`,
      );
      return null;
    } catch (error) {
      console.warn(`❌ Farcaster resolution failed for ${handle}:`, error);
      return null;
    }
  },

  /**
   * Check if an address is a smart contract
   */
  async isSmartContract(address: string, publicClient?: any): Promise<boolean> {
    if (!publicClient) {
      console.warn("No publicClient provided for smart contract detection");
      return false;
    }

    if (!address || !this.isValidEthereumAddress(address)) {
      console.warn(`Invalid address provided for contract check: ${address}`);
      return false;
    }

    try {
      const code = await publicClient.getBytecode({
        address: address as `0x${string}`,
      });
      const isContract = code !== undefined && code !== "0x" && code !== null;
      console.log(
        `Smart contract check for ${address}: ${isContract ? "CONTRACT" : "EOA"}`,
      );
      return isContract;
    } catch (error) {
      console.warn(`Could not check if ${address} is a contract:`, error);
      // Return false but don't fail - assume EOA
      return false;
    }
  },

  /**
   * Validate Ethereum address format
   */
  isValidEthereumAddress(address: string): boolean {
    if (!address || typeof address !== "string") return false;
    return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
  },

  /**
   * Resolve address from various formats
   */
  async resolveAddress(
    input: string,
    publicClient?: any,
  ): Promise<AddressResolution> {
    if (!input || typeof input !== "string") {
      return {
        address: null,
        error: "Invalid input: address cannot be empty",
        source: "invalid",
      };
    }

    const cleanInput = input.trim();

    if (!cleanInput) {
      return {
        address: null,
        error: "Invalid input: address cannot be empty after trimming",
        source: "invalid",
      };
    }

    // Direct Ethereum address - enhanced validation
    if (this.isValidEthereumAddress(cleanInput)) {
      const address = cleanInput.toLowerCase();

      console.log(`📍 Resolving direct address: ${address}`);

      // Check if it's a smart contract with enhanced error handling
      let isContract = false;
      try {
        isContract = await this.isSmartContract(address, publicClient);
      } catch (error) {
        console.warn(
          `Smart contract detection failed for ${address}, assuming EOA:`,
          error,
        );
        isContract = false;
      }

      return {
        address,
        error: null,
        source: "direct",
        isSmartContract: isContract,
      };
    }

    // Basename format (@username.base.eth)
    if (cleanInput.match(/^@[a-zA-Z0-9-]+\.base\.eth$/)) {
      console.log(`🔍 Attempting Basename resolution for: ${cleanInput}`);
      try {
        const resolvedAddress = await this.resolveBasename(
          cleanInput,
          publicClient,
        );

        if (resolvedAddress) {
          // Check if the resolved address is a smart contract
          let isContract = false;
          try {
            isContract = await this.isSmartContract(
              resolvedAddress,
              publicClient,
            );
          } catch (error) {
            console.warn(
              `Smart contract detection failed for resolved address ${resolvedAddress}:`,
              error,
            );
          }

          return {
            address: resolvedAddress,
            error: null,
            source: "basename",
            isSmartContract: isContract,
          };
        } else {
          return {
            address: null,
            error: `Basename not found: ${cleanInput}. Please verify the name exists on Base.`,
            source: "basename",
          };
        }
      } catch (error) {
        console.error(`Basename resolution error for ${cleanInput}:`, error);
        return {
          address: null,
          error: `Failed to resolve Basename ${cleanInput}: ${error instanceof Error ? error.message : String(error)}`,
          source: "basename",
        };
      }
    }

    // ENS format (@username.eth)
    if (cleanInput.match(/^@[a-zA-Z0-9-]+\.eth$/)) {
      console.log(`🔍 Attempting ENS resolution for: ${cleanInput}`);
      try {
        const resolvedAddress = await this.resolveENS(cleanInput, publicClient);

        if (resolvedAddress) {
          // Check if the resolved address is a smart contract
          let isContract = false;
          try {
            isContract = await this.isSmartContract(
              resolvedAddress,
              publicClient,
            );
          } catch (error) {
            console.warn(
              `Smart contract detection failed for resolved address ${resolvedAddress}:`,
              error,
            );
          }

          return {
            address: resolvedAddress,
            error: null,
            source: "ens",
            isSmartContract: isContract,
          };
        } else {
          return {
            address: null,
            error: `ENS name not found: ${cleanInput}. Please verify the name exists.`,
            source: "ens",
          };
        }
      } catch (error) {
        console.error(`ENS resolution error for ${cleanInput}:`, error);
        return {
          address: null,
          error: `Failed to resolve ENS name ${cleanInput}: ${error instanceof Error ? error.message : String(error)}`,
          source: "ens",
        };
      }
    }

    // Farcaster format (@handle)
    if (cleanInput.match(/^@[a-zA-Z0-9-]+$/)) {
      console.log(`🔍 Attempting Farcaster resolution for: ${cleanInput}`);
      try {
        const resolvedAddress = await this.resolveFarcaster(cleanInput);

        if (resolvedAddress) {
          // Check if the resolved address is a smart contract
          let isContract = false;
          try {
            isContract = await this.isSmartContract(
              resolvedAddress,
              publicClient,
            );
          } catch (error) {
            console.warn(
              `Smart contract detection failed for resolved address ${resolvedAddress}:`,
              error,
            );
          }

          return {
            address: resolvedAddress,
            error: null,
            source: "farcaster",
            isSmartContract: isContract,
          };
        } else {
          return {
            address: null,
            error: `Farcaster handle resolution is not yet implemented. Please use a direct Ethereum address or Basename/ENS.`,
            source: "farcaster",
          };
        }
      } catch (error) {
        console.error(`Farcaster resolution error for ${cleanInput}:`, error);
        return {
          address: null,
          error: `Failed to resolve Farcaster handle ${cleanInput}: ${error instanceof Error ? error.message : String(error)}`,
          source: "farcaster",
        };
      }
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
    if (!address) return "Unknown";

    if (!isSmartContract) {
      return "EOA (Externally Owned Account)";
    }

    // Could be enhanced with more specific contract detection
    return "Smart Contract Wallet";
  },

  /**
   * Safe address resolution with comprehensive error handling
   * This is the recommended method to use throughout the application
   */
  async safeResolveAddress(
    input: string,
    publicClient?: any,
    context: string = "unknown",
  ): Promise<AddressResolution> {
    console.log(`🔍 [${context}] Starting address resolution for: "${input}"`);

    try {
      const resolution = await this.resolveAddress(input, publicClient);

      if (resolution.address) {
        console.log(
          `✅ [${context}] Address resolved successfully: ${resolution.address} (${resolution.source})`,
        );
      } else {
        console.warn(
          `⚠️ [${context}] Address resolution failed: ${resolution.error}`,
        );
      }

      return resolution;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `❌ [${context}] Address resolution threw error:`,
        errorMessage,
      );

      return {
        address: null,
        error: `Address resolution failed: ${errorMessage}`,
        source: "error",
      };
    }
  },

  /**
   * Validate and normalize an address that should already be resolved
   */
  validateResolvedAddress(
    address: string | null | undefined,
    context: string = "unknown",
  ): {
    isValid: boolean;
    normalizedAddress: string | null;
    error: string | null;
  } {
    if (!address) {
      console.warn(`⚠️ [${context}] Address is null/undefined`);
      return {
        isValid: false,
        normalizedAddress: null,
        error: "Address is null or undefined",
      };
    }

    if (typeof address !== "string") {
      console.warn(
        `⚠️ [${context}] Address is not a string: ${typeof address}`,
      );
      return {
        isValid: false,
        normalizedAddress: null,
        error: `Address must be a string, got ${typeof address}`,
      };
    }

    const trimmed = address.trim();
    if (!this.isValidEthereumAddress(trimmed)) {
      console.warn(
        `⚠️ [${context}] Invalid Ethereum address format: ${trimmed}`,
      );
      return {
        isValid: false,
        normalizedAddress: null,
        error: `Invalid Ethereum address format: ${trimmed}`,
      };
    }

    const normalized = trimmed.toLowerCase();
    console.log(`✅ [${context}] Address validated: ${normalized}`);
    return {
      isValid: true,
      normalizedAddress: normalized,
      error: null,
    };
  },
};
