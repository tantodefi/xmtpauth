const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("XMTPAuthERC1155 Unit Tests", function () {
  let XMTPAuthERC1155;
  let authContract;
  let owner, user1, user2, bot, treasury;

  beforeEach(async function () {
    [owner, user1, user2, bot, treasury] = await ethers.getSigners();

    // Deploy implementation directly for unit testing
    XMTPAuthERC1155 = await ethers.getContractFactory("XMTPAuthERC1155");
    authContract = await XMTPAuthERC1155.deploy();
    await authContract.waitForDeployment();

    // Initialize the contract
    await authContract.initialize(
      2 * 24 * 60 * 60, // 2 days admin delay
      owner.address,
      "https://api.example.com/metadata/",
      treasury.address,
      "sales-group-id",
      "premium-group-id",
      bot.address,
    );
  });

  describe("Initialization", function () {
    it("Should initialize with correct XMTP info", async function () {
      const xmtpInfo = await authContract.xmtpInfo();
      expect(xmtpInfo.salesGroupId).to.equal("sales-group-id");
      expect(xmtpInfo.premiumGroupId).to.equal("premium-group-id");
      expect(xmtpInfo.botAddress).to.equal(bot.address);
      expect(xmtpInfo.isActive).to.be.true;
    });

    it("Should set correct roles", async function () {
      const DEFAULT_ADMIN_ROLE = await authContract.DEFAULT_ADMIN_ROLE();
      expect(await authContract.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to
        .be.true;
    });

    it("Should initialize with nextTokenId = 1", async function () {
      expect(await authContract.nextTokenId()).to.equal(1);
    });
  });

  describe("Token Configuration", function () {
    it("Should create new token with correct configuration", async function () {
      const tokenConfig = {
        isTransferable: true,
        price: ethers.parseEther("0.01"),
        ttl: 30 * 24 * 60 * 60, // 30 days
      };

      await authContract.newToken(tokenConfig);

      const tokenId = 1;
      const config = await authContract.tokenConfig(tokenId);

      expect(config.isTransferable).to.be.true;
      expect(config.price).to.equal(ethers.parseEther("0.01"));
      expect(config.ttl).to.equal(30 * 24 * 60 * 60);
      expect(await authContract.nextTokenId()).to.equal(2);
    });

    it("Should setup XMTP access tier", async function () {
      // First create a token
      const tokenConfig = {
        isTransferable: true,
        price: ethers.parseEther("0.01"),
        ttl: 30 * 24 * 60 * 60,
      };

      await authContract.newToken(tokenConfig);
      const tokenId = 1;

      // Setup XMTP tier
      await authContract.setupXMTPAccessTier(
        tokenId,
        "Premium Access",
        "30-day premium access",
        "QmImageHash123",
        "https://api.example.com/metadata/1",
      );

      const xmtpTier = await authContract.getXMTPTier(tokenId);
      expect(xmtpTier.name).to.equal("Premium Access");
      expect(xmtpTier.description).to.equal("30-day premium access");
      expect(xmtpTier.imageHash).to.equal("QmImageHash123");
      expect(xmtpTier.metadataUri).to.equal(
        "https://api.example.com/metadata/1",
      );
      expect(xmtpTier.isActive).to.be.true;
    });

    it("Should fail to setup tier for non-existent token", async function () {
      await expect(
        authContract.setupXMTPAccessTier(
          999,
          "Invalid Tier",
          "This should fail",
          "hash",
          "uri",
        ),
      ).to.be.revertedWith("Token does not exist");
    });

    it("Should require non-empty name for XMTP tier", async function () {
      const tokenConfig = {
        isTransferable: true,
        price: ethers.parseEther("0.01"),
        ttl: 30 * 24 * 60 * 60,
      };

      await authContract.newToken(tokenConfig);
      const tokenId = 1;

      await expect(
        authContract.setupXMTPAccessTier(
          tokenId,
          "",
          "description",
          "hash",
          "uri",
        ),
      ).to.be.revertedWith("Name required");
    });
  });

  describe("Inbox ID Management", function () {
    it("Should store inbox ID by bot", async function () {
      const inboxId = "test-inbox-id-123";

      await authContract.connect(bot).storeUserInboxId(user1.address, inboxId);

      expect(await authContract.userInboxIds(user1.address)).to.equal(inboxId);
      expect(await authContract.inboxToAddress(inboxId)).to.equal(
        user1.address,
      );
    });

    it("Should store inbox ID by admin", async function () {
      const inboxId = "admin-stored-inbox-id";

      await authContract
        .connect(owner)
        .storeUserInboxId(user1.address, inboxId);

      expect(await authContract.userInboxIds(user1.address)).to.equal(inboxId);
      expect(await authContract.inboxToAddress(inboxId)).to.equal(
        user1.address,
      );
    });

    it("Should fail to store inbox ID by unauthorized user", async function () {
      const inboxId = "unauthorized-inbox-id";

      await expect(
        authContract.connect(user1).storeUserInboxId(user2.address, inboxId),
      ).to.be.revertedWith("Not authorized");
    });

    it("Should update existing inbox ID mapping", async function () {
      const oldInboxId = "old-inbox-id";
      const newInboxId = "new-inbox-id";

      // Store initial mapping
      await authContract
        .connect(bot)
        .storeUserInboxId(user1.address, oldInboxId);
      expect(await authContract.inboxToAddress(oldInboxId)).to.equal(
        user1.address,
      );

      // Update mapping
      await authContract
        .connect(bot)
        .storeUserInboxId(user1.address, newInboxId);

      // Verify old mapping is cleared and new one is set
      expect(await authContract.inboxToAddress(oldInboxId)).to.equal(
        ethers.ZeroAddress,
      );
      expect(await authContract.inboxToAddress(newInboxId)).to.equal(
        user1.address,
      );
      expect(await authContract.userInboxIds(user1.address)).to.equal(
        newInboxId,
      );
    });

    it("Should require non-empty inbox ID", async function () {
      await expect(
        authContract.connect(bot).storeUserInboxId(user1.address, ""),
      ).to.be.revertedWith("Invalid inbox ID");
    });
  });

  describe("Access Management", function () {
    let tokenId;

    beforeEach(async function () {
      // Setup a test token
      const tokenConfig = {
        isTransferable: true,
        price: ethers.parseEther("0.01"),
        ttl: 30 * 24 * 60 * 60,
      };

      await authContract.newToken(tokenConfig);
      tokenId = 1;

      await authContract.setupXMTPAccessTier(
        tokenId,
        "Test Access",
        "Test description",
        "hash",
        "uri",
      );
    });

    it("Should grant XMTP access", async function () {
      const inboxId = "granted-user-inbox";

      await authContract.grantXMTPAccess(user1.address, tokenId, 2, inboxId);

      // Check balance
      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(2);

      // Check inbox ID was stored
      expect(await authContract.userInboxIds(user1.address)).to.equal(inboxId);
      expect(await authContract.inboxToAddress(inboxId)).to.equal(
        user1.address,
      );

      // Check access
      expect(await authContract.hasValidXMTPAccess(user1.address)).to.be.true;
      expect(await authContract.hasValidAccessByInboxId(inboxId)).to.be.true;
    });

    it("Should grant access without inbox ID", async function () {
      await authContract.grantXMTPAccess(user1.address, tokenId, 1, "");

      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(1);
      expect(await authContract.hasValidXMTPAccess(user1.address)).to.be.true;
    });

    it("Should revoke XMTP access", async function () {
      const inboxId = "user-to-revoke";

      // Grant access first
      await authContract.grantXMTPAccess(user1.address, tokenId, 3, inboxId);
      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(3);

      // Revoke access
      await authContract.revokeXMTPAccess(
        user1.address,
        tokenId,
        "Test revocation",
      );

      // Check access is revoked
      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(0);
      expect(await authContract.hasValidXMTPAccess(user1.address)).to.be.false;
      expect(await authContract.hasValidAccessByInboxId(inboxId)).to.be.false;
    });

    it("Should fail to revoke access for user with no tokens", async function () {
      await expect(
        authContract.revokeXMTPAccess(
          user1.address,
          tokenId,
          "No tokens to revoke",
        ),
      ).to.be.revertedWith("User has no tokens");
    });

    it("Should fail to grant access for non-existent token", async function () {
      await expect(
        authContract.grantXMTPAccess(user1.address, 999, 1, "inbox"),
      ).to.be.revertedWith("Token does not exist");
    });
  });

  describe("Batch Operations", function () {
    let tokenIds;

    beforeEach(async function () {
      tokenIds = [];

      // Create multiple tokens
      for (let i = 0; i < 3; i++) {
        const tokenConfig = {
          isTransferable: true,
          price: ethers.parseEther(`0.0${i + 1}`),
          ttl: (i + 1) * 30 * 24 * 60 * 60,
        };

        await authContract.newToken(tokenConfig);
        const tokenId = i + 1;
        tokenIds.push(tokenId);

        await authContract.setupXMTPAccessTier(
          tokenId,
          `Tier ${i + 1}`,
          `Description ${i + 1}`,
          `hash${i + 1}`,
          `uri${i + 1}`,
        );
      }
    });

    it("Should batch check XMTP access", async function () {
      const users = [user1.address, user2.address];

      // Grant access to user1 for token 1
      await authContract.grantXMTPAccess(
        user1.address,
        tokenIds[0],
        1,
        "user1-inbox",
      );

      const results = await authContract.batchCheckXMTPAccess(users);

      expect(results.length).to.equal(2);
      expect(results[0]).to.be.true; // user1 has access
      expect(results[1]).to.be.false; // user2 has no access
    });

    it("Should get all active XMTP tiers", async function () {
      const activeTiers = await authContract.getActiveXMTPTiers();

      expect(activeTiers.length).to.equal(3);
      expect(activeTiers).to.deep.equal([
        ethers.toBigInt(1),
        ethers.toBigInt(2),
        ethers.toBigInt(3),
      ]);
    });
  });

  describe("Purchase Tracking", function () {
    let tokenId;

    beforeEach(async function () {
      const tokenConfig = {
        isTransferable: true,
        price: ethers.parseEther("0.01"),
        ttl: 30 * 24 * 60 * 60,
      };

      await authContract.newToken(tokenConfig);
      tokenId = 1;

      // Store inbox ID for user
      await authContract
        .connect(bot)
        .storeUserInboxId(user1.address, "user1-inbox");
    });

    it("Should track purchases correctly", async function () {
      // Make a purchase
      await authContract.connect(user1).purchase(tokenId, 2, {
        value: ethers.parseEther("0.02"),
      });

      // Check purchase history
      const userPurchases = await authContract.getXMTPUserPurchases(
        user1.address,
      );
      expect(userPurchases.length).to.equal(1);

      const purchaseRecord = await authContract.getXMTPPurchaseRecord(
        userPurchases[0],
      );
      expect(purchaseRecord.user).to.equal(user1.address);
      expect(purchaseRecord.userInboxId).to.equal("user1-inbox");
      expect(purchaseRecord.tokenId).to.equal(tokenId);
      expect(purchaseRecord.purchasePrice).to.equal(ethers.parseEther("0.02"));
      expect(purchaseRecord.isActive).to.be.true;
      expect(purchaseRecord.paymentToken).to.equal(ethers.ZeroAddress); // ETH payment

      // Check total history length
      expect(await authContract.getXMTPPurchaseHistoryLength()).to.equal(1);
    });

    it("Should track purchase with transaction hash", async function () {
      const txHash =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

      await authContract.connect(user1).purchaseXMTPAccess(tokenId, 1, txHash, {
        value: ethers.parseEther("0.01"),
      });

      const userPurchases = await authContract.getXMTPUserPurchases(
        user1.address,
      );
      const purchaseRecord = await authContract.getXMTPPurchaseRecord(
        userPurchases[0],
      );

      expect(purchaseRecord.transactionHash).to.equal(txHash);
    });
  });

  describe("XMTP Configuration", function () {
    it("Should update XMTP info", async function () {
      const newSalesGroupId = "new-sales-group";
      const newPremiumGroupId = "new-premium-group";
      const newBotAddress = user2.address;

      await authContract.updateXMTPInfo(
        newSalesGroupId,
        newPremiumGroupId,
        newBotAddress,
      );

      const xmtpInfo = await authContract.xmtpInfo();
      expect(xmtpInfo.salesGroupId).to.equal(newSalesGroupId);
      expect(xmtpInfo.premiumGroupId).to.equal(newPremiumGroupId);
      expect(xmtpInfo.botAddress).to.equal(newBotAddress);
    });

    it("Should toggle XMTP integration", async function () {
      // Initially active
      let xmtpInfo = await authContract.xmtpInfo();
      expect(xmtpInfo.isActive).to.be.true;

      // Toggle off
      await authContract.toggleXMTPIntegration();
      xmtpInfo = await authContract.xmtpInfo();
      expect(xmtpInfo.isActive).to.be.false;

      // Toggle back on
      await authContract.toggleXMTPIntegration();
      xmtpInfo = await authContract.xmtpInfo();
      expect(xmtpInfo.isActive).to.be.true;
    });

    it("Should fail to update XMTP info by non-admin", async function () {
      await expect(
        authContract
          .connect(user1)
          .updateXMTPInfo("new-sales", "new-premium", user2.address),
      ).to.be.reverted; // Should revert due to access control
    });

    it("Should fail to toggle integration by non-access-manager", async function () {
      await expect(authContract.connect(user1).toggleXMTPIntegration()).to.be
        .reverted; // Should revert due to access control
    });
  });

  describe("Access Control", function () {
    it("Should have correct initial roles", async function () {
      const DEFAULT_ADMIN_ROLE = await authContract.DEFAULT_ADMIN_ROLE();
      const TOKEN_MANAGER_ROLE = await authContract.TOKEN_MANAGER_ROLE();
      const MINTER_ROLE = await authContract.MINTER_ROLE();

      expect(await authContract.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to
        .be.true;
      expect(await authContract.hasRole(TOKEN_MANAGER_ROLE, owner.address)).to
        .be.true;
      expect(await authContract.hasRole(MINTER_ROLE, owner.address)).to.be.true;
    });

    it("Should fail token creation by non-token-manager", async function () {
      const tokenConfig = {
        isTransferable: true,
        price: ethers.parseEther("0.01"),
        ttl: 30 * 24 * 60 * 60,
      };

      await expect(authContract.connect(user1).newToken(tokenConfig)).to.be
        .reverted; // Should revert due to missing TOKEN_MANAGER_ROLE
    });

    it("Should fail XMTP tier setup by non-token-manager", async function () {
      await expect(
        authContract
          .connect(user1)
          .setupXMTPAccessTier(1, "Test", "Test", "hash", "uri"),
      ).to.be.reverted; // Should revert due to missing TOKEN_MANAGER_ROLE
    });
  });
});
