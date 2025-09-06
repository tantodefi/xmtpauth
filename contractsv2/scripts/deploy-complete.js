const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("🚀 Deploying XMTPAuth V2 Complete System");
  console.log("📋 Deployer address:", deployer.address);
  console.log(
    "💰 Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
  );

  // Deploy implementation contract
  console.log("\n📦 Deploying XMTPAuthERC1155 implementation...");
  const XMTPAuthERC1155 = await ethers.getContractFactory("XMTPAuthERC1155");
  const implementation = await XMTPAuthERC1155.deploy();
  await implementation.waitForDeployment();
  console.log(
    "✅ Implementation deployed to:",
    await implementation.getAddress(),
  );

  // Deploy factory
  console.log("\n🏭 Deploying XMTPAuthFactory...");
  const XMTPAuthFactory = await ethers.getContractFactory("XMTPAuthFactory");
  const factory = await XMTPAuthFactory.deploy(
    await implementation.getAddress(),
    deployer.address, // Fee recipient
    250, // 2.5% fee
    deployer.address, // Initial owner
  );
  await factory.waitForDeployment();
  console.log("✅ Factory deployed to:", await factory.getAddress());

  // Test deployment with a sample contract
  console.log("\n🧪 Testing deployment with sample contract...");
  const config = {
    groupName: "Sample XMTP Group",
    groupDescription: "A sample group for testing",
    groupImageUrl: "https://example.com/image.jpg",
    baseURI: "https://api.example.com/metadata/",
    salesGroupId: "sample-sales-group-id",
    premiumGroupId: "sample-premium-group-id",
    botAddress: deployer.address,
    treasury: deployer.address,
    adminDelay: 2 * 24 * 60 * 60, // 2 days
  };

  const deployTx = await factory.deployXMTPAuthContract(config);
  const receipt = await deployTx.wait();

  // Find the contract deployed event
  const deployEvent = receipt.logs.find((log) => {
    try {
      const parsed = factory.interface.parseLog(log);
      return parsed.name === "ContractDeployed";
    } catch {
      return false;
    }
  });

  if (deployEvent) {
    const contractAddress =
      factory.interface.parseLog(deployEvent).args.contractAddress;
    console.log("✅ Sample contract deployed to:", contractAddress);

    // Test the deployed contract
    const sampleContract = XMTPAuthERC1155.attach(contractAddress);

    // Create a test token
    console.log("\n🎫 Creating test access token...");
    const tokenConfig = {
      isTransferable: true,
      price: ethers.parseEther("0.01"),
      ttl: 30 * 24 * 60 * 60, // 30 days
    };

    await sampleContract.newToken(tokenConfig);
    const tokenId = 1;
    console.log("✅ Test token created with ID:", tokenId);

    // Setup XMTP tier
    await sampleContract.setupXMTPAccessTier(
      tokenId,
      "Premium Access",
      "30-day premium access to XMTP group",
      "QmSampleImageHash123",
      "https://api.example.com/metadata/1",
    );
    console.log("✅ XMTP access tier configured");

    // Test purchase
    console.log("\n💳 Testing token purchase...");
    const purchaseTx = await sampleContract.purchase(tokenId, 1, {
      value: ethers.parseEther("0.01"),
    });
    await purchaseTx.wait();

    const balance = await sampleContract.balanceOf(deployer.address, tokenId);
    console.log("✅ Token purchased, balance:", balance.toString());

    // Check XMTP access
    const hasAccess = await sampleContract.hasValidXMTPAccess(deployer.address);
    console.log("✅ Has XMTP access:", hasAccess);

    console.log("\n📊 Contract Statistics:");
    console.log(
      "- Total contracts deployed:",
      await factory.getTotalContracts(),
    );
    console.log("- Next token ID:", await sampleContract.nextTokenId());
    console.log(
      "- Purchase history length:",
      await sampleContract.getXMTPPurchaseHistoryLength(),
    );
  }

  // Optional: Deploy with Megapot extension if on Base network
  const network = await ethers.provider.getNetwork();
  if (network.chainId === 8453n || network.chainId === 84532n) {
    // Base or Base Sepolia
    console.log("\n🎰 Detected Base network, testing Megapot integration...");

    // Use actual Megapot address on Base, or deploy mock for testing
    const megapotAddress =
      network.chainId === 8453n
        ? "0xbEDd4F2beBE9E3E636161E644759f3cbe3d51B95" // Actual Megapot on Base
        : await deployMockMegapot(); // Mock for testing

    try {
      const megapotConfig = {
        groupName: "Gaming Group with Lottery",
        groupDescription:
          "Premium gaming access with automatic lottery tickets",
        groupImageUrl: "https://example.com/gaming-image.jpg",
        baseURI: "https://api.example.com/gaming-metadata/",
        salesGroupId: "gaming-sales-group-id",
        premiumGroupId: "gaming-premium-group-id",
        botAddress: deployer.address,
        treasury: deployer.address,
        adminDelay: 2 * 24 * 60 * 60,
      };

      const megapotDeployTx = await factory.deployXMTPAuthWithMegapot(
        megapotConfig,
        megapotAddress,
        ethers.ZeroAddress, // No referrer
      );
      const megapotReceipt = await megapotDeployTx.wait();

      console.log("✅ Contract with Megapot extension deployed successfully");

      // Extract addresses from events
      const contractEvent = megapotReceipt.logs.find((log) => {
        try {
          const parsed = factory.interface.parseLog(log);
          return parsed.name === "ContractDeployed";
        } catch {
          return false;
        }
      });

      const extensionEvent = megapotReceipt.logs.find((log) => {
        try {
          const parsed = factory.interface.parseLog(log);
          return parsed.name === "ExtensionDeployed";
        } catch {
          return false;
        }
      });

      if (contractEvent && extensionEvent) {
        const baseAddress =
          factory.interface.parseLog(contractEvent).args.contractAddress;
        const extensionAddress =
          factory.interface.parseLog(extensionEvent).args.extensionAddress;

        console.log("📍 Base contract:", baseAddress);
        console.log("🎰 Megapot extension:", extensionAddress);
      }
    } catch (error) {
      console.log("⚠️  Megapot integration test failed:", error.message);
    }
  }

  console.log("\n🎉 Deployment Complete!");
  console.log("\n📋 Summary:");
  console.log("Implementation:", await implementation.getAddress());
  console.log("Factory:", await factory.getAddress());
  console.log("Network:", network.name, `(${network.chainId})`);

  // Verification instructions
  if (network.chainId !== 31337n) {
    // Not local hardhat
    console.log("\n🔍 Verification Commands:");
    console.log(
      `npx hardhat verify --network ${network.name} ${await implementation.getAddress()}`,
    );
    console.log(
      `npx hardhat verify --network ${network.name} ${await factory.getAddress()} "${await implementation.getAddress()}" "${deployer.address}" 250 "${deployer.address}"`,
    );
  }
}

async function deployMockMegapot() {
  console.log("📦 Deploying mock USDC for testing...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
  await mockUSDC.waitForDeployment();
  console.log("✅ Mock USDC deployed to:", await mockUSDC.getAddress());

  console.log("📦 Deploying mock Megapot for testing...");
  const MockMegapot = await ethers.getContractFactory("MockMegapot");
  const mockMegapot = await MockMegapot.deploy(await mockUSDC.getAddress());
  await mockMegapot.waitForDeployment();
  console.log("✅ Mock Megapot deployed to:", await mockMegapot.getAddress());

  return await mockMegapot.getAddress();
}

// Error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
