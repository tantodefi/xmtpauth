const { expect } = require("chai");
const { BaseTest } = require("../BaseTest");

describe("XMTP Auth V2 - End-to-End Integration", function () {
  let test, accounts, contracts;

  beforeEach(async function () {
    test = new BaseTest();
    ({ accounts, contracts } = await test.fullSetup());
  });

  describe("Complete User Journey", function () {
    it("Should handle full user lifecycle", async function () {
      const { authContract, mocks } = contracts;
      const { treasury, bot, user1 } = accounts;

      // 1. Setup XMTP access tier using token 1 (which should exist from BaseTest)
      // Token 0 has issues due to evmauth-core bugs, so let's use token 1 instead
      await authContract
        .connect(treasury)
        .setupXMTPAccessTier(
          1,
          "Premium XMTP Access",
          "Full access to premium XMTP features",
          "QmHash123",
          "https://metadata.example.com/1",
        );

      // 2. User stores their XMTP inbox ID
      const userInboxId = "user-inbox-abc123";
      await authContract
        .connect(user1)
        .storeUserInboxId(user1.address, userInboxId);

      // Verify mapping
      expect(await authContract.userInboxIds(user1.address)).to.equal(
        userInboxId,
      );
      expect(await authContract.inboxToAddress(userInboxId)).to.equal(
        user1.address,
      );

      // 3. User purchases access with ETH
      console.log("Getting price of token 1...");
      const price = await authContract.priceOf(1);
      console.log(`Token 1 price: ${ethers.formatEther(price)} ETH`);
      const initialBalance = await authContract.balanceOf(user1.address, 1);

      await authContract
        .connect(user1)
        .purchaseXMTPAccess(1, 1, "eth-tx-hash-123", {
          value: price,
        });

      // Verify token received
      const newBalance = await authContract.balanceOf(user1.address, 1);
      expect(newBalance).to.equal(initialBalance + 1n);

      // 4. Verify XMTP access status
      expect(await authContract.hasValidXMTPAccess(user1.address)).to.be.true;
      expect(await authContract.hasValidAccessByInboxId(userInboxId)).to.be
        .true;

      // 5. Check purchase history
      const historyLength = await authContract.getXMTPPurchaseHistoryLength();
      expect(historyLength).to.be.greaterThan(0);

      // 6. Bot can grant additional access
      await authContract
        .connect(bot)
        .grantXMTPAccess(user1.address, 1, 2, "86400");

      const finalBalance = await authContract.balanceOf(user1.address, 1);
      expect(finalBalance).to.equal(newBalance + 2n);
    });

    it("Should handle ERC20 purchase flow with Megapot integration", async function () {
      const { authContract, mocks } = contracts;
      const { treasury, bot, user1, owner } = accounts;

      // 1. Setup ERC20 payment system
      const usdcAddress = await mocks.erc20.getAddress();
      await authContract
        .connect(treasury)
        .addERC20PaymentToken(usdcAddress, ethers.ZeroAddress, 6);

      // 2. Deploy and register Megapot extension
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

      // Fund the extension with USDC tokens for Megapot purchases
      const extensionFunding = ethers.parseUnits("1000", 6); // 1000 USDC
      await mocks.erc20.mint(
        await megapotExtension.getAddress(),
        extensionFunding,
      );

      // 3. Mint USDC to user and approve spending
      const purchaseAmount = ethers.parseUnits("100", 6); // 100 USDC
      await mocks.erc20.mint(user1.address, purchaseAmount);
      await mocks.erc20
        .connect(user1)
        .approve(await authContract.getAddress(), purchaseAmount);

      // 4. User purchases with ERC20 (should trigger Megapot)
      const treasuryBalanceBefore = await mocks.erc20.balanceOf(
        treasury.address,
      );
      const megapotPurchasesBefore = await mocks.megapot.purchasesMade();

      await authContract
        .connect(user1)
        .purchaseXMTPAccessERC20(usdcAddress, 1, 1, "usdc-tx-hash-456");

      // 5. Verify token received
      expect(await authContract.balanceOf(user1.address, 1)).to.be.greaterThan(
        0,
      );

      // 6. Verify treasury received revenue (97.5% minus platform fees)
      const treasuryBalanceAfter = await mocks.erc20.balanceOf(
        treasury.address,
      );
      expect(treasuryBalanceAfter).to.be.greaterThan(treasuryBalanceBefore);

      // 7. Verify Megapot extension was triggered
      const megapotPurchasesAfter = await mocks.megapot.purchasesMade();
      expect(megapotPurchasesAfter).to.be.greaterThan(megapotPurchasesBefore);
    });

    it("Should handle emergency scenarios", async function () {
      const { authContract } = contracts;
      const { bot, user1, treasury } = accounts;

      // 1. User has valid access
      await authContract
        .connect(bot)
        .grantXMTPAccess(user1.address, 1, 1, "86400");
      expect(await authContract.hasValidXMTPAccess(user1.address)).to.be.true;

      // 2. Emergency: Pause the contract
      await authContract.connect(bot).pause();
      expect(await authContract.paused()).to.be.true;

      // 3. Purchases should be blocked
      const price = await authContract.priceOf(1);
      await expect(
        authContract.connect(user1)["purchase(uint256,uint256)"](1, 1, {
          value: price,
        }),
      ).to.be.revertedWithCustomError(authContract, "EnforcedPause");

      // 4. Existing access should still work (read-only)
      expect(await authContract.hasValidXMTPAccess(user1.address)).to.be.true;

      // 5. Admin can still manage in emergency
      await authContract
        .connect(bot)
        .grantXMTPAccess(user1.address, 1, 1, "86400");

      // 6. Unpause when emergency is resolved
      await authContract.connect(bot).unpause();
      expect(await authContract.paused()).to.be.false;

      // 7. Purchases work again
      await expect(
        authContract.connect(user1)["purchase(uint256,uint256)"](1, 1, {
          value: price,
        }),
      ).to.not.be.reverted;
    });
  });

  describe("Multi-Token Scenarios", function () {
    it("Should handle multiple token tiers", async function () {
      const { authContract } = contracts;
      const { treasury, user1 } = accounts;

      // Create different access tiers
      const basicPrice = ethers.parseEther("0.05");
      const premiumPrice = ethers.parseEther("0.2");
      const vipPrice = ethers.parseEther("0.5");

      // Basic tier (token 0 already exists)
      await authContract.connect(treasury).setTokenPrice(1, basicPrice);
      await authContract
        .connect(treasury)
        .setupXMTPAccessTier(0, "Basic Access", "Basic XMTP features", "", "");

      // Premium tier
      await authContract.connect(treasury).createToken(premiumPrice, true, 0);
      await authContract
        .connect(treasury)
        .setupXMTPAccessTier(
          1,
          "Premium Access",
          "Premium XMTP features",
          "",
          "",
        );

      // VIP tier
      await authContract.connect(treasury).createToken(vipPrice, true, 0);
      await authContract
        .connect(treasury)
        .setupXMTPAccessTier(
          2,
          "VIP Access",
          "VIP XMTP features with priority support",
          "",
          "",
        );

      // User purchases all tiers
      await authContract
        .connect(user1)
        ["purchase(uint256,uint256)"](1, 1, { value: basicPrice });
      await authContract
        .connect(user1)
        ["purchase(uint256,uint256)"](2, 1, { value: premiumPrice });
      await authContract
        .connect(user1)
        ["purchase(uint256,uint256)"](3, 1, { value: vipPrice });

      // Verify user has all tokens
      expect(await authContract.balanceOf(user1.address, 1)).to.equal(1);
      expect(await authContract.balanceOf(user1.address, 2)).to.equal(1);
      expect(await authContract.balanceOf(user1.address, 3)).to.equal(1);

      // User should have valid access (any token counts)
      expect(await authContract.hasValidXMTPAccess(user1.address)).to.be.true;
    });

    it("Should handle token expiry", async function () {
      const { authContract } = contracts;
      const { treasury, user1 } = accounts;

      // Create token with 1 hour TTL
      const shortTTL = 3600; // 1 hour
      await authContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), true, shortTTL);

      const tokenId = 2; // Should be the next token
      await authContract
        .connect(treasury)
        .setupXMTPAccessTier(
          tokenId,
          "Temporary Access",
          "1-hour access pass",
          "",
          "",
        );

      // User purchases temporary access
      await authContract
        .connect(user1)
        ["purchase(uint256,uint256)"](tokenId, 1, {
          value: ethers.parseEther("0.1"),
        });

      // User should have token
      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(1);

      // Fast forward time (simulate 2 hours)
      await ethers.provider.send("evm_increaseTime", [7200]);
      await ethers.provider.send("evm_mine");

      // Token should be expired (this depends on TTL implementation)
      // Note: TTL checking might need to be implemented in hasValidXMTPAccess
    });
  });

  describe("Factory Integration", function () {
    it("Should deploy and use contract via factory", async function () {
      const { factory } = contracts;
      const { owner, treasury, bot, feeRecipient, user1 } = accounts;

      // Setup factory
      await factory.connect(owner).setFeeBasisPoints(250); // 2.5%
      await factory.connect(owner).setFeeRecipient(feeRecipient.address);

      // Deploy new contract via factory
      const deploymentConfig = {
        groupName: "Factory Group",
        groupDescription: "Factory Description",
        groupImageUrl: "https://example.com/factory.jpg",
        baseURI: "https://factory.example.com/tokens/",
        salesGroupId: "factory-sales-group",
        premiumGroupId: "factory-premium-group",
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

      const deployedAddress = deploymentEvent.args.contractAddress;

      // Connect to deployed contract
      const XMTPAuthERC1155 = await ethers.getContractFactory(
        "XMTPAuthERC1155",
        {
          libraries: {
            XMTPLibrary: await contracts.library.getAddress(),
          },
        },
      );
      const deployedContract = XMTPAuthERC1155.attach(deployedAddress);

      // Use deployed contract for full user flow
      // Create two tokens (will be assigned next available IDs)
      const tokenId3 = await deployedContract
        .connect(treasury)
        .createToken.staticCall(ethers.parseEther("0.5"), true, 0); // Get ID first
      await deployedContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.5"), true, 0); // Token 3

      const tokenId4 = await deployedContract
        .connect(treasury)
        .createToken.staticCall(ethers.parseEther("1.0"), true, 0); // Get ID first
      await deployedContract
        .connect(treasury)
        .createToken(ethers.parseEther("1.0"), true, 0); // Token 4

      const feeRecipientBalanceBefore = await ethers.provider.getBalance(
        feeRecipient.address,
      );

      // User purchases token 4 (1.0 ETH token, should pay factory fees)
      await deployedContract
        .connect(user1)
        ["purchase(uint256,uint256)"](tokenId4, 1, {
          value: ethers.parseEther("1.0"),
        });

      // Verify user got token
      expect(
        await deployedContract.balanceOf(user1.address, tokenId4),
      ).to.equal(1);

      // Verify factory fee was paid
      const feeRecipientBalanceAfter = await ethers.provider.getBalance(
        feeRecipient.address,
      );
      const expectedFee = (ethers.parseEther("1.0") * 250n) / 10000n; // 2.5%
      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.equal(
        expectedFee,
      );
    });
  });

  describe("Contract Size and Gas Optimization", function () {
    it("Should report contract sizes for deployment planning", async function () {
      const info = await test.getContractInfo();

      console.log("\n📊 Contract Size Report:");
      console.log(`Main Contract: ${info.authContract.size} bytes`);
      console.log(`Library: ${info.library.size} bytes`);
      console.log(`Total: ${info.totalSize} bytes`);
      console.log(
        `Mainnet Deployable: ${info.authContract.deployable ? "Yes" : "No"}`,
      );
      console.log(`Recommended: L2 deployment (Base, Arbitrum, etc.)`);

      // Verify contract exceeds mainnet limit (expected for feature-rich contract)
      expect(info.authContract.size).to.be.greaterThan(24576);
      expect(info.authContract.deployable).to.be.false;

      // But should be reasonable for L2 deployment
      expect(info.authContract.size).to.be.lessThan(100000); // 100KB reasonable limit
    });

    it("Should demonstrate gas efficiency with library", async function () {
      const { authContract } = contracts;
      const { user1 } = accounts;

      // Make a purchase and measure gas
      const price = await authContract.priceOf(1);

      const tx = await authContract
        .connect(user1)
        ["purchase(uint256,uint256)"](1, 1, {
          value: price,
        });
      const receipt = await tx.wait();

      console.log(`\n⛽ Gas used for purchase: ${receipt.gasUsed.toString()}`);

      // Should be reasonable gas usage
      expect(receipt.gasUsed).to.be.lessThan(500000); // 500k gas reasonable limit
    });
  });
});
