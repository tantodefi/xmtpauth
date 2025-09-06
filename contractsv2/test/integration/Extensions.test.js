const { expect } = require("chai");
const { ethers } = require("hardhat");

// Integration tests for the full extension system

describe("XMTPAuth Extension System", function () {
  let XMTPAuthERC1155, XMTPAuthFactory, MegapotExtension;
  let implementation, factory, mockMegapot, mockUSDC;
  let owner, user1, user2, bot, treasury, feeRecipient;
  let authContract, megapotExtension;

  // Mock Megapot contract
  const mockMegapotABI = [
    "function purchaseTickets(address referrer, uint256 value, address recipient) external returns (bool)",
    "function ticketPrice() external view returns (uint256)",
    "function token() external view returns (address)",
    "function allowPurchasing() external view returns (bool)",
  ];

  beforeEach(async function () {
    [owner, user1, user2, bot, treasury, feeRecipient] =
      await ethers.getSigners();

    // Deploy mock USDC
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
    await mockUSDC.waitForDeployment();

    // Deploy mock Megapot
    const MockMegapot = await ethers.getContractFactory("MockMegapot");
    mockMegapot = await MockMegapot.deploy(await mockUSDC.getAddress());
    await mockMegapot.waitForDeployment();

    // Deploy implementation
    XMTPAuthERC1155 = await ethers.getContractFactory("XMTPAuthERC1155");
    implementation = await XMTPAuthERC1155.deploy();
    await implementation.waitForDeployment();

    // Deploy factory
    XMTPAuthFactory = await ethers.getContractFactory("XMTPAuthFactory");
    factory = await XMTPAuthFactory.deploy(
      await implementation.getAddress(),
      feeRecipient.address,
      250, // 2.5% fee
      owner.address,
    );
    await factory.waitForDeployment();
  });

  describe("Basic Extension Management", function () {
    beforeEach(async function () {
      // Deploy a basic auth contract
      const config = {
        groupName: "Test Group",
        groupDescription: "Test Description",
        groupImageUrl: "https://example.com/image.jpg",
        baseURI: "https://api.example.com/metadata/",
        salesGroupId: "sales-group-id",
        premiumGroupId: "premium-group-id",
        botAddress: bot.address,
        treasury: treasury.address,
        adminDelay: 2 * 24 * 60 * 60,
      };

      const tx = await factory.connect(user1).deployXMTPAuthContract(config);
      const receipt = await tx.wait();

      const deployEvent = receipt.logs.find((log) => {
        try {
          const parsed = factory.interface.parseLog(log);
          return parsed.name === "ContractDeployed";
        } catch {
          return false;
        }
      });

      const contractAddress =
        factory.interface.parseLog(deployEvent).args.contractAddress;
      authContract = XMTPAuthERC1155.attach(contractAddress);
    });

    it("Should register extension", async function () {
      // Deploy a simple extension
      MegapotExtension = await ethers.getContractFactory("MegapotExtension");
      const extension = await MegapotExtension.deploy(
        await mockMegapot.getAddress(),
        ethers.ZeroAddress, // no referrer
        user1.address,
      );
      await extension.waitForDeployment();

      const extensionId = ethers.keccak256(
        ethers.toUtf8Bytes("TEST_EXTENSION"),
      );

      // Register extension
      await authContract
        .connect(user1)
        .registerExtension(extensionId, await extension.getAddress());

      // Verify registration
      expect(await authContract.getExtension(extensionId)).to.equal(
        await extension.getAddress(),
      );
      expect(
        await authContract.isAuthorizedExtension(await extension.getAddress()),
      ).to.be.true;

      const registeredExtensions = await authContract.getRegisteredExtensions();
      expect(registeredExtensions.length).to.equal(1);
      expect(registeredExtensions[0]).to.equal(extensionId);
    });

    it("Should revoke extension", async function () {
      // Deploy and register extension
      MegapotExtension = await ethers.getContractFactory("MegapotExtension");
      const extension = await MegapotExtension.deploy(
        await mockMegapot.getAddress(),
        ethers.ZeroAddress,
        user1.address,
      );
      await extension.waitForDeployment();

      const extensionId = ethers.keccak256(
        ethers.toUtf8Bytes("TEST_EXTENSION"),
      );
      await authContract
        .connect(user1)
        .registerExtension(extensionId, await extension.getAddress());

      // Revoke extension
      await authContract.connect(user1).revokeExtension(extensionId);

      // Verify revocation
      expect(await authContract.getExtension(extensionId)).to.equal(
        ethers.ZeroAddress,
      );
      expect(
        await authContract.isAuthorizedExtension(await extension.getAddress()),
      ).to.be.false;

      const registeredExtensions = await authContract.getRegisteredExtensions();
      expect(registeredExtensions.length).to.equal(0);
    });

    it("Should get extension details", async function () {
      // Deploy and register extension
      MegapotExtension = await ethers.getContractFactory("MegapotExtension");
      const extension = await MegapotExtension.deploy(
        await mockMegapot.getAddress(),
        ethers.ZeroAddress,
        user1.address,
      );
      await extension.waitForDeployment();

      const extensionId = ethers.keccak256(
        ethers.toUtf8Bytes("TEST_EXTENSION"),
      );
      await authContract
        .connect(user1)
        .registerExtension(extensionId, await extension.getAddress());

      // Get extension details
      const [name, version, isActive] =
        await authContract.getExtensionDetails(extensionId);
      expect(name).to.equal("MegapotExtension");
      expect(version).to.equal("2.0.0");
      expect(isActive).to.be.true;
    });
  });

  describe("Megapot Extension Integration", function () {
    beforeEach(async function () {
      // Deploy auth contract with Megapot extension
      const config = {
        groupName: "Gaming Group",
        groupDescription: "Gaming access with lottery",
        groupImageUrl: "https://example.com/image.jpg",
        baseURI: "https://api.example.com/metadata/",
        salesGroupId: "sales-group-id",
        premiumGroupId: "premium-group-id",
        botAddress: bot.address,
        treasury: treasury.address,
        adminDelay: 2 * 24 * 60 * 60,
      };

      const tx = await factory.connect(user1).deployXMTPAuthWithMegapot(
        config,
        await mockMegapot.getAddress(),
        ethers.ZeroAddress, // no referrer
      );
      const receipt = await tx.wait();

      // Find the contract deployed event
      const deployEvent = receipt.logs.find((log) => {
        try {
          const parsed = factory.interface.parseLog(log);
          return parsed.name === "ContractDeployed";
        } catch {
          return false;
        }
      });

      // Find the extension deployed event
      const extensionEvent = receipt.logs.find((log) => {
        try {
          const parsed = factory.interface.parseLog(log);
          return parsed.name === "ExtensionDeployed";
        } catch {
          return false;
        }
      });

      const contractAddress =
        factory.interface.parseLog(deployEvent).args.contractAddress;
      const extensionAddress =
        factory.interface.parseLog(extensionEvent).args.extensionAddress;

      authContract = XMTPAuthERC1155.attach(contractAddress);
      megapotExtension = await ethers.getContractAt(
        "MegapotExtension",
        extensionAddress,
      );
    });

    it("Should deploy with Megapot extension", async function () {
      // Verify extension is registered
      const extensionId = ethers.keccak256(
        ethers.toUtf8Bytes("MEGAPOT_EXTENSION"),
      );
      expect(await authContract.getExtension(extensionId)).to.equal(
        await megapotExtension.getAddress(),
      );
      expect(
        await authContract.isAuthorizedExtension(
          await megapotExtension.getAddress(),
        ),
      ).to.be.true;

      // Verify extension configuration
      const config = await megapotExtension.getConfiguration();
      expect(config.isActive).to.be.true;
      expect(config.ticketsPerPurchase).to.equal(1);
      expect(config.minPurchaseForTicket).to.equal(ethers.parseEther("0.001"));
    });

    it("Should notify extension on token purchase", async function () {
      // Setup token
      const tokenConfig = {
        isTransferable: true,
        price: ethers.parseEther("0.01"),
        ttl: 30 * 24 * 60 * 60,
      };

      await authContract.connect(user1).newToken(tokenConfig);
      const tokenId = 1;

      // Fund extension with USDC for lottery tickets
      const usdcAmount = ethers.parseUnits("100", 6); // 100 USDC
      await mockUSDC.mint(user2.address, usdcAmount);
      await mockUSDC
        .connect(user2)
        .approve(await megapotExtension.getAddress(), usdcAmount);
      await megapotExtension.connect(user2).depositMegapotTokens(usdcAmount);

      // Purchase access token
      const tx = await authContract
        .connect(user2)
        ["purchase(uint256,uint256)"](tokenId, 1, {
          value: ethers.parseEther("0.01"),
        });

      // Verify token purchase
      expect(await authContract.balanceOf(user2.address, tokenId)).to.equal(1);

      // Verify extension was notified (check stats)
      const stats = await megapotExtension.getExtensionStats();
      expect(stats.totalTokens).to.equal(1);
      expect(stats.totalTickets).to.equal(1); // Should have bought 1 lottery ticket

      const userStats = await megapotExtension.getUserStats(user2.address);
      expect(userStats.ticketsPurchased).to.equal(1);
      expect(userStats.tokenPurchases).to.equal(1);
    });

    it("Should handle extension configuration", async function () {
      // Update Megapot extension configuration
      await megapotExtension.connect(user1).updateConfiguration(
        true, // active
        3, // 3 tickets per purchase
        ethers.parseEther("0.005"), // 0.005 ETH minimum
        false, // fixed tickets (not value-based)
        5, // max 5 tickets
      );

      const config = await megapotExtension.getConfiguration();
      expect(config.isActive).to.be.true;
      expect(config.ticketsPerPurchase).to.equal(3);
      expect(config.minPurchaseForTicket).to.equal(ethers.parseEther("0.005"));
      expect(config.useTokenValue).to.be.false;
      expect(config.maxTicketsPerPurchase).to.equal(5);
    });

    it("Should handle extension funding", async function () {
      const usdcAmount = ethers.parseUnits("50", 6); // 50 USDC

      // Mint USDC to user2
      await mockUSDC.mint(user2.address, usdcAmount);

      // Approve and deposit
      await mockUSDC
        .connect(user2)
        .approve(await megapotExtension.getAddress(), usdcAmount);
      await megapotExtension.connect(user2).depositMegapotTokens(usdcAmount);

      // Check balance
      const balance = await mockUSDC.balanceOf(
        await megapotExtension.getAddress(),
      );
      expect(balance).to.equal(usdcAmount);

      // Check if extension can purchase tickets
      const ticketPrice = await mockMegapot.ticketPrice();
      const maxTickets = balance / ticketPrice;
      const canPurchase = await megapotExtension.canPurchaseTickets(
        Number(maxTickets),
      );
      expect(canPurchase).to.be.true;
    });

    it("Should handle grant notifications", async function () {
      // Setup token
      const tokenConfig = {
        isTransferable: true,
        price: ethers.parseEther("0.01"),
        ttl: 30 * 24 * 60 * 60,
      };

      await authContract.connect(user1).newToken(tokenConfig);
      const tokenId = 1;

      // Grant access (should notify extension)
      await authContract
        .connect(user1)
        .grantXMTPAccess(user2.address, tokenId, 1, "test-inbox-id");

      // Verify grant worked
      expect(await authContract.balanceOf(user2.address, tokenId)).to.equal(1);

      // Note: Megapot extension doesn't track grants, but the notification was sent
      // Other extensions could track this data
    });
  });

  describe("Extension Error Handling", function () {
    it("Should handle extension failures gracefully", async function () {
      // Deploy auth contract
      const config = {
        groupName: "Test Group",
        groupDescription: "Test Description",
        groupImageUrl: "https://example.com/image.jpg",
        baseURI: "https://api.example.com/metadata/",
        salesGroupId: "sales-group-id",
        premiumGroupId: "premium-group-id",
        botAddress: bot.address,
        treasury: treasury.address,
        adminDelay: 2 * 24 * 60 * 60,
      };

      const tx = await factory.connect(user1).deployXMTPAuthContract(config);
      const receipt = await tx.wait();

      const deployEvent = receipt.logs.find((log) => {
        try {
          const parsed = factory.interface.parseLog(log);
          return parsed.name === "ContractDeployed";
        } catch {
          return false;
        }
      });

      const contractAddress =
        factory.interface.parseLog(deployEvent).args.contractAddress;
      authContract = XMTPAuthERC1155.attach(contractAddress);

      // Deploy a failing extension (one that reverts)
      const FailingExtension =
        await ethers.getContractFactory("FailingExtension");
      const failingExtension = await FailingExtension.deploy();
      await failingExtension.waitForDeployment();

      const extensionId = ethers.keccak256(
        ethers.toUtf8Bytes("FAILING_EXTENSION"),
      );
      await authContract
        .connect(user1)
        .registerExtension(extensionId, await failingExtension.getAddress());

      // Setup token
      const tokenConfig = {
        isTransferable: true,
        price: ethers.parseEther("0.01"),
        ttl: 30 * 24 * 60 * 60,
      };

      await authContract.connect(user1).newToken(tokenConfig);
      const tokenId = 1;

      // Purchase should still work even if extension fails
      await expect(
        authContract.connect(user2)["purchase(uint256,uint256)"](tokenId, 1, {
          value: ethers.parseEther("0.01"),
        }),
      ).to.not.be.reverted;

      // Verify token was still minted despite extension failure
      expect(await authContract.balanceOf(user2.address, tokenId)).to.equal(1);
    });
  });
});

// Helper contract for testing extension failures
const FailingExtensionSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/interfaces/IExtension.sol";

contract FailingExtension is IExtension {
    function onTokenPurchased(
        address,
        uint256,
        uint256,
        uint256,
        address
    ) external pure override {
        revert("Extension failure");
    }

    function onTokenGranted(
        address,
        uint256,
        uint256,
        address
    ) external pure override {
        revert("Extension failure");
    }

    function onTokenRevoked(
        address,
        uint256,
        uint256,
        string memory
    ) external pure override {
        revert("Extension failure");
    }

    function getExtensionInfo()
        external
        pure
        override
        returns (
            string memory,
            string memory,
            bool
        )
    {
        return ("FailingExtension", "1.0.0", true);
    }
}
`;

// Mock contracts for testing
const MockERC20Source = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_
    ) ERC20(name, symbol) {
        _decimals = decimals_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
`;

const MockMegapotSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockMegapot {
    IERC20 public token;
    uint256 public ticketPrice = 1e6; // 1 USDC
    bool public allowPurchasing = true;

    event TicketsPurchased(address indexed referrer, uint256 value, address indexed recipient);

    constructor(address _token) {
        token = IERC20(_token);
    }

    function purchaseTickets(
        address referrer,
        uint256 value,
        address recipient
    ) external returns (bool) {
        require(allowPurchasing, "Purchasing disabled");
        require(value > 0, "Invalid value");
        
        // Transfer tokens from sender
        token.transferFrom(msg.sender, address(this), value);
        
        emit TicketsPurchased(referrer, value, recipient);
        return true;
    }

    function setTicketPrice(uint256 _price) external {
        ticketPrice = _price;
    }

    function setAllowPurchasing(bool _allow) external {
        allowPurchasing = _allow;
    }
}
`;
