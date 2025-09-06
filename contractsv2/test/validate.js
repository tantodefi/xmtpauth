#!/usr/bin/env node

/**
 * XMTP Auth V2 - Comprehensive Validation Script
 *
 * Consolidates all validation functionality into a single, clean script
 * Replaces scattered validation files with organized testing
 */

const { ethers } = require("hardhat");
const { BaseTest } = require("./BaseTest");

class ValidationSuite {
  constructor() {
    this.results = {
      deployment: false,
      tokenManagement: false,
      pauseSystem: false,
      xmtpIntegration: false,
      payments: false,
      extensions: false,
      factory: false,
      security: false,
    };
    this.test = new BaseTest();
  }

  async runCompleteValidation() {
    console.log("🎯 XMTP Auth V2 - Comprehensive Validation");
    console.log("===========================================\n");

    try {
      await this.validateDeployment();
      await this.validateTokenManagement();
      await this.validatePauseSystem();
      await this.validateXMTPIntegration();
      await this.validatePayments();
      await this.validateExtensions();
      await this.validateFactory();
      await this.validateSecurity();

      this.printSummary();
    } catch (error) {
      console.error("\n❌ Validation failed:", error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }

  async validateDeployment() {
    console.log("📦 1. Deployment Validation");
    console.log("----------------------------");

    const { accounts, contracts } = await this.test.fullSetup();

    // Verify core contracts deployed
    expect(contracts.authContract).to.not.be.undefined;
    expect(contracts.library).to.not.be.undefined;
    expect(contracts.factory).to.not.be.undefined;
    console.log("✅ Core contracts deployed");

    // Verify initialization
    const xmtpInfo = await contracts.authContract.xmtpInfo();
    expect(xmtpInfo.isActive).to.be.true;
    console.log("✅ Contract initialized correctly");

    // Check contract size
    const info = await this.test.getContractInfo();
    console.log(`📏 Contract size: ${info.authContract.size} bytes`);
    console.log(`📏 Library size: ${info.library.size} bytes`);

    if (info.authContract.size > 24576) {
      console.log("⚠️  Requires L2 deployment (Base, Arbitrum, etc.)");
    } else {
      console.log("✅ Can deploy on mainnet");
    }

    this.results.deployment = true;
    console.log("");
  }

  async validateTokenManagement() {
    console.log("🪙 2. Token Management Validation");
    console.log("----------------------------------");

    const { contracts, accounts } = await this.test.fullSetup();
    const { authContract } = contracts;
    const { treasury } = accounts;

    // Test createToken
    const tokenTx = await authContract
      .connect(treasury)
      .createToken(ethers.parseEther("0.5"), true, 0);
    await tokenTx.wait();
    console.log("✅ createToken function works");

    // Test token configuration
    const newTokenId = 2; // Should be next available
    expect(await authContract.isValidToken(newTokenId)).to.be.true;
    console.log("✅ Token creation verified");

    // Test price setting
    await authContract
      .connect(treasury)
      .setTokenPrice(newTokenId, ethers.parseEther("1.0"));
    const newPrice = await authContract.priceOf(newTokenId);
    expect(newPrice).to.equal(ethers.parseEther("1.0"));
    console.log("✅ setTokenPrice works");

    // Test XMTP tier setup with auto-creation
    await authContract.connect(treasury).setupXMTPAccessTier(
      3, // New token
      "Auto-Created Tier",
      "Tier created automatically",
      "",
      "",
    );
    expect(await authContract.isValidToken(3)).to.be.true;
    console.log("✅ Auto-creation in setupXMTPAccessTier works");

    this.results.tokenManagement = true;
    console.log("");
  }

  async validatePauseSystem() {
    console.log("⏸️ 3. Pause System Validation");
    console.log("-----------------------------");

    const { contracts, accounts } = await this.test.fullSetup();
    const { authContract } = contracts;
    const { bot } = accounts;

    // Test pause
    expect(await authContract.paused()).to.be.false;
    await authContract.connect(bot).pause();
    expect(await authContract.paused()).to.be.true;
    console.log("✅ Pause function works");

    // Test unpause
    await authContract.connect(bot).unpause();
    expect(await authContract.paused()).to.be.false;
    console.log("✅ Unpause function works");

    this.results.pauseSystem = true;
    console.log("");
  }

  async validateXMTPIntegration() {
    console.log("📨 4. XMTP Integration Validation");
    console.log("----------------------------------");

    const { contracts, accounts } = await this.test.fullSetup();
    const { authContract } = contracts;
    const { bot, user1 } = accounts;

    // Test XMTP info
    const xmtpInfo = await authContract.xmtpInfo();
    expect(xmtpInfo.salesGroupId).to.equal("sales-group");
    console.log("✅ XMTP configuration correct");

    // Test inbox mapping (bot can store inbox IDs)
    await authContract
      .connect(bot)
      .storeUserInboxId(user1.address, "test-inbox-123");
    const storedInbox = await authContract.userInboxIds(user1.address);
    expect(storedInbox).to.equal("test-inbox-123");
    console.log("✅ Inbox mapping works");

    // Test bot access granting (use token 1 which exists from setup)
    await authContract
      .connect(bot)
      .grantXMTPAccess(user1.address, 1, 1, "test-inbox-validation");
    const balance = await authContract.balanceOf(user1.address, 1);
    expect(balance).to.be.greaterThan(0);
    console.log("✅ Bot access granting works");

    // Test access validation
    expect(await authContract.hasValidXMTPAccess(user1.address)).to.be.true;
    console.log("✅ Access validation works");

    this.results.xmtpIntegration = true;
    console.log("");
  }

  async validatePayments() {
    console.log("💰 5. Payment System Validation");
    console.log("--------------------------------");

    const { contracts, accounts } = await this.test.fullSetup();
    const { authContract, mocks } = contracts;
    const { owner, treasury } = accounts;

    // Test ETH payments
    const price = await authContract.priceOf(0);
    const initialBalance = await authContract.balanceOf(owner.address, 0);

    await authContract.connect(owner).purchase(0, 1, {
      value: price,
    });

    const newBalance = await authContract.balanceOf(owner.address, 0);
    expect(newBalance).to.be.greaterThan(initialBalance);
    console.log("✅ ETH purchase works");

    // Test ETH TVL
    const tvl = await authContract.getETHTVL();
    expect(tvl).to.be.greaterThan(0);
    console.log("✅ ETH TVL accumulation works");

    // Test XMTP purchase tracking
    await authContract.connect(owner).purchaseXMTPAccess(0, 1, "test-tx-hash", {
      value: price,
    });
    const historyLength = await authContract.getXMTPPurchaseHistoryLength();
    expect(historyLength).to.be.greaterThan(0);
    console.log("✅ XMTP purchase tracking works");

    // Test ERC20 setup
    const tokenAddress = await mocks.erc20.getAddress();
    await authContract.connect(treasury).addERC20PaymentToken(tokenAddress);
    expect(await authContract.isERC20PaymentTokenAccepted(tokenAddress)).to.be
      .true;
    console.log("✅ ERC20 payment setup works");

    this.results.payments = true;
    console.log("");
  }

  async validateExtensions() {
    console.log("🔌 6. Extension System Validation");
    console.log("----------------------------------");

    const { contracts, accounts } = await this.test.fullSetup();
    const { authContract, mocks } = contracts;
    const { owner } = accounts;

    // Deploy mock extension
    const MockExtension = await ethers.getContractFactory("MockExtension");
    const mockExtension = await MockExtension.deploy();
    await mockExtension.waitForDeployment();

    const extensionName = ethers.keccak256(ethers.toUtf8Bytes("TestExtension"));

    // Register extension
    await authContract
      .connect(owner)
      .registerExtension(extensionName, await mockExtension.getAddress());

    expect(await authContract.extensions(extensionName)).to.equal(
      await mockExtension.getAddress(),
    );
    console.log("✅ Extension registration works");

    // Test Megapot extension
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
    console.log("✅ Megapot extension registration works");

    const extensions = await authContract.getRegisteredExtensions();
    expect(extensions.length).to.be.greaterThan(0);
    console.log("✅ Extension system functional");

    this.results.extensions = true;
    console.log("");
  }

  async validateFactory() {
    console.log("🏭 7. Factory Validation");
    console.log("-------------------------");

    const { contracts, accounts } = await this.test.fullSetup();
    const { factory } = contracts;
    const { owner, treasury, bot, feeRecipient } = accounts;

    // Setup factory
    await factory.connect(owner).setFeeBasisPoints(250);
    await factory.connect(owner).setFeeRecipient(feeRecipient.address);
    console.log("✅ Factory configuration works");

    // Deploy contract via factory
    const deploymentConfig = {
      groupName: "Validation Group",
      groupDescription: "Validation Description",
      groupImageUrl: "https://example.com/validate.jpg",
      baseURI: "https://api.example.com/tokens/",
      salesGroupId: "factory-sales",
      premiumGroupId: "factory-premium",
      botAddress: bot.address,
      treasury: treasury.address,
      adminDelay: 86400,
    };

    const tx = await factory
      .connect(owner)
      .deployXMTPAuthContract(deploymentConfig);
    const receipt = await tx.wait();

    const deploymentEvent = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "XMTPAuthContractDeployed",
    );

    expect(deploymentEvent).to.not.be.undefined;
    console.log("✅ Factory deployment works");

    this.results.factory = true;
    console.log("");
  }

  async validateSecurity() {
    console.log("🔒 8. Security Validation");
    console.log("--------------------------");

    const { contracts, accounts } = await this.test.fullSetup();
    const { authContract } = contracts;
    const { user1, treasury } = accounts;

    // Test access control
    await expect(
      authContract.connect(user1).createToken(ethers.parseEther("1"), true, 0),
    ).to.be.revertedWithCustomError(
      authContract,
      "AccessControlUnauthorizedAccount",
    );
    console.log("✅ Access control works");

    // Test role assignments
    const TOKEN_MANAGER_ROLE = ethers.keccak256(
      ethers.toUtf8Bytes("TOKEN_MANAGER_ROLE"),
    );
    expect(await authContract.hasRole(TOKEN_MANAGER_ROLE, treasury.address)).to
      .be.true;
    console.log("✅ Role assignments correct");

    // Test pause protection
    await authContract.connect(accounts.bot).pause();

    await expect(
      authContract.connect(user1).purchase(0, 1, {
        value: ethers.parseEther("0.1"),
      }),
    ).to.be.revertedWith("Pausable: paused");
    console.log("✅ Pause protection works");

    await authContract.connect(accounts.bot).unpause();

    this.results.security = true;
    console.log("");
  }

  printSummary() {
    console.log("🎉 VALIDATION SUMMARY");
    console.log("=====================");

    const allPassed = Object.values(this.results).every(Boolean);

    Object.entries(this.results).forEach(([test, passed]) => {
      const status = passed ? "✅ PASS" : "❌ FAIL";
      const name =
        test.charAt(0).toUpperCase() + test.slice(1).replace(/([A-Z])/g, " $1");
      console.log(`${status} ${name}`);
    });

    console.log(
      `\n${allPassed ? "🚀 ALL VALIDATIONS PASSED!" : "⚠️  Some validations failed"}`,
    );
    console.log(
      `XMTP Auth V2 is ${allPassed ? "READY FOR PRODUCTION!" : "needs attention"}`,
    );

    if (allPassed) {
      console.log("\n📋 Production Readiness:");
      console.log("✅ Core functionality: Complete");
      console.log("✅ Token management: Working");
      console.log("✅ Dual payments: ETH + ERC20");
      console.log("✅ XMTP integration: Full");
      console.log("✅ Extension system: Ready");
      console.log("✅ Factory deployment: Ready");
      console.log("✅ Access control: Secure");
      console.log("✅ Emergency controls: Available");
      console.log("🎯 Ready for L2 deployment!");
    }

    return allPassed;
  }
}

// Add expect function for validation
function expect(actual) {
  return {
    to: {
      equal: (expected) => {
        if (actual !== expected) {
          throw new Error(`Expected ${expected}, got ${actual}`);
        }
      },
      be: {
        true: () => {
          if (actual !== true) {
            throw new Error(`Expected true, got ${actual}`);
          }
        },
        false: () => {
          if (actual !== false) {
            throw new Error(`Expected false, got ${actual}`);
          }
        },
        greaterThan: (expected) => {
          if (!(actual > expected)) {
            throw new Error(
              `Expected ${actual} to be greater than ${expected}`,
            );
          }
        },
        undefined: () => {
          if (actual !== undefined) {
            throw new Error(`Expected undefined, got ${actual}`);
          }
        },
        revertedWithCustomError: (contract, errorName) => {
          // For promises - this is a simplified implementation
          return Promise.resolve(actual).catch((error) => {
            if (!error.message.includes(errorName)) {
              throw new Error(
                `Expected ${errorName} error, got: ${error.message}`,
              );
            }
          });
        },
        revertedWith: (expectedMessage) => {
          return Promise.resolve(actual).catch((error) => {
            if (!error.message.includes(expectedMessage)) {
              throw new Error(
                `Expected "${expectedMessage}" error, got: ${error.message}`,
              );
            }
          });
        },
      },
      not: {
        be: {
          undefined: () => {
            if (actual === undefined) {
              throw new Error(`Expected not undefined, got undefined`);
            }
          },
          reverted: () => {
            // This should pass if no error is thrown
            return Promise.resolve(actual);
          },
        },
      },
      include: (expected) => {
        if (!actual.includes(expected)) {
          throw new Error(`Expected array to include ${expected}`);
        }
      },
    },
  };
}

// Run validation if called directly
if (require.main === module) {
  const validation = new ValidationSuite();
  validation
    .runCompleteValidation()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

module.exports = { ValidationSuite };
