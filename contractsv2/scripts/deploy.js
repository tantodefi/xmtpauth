const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying EVMAuth V2 System...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`📝 Deploying contracts with account: ${deployer.address}`);
  console.log(
    `💰 Account balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`,
  );

  // Configuration
  const config = {
    feeRecipient: process.env.FEE_RECIPIENT || deployer.address,
    feeBasisPoints: process.env.FEE_BASIS_POINTS || 250, // 2.5%
    deploymentFee: ethers.parseEther("0.0001"), // 0.0001 ETH
    initialOwner: process.env.INITIAL_OWNER || deployer.address,
  };

  console.log("📋 Configuration:");
  console.log(`   Fee Recipient: ${config.feeRecipient}`);
  console.log(
    `   Fee Basis Points: ${config.feeBasisPoints} (${config.feeBasisPoints / 100}%)`,
  );
  console.log(
    `   Deployment Fee: ${ethers.formatEther(config.deploymentFee)} ETH`,
  );
  console.log(`   Initial Owner: ${config.initialOwner}\n`);

  // Deploy Simplified Factory V2
  console.log("📦 Deploying SimpleFactoryV2...");
  const EVMAuthFactoryV2 = await ethers.getContractFactory("SimpleFactoryV2");
  const factory = await EVMAuthFactoryV2.deploy(
    config.feeRecipient,
    config.feeBasisPoints,
    config.initialOwner,
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`✅ SimpleFactoryV2 deployed to: ${factoryAddress}`);

  // Set deployment fee
  if (config.deploymentFee > 0) {
    console.log("\n⚙️  Setting deployment fee...");
    const setFeeTx = await factory.updateDeploymentFee(config.deploymentFee);
    await setFeeTx.wait();
    console.log(
      `✅ Deployment fee set to: ${ethers.formatEther(config.deploymentFee)} ETH`,
    );
  }

  // Deploy example EVMAuth contract with XMTP extension
  console.log("\n🧪 Deploying example EVMAuth contract with XMTP extension...");
  const exampleTx = await factory.deployEVMAuthWithXMTP(
    "Test Group",
    "1.0.0",
    "https://api.example.com/metadata/{id}.json",
    0, // No delay for ownership transfer
    "test-sales-group-id",
    "test-premium-group-id",
    deployer.address, // Bot address (using deployer for testing)
    { value: config.deploymentFee },
  );
  const receipt = await exampleTx.wait();

  // Parse events to get deployed addresses
  let baseContractAddress, xmtpExtensionAddress;
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed.name === "ContractDeployed") {
        baseContractAddress = parsed.args.contractAddress;
      } else if (parsed.name === "ExtensionDeployed") {
        xmtpExtensionAddress = parsed.args.extensionAddress;
      }
    } catch (e) {
      // Skip unparseable logs
    }
  }

  console.log(
    `✅ Example EVMAuth contract deployed to: ${baseContractAddress}`,
  );
  console.log(`✅ Example XMTP extension deployed to: ${xmtpExtensionAddress}`);

  // Setup example access tiers
  if (baseContractAddress && xmtpExtensionAddress) {
    console.log("\n⚙️  Setting up example access tiers...");

    const baseContract = await ethers.getContractAt(
      "EVMAuthV2",
      baseContractAddress,
    );
    const xmtpExtension = await ethers.getContractAt(
      "XMTPGroupExtension",
      xmtpExtensionAddress,
    );

    // Setup base token metadata and XMTP tier info
    const setupTx1 = await baseContract.setMetadata(
      1, // tokenId
      true, // active
      true, // burnable
      false, // transferable (soulbound)
      ethers.parseEther("0.001"), // 0.001 ETH
      7 * 24 * 60 * 60, // 7 days TTL
    );
    await setupTx1.wait();

    const setupTx2 = await xmtpExtension.setupXMTPAccessTier(
      1, // tokenId
      "Weekly Access",
      "7-day access to premium group",
      "QmExampleImageHash",
      "https://api.example.com/metadata/1.json",
    );
    await setupTx2.wait();

    console.log(
      `✅ Example tier setup complete (Token ID: 1, Price: 0.001 ETH, Duration: 7 days)`,
    );
  }

  // Summary
  console.log("\n🎉 Deployment Complete!");
  console.log("=".repeat(60));
  console.log(`📋 Factory Address: ${factoryAddress}`);
  if (baseContractAddress) {
    console.log(`📋 Example Base Contract: ${baseContractAddress}`);
  }
  if (xmtpExtensionAddress) {
    console.log(`📋 Example XMTP Extension: ${xmtpExtensionAddress}`);
  }
  console.log(`📋 Network: ${network.name}`);
  console.log(`📋 Chain ID: ${(await ethers.provider.getNetwork()).chainId}`);
  console.log("=".repeat(60));

  // Verification instructions
  console.log("\n📝 To verify contracts on Basescan:");
  console.log(
    `npx hardhat verify --network ${network.name} ${factoryAddress} "${config.feeRecipient}" ${config.feeBasisPoints} "${config.initialOwner}"`,
  );

  if (baseContractAddress) {
    console.log(
      `npx hardhat verify --network ${network.name} ${baseContractAddress} "Test Group" "1.0.0" "https://api.example.com/metadata/{id}.json" 0 "${deployer.address}"`,
    );
  }

  if (xmtpExtensionAddress) {
    console.log(
      `npx hardhat verify --network ${network.name} ${xmtpExtensionAddress} "${baseContractAddress}" "test-sales-group-id" "test-premium-group-id" "${deployer.address}" "${deployer.address}"`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
