// Enhanced test for address resolver with smart contract detection
import { addressResolver } from "./src/utils/address-resolver.ts";

async function testAddressResolver() {
  console.log("Testing enhanced address resolver...\n");

  const testCases = [
    "0x1234567890123456789012345678901234567890",
    "@claudia.base.eth",
    "@claudia.eth",
    "@claudia",
    "invalid-format",
  ];

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase}`);
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
    console.log("");
  }

  // Test smart contract detection (mock)
  console.log("Testing smart contract detection...");
  const mockPublicClient = {
    getBytecode: async ({ address }) => {
      // Mock: return contract code for specific addresses
      if (address === "0x1234567890123456789012345678901234567890") {
        return "0x608060405234801561001057600080fd5b50610150806100206000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80632e64cec11461003b5780636057361d14610059575b600080fd5b610043610075565b60405161005091906100a1565b60405180910390f35b610073600480360381019061006e91906100ed565b61007e565b005b60008054905090565b8060008190555050565b6000819050919050565b61009b81610088565b82525050565b60006020820190506100b66000830184610092565b92915050565b600080fd5b6100ca81610088565b81146100d557600080fd5b50565b6000813590506100e7816100c1565b92915050565b600060208284031215610103576101026100bc565b5b6000610111848285016100d8565b9150509291505056fea2646970667358221220c86a8c4dd835f5553e1776b123436a1f3ae186c9e7d12061bcc4d55b9c7c0c2f64736f6c63430008120033";
      }
      return "0x"; // EOA
    },
  };

  const smartContractTest = await addressResolver.resolveAddress(
    "0x1234567890123456789012345678901234567890",
    mockPublicClient,
  );
  console.log("Smart Contract Test:", smartContractTest);
  console.log(
    "Wallet Type:",
    addressResolver.getWalletType(
      smartContractTest.address,
      smartContractTest.isSmartContract,
    ),
  );
}

testAddressResolver().catch(console.error);
