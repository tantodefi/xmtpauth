const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Starting EVMAuth deployment...");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // Get deployment configuration from environment
  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;
  const feeBasisPoints = process.env.FEE_BASIS_POINTS || "250"; // 2.5%
  const initialOwner = process.env.INITIAL_OWNER || deployer.address;

  console.log("Configuration:");
  console.log("- Fee Recipient:", feeRecipient);
  console.log("- Fee Basis Points:", feeBasisPoints);
  console.log("- Initial Owner:", initialOwner);

  // Deploy Factory contract
  console.log("\n📋 Deploying EVMAuthFactory...");
  const EVMAuthFactory = await ethers.getContractFactory("EVMAuthFactory");
  const factory = await EVMAuthFactory.deploy(
    feeRecipient,
    feeBasisPoints,
    initialOwner
  );
  await factory.waitForDeployment();
  
  const factoryAddress = await factory.getAddress();
  console.log("✅ EVMAuthFactory deployed to:", factoryAddress);

  // Deploy a test group contract
  console.log("\n📋 Deploying test EVMAuthGroupAccessV2...");
  
  // Test group configuration
  const testGroupName = "Test Premium Community";
  const testGroupDescription = "Test group for development and testing";
  const testGroupImage = "https://example.com/test-group.png";
  const testSalesGroupId = "test-sales-group-id";
  const testPremiumGroupId = "test-premium-group-id";
  const testBotAddress = deployer.address;

  const EVMAuthGroupAccess = await ethers.getContractFactory("EVMAuthGroupAccessV2");
  const groupAccess = await EVMAuthGroupAccess.deploy(
    factoryAddress,
    testGroupName,
    testGroupDescription,
    testGroupImage,
    testSalesGroupId,
    testPremiumGroupId,
    testBotAddress,
    initialOwner
  );
  await groupAccess.waitForDeployment();

  const groupAccessAddress = await groupAccess.getAddress();
  console.log("✅ EVMAuthGroupAccessV2 deployed to:", groupAccessAddress);

  // Setup test tiers
  console.log("\n📋 Setting up test access tiers...");
  
  const testTiers = [
    {
      tokenId: 1,
      durationDays: 7,
      priceWei: ethers.parseEther("0.001"), // 0.001 ETH
      name: "Weekly Access",
      description: "7 days premium access",
      imageHash: "QmTestImageHash1",
      metadataUri: "ipfs://QmTestMetadata1"
    },
    {
      tokenId: 2,
      durationDays: 30,
      priceWei: ethers.parseEther("0.003"), // 0.003 ETH
      name: "Monthly Access",
      description: "30 days premium access",
      imageHash: "QmTestImageHash2",
      metadataUri: "ipfs://QmTestMetadata2"
    },
    {
      tokenId: 3,
      durationDays: 90,
      priceWei: ethers.parseEther("0.008"), // 0.008 ETH
      name: "Quarterly Access",
      description: "90 days premium access",
      imageHash: "QmTestImageHash3",
      metadataUri: "ipfs://QmTestMetadata3"
    }
  ];

  for (const tier of testTiers) {
    await groupAccess.setupAccessTier(
      tier.tokenId,
      tier.durationDays,
      tier.priceWei,
      tier.name,
      tier.description,
      tier.imageHash,
      tier.metadataUri
    );
    console.log(`✅ Set up tier: ${tier.name} (${tier.durationDays} days, ${ethers.formatEther(tier.priceWei)} ETH)`);
  }

  // Output deployment summary
  console.log("\n🎉 Deployment Complete!");
  console.log("=".repeat(50));
  console.log("📋 Contract Addresses:");
  console.log("   Factory:", factoryAddress);
  console.log("   Test Group:", groupAccessAddress);
  console.log("\n📋 Configuration:");
  console.log("   Network:", await deployer.provider.getNetwork().then(n => n.name));
  console.log("   Deployer:", deployer.address);
  console.log("   Fee Recipient:", feeRecipient);
  console.log("   Fee Rate:", feeBasisPoints + " basis points (" + (parseInt(feeBasisPoints) / 100) + "%)");
  
  console.log("\n📋 Next Steps:");
  console.log("1. Add factory address to XMTP agent .env file:");
  console.log("   EVMAUTH_FACTORY_ADDRESS=" + factoryAddress);
  console.log("2. Verify contracts on explorer (if on testnet/mainnet)");
  console.log("3. Test the integration with XMTP agent");

  // Save deployment info
  const deploymentInfo = {
    network: await deployer.provider.getNetwork().then(n => n.name),
    chainId: await deployer.provider.getNetwork().then(n => n.chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      factory: factoryAddress,
      testGroup: groupAccessAddress
    },
    configuration: {
      feeRecipient,
      feeBasisPoints,
      initialOwner
    },
    testTiers
  };

  const fs = require('fs');
  fs.writeFileSync(
    'deployment-info.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\n💾 Deployment info saved to deployment-info.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });