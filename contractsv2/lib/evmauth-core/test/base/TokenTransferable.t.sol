// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import { TokenTransferable } from "src/base/TokenTransferable.sol";
import { BaseTest } from "test/_helpers/BaseTest.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract MockTokenTransferableV1 is TokenTransferable, OwnableUpgradeable, UUPSUpgradeable {
    // For testing only; in a real implementation, use a token standard like ERC-1155 or ERC-6909.
    mapping(address => mapping(uint256 => uint256)) public balances;

    /**
     * @dev Initializer used when deployed directly as an upgradeable contract.
     *
     * @param initialOwner The address to be set as the owner of the contract.
     */
    function initialize(address initialOwner) public initializer {
        __MockTokenTransferableV1_init(initialOwner);
    }

    /**
     * @dev Initializer that calls the parent initializers for upgradeable contracts.
     *
     * @param initialOwner The address to be set as the owner of the contract.
     */
    function __MockTokenTransferableV1_init(address initialOwner) internal onlyInitializing {
        __Ownable_init(initialOwner);
        __TokenTransferable_init();
        __MockTokenTransferableV1_init_unchained();
    }

    /**
     * @dev Unchained initializer that only initializes THIS contract's storage.
     */
    function __MockTokenTransferableV1_init_unchained() internal onlyInitializing { }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {
        // This will revert if the caller is not authorized.
    }
}

contract TokenTransferableTest is BaseTest {
    MockTokenTransferableV1 internal v1;

    // =========== Test Setup ============ //

    function _deployNewImplementation() internal override returns (address) {
        return address(new MockTokenTransferableV1());
    }

    function _getContractName() internal pure override returns (string memory) {
        return "TokenTransferable.t.sol:MockTokenTransferableV1";
    }

    function _getInitializerData() internal view override returns (bytes memory) {
        return abi.encodeCall(MockTokenTransferableV1.initialize, (owner));
    }

    function _setToken(address proxyAddress) internal override {
        v1 = MockTokenTransferableV1(proxyAddress);
    }

    // ============ Tests ============= //

    function test_initialize() public view {
        assertEq(v1.isTransferable(1), false);

        // Check that the storage slot for TokenTransferable is correctly calculated to avoid storage collisions.
        assertEq(
            0xdaa3d1cf82c71b982a9e24ff7dadd71a10e8c3e82a219c0e60ca5c6b8e617700,
            keccak256(abi.encode(uint256(keccak256("tokentransferable.storage.TokenTransferable")) - 1))
                & ~bytes32(uint256(0xff))
        );
    }
}
