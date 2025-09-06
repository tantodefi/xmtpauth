// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { EVMAuth6909 } from "src/EVMAuth6909.sol";
import { BaseTestWithAccessControlAndERC20s } from "test/_helpers/BaseTest.sol";

contract EVMAuth6909Test is BaseTestWithAccessControlAndERC20s {
    EVMAuth6909 internal v1;

    // =========== Test Setup ============ //

    function _deployNewImplementation() internal override returns (address) {
        return address(new EVMAuth6909());
    }

    function _getContractName() internal pure override returns (string memory) {
        return "EVMAuth6909.sol:EVMAuth6909";
    }

    function _getInitializerData() internal view override returns (bytes memory) {
        return abi.encodeCall(
            EVMAuth6909.initialize, (2 days, owner, treasury, "https://contract-cdn-domain/contract-metadata.json")
        );
    }

    function _setToken(address proxyAddress) internal override {
        v1 = EVMAuth6909(proxyAddress);
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
    }
}
