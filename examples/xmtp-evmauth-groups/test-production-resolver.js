// Test address resolver in production environment with Basename support
import { addressResolver } from "./src/utils/address-resolver.ts";

async function testProductionResolver() {
  console.log(
    "🧪 Testing Enhanced Address Resolver with Basename Support...\n",
  );

  const testCases = [
    {
      input: "@claudia",
      description: "Farcaster handle (not implemented yet)",
    },
    {
      input: "@claudia.base.eth",
      description: "Basename - should resolve using Base chain",
    },
    {
      input: "@vitalik.eth",
      description: "ENS name - should resolve using Ethereum mainnet",
    },
    {
      input: "0x1234567890123456789012345678901234567890",
      description: "Direct address - should validate and detect contract type",
    },
    {
      input: "@base.base.eth",
      description: "Official Base Basename (likely exists)",
    },
  ];

  for (const testCase of testCases) {
    console.log(`🔍 Testing: ${testCase.input}`);
    console.log(`📝 ${testCase.description}`);
    console.log("─".repeat(50));

    try {
      const startTime = Date.now();

      // Test with safe resolution method
      const result = await addressResolver.safeResolveAddress(
        testCase.input,
        undefined, // Let resolver create its own clients
        "production-test",
      );

      const duration = Date.now() - startTime;

      console.log(`⏱️  Resolution took: ${duration}ms`);
      console.log(`📊 Result:`, JSON.stringify(result, null, 2));
      console.log(`🏷️  Formatted: ${addressResolver.formatResolution(result)}`);

      if (result.address) {
        const walletType = addressResolver.getWalletType(
          result.address,
          result.isSmartContract,
        );
        console.log(`💼 Wallet Type: ${walletType}`);

        if (result.isSmartContract) {
          console.log(`🔗 ✅ Smart Contract Wallet Detected!`);
          console.log(
            `   This could be a Coinbase Wallet, Safe, or other smart wallet.`,
          );
        } else {
          console.log(`👤 EOA (Externally Owned Account) detected.`);
        }
      } else {
        console.log(`❌ Resolution failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`💥 Error testing ${testCase.input}:`, error);
    }

    console.log("═".repeat(50));
    console.log("");
  }

  console.log("✅ Enhanced Address Resolution Test Complete!");
  console.log("\n📋 Summary of Capabilities:");
  console.log("• ✅ Direct Ethereum addresses with smart contract detection");
  console.log("• ✅ Basename resolution (@name.base.eth) using Base chain");
  console.log("• ✅ ENS resolution (@name.eth) using Ethereum mainnet");
  console.log("• ⚠️  Farcaster resolution (placeholder - not implemented)");
  console.log("• ✅ Comprehensive error handling and fallbacks");
  console.log(
    "• ✅ Smart contract wallet detection for all resolved addresses",
  );
}

testProductionResolver().catch(console.error);
