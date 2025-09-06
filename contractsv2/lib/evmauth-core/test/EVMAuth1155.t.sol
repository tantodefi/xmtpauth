// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { EVMAuth1155 } from "src/EVMAuth1155.sol";
import { BaseTestWithAccessControlAndERC20s } from "test/_helpers/BaseTest.sol";

contract EVMAuth1155Test is BaseTestWithAccessControlAndERC20s {
    EVMAuth1155 internal v1;

    // =========== Test Setup ============ //

    function _deployNewImplementation() internal override returns (address) {
        return address(new EVMAuth1155());
    }

    function _getContractName() internal pure override returns (string memory) {
        return "EVMAuth1155.sol:EVMAuth1155";
    }

    function _getInitializerData() internal view override returns (bytes memory) {
        return abi.encodeCall(EVMAuth1155.initialize, (2 days, owner, treasury, "https://token-cdn-domain/{id}.json"));
    }

    function _setToken(address proxyAddress) internal override {
        v1 = EVMAuth1155(proxyAddress);
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
