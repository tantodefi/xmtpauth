// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./EVMAuthGroupAccessV2.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title EVMAuthFactory
 * @dev Factory contract for deploying EVMAuth group access contracts with platform fees
 */
contract EVMAuthFactory is Ownable, ReentrancyGuard {
  // Platform configuration
  address public feeRecipient;
  uint256 public feeBasisPoints;
  uint256 public deploymentFee;

  // Contract tracking
  mapping(address => address[]) public creatorContracts; // creator => deployed contracts
  mapping(address => address) public contractCreators; // contract => creator
  address[] public allContracts;

  // Events
  event ContractDeployed(
    address indexed creator,
    address indexed contractAddress,
    string groupName,
    uint256 timestamp
  );

  event FeeConfigurationUpdated(
    address indexed newFeeRecipient,
    uint256 newFeeBasisPoints
  );

  event DeploymentFeeUpdated(uint256 newDeploymentFee);

  constructor(
    address _feeRecipient,
    uint256 _feeBasisPoints,
    address _initialOwner
  ) Ownable() {
    require(_feeRecipient != address(0), "Invalid fee recipient");
    require(_feeBasisPoints <= 1000, "Fee basis points too high"); // Max 10%

    feeRecipient = _feeRecipient;
    feeBasisPoints = _feeBasisPoints;
    deploymentFee = 0; // Free deployment initially

    // Transfer ownership if different from deployer
    if (_initialOwner != msg.sender) {
      _transferOwnership(_initialOwner);
    }
  }

  /**
   * @dev Deploy a new EVMAuth group access contract
   */
  function deployGroupContract(
    string memory groupName,
    string memory groupDescription,
    string memory groupImageUrl,
    string memory salesGroupId,
    string memory premiumGroupId,
    address botAddress
  ) external payable nonReentrant returns (address) {
    require(msg.value >= deploymentFee, "Insufficient deployment fee");
    require(bytes(groupName).length > 0, "Group name cannot be empty");
    require(botAddress != address(0), "Invalid bot address");

    // Deploy new contract
    EVMAuthGroupAccessV2 newContract = new EVMAuthGroupAccessV2(
      address(this), // factory
      groupName,
      groupDescription,
      groupImageUrl,
      salesGroupId,
      premiumGroupId,
      botAddress,
      msg.sender // owner (creator)
    );

    address contractAddress = address(newContract);

    // Update tracking
    creatorContracts[msg.sender].push(contractAddress);
    contractCreators[contractAddress] = msg.sender;
    allContracts.push(contractAddress);

    // Handle deployment fee
    if (deploymentFee > 0 && feeRecipient != address(0)) {
      payable(feeRecipient).transfer(deploymentFee);
    }

    // Refund excess payment
    if (msg.value > deploymentFee) {
      payable(msg.sender).transfer(msg.value - deploymentFee);
    }

    emit ContractDeployed(msg.sender, contractAddress, groupName, block.timestamp);

    return contractAddress;
  }

  /**
   * @dev Get contracts deployed by a creator
   */
  function getCreatorContracts(address creator) external view returns (address[] memory) {
    return creatorContracts[creator];
  }

  /**
   * @dev Get all deployed contracts
   */
  function getAllContracts() external view returns (address[] memory) {
    return allContracts;
  }

  /**
   * @dev Get total number of deployed contracts
   */
  function getTotalContracts() external view returns (uint256) {
    return allContracts.length;
  }

  /**
   * @dev Update platform fee configuration (owner only)
   */
  function updateFeeConfiguration(
    address _feeRecipient,
    uint256 _feeBasisPoints
  ) external onlyOwner {
    require(_feeRecipient != address(0), "Invalid fee recipient");
    require(_feeBasisPoints <= 1000, "Fee basis points too high"); // Max 10%

    feeRecipient = _feeRecipient;
    feeBasisPoints = _feeBasisPoints;

    emit FeeConfigurationUpdated(_feeRecipient, _feeBasisPoints);
  }

  /**
   * @dev Update deployment fee (owner only)
   */
  function updateDeploymentFee(uint256 _deploymentFee) external onlyOwner {
    deploymentFee = _deploymentFee;
    emit DeploymentFeeUpdated(_deploymentFee);
  }

  /**
   * @dev Withdraw accumulated fees (owner only)
   */
  function withdrawFees() external onlyOwner {
    uint256 balance = address(this).balance;
    require(balance > 0, "No fees to withdraw");
    
    payable(owner()).transfer(balance);
  }

  /**
   * @dev Check if a contract was deployed by this factory
   */
  function isFactoryContract(address contractAddress) external view returns (bool) {
    return contractCreators[contractAddress] != address(0);
  }

  /**
   * @dev Get contract creator
   */
  function getContractCreator(address contractAddress) external view returns (address) {
    return contractCreators[contractAddress];
  }

  /**
   * @dev Emergency function to disable a contract (if needed)
   */
  function emergencyDisableContract(address contractAddress) external onlyOwner {
    require(this.isFactoryContract(contractAddress), "Not a factory contract");
    
    // Call toggle function on the target contract
    EVMAuthGroupAccessV2(contractAddress).toggleXMTPIntegration();
  }

  /**
   * @dev Get deployment statistics
   */
  function getDeploymentStats() external view returns (
    uint256 totalContracts,
    uint256 totalFees,
    address currentFeeRecipient,
    uint256 currentFeeBasisPoints
  ) {
    totalContracts = allContracts.length;
    totalFees = address(this).balance;
    currentFeeRecipient = feeRecipient;
    currentFeeBasisPoints = feeBasisPoints;
  }
}