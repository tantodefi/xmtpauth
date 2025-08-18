// Test address resolver in production environment
import { addressResolver } from "./src/utils/address-resolver.ts";

async function testProductionResolver() {
  console.log("Testing address resolver in production environment...\n");

  const testCases = [
    "@claudia",
    "@claudia.base.eth",
    "@claudia.eth",
    "0x1234567890123456789012345678901234567890",
  ];

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase}`);
    try {
      const result = await addressResolver.resolveAddress(testCase);
      console.log(`Result:`, result);
      console.log(`Formatted: ${addressResolver.formatResolution(result)}`);

      if (result.address) {
        const walletType = addressResolver.getWalletType(
          result.address,
          result.isSmartContract,
        );
        console.log(`Wallet Type: ${walletType}`);
      }
    } catch (error) {
      console.error(`Error testing ${testCase}:`, error);
    }
    console.log("");
  }
}

testProductionResolver().catch(console.error);
