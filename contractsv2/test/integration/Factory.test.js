const { expect } = require("chai");
const { BaseTest } = require("../BaseTest");

describe("XMTPAuthFactory - Integration Tests", function () {
  let test, accounts, contracts;

  beforeEach(async function () {
    test = new BaseTest();
    ({ accounts, contracts } = await test.fullSetup());
  });

  describe("Factory Deployment", function () {
    it("Should deploy new XMTP Auth instances", async function () {
      const { factory } = contracts;
      const { owner, treasury, bot, feeRecipient } = accounts;

      // Setup factory configuration
      await factory.connect(owner).setFeeBasisPoints(250); // 2.5%
      await factory.connect(owner).setFeeRecipient(feeRecipient.address);

      const deploymentConfig = {
        groupName: "Test Group",
        groupDescription: "Test Description",
        groupImageUrl: "https://example.com/image.jpg",
        baseURI: "https://api.example.com/tokens/",
        salesGroupId: "factory-sales",
        premiumGroupId: "factory-premium",
        botAddress: bot.address,
        treasury: treasury.address,
        adminDelay: 86400,
      };

      // Deploy new instance
      const tx = await factory
        .connect(owner)
        .deployXMTPAuthContract(deploymentConfig);
      const receipt = await tx.wait();

      // Find deployment event
      const deploymentEvent = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "ContractDeployed",
      );

      expect(deploymentEvent).to.not.be.undefined;
      const deployedAddress = deploymentEvent.args.contractAddress;

      // Verify deployed contract
      const XMTPAuthERC1155 =
        await ethers.getContractFactory("XMTPAuthERC1155");
      const deployedContract = XMTPAuthERC1155.attach(deployedAddress);

      expect(await deployedContract.treasury()).to.equal(treasury.address);

      const xmtpInfo = await deployedContract.xmtpInfo();
      expect(xmtpInfo.salesGroupId).to.equal("factory-sales");
      expect(xmtpInfo.premiumGroupId).to.equal("factory-premium");
    });

    it("Should track deployed contracts", async function () {
      const { factory } = contracts;
      const { owner, treasury, bot } = accounts;

      const initialCount = await factory.getTotalContracts();

      const deploymentConfig = {
        groupName: "Tracked Group",
        groupDescription: "Tracked Description",
        groupImageUrl: "https://example.com/tracked.jpg",
        baseURI: "https://api.example.com/tokens/",
        salesGroupId: "tracked-sales",
        premiumGroupId: "tracked-premium",
        botAddress: bot.address,
        treasury: treasury.address,
        adminDelay: 86400,
      };

      // Deploy contract
      await factory.connect(owner).deployXMTPAuthContract(deploymentConfig);

      const newCount = await factory.getTotalContracts();
      expect(newCount).to.equal(initialCount + 1n);

      // Check contract is tracked
      const deployedContracts = await factory.getAllContracts();
      expect(deployedContracts.length).to.be.greaterThan(0);
    });

    it("Should handle multiple deployments", async function () {
      const { factory } = contracts;
      const { owner, treasury, bot } = accounts;

      const baseConfig = {
        groupName: "Multi Deploy Group",
        groupDescription: "Multi Deploy Description",
        groupImageUrl: "https://example.com/multi.jpg",
        baseURI: "https://api.example.com/tokens/",
        salesGroupId: "multi-sales",
        premiumGroupId: "multi-premium",
        botAddress: bot.address,
        treasury: treasury.address,
        adminDelay: 86400,
      };

      // Deploy multiple contracts
      const deployments = [];
      for (let i = 0; i < 3; i++) {
        const config = {
          ...baseConfig,
          salesGroupId: `sales-${i}`,
          premiumGroupId: `premium-${i}`,
        };

        const tx = await factory.connect(owner).deployXMTPAuthContract(config);
        const receipt = await tx.wait();

        const deploymentEvent = receipt.logs.find(
          (log) => log.fragment && log.fragment.name === "ContractDeployed",
        );

        deployments.push(deploymentEvent.args.contractAddress);
      }

      expect(deployments).to.have.lengthOf(3);

      // All addresses should be different
      const uniqueAddresses = new Set(deployments);
      expect(uniqueAddresses.size).to.equal(3);
    });
  });

  describe("Factory Configuration", function () {
    it("Should manage fee configuration", async function () {
      const { factory } = contracts;
      const { owner, feeRecipient } = accounts;

      // Set fee basis points
      await factory.connect(owner).setFeeBasisPoints(500); // 5%
      expect(await factory.feeBasisPoints()).to.equal(500);

      // Set fee recipient
      await factory.connect(owner).setFeeRecipient(feeRecipient.address);
      expect(await factory.feeRecipient()).to.equal(feeRecipient.address);
    });

    it("Should validate fee configuration limits", async function () {
      const { factory } = contracts;
      const { owner } = accounts;

      // Should reject fee basis points over 10000 (100%)
      await expect(
        factory.connect(owner).setFeeBasisPoints(10001),
      ).to.be.revertedWith("Fee cannot exceed 100%");

      // Should reject zero address as fee recipient
      await expect(
        factory.connect(owner).setFeeRecipient(ethers.ZeroAddress),
      ).to.be.revertedWith("Invalid fee recipient");
    });

    it("Should enforce access control on factory functions", async function () {
      const { factory } = contracts;
      const { user1, feeRecipient } = accounts;

      // Non-owner should not be able to set fees
      await expect(
        factory.connect(user1).setFeeBasisPoints(250),
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");

      await expect(
        factory.connect(user1).setFeeRecipient(feeRecipient.address),
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });

  describe("Integration with Deployed Contracts", function () {
    let deployedAuthContract;

    beforeEach(async function () {
      const { factory } = contracts;
      const { owner, treasury, bot, feeRecipient } = accounts;

      // Setup factory with fees
      await factory.connect(owner).setFeeBasisPoints(250); // 2.5%
      await factory.connect(owner).setFeeRecipient(feeRecipient.address);

      // Verify fee was set correctly
      const actualFeeBasisPoints = await factory.feeBasisPoints();
      expect(actualFeeBasisPoints).to.equal(250);

      // Deploy contract through factory
      const deploymentConfig = {
        groupName: "Integration Group",
        groupDescription: "Integration Description",
        groupImageUrl: "https://example.com/integration.jpg",
        baseURI: "https://api.example.com/tokens/",
        salesGroupId: "integration-sales",
        premiumGroupId: "integration-premium",
        botAddress: bot.address,
        treasury: treasury.address,
        adminDelay: 86400,
      };

      const tx = await factory
        .connect(owner)
        .deployXMTPAuthContract(deploymentConfig);
      const receipt = await tx.wait();

      const deploymentEvent = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "ContractDeployed",
      );

      const XMTPAuthERC1155 =
        await ethers.getContractFactory("XMTPAuthERC1155");
      deployedAuthContract = XMTPAuthERC1155.attach(
        deploymentEvent.args.contractAddress,
      );

      // Create test tokens in deployed contract
      await deployedAuthContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.05"), true, 604800); // Token 0: Trial (7 days TTL)

      await deployedAuthContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), true, 2592000); // Token 1: Premium (30 days TTL)
    });

    it("Should have factory reference in deployed contract", async function () {
      const factoryAddress = await deployedAuthContract.factory();
      expect(factoryAddress).to.equal(await contracts.factory.getAddress());
    });

    it("Should apply factory fees to deployed contract purchases", async function () {
      const { treasury, owner, feeRecipient } = accounts;

      // Create tokens in deployed contract (0 and 1)
      await deployedAuthContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.05"), true, 0); // Token 0 - 0.05 ETH
      await deployedAuthContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), true, 0); // Token 1 - 0.1 ETH (matches debug output)

      const feeRecipientBalanceBefore = await ethers.provider.getBalance(
        feeRecipient.address,
      );

      // Check token price
      const tokenPrice = await deployedAuthContract.priceOf(1);
      console.log(`Token 1 price: ${ethers.formatEther(tokenPrice)} ETH`);

      // Make purchase (should apply factory fees)
      await deployedAuthContract
        .connect(owner)
        ["purchase(uint256,uint256)"](1, 1, {
          value: ethers.parseEther("1.0"),
        });

      const feeRecipientBalanceAfter = await ethers.provider.getBalance(
        feeRecipient.address,
      );

      const actualFee = feeRecipientBalanceAfter - feeRecipientBalanceBefore;
      console.log(`Actual fee received: ${ethers.formatEther(actualFee)} ETH`);

      // Debug: Let's see what we're actually getting vs what we expect
      const expectedFeeFromTokenPrice = (tokenPrice * 250n) / 10000n;
      const expectedFeeFromMsgValue =
        (ethers.parseEther("1.0") * 250n) / 10000n;

      console.log(
        `Expected fee from token price: ${ethers.formatEther(expectedFeeFromTokenPrice)} ETH`,
      );
      console.log(
        `Expected fee from msg.value: ${ethers.formatEther(expectedFeeFromMsgValue)} ETH`,
      );

      // For now, let's see what the actual fee calculation should be
      // If actualFee is 0.0025 ETH and rate is 2.5%, then base amount is 0.1 ETH
      const impliedBaseAmount = (actualFee * 10000n) / 250n;
      console.log(
        `Implied base amount for fee calculation: ${ethers.formatEther(impliedBaseAmount)} ETH`,
      );

      // The fee should be 2.5% of the token price
      expect(actualFee).to.equal(expectedFeeFromTokenPrice);
    });

    it("Should support extension registration in deployed contracts", async function () {
      const { owner } = accounts;

      // Deploy mock extension
      const MockExtension = await ethers.getContractFactory("MockExtension");
      const mockExtension = await MockExtension.deploy();
      await mockExtension.waitForDeployment();

      const extensionName = ethers.keccak256(
        ethers.toUtf8Bytes("FactoryTestExtension"),
      );

      // Register extension in deployed contract
      await deployedAuthContract
        .connect(owner)
        .registerExtension(extensionName, await mockExtension.getAddress());

      // Verify registration
      expect(await deployedAuthContract.extensions(extensionName)).to.equal(
        await mockExtension.getAddress(),
      );
    });

    it("Should support full XMTP functionality in deployed contracts", async function () {
      const { treasury, bot, user1 } = accounts;

      // Setup XMTP tier in deployed contract (token 1)
      await deployedAuthContract
        .connect(treasury)
        .setupXMTPAccessTier(
          1,
          "Factory Premium",
          "Premium tier deployed via factory",
          "",
          "",
        );

      // Test inbox mapping
      await deployedAuthContract
        .connect(user1)
        .storeUserInboxId(user1.address, "factory-test-inbox");
      expect(await deployedAuthContract.userInboxIds(user1.address)).to.equal(
        "factory-test-inbox",
      );

      // Test bot access granting
      await deployedAuthContract
        .connect(bot)
        .grantXMTPAccess(user1.address, 1, 1, "86400");
      expect(await deployedAuthContract.balanceOf(user1.address, 1)).to.equal(
        1,
      );

      // Test access validation
      expect(await deployedAuthContract.hasValidXMTPAccess(user1.address)).to.be
        .true;
    });
  });

  describe("Factory Security", function () {
    it("Should validate deployment parameters", async function () {
      const { factory } = contracts;
      const { owner, treasury, bot } = accounts;

      const invalidConfig = {
        groupName: "Invalid Group",
        groupDescription: "Invalid Description",
        groupImageUrl: "https://example.com/invalid.jpg",
        baseURI: "https://api.example.com/tokens/",
        salesGroupId: "invalid-sales",
        premiumGroupId: "invalid-premium",
        botAddress: ethers.ZeroAddress, // Invalid
        treasury: treasury.address,
        adminDelay: 86400,
      };

      await expect(
        factory.connect(owner).deployXMTPAuthContract(invalidConfig),
      ).to.be.revertedWith("Invalid bot address");
    });

    it("Should require deployment fee for deployments", async function () {
      const { factory } = contracts;
      const { user1, treasury, bot, owner } = accounts;

      // Set a deployment fee
      const deploymentFee = ethers.parseEther("0.01");
      await factory.connect(owner).updateDeploymentFee(deploymentFee);

      const deploymentConfig = {
        groupName: "Fee Required Group",
        groupDescription: "Should require fee",
        groupImageUrl: "https://example.com/fee.jpg",
        baseURI: "https://api.example.com/tokens/",
        salesGroupId: "fee-sales",
        premiumGroupId: "fee-premium",
        botAddress: bot.address,
        treasury: treasury.address,
        adminDelay: 86400,
      };

      // Should revert when no fee is provided
      await expect(
        factory.connect(user1).deployXMTPAuthContract(deploymentConfig),
      ).to.be.revertedWith("Insufficient deployment fee");

      // Should succeed when fee is provided
      await expect(
        factory.connect(user1).deployXMTPAuthContract(deploymentConfig, {
          value: deploymentFee,
        }),
      ).to.not.be.reverted;
    });
  });
});
