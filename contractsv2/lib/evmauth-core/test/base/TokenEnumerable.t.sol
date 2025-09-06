// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { TokenEnumerable } from "src/base/TokenEnumerable.sol";
import { BaseTest } from "test/_helpers/BaseTest.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract MockTokenEnumerableV1 is TokenEnumerable, OwnableUpgradeable, UUPSUpgradeable {
    /**
     * @dev Initializer used when deployed directly as an upgradeable contract.
     *
     * @param initialOwner The address to be set as the owner of the contract.
     */
    function initialize(address initialOwner) public initializer {
        __MockTokenEnumerableV1_init(initialOwner);
    }

    /**
     * @dev Initializer that calls the parent initializers for upgradeable contracts.
     *
     * @param initialOwner The address to be set as the owner of the contract.
     */
    function __MockTokenEnumerableV1_init(address initialOwner) internal onlyInitializing {
        __Ownable_init(initialOwner);
        __TokenEnumerable_init();
        __MockTokenEnumerableV1_init_unchained();
    }

    /**
     * @dev Unchained initializer that only initializes THIS contract's storage.
     */
    function __MockTokenEnumerableV1_init_unchained() internal onlyInitializing { }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {
        // This will revert if the caller is not authorized.
    }
}

contract TokenEnumerableTest is BaseTest {
    MockTokenEnumerableV1 internal v1;

    // =========== Test Setup ============ //

    function _deployNewImplementation() internal override returns (address) {
        return address(new MockTokenEnumerableV1());
    }

    function _getContractName() internal pure override returns (string memory) {
        return "TokenEnumerable.t.sol:MockTokenEnumerableV1";
    }

    function _getInitializerData() internal view override returns (bytes memory) {
        return abi.encodeCall(MockTokenEnumerableV1.initialize, (owner));
    }

    function _setToken(address proxyAddress) internal override {
        v1 = MockTokenEnumerableV1(proxyAddress);
    }

    // ============ Tests ============= //

    function test_initialize() public view {
        assertFalse(v1.exists(1));

        // Check that the storage slot for TokenEnumerable is correctly calculated to avoid storage collisions.
        assertEq(
            0x591f2d2df77efc80b9969dfd51dd4fc103fe490745902503f7c21df07a35d600,
            keccak256(abi.encode(uint256(keccak256("tokenenumerable.storage.TokenEnumerable")) - 1))
                & ~bytes32(uint256(0xff))
        );
    }
}
