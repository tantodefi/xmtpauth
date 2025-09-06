// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { AccountFreezable } from "src/base/AccountFreezable.sol";
import { BaseTest } from "test/_helpers/BaseTest.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract MockAccountFreezableV1 is AccountFreezable, OwnableUpgradeable, UUPSUpgradeable {
    /**
     * @dev Initializer used when deployed directly as an upgradeable contract.
     *
     * @param initialOwner The address to be set as the owner of the contract.
     */
    function initialize(address initialOwner) public initializer {
        __MockAccountFreezableV1_init(initialOwner);
    }

    /**
     * @dev Initializer that calls the parent initializers for upgradeable contracts.
     *
     * @param initialOwner The address to be set as the owner of the contract.
     */
    function __MockAccountFreezableV1_init(address initialOwner) internal onlyInitializing {
        __Ownable_init(initialOwner);
        __AccountFreezable_init();
        __MockAccountFreezableV1_init_unchained();
    }

    /**
     * @dev Unchained initializer that only initializes THIS contract's storage.
     */
    function __MockAccountFreezableV1_init_unchained() internal onlyInitializing { }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {
        // This will revert if the caller is not authorized.
    }
}

contract AccountFreezableTest is BaseTest {
    MockAccountFreezableV1 internal v1;

    // =========== Test Setup ============ //

    function _deployNewImplementation() internal override returns (address) {
        return address(new MockAccountFreezableV1());
    }

    function _getContractName() internal pure override returns (string memory) {
        return "AccountFreezable.t.sol:MockAccountFreezableV1";
    }

    function _getInitializerData() internal view override returns (bytes memory) {
        return abi.encodeCall(MockAccountFreezableV1.initialize, (owner));
    }

    function _setToken(address proxyAddress) internal override {
        v1 = MockAccountFreezableV1(proxyAddress);
    }

    // ============ Tests ============= //

    function test_initialize() public view {
        assertEq(v1.isFrozen(owner), false);

        // Check that the storage slot for AccountFreezable is correctly calculated to avoid storage collisions.
        assertEq(
            0xa095fe5a3c31691ae0832631cef3701285d36b2af1972f4c23463476b0353a00,
            keccak256(abi.encode(uint256(keccak256("accountfreezable.storage.AccountFreezable")) - 1))
                & ~bytes32(uint256(0xff))
        );
    }
}
