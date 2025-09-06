// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { TokenAccessControl } from "src/base/TokenAccessControl.sol";
import { BaseTestWithAccessControl } from "test/_helpers/BaseTest.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract MockTokenAccessControlV1 is TokenAccessControl, UUPSUpgradeable {
    /**
     * @dev Initializer used when deployed directly as an upgradeable contract.
     *
     * @param initialDelay The delay in seconds before a new default admin can exercise their role.
     * @param initialDefaultAdmin The address to be granted the initial default admin role.
     */
    function initialize(uint48 initialDelay, address initialDefaultAdmin) public initializer {
        __MockTokenAccessControlV1_init(initialDelay, initialDefaultAdmin);
    }

    /**
     * @dev Initializer that calls the parent initializers for upgradeable contracts.
     *
     * @param initialDelay The delay in seconds before a new default admin can exercise their role.
     * @param initialDefaultAdmin The address to be granted the initial default admin role.
     */
    function __MockTokenAccessControlV1_init(uint48 initialDelay, address initialDefaultAdmin)
        internal
        onlyInitializing
    {
        __TokenAccessControl_init(initialDelay, initialDefaultAdmin);
        __MockTokenAccessControlV1_init_unchained();
    }

    /**
     * @dev Unchained initializer that only initializes THIS contract's storage.
     */
    function __MockTokenAccessControlV1_init_unchained() internal onlyInitializing { }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(UPGRADE_MANAGER_ROLE) {
        // This will revert if the caller is not authorized.
    }
}

contract TokenAccessControlTest is BaseTestWithAccessControl {
    MockTokenAccessControlV1 internal v1;

    // =========== Test Setup ============ //

    function _deployNewImplementation() internal override returns (address) {
        return address(new MockTokenAccessControlV1());
    }

    function _getContractName() internal pure override returns (string memory) {
        return "TokenAccessControl.t.sol:MockTokenAccessControlV1";
    }

    function _getInitializerData() internal view override returns (bytes memory) {
        return abi.encodeCall(MockTokenAccessControlV1.initialize, (2 days, owner));
    }

    function _setToken(address proxyAddress) internal override {
        v1 = MockTokenAccessControlV1(proxyAddress);
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
        assertTrue(v1.hasRole(DEFAULT_ADMIN_ROLE, owner));
    }
}
