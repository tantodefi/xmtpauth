const { expect } = require("chai");
const { BaseTest } = require("../BaseTest");
const { ethers } = require("hardhat");

/**
 * Tests for EVMAuth-Core inherited functionality
 * Covers features from evmauth-core base contracts that weren't tested in legacy tests
 */
describe("XMTP Auth V2 - EVMAuth Core Features", function () {
  let test, accounts, contracts;

  beforeEach(async function () {
    test = new BaseTest();
    ({ accounts, contracts } = await test.fullSetup());
  });

  describe("Account Freezing System", function () {
    it("Should freeze accounts and prevent operations", async function () {
      const { authContract } = contracts;
      const { treasury, user1 } = accounts;

      // Initially not frozen
      expect(await authContract.isFrozen(user1.address)).to.be.false;

      // Freeze account (treasury has ACCESS_MANAGER_ROLE)
      await authContract.connect(treasury).freezeAccount(user1.address);
      expect(await authContract.isFrozen(user1.address)).to.be.true;

      // Check frozen accounts list
      const frozenAccounts = await authContract.frozenAccounts();
      expect(frozenAccounts).to.include(user1.address);
    });

    it("Should unfreeze accounts and restore operations", async function () {
      const { authContract } = contracts;
      const { treasury, user1 } = accounts;

      // Freeze then unfreeze
      await authContract.connect(treasury).freezeAccount(user1.address);
      await authContract.connect(treasury).unfreezeAccount(user1.address);

      expect(await authContract.isFrozen(user1.address)).to.be.false;

      // Check frozen accounts list is empty
      const frozenAccounts = await authContract.frozenAccounts();
      expect(frozenAccounts).to.not.include(user1.address);
    });

    it("Should prevent frozen accounts from purchasing", async function () {
      const { authContract } = contracts;
      const { treasury, user1 } = accounts;

      // Freeze account
      await authContract.connect(treasury).freezeAccount(user1.address);

      // Try to purchase - should fail
      await expect(
        authContract.connect(user1)["purchase(uint256,uint256)"](1, 1, {
          value: ethers.parseEther("0.05"),
        }),
      ).to.be.revertedWithCustomError(authContract, "AccountFrozen");
    });

    it("Should emit proper freeze/unfreeze events", async function () {
      const { authContract } = contracts;
      const { treasury, user1 } = accounts;

      // Test freeze event
      await expect(authContract.connect(treasury).freezeAccount(user1.address))
        .to.emit(authContract, "AccountStatusUpdated")
        .withArgs(user1.address, await authContract.ACCOUNT_FROZEN_STATUS());

      // Test unfreeze event
      await expect(
        authContract.connect(treasury).unfreezeAccount(user1.address),
      )
        .to.emit(authContract, "AccountStatusUpdated")
        .withArgs(user1.address, await authContract.ACCOUNT_UNFROZEN_STATUS());
    });
  });

  describe("Token TTL and Expiry", function () {
    it("Should set TTL for tokens", async function () {
      const { authContract } = contracts;

      // Check TTL for test tokens
      const token1TTL = await authContract.tokenTTL(1);
      expect(token1TTL).to.equal(7 * 24 * 60 * 60); // 7 days

      const token2TTL = await authContract.tokenTTL(2);
      expect(token2TTL).to.equal(30 * 24 * 60 * 60); // 30 days
    });

    it("Should handle permanent tokens (TTL = 0)", async function () {
      const { authContract } = contracts;
      const { treasury } = accounts;

      // Create a permanent token
      const permanentTokenId = await authContract
        .connect(treasury)
        .createToken.staticCall(ethers.parseEther("0.1"), true, 0);
      await authContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), true, 0);

      const ttl = await authContract.tokenTTL(permanentTokenId);
      expect(ttl).to.equal(0);
    });

    it("Should track balance records for expiring tokens", async function () {
      const { authContract } = contracts;
      const { user1 } = accounts;

      // Purchase token with TTL
      await authContract.connect(user1)["purchase(uint256,uint256)"](1, 5, {
        value: ethers.parseEther("0.25"), // 5 tokens * 0.05 ETH
      });

      // Check balance records
      const balanceRecords = await authContract.balanceRecordsOf(
        user1.address,
        1,
      );
      expect(balanceRecords.length).to.be.greaterThan(0);
      expect(balanceRecords[0].amount).to.equal(5);
    });

    it("Should allow manual pruning of balance records", async function () {
      const { authContract } = contracts;
      const { user1 } = accounts;

      // Purchase token
      await authContract.connect(user1)["purchase(uint256,uint256)"](1, 1, {
        value: ethers.parseEther("0.05"),
      });

      // Prune balance records (should not fail)
      await expect(authContract.pruneBalanceRecords(user1.address, 1)).to.not.be
        .reverted;
    });
  });

  describe("Token Transferability", function () {
    it("Should create non-transferable (soulbound) tokens", async function () {
      const { authContract } = contracts;
      const { treasury } = accounts;

      // Create a non-transferable token
      const soulboundTokenId = await authContract
        .connect(treasury)
        .createToken.staticCall(ethers.parseEther("0.1"), false, 0);
      await authContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), false, 0);

      expect(await authContract.isTransferable(soulboundTokenId)).to.be.false;
    });

    it("Should allow transfer of transferable tokens", async function () {
      const { authContract } = contracts;

      // Test tokens should be transferable by default
      expect(await authContract.isTransferable(1)).to.be.true;
      expect(await authContract.isTransferable(2)).to.be.true;
    });
  });

  describe("Batch Operations", function () {
    it("Should batch retrieve token configurations", async function () {
      const { authContract } = contracts;

      // Get multiple token configs at once
      const tokenIds = [1, 2];
      const configs = await authContract.tokenConfigs(tokenIds);

      expect(configs.length).to.equal(2);
      expect(configs[0].id).to.equal(1);
      expect(configs[1].id).to.equal(2);
      expect(configs[0].config.price).to.equal(ethers.parseEther("0.05"));
      expect(configs[1].config.price).to.equal(ethers.parseEther("0.05"));
    });

    it("Should handle empty batch operations", async function () {
      const { authContract } = contracts;

      const configs = await authContract.tokenConfigs([]);
      expect(configs.length).to.equal(0);
    });
  });

  describe("Enhanced ERC20 Multi-Token Pricing", function () {
    it("Should return all accepted ERC20 prices", async function () {
      const { authContract, mocks } = contracts;

      // Get ERC20 prices for token 1
      const erc20Prices = await authContract.tokenERC20Prices(1);

      // Should have at least one ERC20 token configured
      expect(erc20Prices.length).to.be.greaterThan(0);
      expect(erc20Prices[0].token).to.equal(await mocks.erc20.getAddress());
      expect(erc20Prices[0].price).to.equal(ethers.parseUnits("50", 6));
    });

    it("Should handle tokens with no ERC20 pricing", async function () {
      const { authContract } = contracts;
      const { treasury } = accounts;

      // Create token without ERC20 pricing
      const tokenId = await authContract
        .connect(treasury)
        .createToken.staticCall(ethers.parseEther("0.1"), true, 0);
      await authContract
        .connect(treasury)
        .createToken(ethers.parseEther("0.1"), true, 0);

      const erc20Prices = await authContract.tokenERC20Prices(tokenId);
      expect(erc20Prices.length).to.equal(0);
    });
  });

  describe("Role-Based Access Control", function () {
    it("Should enforce ACCESS_MANAGER_ROLE for freezing", async function () {
      const { authContract } = contracts;
      const { user1, user2 } = accounts;

      // Non-access-manager should not be able to freeze
      await expect(
        authContract.connect(user1).freezeAccount(user2.address),
      ).to.be.revertedWithCustomError(
        authContract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("Should have all required roles defined", async function () {
      const { authContract } = contracts;

      // Check that all evmauth-core roles are available
      expect(await authContract.UPGRADE_MANAGER_ROLE()).to.not.be.undefined;
      expect(await authContract.ACCESS_MANAGER_ROLE()).to.not.be.undefined;
      expect(await authContract.TOKEN_MANAGER_ROLE()).to.not.be.undefined;
      expect(await authContract.MINTER_ROLE()).to.not.be.undefined;
      expect(await authContract.BURNER_ROLE()).to.not.be.undefined;
      expect(await authContract.TREASURER_ROLE()).to.not.be.undefined;
    });
  });
});
