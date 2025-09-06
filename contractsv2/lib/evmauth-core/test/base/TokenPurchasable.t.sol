// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { TokenPurchasable } from "src/base/TokenPurchasable.sol";
import { BaseTestWithERC20s } from "test/_helpers/BaseTest.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract MockTokenPurchasableV1 is TokenPurchasable, OwnableUpgradeable, UUPSUpgradeable {
    // For testing only; in a real implementation, use a token standard like ERC-1155 or ERC-6909.
    mapping(address => mapping(uint256 => uint256)) public balances;

    /**
     * @dev Initializer used when deployed directly as an upgradeable contract.
     *
     * @param initialOwner The address to be set as the owner of the contract.
     * @param initialTreasury The address where purchase revenues will be sent.
     */
    function initialize(address initialOwner, address payable initialTreasury) public initializer {
        __MockTokenPurchasableV1_init(initialOwner, initialTreasury);
    }

    /**
     * @dev Initializer that calls the parent initializers for upgradeable contracts.
     *
     * @param initialOwner The address to be set as the owner of the contract.
     * @param initialTreasury The address where purchase revenues will be sent.
     */
    function __MockTokenPurchasableV1_init(address initialOwner, address payable initialTreasury)
        internal
        onlyInitializing
    {
        __TokenPurchasable_init(initialTreasury);
        __Ownable_init(initialOwner);
        __MockTokenPurchasableV1_init_unchained();
    }

    /**
     * @dev Unchained initializer that only initializes THIS contract's storage.
     */
    function __MockTokenPurchasableV1_init_unchained() internal onlyInitializing { }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {
        // This will revert if the caller is not authorized.
    }

    /// @inheritdoc TokenPurchasable
    function _mintPurchasedTokens(address to, uint256 id, uint256 amount) internal virtual override {
        balances[to][id] += amount;
    }
}

contract TokenPurchasableTest is BaseTestWithERC20s {
    MockTokenPurchasableV1 internal v1;

    // =========== Test Setup ============ //

    function _deployNewImplementation() internal override returns (address) {
        return address(new MockTokenPurchasableV1());
    }

    function _getContractName() internal pure override returns (string memory) {
        return "TokenPurchasable.t.sol:MockTokenPurchasableV1";
    }

    function _getInitializerData() internal view override returns (bytes memory) {
        return abi.encodeCall(MockTokenPurchasableV1.initialize, (owner, treasury));
    }

    function _setToken(address proxyAddress) internal override {
        v1 = MockTokenPurchasableV1(proxyAddress);
    }

    // ============ Tests ============= //

    function test_initialize() public view {
        assertEq(v1.treasury(), treasury);

        // Check that the storage slot for TokenPurchasable is correctly calculated to avoid storage collisions.
        assertEq(
            0x54c84cf2875b53587e3bd1a41cdb4ae126fe9184d0b1bd9183d4f9005d2ff600,
            keccak256(abi.encode(uint256(keccak256("tokenpurchasable.storage.TokenPurchasable")) - 1))
                & ~bytes32(uint256(0xff))
        );
    }
}
