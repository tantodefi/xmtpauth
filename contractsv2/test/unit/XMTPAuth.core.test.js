const { expect } = require("chai");
const { BaseTest } = require("../BaseTest");

describe("XMTPAuthERC1155 - Core Functionality", function () {
  let test, accounts, contracts;

  beforeEach(async function () {
    test = new BaseTest();
    ({ accounts, contracts } = await test.fullSetup());
  });

  describe("Contract Deployment", function () {
    it("Should deploy and initialize properly", async function () {
      const { authContract } = contracts;

      expect(await authContract.treasury()).to.equal(accounts.treasury.address);

      const xmtpInfo = await authContract.xmtpInfo();
      expect(xmtpInfo.salesGroupId).to.equal("sales-group");
      expect(xmtpInfo.premiumGroupId).to.equal("premium-group");
      expect(xmtpInfo.botAddress).to.equal(accounts.bot.address);
      expect(xmtpInfo.isActive).to.be.true;
    });

    it("Should have correct contract size for L2 deployment", async function () {
      const info = await test.getContractInfo();

      console.log(`📏 Auth Contract: ${info.authContract.size} bytes`);

      // Contract should require L2 deployment
      expect(info.authContract.size).to.be.greaterThan(24576);
      expect(info.authContract.deployable).to.be.false;
    });
  });

  describe("Token Management", function () {
    it("Should create tokens with correct configuration", async function () {
      const { authContract } = contracts;

      // Token 1 should exist (created in setup via setupXMTPAccessTier)
      expect(await authContract.isValidToken(1)).to.be.true;
      expect(await authContract.priceOf(1)).to.equal(ethers.parseEther("0.05"));
    });

    it("Should handle XMTP tier setup with auto-creation", async function () {
      const { authContract } = contracts;

      // Token 1 should exist (created via setupAccessTier)
      expect(await authContract.isValidToken(1)).to.be.true;

      // Check that the token has the correct price and configuration
      const tokenPrice = await authContract.priceOf(1);
      expect(tokenPrice).to.equal(ethers.parseEther("0.05"));

      // Check that the token has the correct TTL (7 days for trial token)
      const tokenTTL = await authContract.tokenTTL(1);
      expect(tokenTTL).to.equal(7 * 24 * 60 * 60); // 7 days in seconds
    });

    it("Should allow token price updates", async function () {
      const { authContract } = contracts;
      const { treasury } = accounts;

      const newPrice = ethers.parseEther("0.2");
      await authContract.connect(treasury).setTokenPrice(1, newPrice);

      expect(await authContract.priceOf(1)).to.equal(newPrice);
    });

    it("Should enforce access control for token management", async function () {
      const { authContract } = contracts;
      const { user1 } = accounts;

      await expect(
        authContract
          .connect(user1)
          .createToken(ethers.parseEther("1"), true, 0),
      ).to.be.revertedWithCustomError(
        authContract,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("Access Control", function () {
    it("Should have proper role assignments", async function () {
      const { authContract } = contracts;
      const { owner, treasury, bot } = accounts;

      // Check default admin
      const DEFAULT_ADMIN_ROLE = await authContract.DEFAULT_ADMIN_ROLE();
      expect(await authContract.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to
        .be.true;

      // Check token manager role
      const TOKEN_MANAGER_ROLE = ethers.keccak256(
        ethers.toUtf8Bytes("TOKEN_MANAGER_ROLE"),
      );
      expect(await authContract.hasRole(TOKEN_MANAGER_ROLE, treasury.address))
        .to.be.true;

      // Check access manager role for bot
      const ACCESS_MANAGER_ROLE = ethers.keccak256(
        ethers.toUtf8Bytes("ACCESS_MANAGER_ROLE"),
      );
      expect(await authContract.hasRole(ACCESS_MANAGER_ROLE, bot.address)).to.be
        .true;
    });

    it("Should allow role-based function access", async function () {
      const { authContract } = contracts;
      const { treasury, bot } = accounts;

      // Treasury can manage tokens
      await expect(
        authContract
          .connect(treasury)
          .createToken(ethers.parseEther("0.5"), false, 3600),
      ).to.not.be.reverted;

      // Bot can manage access
      await expect(authContract.connect(bot).pause()).to.not.be.reverted;

      await expect(authContract.connect(bot).unpause()).to.not.be.reverted;
    });
  });

  describe("Pause Functionality", function () {
    it("Should handle pause/unpause correctly", async function () {
      const { authContract } = contracts;
      const { bot } = accounts;

      // Initially not paused
      expect(await authContract.paused()).to.be.false;

      // Bot can pause
      await authContract.connect(bot).pause();
      expect(await authContract.paused()).to.be.true;

      // Bot can unpause
      await authContract.connect(bot).unpause();
      expect(await authContract.paused()).to.be.false;
    });

    it("Should prevent purchases when paused", async function () {
      const { authContract } = contracts;
      const { bot, owner } = accounts;

      // Pause the contract
      await authContract.connect(bot).pause();

      // Purchase should fail when paused
      await expect(
        authContract.connect(owner).purchaseXMTPAccess(0, 1, "tx-hash", {
          value: ethers.parseEther("0.1"),
        }),
      ).to.be.revertedWithCustomError(authContract, "EnforcedPause");
    });
  });

  describe("XMTP Integration", function () {
    it("Should manage inbox ID mappings", async function () {
      const { authContract } = contracts;
      const { bot, user1 } = accounts;

      const testInboxId = "test-inbox-12345";

      // Store inbox ID (only bot or admin can call this)
      await authContract
        .connect(bot)
        .storeUserInboxId(user1.address, testInboxId);

      // Check mappings
      expect(await authContract.userInboxIds(user1.address)).to.equal(
        testInboxId,
      );
      expect(await authContract.inboxToAddress(testInboxId)).to.equal(
        user1.address,
      );
    });

    it("Should allow bot to grant access", async function () {
      const { authContract } = contracts;
      const { bot, user1 } = accounts;

      // Check if token 1 exists and get initial balance
      const tokenExists = await authContract.isValidToken(1);
      console.log("Token 1 exists:", tokenExists);

      // Check bot address and roles
      const xmtpInfo = await authContract.xmtpInfo();
      console.log("XMTP bot address:", xmtpInfo.botAddress);
      console.log("Test bot address:", bot.address);
      console.log(
        "Bot addresses match:",
        xmtpInfo.botAddress.toLowerCase() === bot.address.toLowerCase(),
      );

      const initialBalance = await authContract.balanceOf(user1.address, 1);
      console.log("Initial balance:", initialBalance.toString());

      // Bot grants access to token 1 (which should exist from setup)
      try {
        const tx = await authContract
          .connect(bot)
          .grantXMTPAccess(user1.address, 1, 5, "test-inbox-456");
        console.log("Grant access transaction successful:", tx.hash);
        const receipt = await tx.wait();
        console.log("Transaction receipt status:", receipt.status);

        // Check events emitted
        const events = receipt.logs;
        console.log("Number of events emitted:", events.length);
        for (let i = 0; i < events.length; i++) {
          console.log(`Event ${i}:`, events[i].fragment?.name || "Unknown");
        }
      } catch (error) {
        console.error("Grant access failed:", error.message);
        throw error;
      }

      const newBalance = await authContract.balanceOf(user1.address, 1);
      console.log("New balance:", newBalance.toString());

      // Also check total supply to see if tokens were minted at all
      const totalSupply = await authContract["totalSupply(uint256)"](1);
      console.log("Total supply of token 1:", totalSupply.toString());

      expect(newBalance).to.equal(initialBalance + 5n);
    });

    it("Should track XMTP access status", async function () {
      const { authContract } = contracts;
      const { bot, user1 } = accounts;

      // Grant access to token 1
      await authContract
        .connect(bot)
        .grantXMTPAccess(user1.address, 1, 1, "test-inbox-789");

      // Check access status - user should have valid access now
      const hasAccess = await authContract.hasValidXMTPAccess(user1.address);
      console.log("Has valid access:", hasAccess);
      expect(hasAccess).to.be.true;
    });
  });
});
