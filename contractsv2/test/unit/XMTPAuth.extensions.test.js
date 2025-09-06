const { expect } = require("chai");
const { BaseTest } = require("../BaseTest");

describe("XMTPAuthERC1155 - Extension System", function () {
  let test, accounts, contracts;

  beforeEach(async function () {
    test = new BaseTest();
    ({ accounts, contracts } = await test.fullSetup());
  });

  describe("Extension Registration", function () {
    it("Should register extensions correctly", async function () {
      const { authContract } = contracts;
      const { owner } = accounts;

      // Deploy mock extension
      const MockExtension = await ethers.getContractFactory("MockExtension");
      const mockExtension = await MockExtension.deploy();
      await mockExtension.waitForDeployment();

      const extensionName = ethers.keccak256(
        ethers.toUtf8Bytes("TestExtension"),
      );

      // Register extension
      await authContract
        .connect(owner)
        .registerExtension(extensionName, await mockExtension.getAddress());

      // Check registration
      expect(await authContract.extensions(extensionName)).to.equal(
        await mockExtension.getAddress(),
      );
      expect(
        await authContract.authorizedExtensions(
          await mockExtension.getAddress(),
        ),
      ).to.be.true;

      const registeredExtensions = await authContract.getRegisteredExtensions();
      expect(registeredExtensions).to.include(extensionName);
    });

    it("Should prevent unauthorized extension registration", async function () {
      const { authContract } = contracts;
      const { user1 } = accounts;

      const MockExtension = await ethers.getContractFactory("MockExtension");
      const mockExtension = await MockExtension.deploy();
      await mockExtension.waitForDeployment();

      const extensionName = ethers.keccak256(
        ethers.toUtf8Bytes("UnauthorizedExtension"),
      );

      await expect(
        authContract
          .connect(user1)
          .registerExtension(extensionName, await mockExtension.getAddress()),
      ).to.be.revertedWithCustomError(
        authContract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("Should allow extension deregistration", async function () {
      const { authContract } = contracts;
      const { owner } = accounts;

      // Deploy and register extension
      const MockExtension = await ethers.getContractFactory("MockExtension");
      const mockExtension = await MockExtension.deploy();
      await mockExtension.waitForDeployment();

      const extensionName = ethers.keccak256(
        ethers.toUtf8Bytes("TempExtension"),
      );

      await authContract
        .connect(owner)
        .registerExtension(extensionName, await mockExtension.getAddress());

      // Deregister extension
      await authContract
        .connect(owner)
        .deregisterExtension(await mockExtension.getAddress());

      // Check deregistration
      expect(await authContract.extensions(extensionName)).to.equal(
        ethers.ZeroAddress,
      );
      expect(
        await authContract.authorizedExtensions(
          await mockExtension.getAddress(),
        ),
      ).to.be.false;
    });
  });

  describe("Extension Hooks", function () {
    let mockExtension, extensionName;

    beforeEach(async function () {
      const { authContract } = contracts;
      const { owner } = accounts;

      // Deploy and register mock extension
      const MockExtension = await ethers.getContractFactory("MockExtension");
      mockExtension = await MockExtension.deploy();
      await mockExtension.waitForDeployment();

      extensionName = ethers.keccak256(ethers.toUtf8Bytes("HookTestExtension"));

      await authContract
        .connect(owner)
        .registerExtension(extensionName, await mockExtension.getAddress());
    });

    it("Should call onTokenPurchased hook", async function () {
      const { authContract } = contracts;
      const { owner } = accounts;

      const price = await authContract.priceOf(1);

      // Make purchase (should trigger hook)
      await authContract.connect(owner).purchase(1, 1, {
        value: price,
      });

      // Check if hook was called (mock extension should have recorded the call)
      expect(await mockExtension.onTokenPurchasedCalled()).to.be.true;
    });

    it("Should call onTokensMinted hook", async function () {
      const { authContract } = contracts;
      const { bot, user1 } = accounts;

      // Grant access (should trigger minting hook)
      await authContract
        .connect(bot)
        .grantXMTPAccess(user1.address, 1, 1, "86400");

      // Check if hook was called
      expect(await mockExtension.onTokensMintedCalled()).to.be.true;
    });

    it("Should call onTokenConfigUpdated hook", async function () {
      const { authContract } = contracts;
      const { treasury } = accounts;

      // Update token price (should trigger config hook)
      await authContract
        .connect(treasury)
        .setTokenPrice(1, ethers.parseEther("0.2"));

      // Check if hook was called
      expect(await mockExtension.onTokenConfigUpdatedCalled()).to.be.true;
    });

    it("Should handle failing extensions gracefully", async function () {
      const { authContract } = contracts;
      const { owner } = accounts;

      // Deploy failing extension
      const FailingExtension =
        await ethers.getContractFactory("FailingExtension");
      const failingExtension = await FailingExtension.deploy();
      await failingExtension.waitForDeployment();

      const failingName = ethers.keccak256(
        ethers.toUtf8Bytes("FailingExtension"),
      );

      await authContract
        .connect(owner)
        .registerExtension(failingName, await failingExtension.getAddress());

      const price = await authContract.priceOf(1);

      // Purchase should succeed even if extension fails
      await expect(
        authContract.connect(owner).purchase(1, 1, {
          value: price,
        }),
      ).to.not.be.reverted;

      // Token should still be minted
      const balance = await authContract.balanceOf(owner.address, 1);
      expect(balance).to.be.greaterThan(0);
    });
  });

  describe("Megapot Extension Integration", function () {
    it("Should deploy and register Megapot extension", async function () {
      const { authContract, mocks } = contracts;
      const { owner, treasury } = accounts;

      // Deploy Megapot extension
      const MegapotExtension =
        await ethers.getContractFactory("MegapotExtension");
      const megapotExtension = await MegapotExtension.deploy(
        await mocks.megapot.getAddress(),
        ethers.ZeroAddress, // referrer
        owner.address, // owner
      );
      await megapotExtension.waitForDeployment();

      const megapotName = ethers.keccak256(
        ethers.toUtf8Bytes("MegapotExtension"),
      );

      // Register extension
      await authContract
        .connect(owner)
        .registerExtension(megapotName, await megapotExtension.getAddress());

      // Check registration
      expect(await authContract.extensions(megapotName)).to.equal(
        await megapotExtension.getAddress(),
      );
    });

    it("Should process Megapot integration on ERC20 purchases", async function () {
      const { authContract, mocks } = contracts;
      const { owner, treasury } = accounts;

      // Setup Megapot extension
      const MegapotExtension =
        await ethers.getContractFactory("MegapotExtension");
      const megapotExtension = await MegapotExtension.deploy(
        await mocks.megapot.getAddress(),
        ethers.ZeroAddress, // referrer
        owner.address, // owner
      );
      await megapotExtension.waitForDeployment();

      const megapotName = ethers.keccak256(
        ethers.toUtf8Bytes("MegapotExtension"),
      );
      await authContract
        .connect(owner)
        .registerExtension(megapotName, await megapotExtension.getAddress());

      // Setup ERC20 payment with correct decimals
      const tokenAddress = await mocks.erc20.getAddress();
      await authContract
        .connect(treasury)
        .addERC20PaymentToken(tokenAddress, ethers.ZeroAddress, 6);

      // Fund the extension with USDC tokens for Megapot purchases
      const extensionFunding = ethers.parseUnits("1000", 6); // 1000 USDC
      await mocks.erc20.mint(
        await megapotExtension.getAddress(),
        extensionFunding,
      );

      // Mint and approve tokens (100 USDC for 0.05 ETH at 1 ETH = 2000 USDC rate)
      const purchaseAmount = ethers.parseUnits("100", 6);
      await mocks.erc20.mint(owner.address, purchaseAmount);
      await mocks.erc20
        .connect(owner)
        .approve(await authContract.getAddress(), purchaseAmount);

      // Make ERC20 purchase (should trigger Megapot)
      await authContract.connect(owner).purchaseWithERC20(tokenAddress, 1, 1);

      // Check if Megapot received purchase
      expect(await mocks.megapot.purchasesMade()).to.be.greaterThan(0);
    });
  });

  describe("Extension Security", function () {
    it("Should validate extension addresses", async function () {
      const { authContract } = contracts;
      const { owner } = accounts;

      const extensionName = ethers.keccak256(
        ethers.toUtf8Bytes("InvalidExtension"),
      );

      // Should reject zero address
      await expect(
        authContract
          .connect(owner)
          .registerExtension(extensionName, ethers.ZeroAddress),
      ).to.be.revertedWith("Invalid extension address");

      // Should reject already registered names
      const MockExtension = await ethers.getContractFactory("MockExtension");
      const mockExtension = await MockExtension.deploy();
      await mockExtension.waitForDeployment();

      await authContract
        .connect(owner)
        .registerExtension(extensionName, await mockExtension.getAddress());

      await expect(
        authContract
          .connect(owner)
          .registerExtension(extensionName, await mockExtension.getAddress()),
      ).to.be.revertedWith("Extension already registered");
    });

    it("Should prevent duplicate extension addresses", async function () {
      const { authContract } = contracts;
      const { owner } = accounts;

      const MockExtension = await ethers.getContractFactory("MockExtension");
      const mockExtension = await MockExtension.deploy();
      await mockExtension.waitForDeployment();

      const firstExtensionName = ethers.keccak256(
        ethers.toUtf8Bytes("FirstExtension"),
      );
      const secondExtensionName = ethers.keccak256(
        ethers.toUtf8Bytes("SecondExtension"),
      );

      // Register first extension
      await authContract
        .connect(owner)
        .registerExtension(
          firstExtensionName,
          await mockExtension.getAddress(),
        );

      // Should reject same address with different name
      await expect(
        authContract
          .connect(owner)
          .registerExtension(
            secondExtensionName,
            await mockExtension.getAddress(),
          ),
      ).to.be.revertedWith("Extension address already in use");
    });

    it("Should handle direct funding configuration in Megapot extension", async function () {
      const { authContract, mocks } = contracts;
      const { owner } = accounts;

      // Deploy Megapot extension
      const MegapotExtension =
        await ethers.getContractFactory("MegapotExtension");
      const megapotExtension = await MegapotExtension.deploy(
        await mocks.megapot.getAddress(),
        ethers.ZeroAddress,
        owner.address,
      );
      await megapotExtension.waitForDeployment();

      // Test default direct funding configuration
      const config = await megapotExtension.config();
      expect(config.useDirectFunding).to.be.true;
      expect(config.fundingPercentage).to.equal(250); // 2.5%
      expect(config.minTicketAmount).to.equal(ethers.parseUnits("1", 6));
      expect(config.maxTicketAmount).to.equal(ethers.parseUnits("10", 6));

      // Test configuration update
      await expect(
        megapotExtension
          .connect(owner)
          .updateDirectFundingConfig(
            false,
            500,
            ethers.parseUnits("2", 6),
            ethers.parseUnits("20", 6),
          ),
      )
        .to.emit(megapotExtension, "DirectFundingConfigUpdated")
        .withArgs(
          false,
          500,
          ethers.parseUnits("2", 6),
          ethers.parseUnits("20", 6),
        );

      const updatedConfig = await megapotExtension.config();
      expect(updatedConfig.useDirectFunding).to.be.false;
      expect(updatedConfig.fundingPercentage).to.equal(500);
    });

    it("Should integrate direct funding with XMTPLibrary 3-way split", async function () {
      const { authContract, mocks, factory } = contracts;
      const { owner, treasury, user1: buyer } = accounts;

      // Setup factory fees
      await factory.connect(owner).setFeeBasisPoints(250); // 2.5%
      await factory
        .connect(owner)
        .setFeeRecipient(accounts.feeRecipient.address);

      // Deploy and register Megapot extension
      const MegapotExtension =
        await ethers.getContractFactory("MegapotExtension");
      const megapotExtension = await MegapotExtension.deploy(
        await mocks.megapot.getAddress(),
        ethers.ZeroAddress,
        owner.address,
      );
      await megapotExtension.waitForDeployment();

      const megapotId = ethers.keccak256(
        ethers.toUtf8Bytes("MEGAPOT_EXTENSION"),
      );
      await authContract
        .connect(owner)
        .registerExtension(megapotId, await megapotExtension.getAddress());

      // Create token and setup ERC20
      const tokenAddress = await mocks.erc20.getAddress();
      await authContract
        .connect(treasury)
        .addERC20PaymentToken(tokenAddress, ethers.ZeroAddress, 6);

      const tokenPrice = ethers.parseUnits("100", 6); // $100
      await authContract
        .connect(treasury)
        .setERC20Price(1, tokenAddress, tokenPrice);

      // Setup buyer with USDC and allowance
      await mocks.erc20.mint(buyer.address, tokenPrice);
      await mocks.erc20.connect(buyer).approve(authContract.target, tokenPrice);

      // Track balances before purchase
      const initialTreasuryBalance = await mocks.erc20.balanceOf(
        treasury.address,
      );
      const initialPlatformBalance = await mocks.erc20.balanceOf(
        accounts.feeRecipient.address,
      );
      const initialMegapotBalance = await mocks.erc20.balanceOf(
        megapotExtension.target,
      );

      // Verify extension is registered and configured correctly
      const registeredMegapot = await authContract.getExtension(megapotId);
      expect(registeredMegapot).to.equal(await megapotExtension.getAddress());

      // Make purchase
      await authContract.connect(buyer).purchaseWithERC20(tokenAddress, 1, 1);

      // Check 3-way split occurred
      const finalTreasuryBalance = await mocks.erc20.balanceOf(
        treasury.address,
      );
      const finalPlatformBalance = await mocks.erc20.balanceOf(
        accounts.feeRecipient.address,
      );
      const finalMegapotBalance = await mocks.erc20.balanceOf(
        megapotExtension.target,
      );

      const treasuryIncrease = finalTreasuryBalance - initialTreasuryBalance;
      const platformIncrease = finalPlatformBalance - initialPlatformBalance;
      const megapotIncrease = finalMegapotBalance - initialMegapotBalance;

      // Check ticket purchases occurred with direct funding
      const userTickets = await megapotExtension.userTicketsPurchased(
        buyer.address,
      );

      // Verify 3-way split: 95% treasury, 2.5% platform, 2.5% to megapot (which buys tickets)
      expect(treasuryIncrease).to.equal(ethers.parseUnits("95", 6));
      expect(platformIncrease).to.equal(ethers.parseUnits("2.5", 6));

      // Verify tickets were purchased with direct funding
      expect(userTickets).to.equal(2n); // Should buy 2 tickets with $2.5 funding

      // Megapot balance should increase by: funding_received - tickets_cost
      // $2.5 funding - (2 tickets * $1) = $0.5 remaining
      const expectedMegapotIncrease =
        ethers.parseUnits("2.5", 6) - userTickets * ethers.parseUnits("1", 6);
      expect(megapotIncrease).to.equal(expectedMegapotIncrease);
    });
  });
});
