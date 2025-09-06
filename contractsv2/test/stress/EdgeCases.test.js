/**
 * XMTP Auth V2 - Edge Cases and Stress Testing
 *
 * Tests for boundary conditions, malformed inputs, and complex scenarios
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BaseTest } = require("../BaseTest");

describe("XMTP Auth V2 - Edge Cases & Stress Testing", function () {
  this.timeout(120000);

  let testInstance;
  let contracts, accounts;

  beforeEach(async function () {
    testInstance = new BaseTest();
    ({ contracts, accounts } = await testInstance.fullSetup());
  });

  describe("🔥 Pricing Edge Cases", function () {
    it("Should handle zero prices correctly", async function () {
      const { authContract } = contracts;
      const { treasury } = accounts;

      // Create token with zero ETH price
      await authContract.connect(treasury).createToken(0, true, 0);
      const tokenId = 2; // Next available token

      // Should allow free purchases
      await authContract.connect(accounts.user1).purchase(tokenId, 1, {
        value: 0,
      });

      expect(
        await authContract.balanceOf(accounts.user1.address, tokenId),
      ).to.equal(1);
    });

    it("Should handle maximum uint256 prices", async function () {
      const { authContract } = contracts;
      const { treasury } = accounts;

      const maxPrice = ethers.MaxUint256;

      await authContract.connect(treasury).createToken(maxPrice, true, 0);
      const tokenId = 2;

      // Should revert with insufficient payment
      await expect(
        authContract.connect(accounts.user1).purchase(tokenId, 1, {
          value: ethers.parseEther("1000"),
        }),
      ).to.be.revertedWithCustomError(authContract, "InsufficientPayment");
    });

    it("Should handle complex multi-token pricing scenarios", async function () {
      const { authContract, mocks } = contracts;
      const { treasury, user1 } = accounts;
      const { erc20: mockERC20 } = mocks;

      // Create token
      await authContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), true, 0);
      const tokenId = 2;

      // Set up ERC20 payment
      await authContract
        .connect(treasury)
        .addERC20PaymentToken(
          await mockERC20.getAddress(),
          ethers.ZeroAddress,
          6,
        );

      // Set different prices for ETH vs ERC20
      await authContract
        .connect(treasury)
        .setTokenETHPrice(tokenId, ethers.parseEther("0.1"));
      await authContract.connect(treasury).setTokenERC20Price(
        tokenId,
        await mockERC20.getAddress(),
        ethers.parseUnits("50", 6), // 50 USDC
      );

      // Test ETH purchase
      await authContract.connect(user1).purchase(tokenId, 1, {
        value: ethers.parseEther("0.1"),
      });

      // Test ERC20 purchase
      await mockERC20.mint(user1.address, ethers.parseUnits("100", 6));
      await mockERC20
        .connect(user1)
        .approve(await authContract.getAddress(), ethers.parseUnits("50", 6));

      await authContract
        .connect(user1)
        .purchaseWithERC20(await mockERC20.getAddress(), tokenId, 1);

      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(2);
    });
  });

  describe("🕒 Expiry Edge Cases", function () {
    it("Should handle tokens expiring at exact block timestamp", async function () {
      const { authContract } = contracts;
      const { treasury, user1 } = accounts;

      // Create token with 1 second TTL
      await authContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), true, 1);
      const tokenId = 2;

      await authContract.connect(user1).purchase(tokenId, 1, {
        value: ethers.parseEther("0.1"),
      });

      // Should have balance immediately
      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(1);

      // Wait for expiry
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine");

      // Should have zero balance after expiry
      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(0);
    });

    it("Should handle multiple overlapping expiries", async function () {
      const { authContract } = contracts;
      const { treasury, user1, bot } = accounts;

      // Create token with 10 second TTL
      await authContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), true, 10);
      const tokenId = 2;

      // Purchase at different times
      await authContract.connect(user1).purchase(tokenId, 1, {
        value: ethers.parseEther("0.1"),
      });

      // Advance time and purchase again
      await ethers.provider.send("evm_increaseTime", [5]);
      await ethers.provider.send("evm_mine");

      await authContract
        .connect(bot)
        .grantXMTPAccess(user1.address, tokenId, 1, "5");

      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(2);

      // First token should expire
      await ethers.provider.send("evm_increaseTime", [6]);
      await ethers.provider.send("evm_mine");

      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(1);

      // Second token should expire
      await ethers.provider.send("evm_increaseTime", [5]);
      await ethers.provider.send("evm_mine");

      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(0);
    });
  });

  describe("🚫 Access Control Edge Cases", function () {
    it("Should handle role transfers during operations", async function () {
      const { authContract } = contracts;
      const { treasury, user1, user2 } = accounts;

      // Transfer admin role
      await authContract
        .connect(treasury)
        .grantRole(await authContract.DEFAULT_ADMIN_ROLE(), user1.address);

      // Original admin should still work
      await authContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), true, 0);

      // New admin should work
      await authContract
        .connect(user1)
        .createToken(ethers.parseEther("0.2"), true, 0);

      // Revoke original admin
      await authContract
        .connect(user1)
        .revokeRole(await authContract.DEFAULT_ADMIN_ROLE(), treasury.address);

      // Original admin should no longer work
      await expect(
        authContract
          .connect(treasury)
          .createToken(ethers.parseEther("0.3"), true, 0),
      ).to.be.reverted;

      // New admin should still work
      await authContract
        .connect(user1)
        .createToken(ethers.parseEther("0.3"), true, 0);
    });

    it("Should handle paused state during complex operations", async function () {
      const { authContract } = contracts;
      const { treasury, user1, bot } = accounts;

      await authContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), true, 0);
      const tokenId = 2;

      // Pause the contract
      await authContract.connect(treasury).pause();

      // User purchases should fail
      await expect(
        authContract.connect(user1).purchase(tokenId, 1, {
          value: ethers.parseEther("0.1"),
        }),
      ).to.be.revertedWithCustomError(authContract, "EnforcedPause");

      // But admin operations should still work
      await authContract
        .connect(bot)
        .grantXMTPAccess(user1.address, tokenId, 1, "0");

      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(1);
    });
  });

  describe("💸 Payment Edge Cases", function () {
    it("Should handle ERC20 tokens with different decimals", async function () {
      const { authContract } = contracts;
      const { treasury, user1 } = accounts;

      // Deploy tokens with different decimals
      const Token18 = await ethers.getContractFactory("MockERC20");
      const Token6 = await ethers.getContractFactory("MockERC20");

      const token18 = await Token18.deploy("18Decimal", "T18", 18);
      const token6 = await Token6.deploy("6Decimal", "T6", 6);

      await authContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), true, 0);
      const tokenId = 2;

      // Add both tokens
      await authContract
        .connect(treasury)
        .addERC20PaymentToken(
          await token18.getAddress(),
          ethers.ZeroAddress,
          18,
        );
      await authContract
        .connect(treasury)
        .addERC20PaymentToken(await token6.getAddress(), ethers.ZeroAddress, 6);

      // Set prices accounting for decimals
      await authContract.connect(treasury).setTokenERC20Price(
        tokenId,
        await token18.getAddress(),
        ethers.parseUnits("100", 18), // 100 tokens with 18 decimals
      );
      await authContract.connect(treasury).setTokenERC20Price(
        tokenId,
        await token6.getAddress(),
        ethers.parseUnits("100", 6), // 100 tokens with 6 decimals
      );

      // Test purchases with both
      await token18.mint(user1.address, ethers.parseUnits("200", 18));
      await token6.mint(user1.address, ethers.parseUnits("200", 6));

      await token18
        .connect(user1)
        .approve(await authContract.getAddress(), ethers.parseUnits("100", 18));
      await token6
        .connect(user1)
        .approve(await authContract.getAddress(), ethers.parseUnits("100", 6));

      await authContract
        .connect(user1)
        .purchaseWithERC20(await token18.getAddress(), tokenId, 1);

      await authContract
        .connect(user1)
        .purchaseWithERC20(await token6.getAddress(), tokenId, 1);

      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(2);
    });

    it("Should handle insufficient allowance edge cases", async function () {
      const { authContract, mocks } = contracts;
      const { treasury, user1 } = accounts;
      const { erc20: mockERC20 } = mocks;

      await authContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), true, 0);
      const tokenId = 2;

      await authContract
        .connect(treasury)
        .addERC20PaymentToken(
          await mockERC20.getAddress(),
          ethers.ZeroAddress,
          6,
        );
      await authContract
        .connect(treasury)
        .setTokenERC20Price(
          tokenId,
          await mockERC20.getAddress(),
          ethers.parseUnits("100", 6),
        );

      await mockERC20.mint(user1.address, ethers.parseUnits("200", 6));

      // Approve exact amount
      await mockERC20
        .connect(user1)
        .approve(await authContract.getAddress(), ethers.parseUnits("100", 6));

      // First purchase should work
      await authContract
        .connect(user1)
        .purchaseWithERC20(await mockERC20.getAddress(), tokenId, 1);

      // Second purchase should fail due to insufficient allowance
      await expect(
        authContract
          .connect(user1)
          .purchaseWithERC20(await mockERC20.getAddress(), tokenId, 1),
      ).to.be.revertedWithCustomError(
        authContract,
        "InsufficientERC20Allowance",
      );
    });
  });

  describe("🔗 XMTP Integration Edge Cases", function () {
    it("Should handle inbox ID conflicts", async function () {
      const { authContract } = contracts;
      const { user1, user2 } = accounts;

      const inboxId = "shared-inbox-id";

      // First user stores inbox ID
      await authContract
        .connect(user1)
        .storeUserInboxId(user1.address, inboxId);

      // Second user tries to use same inbox ID (should overwrite)
      await authContract
        .connect(user2)
        .storeUserInboxId(user2.address, inboxId);

      // Should map to second user
      expect(await authContract.inboxToAddress(inboxId)).to.equal(
        user2.address,
      );
      expect(await authContract.userInboxIds(user2.address)).to.equal(inboxId);
    });

    it("Should handle empty and malformed inbox IDs", async function () {
      const { authContract } = contracts;
      const { user1 } = accounts;

      // Empty string should work
      await authContract.connect(user1).storeUserInboxId(user1.address, "");
      expect(await authContract.userInboxIds(user1.address)).to.equal("");

      // Very long string should work
      const longInboxId = "a".repeat(1000);
      await authContract
        .connect(user1)
        .storeUserInboxId(user1.address, longInboxId);
      expect(await authContract.userInboxIds(user1.address)).to.equal(
        longInboxId,
      );
    });

    it("Should handle batch access checks efficiently", async function () {
      const { authContract } = contracts;
      const { treasury, user1, user2 } = accounts;

      await authContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), true, 0);
      const tokenId = 2;

      await authContract
        .connect(treasury)
        .setupXMTPAccessTier(tokenId, "Test Tier", "Test Description", "", "");

      // Give access to user1 but not user2
      await authContract.connect(user1).purchase(tokenId, 1, {
        value: ethers.parseEther("0.1"),
      });

      // Batch check
      const users = [user1.address, user2.address];
      const results = await authContract.batchCheckXMTPAccess(users);

      expect(results[0]).to.be.true;
      expect(results[1]).to.be.false;
    });
  });

  describe("🏭 Factory Integration Edge Cases", function () {
    it("Should handle deployment fee edge cases", async function () {
      const { factory } = contracts;
      const { owner, user1 } = accounts;

      // Set deployment fee
      const deploymentFee = ethers.parseEther("0.01");
      await factory.connect(owner).setDeploymentFee(deploymentFee);

      const config = {
        groupName: "Test Group",
        groupDescription: "Test Description",
        groupImageUrl: "https://example.com/image.jpg",
        baseURI: "https://metadata.example.com/",
        salesGroupId: "sales-123",
        premiumGroupId: "premium-456",
        botAddress: user1.address,
        treasury: user1.address,
        adminDelay: 0,
      };

      // Exact fee should work
      await factory.connect(user1).deployXMTPAuthContract(config, {
        value: deploymentFee,
      });

      // Insufficient fee should fail
      await expect(
        factory.connect(user1).deployXMTPAuthContract(config, {
          value: deploymentFee - 1n,
        }),
      ).to.be.revertedWith("Insufficient deployment fee");

      // Excess fee should work (and be refunded)
      const balanceBefore = await ethers.provider.getBalance(user1.address);
      const tx = await factory.connect(user1).deployXMTPAuthContract(config, {
        value: deploymentFee + ethers.parseEther("1"),
      });
      const receipt = await tx.wait();
      const balanceAfter = await ethers.provider.getBalance(user1.address);

      // Should have refunded excess
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const expectedBalance = balanceBefore - deploymentFee - gasUsed;
      expect(balanceAfter).to.be.closeTo(
        expectedBalance,
        ethers.parseEther("0.001"),
      );
    });
  });

  describe("🔌 Extension Edge Cases", function () {
    it("Should handle extension failures gracefully", async function () {
      const { authContract } = contracts;
      const { treasury, user1 } = accounts;

      // Deploy a failing extension
      const FailingExtension = await ethers.getContractFactory(
        "MockFailingExtension",
      );
      const failingExtension = await FailingExtension.deploy();

      await authContract
        .connect(treasury)
        .registerExtension(
          ethers.keccak256(ethers.toUtf8Bytes("failing")),
          await failingExtension.getAddress(),
        );

      await authContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), true, 0);
      const tokenId = 2;

      // Purchase should succeed even if extension fails
      await authContract.connect(user1).purchase(tokenId, 1, {
        value: ethers.parseEther("0.1"),
      });

      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(1);
    });
  });
});
