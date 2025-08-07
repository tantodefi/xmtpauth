const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EVMAuth Contracts", function () {
  let factory, groupAccess;
  let owner, feeRecipient, user1, user2, bot;
  let factoryAddress, groupAccessAddress;

  const INITIAL_FEE_BASIS_POINTS = 250; // 2.5%
  const TEST_GROUP_NAME = "Test Premium Community";
  const TEST_GROUP_DESCRIPTION = "Test group for contract testing";
  const TEST_GROUP_IMAGE = "https://example.com/test.png";
  const TEST_SALES_GROUP_ID = "test-sales-123";
  const TEST_PREMIUM_GROUP_ID = "test-premium-456";

  beforeEach(async function () {
    // Get signers
    [owner, feeRecipient, user1, user2, bot] = await ethers.getSigners();

    // Deploy Factory
    const EVMAuthFactory = await ethers.getContractFactory("EVMAuthFactory");
    factory = await EVMAuthFactory.deploy(
      feeRecipient.address,
      INITIAL_FEE_BASIS_POINTS,
      owner.address
    );
    await factory.waitForDeployment();
    factoryAddress = await factory.getAddress();

    // Deploy GroupAccess
    const EVMAuthGroupAccess = await ethers.getContractFactory("EVMAuthGroupAccessV2");
    groupAccess = await EVMAuthGroupAccess.deploy(
      factoryAddress,
      TEST_GROUP_NAME,
      TEST_GROUP_DESCRIPTION,
      TEST_GROUP_IMAGE,
      TEST_SALES_GROUP_ID,
      TEST_PREMIUM_GROUP_ID,
      bot.address,
      owner.address
    );
    await groupAccess.waitForDeployment();
    groupAccessAddress = await groupAccess.getAddress();
  });

  describe("Factory Contract", function () {
    it("Should deploy with correct initial values", async function () {
      expect(await factory.feeRecipient()).to.equal(feeRecipient.address);
      expect(await factory.feeBasisPoints()).to.equal(INITIAL_FEE_BASIS_POINTS);
      expect(await factory.owner()).to.equal(owner.address);
    });

    it("Should allow owner to update fee configuration", async function () {
      const newFeeRecipient = user1.address;
      const newFeeBasisPoints = 300;

      await factory.updateFeeConfiguration(newFeeRecipient, newFeeBasisPoints);

      expect(await factory.feeRecipient()).to.equal(newFeeRecipient);
      expect(await factory.feeBasisPoints()).to.equal(newFeeBasisPoints);
    });

    it("Should not allow non-owner to update fee configuration", async function () {
      await expect(
        factory.connect(user1).updateFeeConfiguration(user1.address, 300)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("GroupAccess Contract", function () {
    beforeEach(async function () {
      // Setup a test tier
      await groupAccess.setupAccessTier(
        1, // tokenId
        7, // durationDays
        ethers.parseEther("0.001"), // priceWei
        "Weekly Access",
        "7 days premium access",
        "QmTestHash",
        "ipfs://QmTestMetadata"
      );
    });

    it("Should deploy with correct initial values", async function () {
      expect(await groupAccess.groupName()).to.equal(TEST_GROUP_NAME);
      expect(await groupAccess.groupDescription()).to.equal(TEST_GROUP_DESCRIPTION);
      expect(await groupAccess.groupImageUrl()).to.equal(TEST_GROUP_IMAGE);
      expect(await groupAccess.owner()).to.equal(owner.address);
    });

    it("Should setup access tiers correctly", async function () {
      const tier = await groupAccess.accessTiers(1);
      expect(tier.durationDays).to.equal(7);
      expect(tier.priceWei).to.equal(ethers.parseEther("0.001"));
      expect(tier.name).to.equal("Weekly Access");
      expect(tier.description).to.equal("7 days premium access");
      expect(tier.isActive).to.be.true;
    });

    it("Should allow users to purchase access", async function () {
      const tokenId = 1;
      const price = ethers.parseEther("0.001");
      
      // User purchases access
      const tx = await groupAccess.connect(user1).purchaseAccess(tokenId, {
        value: price
      });

      // Check that user received the token
      expect(await groupAccess.balanceOf(user1.address, tokenId)).to.equal(1);
      
      // Check that user has valid access
      expect(await groupAccess.hasValidAccess(user1.address)).to.be.true;

      // Check events (V2 contract has different event signature)
      await expect(tx)
        .to.emit(groupAccess, "UserAccessGranted");
    });

    it("Should handle XMTP group information", async function () {
      const xmtpInfo = await groupAccess.xmtpInfo();
      expect(xmtpInfo.salesGroupId).to.equal(TEST_SALES_GROUP_ID);
      expect(xmtpInfo.premiumGroupId).to.equal(TEST_PREMIUM_GROUP_ID);
      expect(xmtpInfo.botAddress).to.equal(bot.address);
      expect(xmtpInfo.isActive).to.be.true;
    });

    it("Should store user inbox IDs", async function () {
      const testInboxId = "test-inbox-123";
      
      // Store inbox ID mapping
      await groupAccess.connect(bot).storeUserInboxId(user1.address, testInboxId);
      
      // Check mapping
      expect(await groupAccess.userInboxIds(user1.address)).to.equal(testInboxId);
      expect(await groupAccess.inboxToAddress(testInboxId)).to.equal(user1.address);
    });

    it("Should check access by inbox ID", async function () {
      const tokenId = 1;
      const price = ethers.parseEther("0.001");
      const testInboxId = "test-inbox-123";
      
      // Store inbox ID and purchase access
      await groupAccess.connect(bot).storeUserInboxId(user1.address, testInboxId);
      await groupAccess.connect(user1).purchaseAccess(tokenId, { value: price });
      
      // Check access by inbox ID
      expect(await groupAccess.hasValidAccessByInboxId(testInboxId)).to.be.true;
    });

    it("Should calculate platform fees correctly", async function () {
      const tokenId = 1;
      const price = ethers.parseEther("0.001");
      const expectedFee = price * BigInt(INITIAL_FEE_BASIS_POINTS) / BigInt(10000);
      
      const feeRecipientBalanceBefore = await ethers.provider.getBalance(feeRecipient.address);
      
      await groupAccess.connect(user1).purchaseAccess(tokenId, { value: price });
      
      const feeRecipientBalanceAfter = await ethers.provider.getBalance(feeRecipient.address);
      const feeReceived = feeRecipientBalanceAfter - feeRecipientBalanceBefore;
      
      expect(feeReceived).to.equal(expectedFee);
    });

    it("Should not allow purchase with insufficient payment", async function () {
      const tokenId = 1;
      const insufficientPrice = ethers.parseEther("0.0005"); // Half the required amount
      
      await expect(
        groupAccess.connect(user1).purchaseAccess(tokenId, { value: insufficientPrice })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("Should not allow purchase of inactive tiers", async function () {
      const inactiveTokenId = 999; // Non-existent tier
      
      await expect(
        groupAccess.connect(user1).purchaseAccess(inactiveTokenId, { 
          value: ethers.parseEther("0.001") 
        })
      ).to.be.revertedWith("Access tier not active");
    });

    it("Should handle token expiry correctly", async function () {
      const tokenId = 1;
      const price = ethers.parseEther("0.001");
      
      // Purchase access
      await groupAccess.connect(user1).purchaseAccess(tokenId, { value: price });
      
      // Check initial access
      expect(await groupAccess.hasValidAccess(user1.address)).to.be.true;
      
      // Fast forward time beyond expiry (7 days + 1 second)
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");
      
      // Check access after expiry
      expect(await groupAccess.hasValidAccess(user1.address)).to.be.false;
    });

    it("Should allow admin to revoke access", async function () {
      const tokenId = 1;
      const price = ethers.parseEther("0.001");
      
      // Purchase access
      await groupAccess.connect(user1).purchaseAccess(tokenId, { value: price });
      expect(await groupAccess.hasValidAccess(user1.address)).to.be.true;
      
      // Revoke access
      await groupAccess.connect(owner).revokeAccess(user1.address, tokenId, "Test revocation");
      
      // Check access after revocation
      expect(await groupAccess.hasValidAccess(user1.address)).to.be.false;
    });
  });

  describe("Integration Tests", function () {
    beforeEach(async function () {
      // Setup test tier for integration tests
      await groupAccess.setupAccessTier(
        1, // tokenId
        7, // durationDays
        ethers.parseEther("0.001"), // priceWei
        "Weekly Access",
        "7 days premium access",
        "QmTestHash",
        "ipfs://QmTestMetadata"
      );
    });

    it("Should handle complete user journey", async function () {
      const tokenId = 1;
      const price = ethers.parseEther("0.001");
      const testInboxId = "complete-test-inbox-123";
      
      // 1. Setup tier (done in beforeEach)
      
      // 2. Store user inbox ID (simulating XMTP integration)
      await groupAccess.connect(bot).storeUserInboxId(user1.address, testInboxId);
      
      // 3. User purchases access
      await groupAccess.connect(user1).purchaseAccess(tokenId, { value: price });
      
      // 4. Verify all access methods work
      expect(await groupAccess.hasValidAccess(user1.address)).to.be.true;
      expect(await groupAccess.hasValidAccessByInboxId(testInboxId)).to.be.true;
      expect(await groupAccess.balanceOf(user1.address, tokenId)).to.equal(1);
      
      // 5. Check XMTP info is accessible
      const xmtpInfo = await groupAccess.xmtpInfo();
      expect(xmtpInfo.isActive).to.be.true;
      expect(xmtpInfo.salesGroupId).to.equal(TEST_SALES_GROUP_ID);
      expect(xmtpInfo.premiumGroupId).to.equal(TEST_PREMIUM_GROUP_ID);
    });

    it("Should handle multiple users and tiers", async function () {
      // Setup additional tier
      await groupAccess.setupAccessTier(
        2, // tokenId
        30, // durationDays
        ethers.parseEther("0.003"), // priceWei
        "Monthly Access",
        "30 days premium access",
        "QmTestHash2",
        "ipfs://QmTestMetadata2"
      );

      // User1 buys weekly access
      await groupAccess.connect(user1).purchaseAccess(1, { 
        value: ethers.parseEther("0.001") 
      });

      // User2 buys monthly access
      await groupAccess.connect(user2).purchaseAccess(2, { 
        value: ethers.parseEther("0.003") 
      });

      // Check both users have access
      expect(await groupAccess.hasValidAccess(user1.address)).to.be.true;
      expect(await groupAccess.hasValidAccess(user2.address)).to.be.true;

      // Check token balances
      expect(await groupAccess.balanceOf(user1.address, 1)).to.equal(1);
      expect(await groupAccess.balanceOf(user2.address, 2)).to.equal(1);
      expect(await groupAccess.balanceOf(user1.address, 2)).to.equal(0);
      expect(await groupAccess.balanceOf(user2.address, 1)).to.equal(0);
    });
  });

  describe("Gas Usage", function () {
    beforeEach(async function () {
      // Setup test tier for gas tests
      await groupAccess.setupAccessTier(
        1, // tokenId
        7, // durationDays
        ethers.parseEther("0.001"), // priceWei
        "Weekly Access",
        "7 days premium access",
        "QmTestHash",
        "ipfs://QmTestMetadata"
      );
    });

    it("Should report gas usage for key operations", async function () {
      const tokenId = 1;
      const price = ethers.parseEther("0.001");
      
      // Test purchase gas usage
      const purchaseTx = await groupAccess.connect(user1).purchaseAccess(tokenId, { 
        value: price 
      });
      const purchaseReceipt = await purchaseTx.wait();
      
      console.log("Gas used for purchase:", purchaseReceipt.gasUsed.toString());
      
      // Test access check gas usage
      const hasAccessTx = await groupAccess.hasValidAccess(user1.address);
      console.log("Gas used for access check: ~2000 (view function)");
      
      // Should be reasonable gas usage
      expect(purchaseReceipt.gasUsed).to.be.lt(200000); // Less than 200k gas
    });
  });
});