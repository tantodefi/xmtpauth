const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Extension System Unit Tests", function () {
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

  describe("Extension Registry", function () {
    let mockExtension;

    beforeEach(async function () {
      // Deploy a mock extension
      const MockExtension = await ethers.getContractFactory("MockExtension");
      mockExtension = await MockExtension.deploy();
      await mockExtension.waitForDeployment();
    });

    it("Should register extension", async function () {
      const extensionId = ethers.keccak256(
        ethers.toUtf8Bytes("MOCK_EXTENSION"),
      );

      await authContract.registerExtension(
        extensionId,
        await mockExtension.getAddress(),
      );

      expect(await authContract.getExtension(extensionId)).to.equal(
        await mockExtension.getAddress(),
      );
      expect(
        await authContract.isAuthorizedExtension(
          await mockExtension.getAddress(),
        ),
      ).to.be.true;

      const registeredExtensions = await authContract.getRegisteredExtensions();
      expect(registeredExtensions.length).to.equal(1);
      expect(registeredExtensions[0]).to.equal(extensionId);
    });

    it("Should fail to register extension with zero address", async function () {
      const extensionId = ethers.keccak256(
        ethers.toUtf8Bytes("INVALID_EXTENSION"),
      );

      await expect(
        authContract.registerExtension(extensionId, ethers.ZeroAddress),
      ).to.be.revertedWith("Invalid extension address");
    });

    it("Should fail to register duplicate extension", async function () {
      const extensionId = ethers.keccak256(
        ethers.toUtf8Bytes("DUPLICATE_EXTENSION"),
      );

      await authContract.registerExtension(
        extensionId,
        await mockExtension.getAddress(),
      );

      await expect(
        authContract.registerExtension(
          extensionId,
          await mockExtension.getAddress(),
        ),
      ).to.be.revertedWith("Extension already registered");
    });

    it("Should revoke extension", async function () {
      const extensionId = ethers.keccak256(ethers.toUtf8Bytes("REVOKE_TEST"));

      // Register first
      await authContract.registerExtension(
        extensionId,
        await mockExtension.getAddress(),
      );
      expect(
        await authContract.isAuthorizedExtension(
          await mockExtension.getAddress(),
        ),
      ).to.be.true;

      // Revoke
      await authContract.revokeExtension(extensionId);

      expect(await authContract.getExtension(extensionId)).to.equal(
        ethers.ZeroAddress,
      );
      expect(
        await authContract.isAuthorizedExtension(
          await mockExtension.getAddress(),
        ),
      ).to.be.false;

      const registeredExtensions = await authContract.getRegisteredExtensions();
      expect(registeredExtensions.length).to.equal(0);
    });

    it("Should fail to revoke non-existent extension", async function () {
      const extensionId = ethers.keccak256(ethers.toUtf8Bytes("NON_EXISTENT"));

      await expect(
        authContract.revokeExtension(extensionId),
      ).to.be.revertedWith("Extension not found");
    });

    it("Should get extension details", async function () {
      const extensionId = ethers.keccak256(ethers.toUtf8Bytes("DETAILS_TEST"));

      await authContract.registerExtension(
        extensionId,
        await mockExtension.getAddress(),
      );

      const [name, version, isActive] =
        await authContract.getExtensionDetails(extensionId);
      expect(name).to.equal("MockExtension");
      expect(version).to.equal("1.0.0");
      expect(isActive).to.be.true;
    });

    it("Should fail to get details for non-existent extension", async function () {
      const extensionId = ethers.keccak256(ethers.toUtf8Bytes("NON_EXISTENT"));

      await expect(
        authContract.getExtensionDetails(extensionId),
      ).to.be.revertedWith("Extension not found");
    });

    it("Should handle multiple extensions", async function () {
      const MockExtension2 = await ethers.getContractFactory("MockExtension");
      const mockExtension2 = await MockExtension2.deploy();
      await mockExtension2.waitForDeployment();

      const extensionId1 = ethers.keccak256(ethers.toUtf8Bytes("EXTENSION_1"));
      const extensionId2 = ethers.keccak256(ethers.toUtf8Bytes("EXTENSION_2"));

      await authContract.registerExtension(
        extensionId1,
        await mockExtension.getAddress(),
      );
      await authContract.registerExtension(
        extensionId2,
        await mockExtension2.getAddress(),
      );

      const registeredExtensions = await authContract.getRegisteredExtensions();
      expect(registeredExtensions.length).to.equal(2);
      expect(registeredExtensions).to.include(extensionId1);
      expect(registeredExtensions).to.include(extensionId2);

      expect(
        await authContract.isAuthorizedExtension(
          await mockExtension.getAddress(),
        ),
      ).to.be.true;
      expect(
        await authContract.isAuthorizedExtension(
          await mockExtension2.getAddress(),
        ),
      ).to.be.true;
    });

    it("Should fail extension registration by non-admin", async function () {
      const extensionId = ethers.keccak256(ethers.toUtf8Bytes("UNAUTHORIZED"));

      await expect(
        authContract
          .connect(user1)
          .registerExtension(extensionId, await mockExtension.getAddress()),
      ).to.be.reverted; // Should revert due to access control
    });

    it("Should fail extension revocation by non-admin", async function () {
      const extensionId = ethers.keccak256(
        ethers.toUtf8Bytes("UNAUTHORIZED_REVOKE"),
      );

      await authContract.registerExtension(
        extensionId,
        await mockExtension.getAddress(),
      );

      await expect(authContract.connect(user1).revokeExtension(extensionId)).to
        .be.reverted; // Should revert due to access control
    });
  });

  describe("Extension Notifications", function () {
    let mockExtension;
    let extensionId;
    let tokenId;

    beforeEach(async function () {
      // Deploy mock extension
      const MockExtension = await ethers.getContractFactory("MockExtension");
      mockExtension = await MockExtension.deploy();
      await mockExtension.waitForDeployment();

      // Register extension
      extensionId = ethers.keccak256(ethers.toUtf8Bytes("NOTIFICATION_TEST"));
      await authContract.registerExtension(
        extensionId,
        await mockExtension.getAddress(),
      );

      // Create test token
      const tokenConfig = {
        isTransferable: true,
        price: ethers.parseEther("0.01"),
        ttl: 30 * 24 * 60 * 60,
      };

      await authContract.newToken(tokenConfig);
      tokenId = 1;
    });

    it("Should notify extension on token purchase", async function () {
      // Purchase token
      await authContract.connect(user1).purchase(tokenId, 2, {
        value: ethers.parseEther("0.02"),
      });

      // Check if extension was notified
      const purchaseCount = await mockExtension.purchaseNotificationCount();
      expect(purchaseCount).to.equal(1);

      const lastPurchase = await mockExtension.lastPurchaseNotification();
      expect(lastPurchase.buyer).to.equal(user1.address);
      expect(lastPurchase.tokenId).to.equal(tokenId);
      expect(lastPurchase.amount).to.equal(2);
      expect(lastPurchase.totalPrice).to.equal(ethers.parseEther("0.02"));
      expect(lastPurchase.paymentToken).to.equal(ethers.ZeroAddress);
    });

    it("Should notify extension on token grant", async function () {
      await authContract.grantXMTPAccess(
        user1.address,
        tokenId,
        3,
        "test-inbox",
      );

      const grantCount = await mockExtension.grantNotificationCount();
      expect(grantCount).to.equal(1);

      const lastGrant = await mockExtension.lastGrantNotification();
      expect(lastGrant.recipient).to.equal(user1.address);
      expect(lastGrant.tokenId).to.equal(tokenId);
      expect(lastGrant.amount).to.equal(3);
      expect(lastGrant.grantedBy).to.equal(owner.address);
    });

    it("Should notify extension on token revocation", async function () {
      // Grant first
      await authContract.grantXMTPAccess(
        user1.address,
        tokenId,
        1,
        "test-inbox",
      );

      // Then revoke
      await authContract.revokeXMTPAccess(
        user1.address,
        tokenId,
        "Test revocation",
      );

      const revokeCount = await mockExtension.revokeNotificationCount();
      expect(revokeCount).to.equal(1);

      const lastRevoke = await mockExtension.lastRevokeNotification();
      expect(lastRevoke.user).to.equal(user1.address);
      expect(lastRevoke.tokenId).to.equal(tokenId);
      expect(lastRevoke.amount).to.equal(1);
      expect(lastRevoke.reason).to.equal("Test revocation");
    });

    it("Should handle extension failures gracefully", async function () {
      // Deploy failing extension
      const FailingExtension =
        await ethers.getContractFactory("FailingExtension");
      const failingExtension = await FailingExtension.deploy();
      await failingExtension.waitForDeployment();

      const failingExtensionId = ethers.keccak256(
        ethers.toUtf8Bytes("FAILING_EXTENSION"),
      );
      await authContract.registerExtension(
        failingExtensionId,
        await failingExtension.getAddress(),
      );

      // Purchase should still work even if extension fails
      await expect(
        authContract.connect(user1).purchase(tokenId, 1, {
          value: ethers.parseEther("0.01"),
        }),
      ).to.not.be.reverted;

      // Token should still be minted despite extension failure
      expect(await authContract.balanceOf(user1.address, tokenId)).to.equal(1);

      // Working extension should still be notified
      const purchaseCount = await mockExtension.purchaseNotificationCount();
      expect(purchaseCount).to.equal(1);
    });

    it("Should notify multiple extensions", async function () {
      // Deploy second extension
      const MockExtension2 = await ethers.getContractFactory("MockExtension");
      const mockExtension2 = await MockExtension2.deploy();
      await mockExtension2.waitForDeployment();

      const extensionId2 = ethers.keccak256(ethers.toUtf8Bytes("EXTENSION_2"));
      await authContract.registerExtension(
        extensionId2,
        await mockExtension2.getAddress(),
      );

      // Purchase token
      await authContract.connect(user1).purchase(tokenId, 1, {
        value: ethers.parseEther("0.01"),
      });

      // Both extensions should be notified
      expect(await mockExtension.purchaseNotificationCount()).to.equal(1);
      expect(await mockExtension2.purchaseNotificationCount()).to.equal(1);
    });
  });

  describe("Extension Info", function () {
    it("Should return contract extension info", async function () {
      const [name, version, baseContract, isActive] =
        await authContract.getExtensionInfo();

      expect(name).to.equal("XMTPAuthERC1155");
      expect(version).to.equal("2.0.0");
      expect(baseContract).to.equal(await authContract.getAddress());
      expect(isActive).to.be.true; // XMTP integration is active by default
    });
  });
});

// Mock Extension Contract Source (to be compiled separately)
const MockExtensionSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/interfaces/IExtension.sol";

contract MockExtension is IExtension {
    struct PurchaseNotification {
        address buyer;
        uint256 tokenId;
        uint256 amount;
        uint256 totalPrice;
        address paymentToken;
    }

    struct GrantNotification {
        address recipient;
        uint256 tokenId;
        uint256 amount;
        address grantedBy;
    }

    struct RevokeNotification {
        address user;
        uint256 tokenId;
        uint256 amount;
        string reason;
    }

    uint256 public purchaseNotificationCount;
    uint256 public grantNotificationCount;
    uint256 public revokeNotificationCount;

    PurchaseNotification public lastPurchaseNotification;
    GrantNotification public lastGrantNotification;
    RevokeNotification public lastRevokeNotification;

    function onTokenPurchased(
        address buyer,
        uint256 tokenId,
        uint256 amount,
        uint256 totalPrice,
        address paymentToken
    ) external override {
        purchaseNotificationCount++;
        lastPurchaseNotification = PurchaseNotification({
            buyer: buyer,
            tokenId: tokenId,
            amount: amount,
            totalPrice: totalPrice,
            paymentToken: paymentToken
        });
    }

    function onTokenGranted(
        address recipient,
        uint256 tokenId,
        uint256 amount,
        address grantedBy
    ) external override {
        grantNotificationCount++;
        lastGrantNotification = GrantNotification({
            recipient: recipient,
            tokenId: tokenId,
            amount: amount,
            grantedBy: grantedBy
        });
    }

    function onTokenRevoked(
        address user,
        uint256 tokenId,
        uint256 amount,
        string memory reason
    ) external override {
        revokeNotificationCount++;
        lastRevokeNotification = RevokeNotification({
            user: user,
            tokenId: tokenId,
            amount: amount,
            reason: reason
        });
    }

    function getExtensionInfo()
        external
        pure
        override
        returns (
            string memory name,
            string memory version,
            bool isActive
        )
    {
        return ("MockExtension", "1.0.0", true);
    }
}
`;

const FailingExtensionSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/interfaces/IExtension.sol";

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
