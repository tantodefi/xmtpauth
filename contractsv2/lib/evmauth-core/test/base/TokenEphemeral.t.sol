// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { TokenEphemeral } from "src/base/TokenEphemeral.sol";
import { BaseTest } from "test/_helpers/BaseTest.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract MockTokenEphemeralV1 is TokenEphemeral, OwnableUpgradeable, UUPSUpgradeable {
    // For testing only; in a real implementation, use a token standard like ERC-1155 or ERC-6909.
    mapping(address => mapping(uint256 => uint256)) public balances;

    /**
     * @dev Initializer used when deployed directly as an upgradeable contract.
     *
     * @param initialOwner The address to be set as the owner of the contract.
     */
    function initialize(address initialOwner) public initializer {
        __MockTokenEphemeralV1_init(initialOwner);
    }

    /**
     * @dev Initializer that calls the parent initializers for upgradeable contracts.
     *
     * @param initialOwner The address to be set as the owner of the contract.
     */
    function __MockTokenEphemeralV1_init(address initialOwner) internal onlyInitializing {
        __Ownable_init(initialOwner);
        __TokenEphemeral_init();
        __MockTokenEphemeralV1_init_unchained();
    }

    /**
     * @dev Unchained initializer that only initializes THIS contract's storage.
     */
    function __MockTokenEphemeralV1_init_unchained() internal onlyInitializing { }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {
        // This will revert if the caller is not authorized.
    }
}

contract TokenEphemeralTest is BaseTest {
    MockTokenEphemeralV1 internal v1;

    // =========== Test Setup ============ //

    function _deployNewImplementation() internal override returns (address) {
        return address(new MockTokenEphemeralV1());
    }

    function _getContractName() internal pure override returns (string memory) {
        return "TokenEphemeral.t.sol:MockTokenEphemeralV1";
    }

    function _getInitializerData() internal view override returns (bytes memory) {
        return abi.encodeCall(MockTokenEphemeralV1.initialize, (owner));
    }

    function _setToken(address proxyAddress) internal override {
        v1 = MockTokenEphemeralV1(proxyAddress);
    }

    // ============ Tests ============= //

    function test_initialize() public view {
        assertEq(v1.tokenTTL(1), 0);

        // Check that the storage slot for TokenEphemeral is correctly calculated to avoid storage collisions.
        assertEq(
            0xec3c1253ecdf88a29ff53024f0721fc3faa1b42abcff612deb5b22d1f94e2d00,
            keccak256(abi.encode(uint256(keccak256("tokenephemeral.storage.TokenEphemeral")) - 1))
                & ~bytes32(uint256(0xff))
        );
    }
}
