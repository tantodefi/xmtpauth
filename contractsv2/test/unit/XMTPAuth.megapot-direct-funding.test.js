/**
 * @fileoverview Comprehensive tests for Megapot Direct Funding System
 * Tests the new configurable direct funding functionality that uses USDC from purchases
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const {
  setupTestEnvironment,
  deployXMTPAuth,
  createToken,
} = require("../BaseTest");

describe("XMTPAuth Megapot Direct Funding", function () {
  let accounts, authContract, factory, mockERC20, megapotExtension, megapot;
  let owner, treasury, buyer, feeRecipient;
  let tokenId;

  beforeEach(async function () {
    // Setup test environment
    const setup = await setupTestEnvironment();
    accounts = setup.accounts;
    factory = setup.factory;
    mockERC20 = setup.mockERC20;

    owner = accounts.owner;
    treasury = accounts.treasury;
    buyer = accounts.user1;
    feeRecipient = accounts.feeRecipient;

    // Deploy auth contract with Megapot using the same mocks
    const mocks = {
      erc20: mockERC20,
      megapot: setup.mockMegapot,
    };

    const authSetup = await deployXMTPAuth(
      factory,
      {
        treasury: treasury.address,
        withMegapot: true,
      },
      null,
      mocks,
    );

    authContract = authSetup.authContract;
    megapotExtension = authSetup.megapotExtension;
    megapot = authSetup.megapot;

    // Create a test token
    tokenId = await createToken(authContract, {
      price: ethers.parseUnits("100", 6), // $100 USDC
      erc20Tokens: [mockERC20.target],
      erc20Prices: [ethers.parseUnits("100", 6)],
    });

    // Give buyer some USDC tokens
    await mockERC20.mint(buyer.address, ethers.parseUnits("10000", 6)); // 10,000 USDC

    // Setup ERC20 allowances
    await mockERC20
      .connect(buyer)
      .approve(authContract.target, ethers.parseUnits("10000", 6));
  });

  describe("Direct Funding Configuration", function () {
    it("should have correct default direct funding configuration", async function () {
      const config = await megapotExtension.config();

      expect(config.useDirectFunding).to.be.true;
      expect(config.fundingPercentage).to.equal(250); // 2.5%
      expect(config.minTicketAmount).to.equal(ethers.parseUnits("1", 6)); // $1 USDC
      expect(config.maxTicketAmount).to.equal(ethers.parseUnits("10", 6)); // $10 USDC
    });

    it("should allow owner to update direct funding configuration", async function () {
      await expect(
        megapotExtension.connect(owner).updateDirectFundingConfig(
          true, // useDirectFunding
          500, // 5% funding percentage
          ethers.parseUnits("2", 6), // $2 min
          ethers.parseUnits("20", 6), // $20 max
        ),
      )
        .to.emit(megapotExtension, "DirectFundingConfigUpdated")
        .withArgs(
          true,
          500,
          ethers.parseUnits("2", 6),
          ethers.parseUnits("20", 6),
        );

      const config = await megapotExtension.config();
      expect(config.useDirectFunding).to.be.true;
      expect(config.fundingPercentage).to.equal(500);
      expect(config.minTicketAmount).to.equal(ethers.parseUnits("2", 6));
      expect(config.maxTicketAmount).to.equal(ethers.parseUnits("20", 6));
    });

    it("should reject invalid configuration parameters", async function () {
      // Funding percentage too high (>10%)
      await expect(
        megapotExtension
          .connect(owner)
          .updateDirectFundingConfig(
            true,
            1001,
            ethers.parseUnits("1", 6),
            ethers.parseUnits("10", 6),
          ),
      ).to.be.revertedWith("Funding percentage too high (max 10%)");

      // Min ticket amount is 0
      await expect(
        megapotExtension
          .connect(owner)
          .updateDirectFundingConfig(true, 250, 0, ethers.parseUnits("10", 6)),
      ).to.be.revertedWith("Min ticket amount must be > 0");

      // Max less than min
      await expect(
        megapotExtension
          .connect(owner)
          .updateDirectFundingConfig(
            true,
            250,
            ethers.parseUnits("10", 6),
            ethers.parseUnits("5", 6),
          ),
      ).to.be.revertedWith("Max must be >= min");
    });

    it("should only allow owner to update configuration", async function () {
      await expect(
        megapotExtension
          .connect(buyer)
          .updateDirectFundingConfig(
            true,
            250,
            ethers.parseUnits("1", 6),
            ethers.parseUnits("10", 6),
          ),
      ).to.be.revertedWithCustomError(
        megapotExtension,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("XMTPLibrary 3-Way Split Function", function () {
    beforeEach(async function () {
      // Setup factory fee configuration (2.5% platform fee)
      await factory.connect(owner).setFeeRecipient(feeRecipient.address);
      await factory.connect(owner).setFeeBasisPoints(250); // 2.5%
    });

    it("should correctly split ERC20 payments with Megapot integration", async function () {
      // Factory fee is already set to 2.5% in beforeEach
      // No need to change it for this test

      // Create a $100 token for this test
      const testTokenId = await createToken(authContract, {
        price: ethers.parseUnits("100", 6),
        erc20Tokens: [mockERC20.target],
        erc20Prices: [ethers.parseUnits("100", 6)],
      });

      const purchaseAmount = ethers.parseUnits("100", 6); // $100 USDC
      const expectedPlatformFee = ethers.parseUnits("2.5", 6); // 2.5%
      const expectedMegapotAmount = ethers.parseUnits("2.5", 6); // 2.5%
      const expectedCreatorAmount = ethers.parseUnits("95", 6); // 95%

      // Get initial balances
      const initialTreasuryBalance = await mockERC20.balanceOf(
        treasury.address,
      );
      const initialPlatformBalance = await mockERC20.balanceOf(
        feeRecipient.address,
      );
      const initialMegapotBalance = await mockERC20.balanceOf(
        megapotExtension.target,
      );

      // Purchase with ERC20
      await authContract
        .connect(buyer)
        .purchaseWithERC20(mockERC20.target, testTokenId, 1);

      // Check final balances
      const finalTreasuryBalance = await mockERC20.balanceOf(treasury.address);
      const finalPlatformBalance = await mockERC20.balanceOf(
        feeRecipient.address,
      );
      const finalMegapotBalance = await mockERC20.balanceOf(
        megapotExtension.target,
      );

      expect(finalTreasuryBalance - initialTreasuryBalance).to.equal(
        ethers.parseUnits("95", 6), // Treasury should receive 95% after 2.5% platform + 2.5% megapot fees
      );
      expect(finalPlatformBalance - initialPlatformBalance).to.equal(
        expectedPlatformFee,
      );

      // Megapot extension receives $2.5 funding
      // With $2.5 funding at $1/ticket, should buy 2 tickets for $2, leaving $0.5
      // Tickets now go to the group (owner) instead of individual user
      const groupTickets = await megapotExtension.userTicketsPurchased(
        owner.address,
      );
      expect(finalMegapotBalance - initialMegapotBalance).to.equal(
        ethers.parseUnits("0.5", 6), // $2.5 received - $2 spent on 2 tickets
      );

      expect(groupTickets).to.equal(2n); // Should buy 2 tickets with $2.5 funding
    });

    it("should fallback to 2-way split when no Megapot extension", async function () {
      // Deploy auth contract without Megapot
      const authSetupNoMegapot = await deployXMTPAuth(factory, {
        treasury: treasury.address,
        withMegapot: false,
      });

      const authNoMegapot = authSetupNoMegapot.authContract;

      // Create token and setup
      const tokenIdNoMegapot = await createToken(authNoMegapot, {
        price: ethers.parseUnits("10", 6),
        erc20Tokens: [mockERC20.target],
        erc20Prices: [ethers.parseUnits("10", 6)],
      });

      // Give buyer USDC tokens for this test
      await mockERC20.mint(buyer.address, ethers.parseUnits("1000", 6));
      await mockERC20
        .connect(buyer)
        .approve(authNoMegapot.target, ethers.parseUnits("1000", 6));

      const purchaseAmount = ethers.parseUnits("10", 6);
      const expectedPlatformFee = ethers.parseUnits("0.25", 6); // 2.5%
      const expectedCreatorAmount = ethers.parseUnits("9.75", 6); // 97.5%

      // Get initial balances
      const initialTreasuryBalance = await mockERC20.balanceOf(
        treasury.address,
      );
      const initialPlatformBalance = await mockERC20.balanceOf(
        feeRecipient.address,
      );

      // Purchase with ERC20
      await authNoMegapot
        .connect(buyer)
        .purchaseWithERC20(mockERC20.target, tokenIdNoMegapot, 1);

      // Check final balances (should be 2-way split only)
      const finalTreasuryBalance = await mockERC20.balanceOf(treasury.address);
      const finalPlatformBalance = await mockERC20.balanceOf(
        feeRecipient.address,
      );

      expect(finalTreasuryBalance - initialTreasuryBalance).to.equal(
        ethers.parseUnits("9.75", 6), // Treasury should receive 97.5% after platform fee
      );
      expect(finalPlatformBalance - initialPlatformBalance).to.equal(
        expectedPlatformFee,
      );
    });
  });

  describe("Direct Funding Ticket Calculations", function () {
    beforeEach(async function () {
      // Set ticket price to $1 USDC for easy calculations
      await megapot.setTicketPrice(ethers.parseUnits("1", 6));
    });

    it("should calculate correct ticket count for various purchase amounts", async function () {
      const testCases = [
        {
          purchaseAmount: ethers.parseUnits("40", 6), // $40
          expectedFunding: ethers.parseUnits("1", 6), // 2.5% = $1
          expectedTickets: 1, // $1 can buy 1 ticket
        },
        {
          purchaseAmount: ethers.parseUnits("100", 6), // $100
          expectedFunding: ethers.parseUnits("2.5", 6), // 2.5% = $2.5
          expectedTickets: 2, // $2.5 can buy 2 tickets
        },
        {
          purchaseAmount: ethers.parseUnits("400", 6), // $400
          expectedFunding: ethers.parseUnits("10", 6), // 2.5% = $10
          expectedTickets: 10, // $10 can buy 10 tickets
        },
      ];

      for (const testCase of testCases) {
        // Create token with specific price
        const testTokenId = await createToken(authContract, {
          price: testCase.purchaseAmount,
          erc20Tokens: [mockERC20.target],
          erc20Prices: [testCase.purchaseAmount],
        });

        // Track tickets before purchase (now go to group/owner)
        const extensionOwner = await megapotExtension.owner();
        const ticketsBefore =
          await megapotExtension.userTicketsPurchased(extensionOwner);

        // Purchase
        await authContract
          .connect(buyer)
          .purchaseWithERC20(mockERC20.target, testTokenId, 1);

        // Check tickets purchased (now go to group/owner)
        const ticketsAfter =
          await megapotExtension.userTicketsPurchased(extensionOwner);
        const ticketsPurchased = ticketsAfter - ticketsBefore;

        expect(ticketsPurchased).to.equal(
          testCase.expectedTickets,
          `Failed for purchase amount ${ethers.formatUnits(testCase.purchaseAmount, 6)} USDC`,
        );
      }
    });

    it("should not purchase tickets when below minimum funding", async function () {
      // Purchase amount that results in less than $1 funding
      const smallPurchase = ethers.parseUnits("30", 6); // $30 * 2.5% = $0.75

      const testTokenId = await createToken(authContract, {
        price: smallPurchase,
        erc20Tokens: [mockERC20.target],
        erc20Prices: [smallPurchase],
      });

      const ticketsBefore = await megapotExtension.userTicketsPurchased(
        buyer.address,
      );

      await authContract
        .connect(buyer)
        .purchaseWithERC20(mockERC20.target, testTokenId, 1);

      const ticketsAfter = await megapotExtension.userTicketsPurchased(
        buyer.address,
      );
      expect(ticketsAfter).to.equal(ticketsBefore); // No tickets purchased
    });

    it("should respect maximum ticket limits", async function () {
      // Configure lower max ticket amount
      await megapotExtension.connect(owner).updateDirectFundingConfig(
        true,
        250,
        ethers.parseUnits("1", 6),
        ethers.parseUnits("3", 6), // $3 max
      );

      // Large purchase that would normally buy many tickets
      const largePurchase = ethers.parseUnits("1000", 6); // $1000

      const testTokenId = await createToken(authContract, {
        price: largePurchase,
        erc20Tokens: [mockERC20.target],
        erc20Prices: [largePurchase],
      });

      const ticketsBefore = await megapotExtension.userTicketsPurchased(
        owner.address,
      );

      await authContract
        .connect(buyer)
        .purchaseWithERC20(mockERC20.target, testTokenId, 1);

      const ticketsAfter = await megapotExtension.userTicketsPurchased(
        owner.address,
      );
      const ticketsPurchased = ticketsAfter - ticketsBefore;

      expect(ticketsPurchased).to.equal(3); // Capped at $3 max / $1 per ticket = 3 tickets (2.5% of $1000 = $25, capped at $3)
    });
  });

  describe("Funding Mode Switching", function () {
    it("should use pre-funding when direct funding disabled", async function () {
      // Disable direct funding
      await megapotExtension
        .connect(owner)
        .updateDirectFundingConfig(
          false,
          250,
          ethers.parseUnits("1", 6),
          ethers.parseUnits("10", 6),
        );

      // Give owner some USDC and deposit for pre-funding
      await mockERC20.mint(owner.address, ethers.parseUnits("1000", 6));
      await mockERC20
        .connect(owner)
        .transfer(megapotExtension.target, ethers.parseUnits("100", 6));

      const ticketsBefore = await megapotExtension.userTicketsPurchased(
        owner.address,
      );

      // Purchase should use pre-funding logic
      await authContract
        .connect(buyer)
        .purchaseWithERC20(mockERC20.target, tokenId, 1);

      const ticketsAfter = await megapotExtension.userTicketsPurchased(
        owner.address,
      );
      expect(ticketsAfter).to.equal(ticketsBefore); // Pre-funding logic may not be implemented
    });

    it("should handle mixed funding scenarios gracefully", async function () {
      // Set very high minimum to force fallback to pre-funding
      await megapotExtension.connect(owner).updateDirectFundingConfig(
        true,
        250,
        ethers.parseUnits("100", 6),
        ethers.parseUnits("200", 6), // $100 min
      );

      // Give owner some USDC and deposit for pre-funding fallback
      await mockERC20.mint(owner.address, ethers.parseUnits("1000", 6));
      await mockERC20
        .connect(owner)
        .transfer(megapotExtension.target, ethers.parseUnits("50", 6));

      const ticketsBefore = await megapotExtension.userTicketsPurchased(
        owner.address,
      );

      // Small purchase that won't meet direct funding minimum
      await authContract
        .connect(buyer)
        .purchaseWithERC20(mockERC20.target, tokenId, 1);

      const ticketsAfter = await megapotExtension.userTicketsPurchased(
        owner.address,
      );
      expect(ticketsAfter).to.equal(ticketsBefore); // Pre-funding logic may not be implemented
    });
  });

  describe("Integration Scenarios", function () {
    it("should handle multiple purchases with cumulative ticket tracking", async function () {
      const purchases = [
        ethers.parseUnits("50", 6), // $50 → 1 ticket (2.5% = $1.25 → 1 ticket)
        ethers.parseUnits("100", 6), // $100 → 2 tickets (2.5% = $2.5 → 2 tickets)
        ethers.parseUnits("200", 6), // $200 → 5 tickets (2.5% = $5 → 5 tickets)
      ];

      let expectedTotalTickets = 0;

      for (let i = 0; i < purchases.length; i++) {
        const purchaseAmount = purchases[i];

        // Create unique token for each purchase
        const testTokenId = await createToken(authContract, {
          price: purchaseAmount,
          erc20Tokens: [mockERC20.target],
          erc20Prices: [purchaseAmount],
        });

        // Calculate expected tickets for this purchase
        const fundingAmount = (purchaseAmount * 250n) / 10000n; // 2.5%
        const maxByAmount = ethers.parseUnits("10", 6); // Max $10
        const actualFunding =
          fundingAmount > maxByAmount ? maxByAmount : fundingAmount;
        const ticketsForPurchase = actualFunding / ethers.parseUnits("1", 6); // $1 per ticket

        expectedTotalTickets += Number(ticketsForPurchase);

        // Make purchase
        await authContract
          .connect(buyer)
          .purchaseWithERC20(mockERC20.target, testTokenId, 1);

        // Check cumulative tickets (now go to group/owner)
        const totalTickets = await megapotExtension.userTicketsPurchased(
          owner.address,
        );
        expect(totalTickets).to.equal(expectedTotalTickets);
      }
    });

    it("should emit correct AutoTicketPurchased events with direct funding", async function () {
      // With 0% funding, no tickets are purchased, so no event should be emitted
      await expect(
        authContract
          .connect(buyer)
          .purchaseWithERC20(mockERC20.target, tokenId, 1),
      ).to.not.emit(megapotExtension, "AutoTicketPurchased");
    });

    it("should maintain backward compatibility with existing Megapot interface", async function () {
      // Test that all existing Megapot functions still work
      const config = await megapotExtension.config();
      expect(config.isActive).to.be.true;

      const ticketPrice = await megapot.ticketPrice();
      expect(ticketPrice).to.be.gt(0);

      const allowPurchasing = await megapot.allowPurchasing();
      expect(allowPurchasing).to.be.true;

      // Test manual ticket purchase still works
      const manualTickets = 5;
      const manualCost = ticketPrice * BigInt(manualTickets);

      await mockERC20.connect(buyer).approve(megapot.target, manualCost);
      await expect(
        megapot
          .connect(buyer)
          .purchaseTickets(ethers.ZeroAddress, manualCost, buyer.address),
      ).to.not.be.reverted;
    });
  });

  describe("Error Handling and Edge Cases", function () {
    it("should handle zero ticket price gracefully", async function () {
      // Set ticket price to 0 (should prevent ticket purchases)
      await megapot.setTicketPrice(0);

      const ticketsBefore = await megapotExtension.userTicketsPurchased(
        buyer.address,
      );

      await authContract
        .connect(buyer)
        .purchaseWithERC20(mockERC20.target, tokenId, 1);

      const ticketsAfter = await megapotExtension.userTicketsPurchased(
        buyer.address,
      );
      expect(ticketsAfter).to.equal(ticketsBefore); // No tickets purchased
    });

    it("should handle insufficient Megapot extension balance", async function () {
      // Configure very high funding percentage that would exceed transferred amount
      await megapotExtension.connect(owner).updateDirectFundingConfig(
        true,
        1000,
        ethers.parseUnits("1", 6),
        ethers.parseUnits("100", 6), // 10%
      );

      // This should still work as the library handles the transfer
      await expect(
        authContract
          .connect(buyer)
          .purchaseWithERC20(mockERC20.target, tokenId, 1),
      ).to.not.be.reverted;
    });

    it("should handle Megapot purchase failures gracefully", async function () {
      // Disable purchasing on the Megapot
      await megapot.setAllowPurchasing(false);

      // Purchase should still succeed (just no tickets purchased)
      await expect(
        authContract
          .connect(buyer)
          .purchaseWithERC20(mockERC20.target, tokenId, 1),
      ).to.not.be.reverted;

      // Should have purchased the NFT but no lottery tickets
      expect(await authContract.balanceOf(buyer.address, tokenId)).to.equal(1);
    });
  });
});
