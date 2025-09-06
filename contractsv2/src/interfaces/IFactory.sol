// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IFactory
 * @dev Interface for XMTP Auth factory contracts
 */
interface IFactory {
  /**
   * @dev Deployment configuration structure
   */
  struct DeploymentConfig {
    string groupName;
    string groupDescription;
    string groupImageUrl;
    string baseURI;
    string salesGroupId;
    string premiumGroupId;
    address botAddress;
    address treasury;
    uint48 adminDelay;
  }

  // Events
  event ContractDeployed(
    address indexed creator,
    address indexed contractAddress,
    string groupName,
    uint256 timestamp
  );

  event FeeBasisPointsUpdated(uint256 newFeeBasisPoints);

  event FeeRecipientUpdated(address indexed newFeeRecipient);

  event ExtensionDeployed(
    address indexed baseContract,
    address indexed extensionAddress,
    bytes32 indexed extensionType,
    uint256 timestamp
  );

  event FeeConfigurationUpdated(
    address indexed newFeeRecipient,
    uint256 newFeeBasisPoints
  );

  event DeploymentFeeUpdated(uint256 newDeploymentFee);

  // Core deployment functions
  function deployXMTPAuthContract(
    DeploymentConfig memory config
  ) external payable returns (address);

  function deployGroupContract(
    string memory groupName,
    string memory groupDescription,
    string memory groupImageUrl,
    string memory salesGroupId,
    string memory premiumGroupId,
    address botAddress
  ) external payable returns (address);

  function deployXMTPAuthWithMegapot(
    DeploymentConfig memory config,
    address megapotContract,
    address referrer
  ) external payable returns (address baseContract, address megapotExtension);

  function deployGroupContractWithMegapot(
    string memory groupName,
    string memory groupDescription,
    string memory groupImageUrl,
    string memory salesGroupId,
    string memory premiumGroupId,
    address botAddress,
    address megapotContract,
    address referrer
  ) external payable returns (address baseContract, address megapotExtension);

  // View functions
  function getCreatorContracts(
    address creator
  ) external view returns (address[] memory);

  function getAllContracts() external view returns (address[] memory);

  function getTotalContracts() external view returns (uint256);

  function isFactoryContract(
    address contractAddress
  ) external view returns (bool);

  function getContractCreator(
    address contractAddress
  ) external view returns (address);

  function getContractInfo(
    address contractAddress
  ) external view returns (address creator, bool isFactory);

  function getDeploymentStats()
    external
    view
    returns (
      uint256 totalContracts,
      uint256 totalFees,
      address currentFeeRecipient,
      uint256 currentFeeBasisPoints,
      address currentImplementation
    );

  // Management functions
  function updateFeeConfiguration(
    address _feeRecipient,
    uint256 _feeBasisPoints
  ) external;

  function updateDeploymentFee(uint256 _deploymentFee) external;

  function withdrawFees() external;

  // View properties
  function implementation() external view returns (address);

  function feeRecipient() external view returns (address);

  function feeBasisPoints() external view returns (uint256);

  function deploymentFee() external view returns (uint256);
}
