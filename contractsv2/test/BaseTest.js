const { ethers } = require("hardhat");
const { expect } = require("chai");

/**
 * Base test utilities for XMTP Auth V2 tests
 * Following the evmauth-core pattern for clean test organization
 */
class BaseTest {
  constructor() {
    this.accounts = {};
    this.contracts = {};
    this.config = {
      initialDelay: 86400,
      defaultURI: "https://api.example.com/metadata/",
      salesGroupId: "sales-group",
      premiumGroupId: "premium-group",
    };
  }

  /**
   * Setup test accounts with roles
   */
  async setupAccounts() {
    const [owner, treasury, bot, user1, user2, feeRecipient] =
      await ethers.getSigners();

    this.accounts = {
      owner,
      treasury,
      bot,
      user1,
      user2,
      feeRecipient,
    };

    console.log("✅ Test accounts configured");
    return this.accounts;
  }

  /**
   * Deploy core contracts with proper library linking
   */
  async deployContracts() {
    if (!this.accounts.owner) {
      await this.setupAccounts();
    }

    // Deploy library first

    // Deploy main contract
    const XMTPAuthERC1155 = await ethers.getContractFactory("XMTPAuthERC1155");
    const authContract = await XMTPAuthERC1155.deploy();
    await authContract.waitForDeployment();
    this.contracts.authContract = authContract;

    // Deploy factory with required constructor parameters
    const XMTPAuthFactory = await ethers.getContractFactory("XMTPAuthFactory");
    const factory = await XMTPAuthFactory.deploy(
      await authContract.getAddress(), // implementation
      this.accounts.owner.address, // fee recipient
      250, // 2.5% fee basis points
      this.accounts.owner.address, // initial owner
    );
    await factory.waitForDeployment();
    this.contracts.factory = factory;

    console.log("✅ Core contracts deployed");
    return this.contracts;
  }

  /**
   * Initialize contracts with standard configuration
   */
  async initializeContracts() {
    if (!this.contracts.authContract) {
      await this.deployContracts();
    }

    const { authContract } = this.contracts;
    const { owner, treasury, bot } = this.accounts;

    await authContract.initialize(
      this.config.initialDelay,
      owner.address,
      treasury.address,
      this.config.defaultURI,
      this.config.salesGroupId,
      this.config.premiumGroupId,
      bot.address,
    );

    // Grant necessary roles for testing
    const TOKEN_MANAGER_ROLE = ethers.keccak256(
      ethers.toUtf8Bytes("TOKEN_MANAGER_ROLE"),
    );
    const ACCESS_MANAGER_ROLE = ethers.keccak256(
      ethers.toUtf8Bytes("ACCESS_MANAGER_ROLE"),
    );
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));

    // Owner grants roles to treasury and bot
    await authContract
      .connect(owner)
      .grantRole(TOKEN_MANAGER_ROLE, treasury.address);
    await authContract
      .connect(owner)
      .grantRole(ACCESS_MANAGER_ROLE, treasury.address);
    await authContract.connect(owner).grantRole(MINTER_ROLE, bot.address);
    // Bot already has ACCESS_MANAGER_ROLE from initialization
    // Note: DEFAULT_ADMIN_ROLE cannot be granted directly due to AccessControlDefaultAdminRules

    // Set the factory address in the auth contract for proper fee handling
    // Use treasury account which has ACCESS_MANAGER_ROLE
    await authContract
      .connect(treasury)
      .setFactory(await this.contracts.factory.getAddress());

    console.log("✅ Contracts initialized with proper roles");
  }

  /**
   * Setup test tokens for testing
   */
  async setupTestTokens() {
    const { authContract } = this.contracts;
    const { treasury } = this.accounts;

    // Setup Token ID 1: Free Trial (evmauth-core starts from ID 1)
    await authContract.connect(treasury).setupAccessTier(
      1, // tokenId - Trial access (ID 1 since evmauth-core starts from 1)
      7, // durationDays (7-day trial)
      ethers.parseEther("0.05"), // priceWei (0.05 ETH)
      "Trial Access",
      "7-day trial access to XMTP premium features",
      "", // imageHash
      "", // metadataUri
    );

    // Setup Token ID 2: Basic Premium (user-configurable price)
    await authContract.connect(treasury).setupAccessTier(
      2, // tokenId
      30, // durationDays (30-day access)
      ethers.parseEther("0.05"), // priceWei (0.05 ETH)
      "Premium Access",
      "30-day premium access to XMTP features",
      "", // imageHash
      "", // metadataUri
    );

    // Also setup as XMTP access tiers for hasValidXMTPAccess function
    await authContract
      .connect(treasury)
      .setupXMTPAccessTier(
        1,
        "Trial Access",
        "7-day trial access to XMTP premium features",
        "",
        "",
      );

    await authContract
      .connect(treasury)
      .setupXMTPAccessTier(
        2,
        "Premium Access",
        "30-day premium access to XMTP features",
        "",
        "",
      );

    // Set up multi-token pricing (ETH prices are already set via setupAccessTier)
    // Add ERC20 pricing for testing
    const { erc20: mockERC20 } = this.contracts.mocks;
    if (mockERC20) {
      // Add mock ERC20 as accepted payment token (6 decimals like USDC)
      await authContract.connect(treasury).addERC20PaymentToken(
        await mockERC20.getAddress(),
        ethers.ZeroAddress, // no price feed for testing
        6, // USDC-like decimals
      );

      // Set ERC20 prices for both tokens
      // Token 1 (Trial) = 50 USDC (to test allowance properly)
      await authContract.connect(treasury).setTokenERC20Price(
        1,
        await mockERC20.getAddress(),
        ethers.parseUnits("50", 6), // 50 USDC (6 decimals)
      );

      // Token 2 (Premium) = 100 USDC
      await authContract.connect(treasury).setTokenERC20Price(
        2,
        await mockERC20.getAddress(),
        ethers.parseUnits("100", 6), // 100 USDC (6 decimals)
      );
    }

    console.log(
      "✅ Test tokens configured dynamically (Token 1: Trial, Token 2: Premium)",
    );
  }

  /**
   * Get contract size information
   */
  async getContractInfo() {
    const { authContract } = this.contracts;

    const authCode = await ethers.provider.getCode(
      await authContract.getAddress(),
    );

    const authSize = (authCode.length - 2) / 2;

    return {
      authContract: {
        address: await authContract.getAddress(),
        size: authSize,
        deployable: authSize <= 24576,
      },
    };
  }

  /**
   * Deploy XMTPAuth with optional Megapot integration
   */
  async deployXMTPAuth(factory, options = {}) {
    const {
      treasury = this.accounts[1].address,
      withMegapot = false,
      megapotConfig = {},
    } = options;

    let authContract, megapotExtension, megapot;

    if (withMegapot) {
      // Deploy mocks if not already available
      if (!this.contracts.mocks) {
        await this.deployMocks();
      }
      megapot = this.contracts.mocks.megapot;

      // Deploy auth contract using factory
      const deploymentConfig = {
        treasury: treasury,
        groupName: "Test Group",
        groupDescription: "Test Description",
        groupImageUrl: "https://example.com/image.png",
        baseURI: "",
        salesGroupId: "test-sales",
        premiumGroupId: "test-premium",
        botAddress: this.accounts?.bot?.address || ethers.ZeroAddress,
        adminDelay: 0,
      };

      const tx = await factory
        .connect(this.accounts.owner)
        .deployXMTPAuthContract(deploymentConfig);
      const receipt = await tx.wait();

      // Get deployed contract address from event
      const deploymentEvent = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "ContractDeployed",
      );
      const deployedAddress = deploymentEvent.args.contractAddress;

      // Attach to the deployed contract
      const XMTPAuthERC1155 = await ethers.getContractFactory(
        "XMTPAuthERC1155",
        {},
      );
      authContract = XMTPAuthERC1155.attach(deployedAddress);

      // Deploy Megapot extension
      const MegapotExtension =
        await ethers.getContractFactory("MegapotExtension");
      megapotExtension = await MegapotExtension.deploy(
        await megapot.getAddress(),
        ethers.ZeroAddress, // referrer
        this.accounts.owner.address, // owner
      );
      await megapotExtension.waitForDeployment();

      // Register Megapot extension
      const megapotId = ethers.keccak256(
        ethers.toUtf8Bytes("MEGAPOT_EXTENSION"),
      );
      await authContract
        .connect(this.accounts.owner)
        .registerExtension(megapotId, await megapotExtension.getAddress());

      // Configure Megapot with defaults or custom config
      const {
        useDirectFunding = true,
        fundingPercentage = 250,
        minTicketAmount = ethers.parseUnits("1", 6),
        maxTicketAmount = ethers.parseUnits("10", 6),
      } = megapotConfig;

      await megapotExtension
        .connect(this.accounts.owner)
        .updateDirectFundingConfig(
          useDirectFunding,
          fundingPercentage,
          minTicketAmount,
          maxTicketAmount,
        );
    } else {
      // Deploy without Megapot using factory
      const deploymentConfig = {
        treasury: treasury,
        groupName: "Test Group",
        groupDescription: "Test Description",
        groupImageUrl: "https://example.com/image.png",
        baseURI: "",
        salesGroupId: "test-sales",
        premiumGroupId: "test-premium",
        botAddress: this.accounts?.bot?.address || ethers.ZeroAddress,
        adminDelay: 0,
      };

      const tx = await factory
        .connect(this.accounts.owner)
        .deployXMTPAuthContract(deploymentConfig);
      const receipt = await tx.wait();

      // Get deployed contract address from event
      const deploymentEvent = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "ContractDeployed",
      );
      const deployedAddress = deploymentEvent.args.contractAddress;

      // Attach to the deployed contract
      const XMTPAuthERC1155 = await ethers.getContractFactory(
        "XMTPAuthERC1155",
        {},
      );
      authContract = XMTPAuthERC1155.attach(deployedAddress);
    }

    return { authContract, megapotExtension, megapot };
  }

  /**
   * Create a test token with specified configuration
   */
  async createToken(authContract, options = {}) {
    const {
      price = ethers.parseUnits("10", 6),
      ttl = 7 * 24 * 60 * 60, // 7 days
      transferable = false,
      erc20Tokens = [],
      erc20Prices = [],
    } = options;

    const treasury = this.accounts.treasury;

    // Get the token ID first using staticCall
    const tokenId = await authContract
      .connect(treasury)
      .createToken.staticCall(price, transferable, ttl);

    // Create token
    await authContract.connect(treasury).createToken(price, transferable, ttl);

    // Add ERC20 payment options if provided
    for (let i = 0; i < erc20Tokens.length; i++) {
      await authContract.connect(treasury).addERC20PaymentToken(
        erc20Tokens[i],
        ethers.ZeroAddress,
        6, // USDC decimals
      );

      await authContract
        .connect(treasury)
        .setERC20Price(tokenId, erc20Tokens[i], erc20Prices[i]);
    }

    return tokenId;
  }

  /**
   * Calculate expected Megapot funding for a purchase
   */
  calculateMegapotFunding(
    purchaseAmount,
    fundingPercentage = 250,
    maxAmount = null,
  ) {
    const funding = (purchaseAmount * BigInt(fundingPercentage)) / 10000n;
    return maxAmount && funding > maxAmount ? maxAmount : funding;
  }

  /**
   * Calculate expected ticket count for Megapot funding
   */
  calculateTicketCount(fundingAmount, ticketPrice, minAmount = null) {
    if (minAmount && fundingAmount < minAmount) {
      return 0n;
    }
    return fundingAmount / ticketPrice;
  }

  /**
   * Deploy mock contracts for testing
   */
  async deployMocks() {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Test USDC", "TUSDC", 6);
    await mockToken.waitForDeployment();

    const MockMegapot = await ethers.getContractFactory("MockMegapot");
    const mockMegapot = await MockMegapot.deploy(await mockToken.getAddress());
    await mockMegapot.waitForDeployment();

    this.contracts.mocks = {
      erc20: mockToken,
      megapot: mockMegapot,
    };

    console.log("✅ Mock contracts deployed");
    return this.contracts.mocks;
  }

  /**
   * Full setup for comprehensive testing
   */
  async fullSetup() {
    await this.setupAccounts();
    await this.deployContracts();
    await this.deployMocks();
    await this.initializeContracts();
    await this.setupTestTokens();

    console.log("🎯 Full test setup complete");
    return {
      accounts: this.accounts,
      contracts: this.contracts,
      config: this.config,
    };
  }
}

// Export helper functions for direct use in tests
const setupTestEnvironment = async () => {
  const baseTest = new BaseTest();
  await baseTest.setupAccounts();
  await baseTest.deployContracts();
  await baseTest.deployMocks();
  await baseTest.initializeContracts();

  return {
    accounts: baseTest.accounts,
    factory: baseTest.contracts.factory,
    library: baseTest.contracts.library,
    mockERC20: baseTest.contracts.mocks.erc20,
    mockMegapot: baseTest.contracts.mocks.megapot,
  };
};

const deployXMTPAuth = async (
  factory,
  options = {},
  library = null,
  mocks = null,
) => {
  const baseTest = new BaseTest();
  await baseTest.setupAccounts();

  // Set up minimal contracts structure for the helper
  baseTest.contracts = {
    factory: factory,
  };

  // Use provided mocks or deploy new ones
  if (mocks) {
    baseTest.contracts.mocks = mocks;
  } else {
    await baseTest.deployMocks();
  }

  return await baseTest.deployXMTPAuth(factory, options);
};

const createToken = async (authContract, options = {}) => {
  const baseTest = new BaseTest();
  await baseTest.setupAccounts();
  return await baseTest.createToken(authContract, options);
};

module.exports = {
  BaseTest,
  setupTestEnvironment,
  deployXMTPAuth,
  createToken,
};
