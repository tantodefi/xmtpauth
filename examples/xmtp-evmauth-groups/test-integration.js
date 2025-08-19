// Comprehensive integration test for address resolution and EVM handler
import { EVMAuthHandler } from "./src/handlers/evmauth-handler.ts";
import { addressResolver } from "./src/utils/address-resolver.ts";

async function testIntegration() {
  console.log(
    "Testing integration between address resolver and EVM handler...\n",
  );

  // Test cases
  const testCases = [
    {
      input: "@claudia",
      expected: "farcaster",
      description: "Farcaster handle",
    },
    {
      input: "@claudia.base.eth",
      expected: "basename",
      description: "Base name",
    },
    {
      input: "@claudia.eth",
      expected: "ens",
      description: "ENS name",
    },
    {
      input: "0x1234567890123456789012345678901234567890",
      expected: "direct",
      description: "Direct Ethereum address",
    },
    {
      input: "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc",
      expected: "direct",
      description: "Real Ethereum address (agent)",
    },
  ];

  // Create mock EVM handler for testing
  const mockEVMHandler = {
    publicClientInstance: {
      getBytecode: async ({ address }) => {
        // Mock: return contract code for specific addresses
        if (address === "0xa14ce36e7b135b66c3e3cb2584e777f32b15f5dc") {
          return "0x608060405234801561001057600080fd5b50610150806100206000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80632e64cec11461003b5780636057361d14610059575b600080fd5b610043610075565b60405161005091906100a1565b60405180910390f35b610073600480360381019061006e91906100ed565b61007e565b005b60008054905090565b8060008190555050565b6000819050919050565b61009b81610088565b82525050565b60006020820190506100b66000830184610092565b92915050565b600080fd5b6100ca81610088565b81146100d557600080fd5b50565b6000813590506100e7816100c1565b92915050565b600060208284031215610103576101026100bc565b5b6000610111848285016100d8565b9150509291505056fea2646970667358221220c86a8c4dd835f5553e1776b123436a1f3ae186c9e7d12061bcc4d55b9c7c0c2f64736f6c63430008120033";
        }
        return "0x"; // EOA
      },
    },
  };

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.description}`);
    console.log(`Input: ${testCase.input}`);

    try {
      const result = await addressResolver.resolveAddress(
        testCase.input,
        mockEVMHandler.publicClientInstance,
      );

      console.log(`Result:`, result);
      console.log(`Formatted: ${addressResolver.formatResolution(result)}`);

      if (result.address) {
        const walletType = addressResolver.getWalletType(
          result.address,
          result.isSmartContract,
        );
        console.log(`Wallet Type: ${walletType}`);
      }

      // Verify expected behavior
      if (result.source === testCase.expected) {
        console.log(
          `✅ PASS: Expected ${testCase.expected}, got ${result.source}`,
        );
      } else {
        console.log(
          `❌ FAIL: Expected ${testCase.expected}, got ${result.source}`,
        );
      }
    } catch (error) {
      console.error(`❌ Error testing ${testCase.input}:`, error);
    }
    console.log("");
  }

  console.log("Integration test completed!");
}

testIntegration().catch(console.error);

