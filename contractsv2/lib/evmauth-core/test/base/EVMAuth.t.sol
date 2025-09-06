// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { EVMAuth } from "src/base/EVMAuth.sol";
import { TokenPurchasable } from "src/base/TokenPurchasable.sol";
import { BaseTestWithAccessControlAndERC20s } from "test/_helpers/BaseTest.sol";

contract MockEVMAuthV1 is EVMAuth {
    // For testing only; in a real implementation, use a token standard like ERC-1155 or ERC-6909.
    mapping(address => mapping(uint256 => uint256)) public balances;

    /**
     * @dev Initializer used when deployed directly as an upgradeable contract.
     *
     * @param initialDelay The delay in seconds before a new default admin can exercise their role.
     * @param initialDefaultAdmin The address to be granted the initial default admin role.
     * @param initialTreasury The address where purchase revenues will be sent.
     */
    function initialize(uint48 initialDelay, address initialDefaultAdmin, address payable initialTreasury)
        public
        initializer
    {
        __MockEVMAuthV1_init(initialDelay, initialDefaultAdmin, initialTreasury);
    }

    /**
     * @dev Initializer that calls the parent initializers for upgradeable contracts.
     *
     * @param initialDelay The delay in seconds before a new default admin can exercise their role.
     * @param initialDefaultAdmin The address to be granted the initial default admin role.
     * @param initialTreasury The address where purchase revenues will be sent.
     */
    function __MockEVMAuthV1_init(uint48 initialDelay, address initialDefaultAdmin, address payable initialTreasury)
        internal
        onlyInitializing
    {
        __EVMAuth_init(initialDelay, initialDefaultAdmin, initialTreasury);
        __MockEVMAuthV1_init_unchained();
    }

    /**
     * @dev Unchained initializer that only initializes THIS contract's storage.
     */
    function __MockEVMAuthV1_init_unchained() internal onlyInitializing { }

    /// @inheritdoc TokenPurchasable
    function _mintPurchasedTokens(address to, uint256 id, uint256 amount) internal virtual override {
        balances[to][id] += amount;
    }
}

contract EVMAuthTest is BaseTestWithAccessControlAndERC20s {
    MockEVMAuthV1 internal v1;

    // =========== Test Setup ============ //

    function _deployNewImplementation() internal override returns (address) {
        return address(new MockEVMAuthV1());
    }

    function _getContractName() internal pure override returns (string memory) {
        return "EVMAuth.t.sol:MockEVMAuthV1";
    }

    function _getInitializerData() internal view override returns (bytes memory) {
        return abi.encodeCall(MockEVMAuthV1.initialize, (2 days, owner, treasury));
    }

    function _setToken(address proxyAddress) internal override {
        v1 = MockEVMAuthV1(proxyAddress);
    }

    function _grantRoles() internal override {
        v1.grantRole(UPGRADE_MANAGER_ROLE, owner);
        v1.grantRole(ACCESS_MANAGER_ROLE, accessManager);
        v1.grantRole(TOKEN_MANAGER_ROLE, tokenManager);
        v1.grantRole(MINTER_ROLE, minter);
        v1.grantRole(BURNER_ROLE, burner);
        v1.grantRole(TREASURER_ROLE, treasurer);
    }

    // ============ Tests ============= //

    function test_initialize() public view {
        assertEq(v1.nextTokenID(), 1);
        assertEq(
            keccak256(abi.encode(uint256(keccak256("tokenephemeral.storage.TokenEphemeral")) - 1))
                & ~bytes32(uint256(0xff)),
            0xec3c1253ecdf88a29ff53024f0721fc3faa1b42abcff612deb5b22d1f94e2d00
        );
    }
}
