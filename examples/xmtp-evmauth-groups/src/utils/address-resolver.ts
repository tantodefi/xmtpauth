import { createPublicClient, http } from "viem";
import { base, mainnet } from "viem/chains";

export interface AddressResolution {
  address: string;
  source: "direct" | "basename" | "ens" | "farcaster" | "cb_id";
  name?: string;
  error?: string;
}

export class AddressResolver {
  private baseClient;
  private mainnetClient;

  constructor() {
    this.baseClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    this.mainnetClient = createPublicClient({
      chain: mainnet,
      transport: http(),
    });
  }

  /**
   * Resolve address from various formats:
   * - Direct address: 0x123...
   * - Basename: @username.base.eth or username.base.eth
   * - ENS: @username.eth or username.eth
   * - Farcaster: @username (tries to resolve via Farcaster API)
   * - Coinbase ID: @username (tries Coinbase ID resolution)
   */
  async resolveAddress(input: string): Promise<AddressResolution> {
    const cleanInput = input.trim();

    // 1. Direct Ethereum address
    if (this.isEthereumAddress(cleanInput)) {
      return {
        address: cleanInput.toLowerCase(),
        source: "direct",
      };
    }

    // Remove @ prefix if present
    const nameInput = cleanInput.startsWith("@")
      ? cleanInput.slice(1)
      : cleanInput;

    // 2. Basename (.base.eth)
    if (nameInput.endsWith(".base.eth") || nameInput.includes(".base.eth")) {
      const result = await this.resolveBasename(nameInput);
      if (result.address) return result;
    }

    // 3. ENS (.eth)
    if (nameInput.endsWith(".eth")) {
      const result = await this.resolveENS(nameInput);
      if (result.address) return result;
    }

    // 4. Try Basename first (most common on Base)
    if (!nameInput.includes(".")) {
      const basenameResult = await this.resolveBasename(
        `${nameInput}.base.eth`,
      );
      if (basenameResult.address) return basenameResult;
    }

    // 5. Try Farcaster handle
    const farcasterResult = await this.resolveFarcaster(nameInput);
    if (farcasterResult.address) return farcasterResult;

    // 6. Try Coinbase ID
    const coinbaseResult = await this.resolveCoinbaseId(nameInput);
    if (coinbaseResult.address) return coinbaseResult;

    return {
      address: "",
      source: "direct",
      error: `Could not resolve "${cleanInput}". Try: 0x123..., @username.base.eth, @username.eth, or @farcaster_handle`,
    };
  }

  /**
   * Resolve Basename (.base.eth) using Base L2 resolver
   */
  private async resolveBasename(name: string): Promise<AddressResolution> {
    try {
      // Ensure name ends with .base.eth
      const fullName = name.endsWith(".base.eth") ? name : `${name}.base.eth`;

      // Use Base's ENS resolver contract
      const baseResolver = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD"; // Base resolver

      const address = await this.baseClient.getEnsAddress({
        name: fullName,
      });

      if (address) {
        return {
          address: address.toLowerCase(),
          source: "basename",
          name: fullName,
        };
      }
    } catch (error) {
      console.log(`Basename resolution failed for ${name}:`, error);
    }

    return {
      address: "",
      source: "basename",
      error: `Basename ${name} not found`,
    };
  }

  /**
   * Resolve ENS (.eth) using Ethereum mainnet
   */
  private async resolveENS(name: string): Promise<AddressResolution> {
    try {
      const address = await this.mainnetClient.getEnsAddress({
        name: name,
      });

      if (address) {
        return {
          address: address.toLowerCase(),
          source: "ens",
          name: name,
        };
      }
    } catch (error) {
      console.log(`ENS resolution failed for ${name}:`, error);
    }

    return {
      address: "",
      source: "ens",
      error: `ENS ${name} not found`,
    };
  }

  /**
   * Resolve Farcaster handle using Farcaster API
   */
  private async resolveFarcaster(handle: string): Promise<AddressResolution> {
    try {
      // Try Farcaster Hub API
      const response = await fetch(
        `https://hub.farcaster.xyz/v1/userNameProofsByName?name=${handle}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (response.ok) {
        const data = (await response.json()) as {
          proofs?: Array<{ owner?: string }>;
        };
        if (data.proofs && data.proofs.length > 0) {
          const proof = data.proofs[0];
          if (proof.owner) {
            return {
              address: proof.owner.toLowerCase(),
              source: "farcaster",
              name: `@${handle}`,
            };
          }
        }
      }

      // Fallback: Try Airstack API (if available)
      // This would require an API key
    } catch (error) {
      console.log(`Farcaster resolution failed for ${handle}:`, error);
    }

    return {
      address: "",
      source: "farcaster",
      error: `Farcaster handle @${handle} not found`,
    };
  }

  /**
   * Resolve Coinbase ID using Coinbase's resolution service
   */
  private async resolveCoinbaseId(
    username: string,
  ): Promise<AddressResolution> {
    try {
      // Try Coinbase ID resolution
      // This might require specific API endpoints
      const response = await fetch(
        `https://api.coinbase.com/v2/users/${username}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        // Parse Coinbase response for wallet address
        // This is a placeholder - actual implementation depends on Coinbase API
      }
    } catch (error) {
      console.log(`Coinbase ID resolution failed for ${username}:`, error);
    }

    return {
      address: "",
      source: "cb_id",
      error: `Coinbase ID @${username} not found`,
    };
  }

  /**
   * Check if string is a valid Ethereum address
   */
  private isEthereumAddress(str: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(str);
  }

  /**
   * Batch resolve multiple addresses
   */
  async resolveMultiple(inputs: string[]): Promise<AddressResolution[]> {
    const promises = inputs.map((input) => this.resolveAddress(input));
    return Promise.all(promises);
  }

  /**
   * Format resolution result for user display
   */
  formatResolution(resolution: AddressResolution): string {
    if (!resolution.address) {
      return `❌ ${resolution.error}`;
    }

    const shortAddr = `${resolution.address.slice(0, 6)}...${resolution.address.slice(-4)}`;

    switch (resolution.source) {
      case "direct":
        return `✅ ${shortAddr}`;
      case "basename":
        return `✅ ${resolution.name} → ${shortAddr}`;
      case "ens":
        return `✅ ${resolution.name} → ${shortAddr}`;
      case "farcaster":
        return `✅ ${resolution.name} (Farcaster) → ${shortAddr}`;
      case "cb_id":
        return `✅ ${resolution.name} (Coinbase) → ${shortAddr}`;
      default:
        return `✅ ${shortAddr}`;
    }
  }
}

/**
 * Global resolver instance
 */
export const addressResolver = new AddressResolver();

/**
 * Helper function for quick resolution
 */
export async function resolveUserAddress(input: string): Promise<string> {
  const resolution = await addressResolver.resolveAddress(input);
  if (!resolution.address) {
    throw new Error(
      resolution.error || `Could not resolve address for: ${input}`,
    );
  }
  return resolution.address;
}

/**
 * Helper function to extract and resolve addresses from command arguments
 */
export async function parseCommandWithAddressResolution(
  messageContent: string,
  expectedArgs: number,
): Promise<{
  valid: boolean;
  error?: string;
  args: string[];
  resolvedAddresses?: AddressResolution[];
}> {
  const parts = messageContent.trim().split(" ");

  if (parts.length < expectedArgs) {
    return {
      valid: false,
      error: `Not enough arguments. Expected ${expectedArgs}, got ${parts.length - 1}`,
      args: parts,
    };
  }

  // Find parts that look like addresses/names (start with @ or 0x, or contain .eth/.base.eth)
  const addressCandidates: { index: number; value: string }[] = [];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (
      part.startsWith("@") ||
      part.startsWith("0x") ||
      part.includes(".eth") ||
      part.includes(".base.eth")
    ) {
      addressCandidates.push({ index: i, value: part });
    }
  }

  // Resolve addresses if found
  let resolvedAddresses: AddressResolution[] = [];
  if (addressCandidates.length > 0) {
    const resolutions = await addressResolver.resolveMultiple(
      addressCandidates.map((c) => c.value),
    );
    resolvedAddresses = resolutions;

    // Replace original parts with resolved addresses
    for (let i = 0; i < addressCandidates.length; i++) {
      const candidate = addressCandidates[i];
      const resolution = resolutions[i];

      if (resolution.address) {
        parts[candidate.index] = resolution.address;
      } else {
        return {
          valid: false,
          error: resolution.error,
          args: parts,
          resolvedAddresses,
        };
      }
    }
  }

  return {
    valid: true,
    args: parts,
    resolvedAddresses,
  };
}
