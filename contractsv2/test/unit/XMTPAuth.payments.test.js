const { expect } = require("chai");
const { BaseTest } = require("../BaseTest");

describe("XMTPAuthERC1155 - Payment Systems", function () {
  let test, accounts, contracts;

  beforeEach(async function () {
    test = new BaseTest();
    ({ accounts, contracts } = await test.fullSetup());
  });

  describe("ETH Payments (TVL System)", function () {
    it("Should handle ETH purchases correctly", async function () {
      const { authContract } = contracts;
      const { owner } = accounts;

      const price = await authContract.priceOf(1);
      const initialBalance = await authContract.balanceOf(owner.address, 1);
      const initialETHTVL = await authContract.getETHTVL();

      // Purchase token with ETH
      await authContract.connect(owner)["purchase(uint256,uint256)"](1, 1, {
        value: price,
      });

      // Check token balance increased
      const newBalance = await authContract.balanceOf(owner.address, 1);
      expect(newBalance).to.equal(initialBalance + 1n);

      // Check ETH TVL increased (minus any platform fees)
      const newETHTVL = await authContract.getETHTVL();
      expect(newETHTVL).to.be.greaterThan(initialETHTVL);
    });

    it("Should track XMTP-specific ETH purchases", async function () {
      const { authContract } = contracts;
      const { owner } = accounts;

      const price = await authContract.priceOf(1);
      const testTxHash = "0x123abc";

      // Purchase with XMTP tracking
      await authContract.connect(owner).purchaseXMTPAccess(1, 1, testTxHash, {
        value: price,
      });

      // Check purchase history
      const historyLength = await authContract.getXMTPPurchaseHistoryLength();
      expect(historyLength).to.be.greaterThan(0);
    });

    it("Should allow admin to withdraw ETH TVL", async function () {
      const { authContract } = contracts;
      const { owner, treasury } = accounts;

      const price = await authContract.priceOf(1);

      // Make purchase to accumulate ETH
      await authContract.connect(owner)["purchase(uint256,uint256)"](1, 1, {
        value: price,
      });

      const tvlBefore = await authContract.getETHTVL();
      expect(tvlBefore).to.be.greaterThan(0);

      // Get contract balance before withdrawal
      const contractBalanceBefore = await ethers.provider.getBalance(
        await authContract.getAddress(),
      );

      // Withdraw ETH
      await authContract.connect(treasury).withdrawETH();

      const tvlAfter = await authContract.getETHTVL();
      const contractBalanceAfter = await ethers.provider.getBalance(
        await authContract.getAddress(),
      );

      expect(tvlAfter).to.equal(0);
      expect(contractBalanceAfter).to.be.lessThan(contractBalanceBefore);
    });

    it("Should reject insufficient ETH payments", async function () {
      const { authContract } = contracts;
      const { owner } = accounts;

      const price = await authContract.priceOf(1);
      const insufficientAmount = price - 1n;

      await expect(
        authContract.connect(owner)["purchase(uint256,uint256)"](1, 1, {
          value: insufficientAmount,
        }),
      ).to.be.revertedWithCustomError(authContract, "InsufficientPayment");
    });
  });

  describe("ERC20 Payments (Revenue Share)", function () {
    it("Should handle ERC20 token setup", async function () {
      const { authContract, mocks } = contracts;
      const { treasury } = accounts;

      // Add ERC20 payment token
      await authContract
        .connect(treasury)
        .addERC20PaymentToken(await mocks.erc20.getAddress());

      expect(
        await authContract.isERC20PaymentTokenAccepted(
          await mocks.erc20.getAddress(),
        ),
      ).to.be.true;
    });

    it("Should process ERC20 purchases with revenue share", async function () {
      const { authContract, mocks } = contracts;
      const { treasury, owner } = accounts;

      // Setup ERC20 payment with correct decimals
      const tokenAddress = await mocks.erc20.getAddress();
      await authContract
        .connect(treasury)
        .addERC20PaymentToken(tokenAddress, ethers.ZeroAddress, 6);

      // Mint tokens to user and approve
      const purchaseAmount = ethers.parseUnits("100", 6); // 100 USDC
      await mocks.erc20.mint(owner.address, purchaseAmount);
      await mocks.erc20
        .connect(owner)
        .approve(await authContract.getAddress(), purchaseAmount);

      const treasuryBalanceBefore = await mocks.erc20.balanceOf(
        treasury.address,
      );

      // Purchase with ERC20
      await authContract.connect(owner).purchaseWithERC20(tokenAddress, 1, 1);

      const treasuryBalanceAfter = await mocks.erc20.balanceOf(
        treasury.address,
      );

      // Should receive ~97.5% of payment (minus platform fees)
      expect(treasuryBalanceAfter).to.be.greaterThan(treasuryBalanceBefore);
    });

    it("Should track XMTP-specific ERC20 purchases", async function () {
      const { authContract, mocks } = contracts;
      const { treasury, owner } = accounts;

      // Setup ERC20 payment with correct decimals
      const tokenAddress = await mocks.erc20.getAddress();
      await authContract
        .connect(treasury)
        .addERC20PaymentToken(tokenAddress, ethers.ZeroAddress, 6);

      const purchaseAmount = ethers.parseUnits("100", 6); // Need 100 USDC for 0.05 ETH at 1 ETH = 2000 USDC rate
      await mocks.erc20.mint(owner.address, purchaseAmount);
      await mocks.erc20
        .connect(owner)
        .approve(await authContract.getAddress(), purchaseAmount);

      const testTxHash = "0x456def";

      // Purchase with XMTP tracking
      await authContract
        .connect(owner)
        .purchaseXMTPAccessERC20(tokenAddress, 1, 1, testTxHash);

      // Check purchase history includes ERC20 info
      const historyLength = await authContract.getXMTPPurchaseHistoryLength();
      expect(historyLength).to.be.greaterThan(0);
    });

    it("Should reject unauthorized ERC20 tokens", async function () {
      const { authContract } = contracts;
      const { owner } = accounts;

      // Try to use non-approved ERC20 token
      const fakeTokenAddress = ethers.Wallet.createRandom().address;

      await expect(
        authContract.connect(owner).purchaseWithERC20(fakeTokenAddress, 1, 1),
      ).to.be.revertedWithCustomError(authContract, "InvalidERC20PaymentToken");
    });

    it("Should handle insufficient ERC20 allowance", async function () {
      const { authContract, mocks } = contracts;
      const { treasury, owner } = accounts;

      // Setup ERC20 payment
      const tokenAddress = await mocks.erc20.getAddress();
      await authContract.connect(treasury).addERC20PaymentToken(tokenAddress);

      // Mint tokens but don't approve enough
      const purchaseAmount = ethers.parseUnits("100", 6);
      await mocks.erc20.mint(owner.address, purchaseAmount);
      // Approve only 25 USDC, but token costs 50 USDC
      await mocks.erc20
        .connect(owner)
        .approve(await authContract.getAddress(), ethers.parseUnits("25", 6));

      await expect(
        authContract.connect(owner).purchaseWithERC20(tokenAddress, 1, 1),
      ).to.be.revertedWithCustomError(
        authContract,
        "InsufficientERC20Allowance",
      );
    });
  });

  describe("Purchase Validation", function () {
    it("Should validate token existence before purchase", async function () {
      const { authContract } = contracts;
      const { owner } = accounts;

      // Try to purchase non-existent token
      await expect(
        authContract.connect(owner)["purchase(uint256,uint256)"](999, 1, {
          value: ethers.parseEther("1"),
        }),
      ).to.be.revertedWith("Token does not exist");
    });

    it("Should prevent purchases when paused", async function () {
      const { authContract } = contracts;
      const { bot, owner } = accounts;

      // Pause contract
      await authContract.connect(bot).pause();

      const price = await authContract.priceOf(1);

      // Both ETH and ERC20 purchases should fail
      await expect(
        authContract.connect(owner)["purchase(uint256,uint256)"](1, 1, {
          value: price,
        }),
      ).to.be.revertedWithCustomError(authContract, "EnforcedPause");
    });

    it("Should handle zero amount purchases", async function () {
      const { authContract } = contracts;
      const { owner } = accounts;

      await expect(
        authContract.connect(owner)["purchase(uint256,uint256)"](1, 0, {
          value: 0,
        }),
      ).to.be.revertedWith("Invalid token quantity");
    });
  });
});
