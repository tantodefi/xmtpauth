const { ethers } = require("hardhat");

async function main() {
  console.log("🎰 Deploying EVMAuth V2 with Megapot Integration...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`📝 Deploying contracts with account: ${deployer.address}`);
  console.log(
    `💰 Account balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`,
  );

  // Megapot configuration (Base Mainnet addresses)
  const megapotConfig = {
    // Base Mainnet Megapot contract address (from docs)
    megapotContract:
      process.env.MEGAPOT_CONTRACT ||
      "0xbEDd4F2beBE9E3E636161E644759f3cbe3d51B95",
    // Optional referrer address for earning fees on ticket purchases
    referrer: process.env.MEGAPOT_REFERRER || ethers.ZeroAddress, // No referrer by default
  };

  // Factory configuration
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
  console.log(`   Initial Owner: ${config.initialOwner}`);
  console.log(`   Megapot Contract: ${megapotConfig.megapotContract}`);
  console.log(`   Megapot Referrer: ${megapotConfig.referrer}\n`);

  // Deploy Simplified Factory V2
  console.log("📦 Deploying SimpleFactoryV2...");
  const SimpleFactoryV2 = await ethers.getContractFactory("SimpleFactoryV2");
  const factory = await SimpleFactoryV2.deploy(
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

  // Deploy example EVMAuth contract with Megapot extension only
  console.log("\n🎰 Deploying EVMAuth with Megapot extension...");
  const megapotTx = await factory.deployEVMAuthWithMegapot(
    "Gamified Access Token",
    "1.0.0",
    "https://api.example.com/metadata/{id}.json",
    0, // No delay for ownership transfer
    megapotConfig.megapotContract,
    megapotConfig.referrer,
    { value: config.deploymentFee },
  );
  const receipt = await megapotTx.wait();

  // Parse events to get deployed addresses
  let baseContractAddress, megapotExtensionAddress;
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed.name === "ContractDeployed") {
        baseContractAddress = parsed.args.contractAddress;
      } else if (parsed.name === "ExtensionDeployed") {
        megapotExtensionAddress = parsed.args.extensionAddress;
      }
    } catch (e) {
      // Skip unparseable logs
    }
  }

  console.log(
    `✅ Gamified EVMAuth contract deployed to: ${baseContractAddress}`,
  );
  console.log(`✅ Megapot extension deployed to: ${megapotExtensionAddress}`);

  // Deploy full system with both XMTP and Megapot
  console.log("\n🚀 Deploying full gamified system (XMTP + Megapot)...");
  const fullSystemTx = await factory.deployFullGamifiedSystem(
    "Premium Gaming Group",
    "1.0.0",
    "https://api.example.com/gaming/{id}.json",
    0, // No delay
    "gaming-sales-group",
    "gaming-premium-group",
    deployer.address, // Bot address
    megapotConfig.megapotContract,
    megapotConfig.referrer,
    { value: config.deploymentFee },
  );
  const fullReceipt = await fullSystemTx.wait();

  // Parse full system deployment events
  let fullBaseAddress, fullXmtpAddress, fullMegapotAddress;
  for (const log of fullReceipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed.name === "ContractDeployed") {
        fullBaseAddress = parsed.args.contractAddress;
      }
    } catch (e) {
      // Skip unparseable logs
    }
  }

  console.log(`✅ Full system base contract: ${fullBaseAddress}`);

  // Setup example access tiers for both systems
  if (baseContractAddress && megapotExtensionAddress) {
    console.log("\n⚙️  Setting up gamified access tiers...");

    const baseContract = await ethers.getContractAt(
      "EVMAuthV2",
      baseContractAddress,
    );
    const megapotExtension = await ethers.getContractAt(
      "MegapotExtension",
      megapotExtensionAddress,
    );

    // Setup base token metadata
    const setupTx1 = await baseContract.setMetadata(
      1, // tokenId
      true, // active
      true, // burnable
      false, // transferable (soulbound)
      ethers.parseEther("0.01"), // 0.01 ETH - higher price for more lottery tickets
      30 * 24 * 60 * 60, // 30 days TTL
    );
    await setupTx1.wait();

    // Configure Megapot extension
    const configTx = await megapotExtension.updateConfiguration(
      true, // isActive
      2, // 2 tickets per purchase
      ethers.parseEther("0.005"), // Minimum 0.005 ETH purchase for tickets
      true, // useTokenValue - buy tickets proportional to spending
      5, // Max 5 tickets per purchase
    );
    await configTx.wait();

    console.log(`✅ Gamified tier setup complete:`);
    console.log(`   - Token ID: 1`);
    console.log(`   - Price: 0.01 ETH`);
    console.log(`   - Duration: 30 days`);
    console.log(`   - Auto Megapot tickets: 2-5 per purchase`);
    console.log(`   - Minimum for tickets: 0.005 ETH`);
  }

  // Example usage instructions
  console.log("\n📖 Usage Examples:");
  console.log("=".repeat(60));

  console.log("\n🎮 How the Megapot integration works:");
  console.log("1. User purchases EVMAuth token using purchaseWithHooks()");
  console.log("2. MegapotExtension automatically buys lottery tickets");
  console.log("3. User gets access token AND lottery entries!");
  console.log("4. If user wins lottery, they can claim winnings separately");

  console.log("\n💻 JavaScript Integration:");
  console.log(`
// Purchase token with automatic lottery tickets
await baseContract.purchaseWithHooks(
  ethers.ZeroAddress, // Buy for self
  1, // Token ID
  1, // Amount
  { value: ethers.parseEther("0.01") }
);

// Check user's lottery stats
const stats = await megapotExtension.getUserStats(userAddress);
console.log(\`User has \${stats.ticketsPurchased} lottery tickets\`);

// Fund the extension to buy lottery tickets
const usdcAmount = ethers.parseUnits("100", 6); // 100 USDC
await usdcToken.approve(megapotExtensionAddress, usdcAmount);
await megapotExtension.depositMegapotTokens(usdcAmount);
  `);

  console.log("\n🎯 Key Benefits:");
  console.log("✅ Gamified token purchases - users get lottery entries");
  console.log("✅ Automatic ticket buying - no extra user action needed");
  console.log("✅ Configurable ticket amounts based on purchase value");
  console.log("✅ Optional referrer fees for additional monetization");
  console.log("✅ Works with existing Megapot jackpots on Base");

  // Summary
  console.log("\n🎉 Deployment Complete!");
  console.log("=".repeat(60));
  console.log(`📋 Factory Address: ${factoryAddress}`);
  if (baseContractAddress) {
    console.log(`📋 Gamified Contract: ${baseContractAddress}`);
  }
  if (megapotExtensionAddress) {
    console.log(`📋 Megapot Extension: ${megapotExtensionAddress}`);
  }
  if (fullBaseAddress) {
    console.log(`📋 Full System Contract: ${fullBaseAddress}`);
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
      `npx hardhat verify --network ${network.name} ${baseContractAddress} "Gamified Access Token" "1.0.0" "https://api.example.com/metadata/{id}.json" 0 "${deployer.address}"`,
    );
  }

  if (megapotExtensionAddress) {
    console.log(
      `npx hardhat verify --network ${network.name} ${megapotExtensionAddress} "${baseContractAddress}" "${megapotConfig.megapotContract}" "${megapotConfig.referrer}" "${deployer.address}"`,
    );
  }

  console.log("\n💡 Next Steps:");
  console.log(
    "1. Fund Megapot extension with USDC for automatic ticket purchases",
  );
  console.log("2. Configure ticket amounts based on your tokenomics");
  console.log("3. Test the integration with small purchases");
  console.log("4. Monitor lottery winnings and user engagement");
  console.log("5. Consider adding referrer program for additional revenue");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
