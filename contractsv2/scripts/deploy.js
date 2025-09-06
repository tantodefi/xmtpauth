const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log(
    "Account balance:",
    (await ethers.provider.getBalance(deployer.address)).toString(),
  );

  // Configuration
  const config = {
    // Platform fee configuration
    feeRecipient: deployer.address, // Change this to actual fee recipient
    feeBasisPoints: 250, // 2.5% platform fee

    // Admin configuration
    adminDelay: 2 * 24 * 60 * 60, // 2 days in seconds

    // Default URI
    baseURI: "https://api.xmtpauth.com/metadata/{id}",

    // Treasury (can be same as deployer initially)
    treasury: deployer.address,
  };

  console.log("Deployment configuration:");
  console.log("- Fee Recipient:", config.feeRecipient);
  console.log("- Fee Basis Points:", config.feeBasisPoints);
  console.log("- Admin Delay:", config.adminDelay, "seconds");
  console.log("- Base URI:", config.baseURI);
  console.log("- Treasury:", config.treasury);

  try {
    // 1. Deploy the implementation contract for XMTPAuthERC1155
    console.log("\n1. Deploying XMTPAuthERC1155 implementation...");
    const XMTPAuthERC1155 = await ethers.getContractFactory("XMTPAuthERC1155");

    // Deploy as implementation (not initialized)
    const implementation = await XMTPAuthERC1155.deploy();
    await implementation.waitForDeployment();
    const implementationAddress = await implementation.getAddress();

    console.log(
      "XMTPAuthERC1155 implementation deployed to:",
      implementationAddress,
    );

    // 2. Deploy the factory contract
    console.log("\n2. Deploying XMTPAuthFactory...");
    const XMTPAuthFactory = await ethers.getContractFactory("XMTPAuthFactory");

    const factory = await XMTPAuthFactory.deploy(
      implementationAddress,
      config.feeRecipient,
      config.feeBasisPoints,
      deployer.address, // factory owner
    );

    await factory.waitForDeployment();
    const factoryAddress = await factory.getAddress();

    console.log("XMTPAuthFactory deployed to:", factoryAddress);

    // 3. Test deployment by creating a sample contract
    console.log("\n3. Testing deployment with sample contract...");

    const sampleConfig = {
      groupName: "Sample XMTP Group",
      groupDescription: "A sample group for testing",
      groupImageUrl: "https://example.com/image.jpg",
      baseURI: config.baseURI,
      salesGroupId: "sample-sales-group-id",
      premiumGroupId: "sample-premium-group-id",
      botAddress: deployer.address, // Using deployer as bot for testing
      treasury: config.treasury,
      adminDelay: config.adminDelay,
    };

    const deployTx = await factory.deployXMTPAuthContract(sampleConfig, {
      value: 0, // No deployment fee initially
    });

    const receipt = await deployTx.wait();

    // Get the deployed contract address from events
    const deployEvent = receipt.logs.find((log) => {
      try {
        const parsed = factory.interface.parseLog(log);
        return parsed.name === "ContractDeployed";
      } catch {
        return false;
      }
    });

    if (deployEvent) {
      const parsedEvent = factory.interface.parseLog(deployEvent);
      const sampleContractAddress = parsedEvent.args.contractAddress;
      console.log(
        "Sample XMTPAuth contract deployed to:",
        sampleContractAddress,
      );

      // 4. Verify the sample contract works
      console.log("\n4. Verifying sample contract...");
      const sampleContract = XMTPAuthERC1155.attach(sampleContractAddress);

      // Test basic functionality
      const xmtpInfo = await sampleContract.xmtpInfo();
      console.log("XMTP Info:", {
        salesGroupId: xmtpInfo.salesGroupId,
        premiumGroupId: xmtpInfo.premiumGroupId,
        botAddress: xmtpInfo.botAddress,
        isActive: xmtpInfo.isActive,
      });

      // Create a test token
      console.log("\n5. Creating test access tier...");
      const tokenConfig = {
        isTransferable: true,
        price: ethers.parseEther("0.01"), // 0.01 ETH
        ttl: 30 * 24 * 60 * 60, // 30 days
      };

      const newTokenTx = await sampleContract.newToken(tokenConfig);
      await newTokenTx.wait();

      const tokenId = 1; // First token ID
      const tokenConfigResult = await sampleContract.tokenConfig(tokenId);
      console.log("Test token created:", {
        id: tokenId,
        isTransferable: tokenConfigResult.isTransferable,
        price: ethers.formatEther(tokenConfigResult.price),
        ttl: tokenConfigResult.ttl.toString(),
      });

      // Setup XMTP tier
      const setupTierTx = await sampleContract.setupXMTPAccessTier(
        tokenId,
        "Basic Access",
        "30-day basic access to premium group",
        "QmSampleImageHash",
        "https://api.xmtpauth.com/metadata/1",
      );
      await setupTierTx.wait();

      const xmtpTier = await sampleContract.getXMTPTier(tokenId);
      console.log("XMTP tier configured:", {
        name: xmtpTier.name,
        description: xmtpTier.description,
        isActive: xmtpTier.isActive,
      });
    }

    // 6. Display deployment summary
    console.log("\n" + "=".repeat(60));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log(
      "Network:",
      await ethers.provider.getNetwork().then((n) => n.name),
    );
    console.log("Deployer:", deployer.address);
    console.log("Implementation:", implementationAddress);
    console.log("Factory:", factoryAddress);
    if (deployEvent) {
      const parsedEvent = factory.interface.parseLog(deployEvent);
      console.log("Sample Contract:", parsedEvent.args.contractAddress);
    }
    console.log("\nFactory Configuration:");
    console.log("- Fee Recipient:", await factory.feeRecipient());
    console.log(
      "- Fee Basis Points:",
      (await factory.feeBasisPoints()).toString(),
    );
    console.log(
      "- Deployment Fee:",
      ethers.formatEther(await factory.deploymentFee()),
    );
    console.log(
      "- Total Contracts:",
      (await factory.getTotalContracts()).toString(),
    );

    console.log("\n" + "=".repeat(60));
    console.log("VERIFICATION COMMANDS");
    console.log("=".repeat(60));
    console.log(
      `npx hardhat verify --network ${process.env.HARDHAT_NETWORK || "localhost"} ${implementationAddress}`,
    );
    console.log(
      `npx hardhat verify --network ${process.env.HARDHAT_NETWORK || "localhost"} ${factoryAddress} "${implementationAddress}" "${config.feeRecipient}" ${config.feeBasisPoints} "${deployer.address}"`,
    );

    console.log("\n" + "=".repeat(60));
    console.log("NEXT STEPS");
    console.log("=".repeat(60));
    console.log("1. Update fee recipient if needed:");
    console.log(
      `   await factory.updateFeeConfiguration("NEW_FEE_RECIPIENT", ${config.feeBasisPoints})`,
    );
    console.log("2. Set deployment fee if desired:");
    console.log(
      `   await factory.updateDeploymentFee(ethers.parseEther("0.001"))`,
    );
    console.log("3. Deploy additional contracts:");
    console.log(`   await factory.deployGroupContract(...)`);
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
