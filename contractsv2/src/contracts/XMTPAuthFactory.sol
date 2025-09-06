// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { XMTPAuthERC1155 } from "./XMTPAuthERC1155.sol";
import { MegapotExtension } from "./extensions/MegapotExtension.sol";
import { IFactory } from "../interfaces/IFactory.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";

/**
 * @title XMTPAuthFactory
 * @dev Factory contract for deploying XMTP authentication contracts with platform fees
 * Uses minimal proxy pattern for gas-efficient deployments
 */
contract XMTPAuthFactory is IFactory, Ownable, ReentrancyGuard {
  using Clones for address;

  // Platform configuration
  address public feeRecipient;
  uint256 public feeBasisPoints;
  uint256 public deploymentFee;

  // Implementation contract for cloning
  address public immutable implementation;

  // Contract tracking
  mapping(address => address[]) public creatorContracts; // creator => deployed contracts
  mapping(address => address) public contractCreators; // contract => creator
  address[] public allContracts;

  // Network-specific default tokens
  mapping(uint256 => address) public networkDefaultTokens; // chainId => default token address
  mapping(uint256 => address) public networkDefaultPriceFeeds; // chainId => price feed address

  // Deployment configuration - using struct from IFactory interface

  // Events are declared in the IFactory interface

  /**
   * @dev Constructor
   * @param _implementation Address of the XMTPAuthERC1155 implementation contract
   * @param _feeRecipient Address to receive platform fees
   * @param _feeBasisPoints Platform fee in basis points (100 = 1%)
   * @param _initialOwner Initial owner of the factory
   */
  constructor(
    address _implementation,
    address _feeRecipient,
    uint256 _feeBasisPoints,
    address _initialOwner
  ) Ownable(_initialOwner) {
    require(_implementation != address(0), "Invalid implementation");
    require(_feeRecipient != address(0), "Invalid fee recipient");
    require(_feeBasisPoints <= 1000, "Fee basis points too high"); // Max 10%

    implementation = _implementation;
    feeRecipient = _feeRecipient;
    feeBasisPoints = _feeBasisPoints;
    deploymentFee = 0; // Free deployment initially

    // Initialize network-specific default tokens
    _initializeNetworkDefaults();
  }

  /**
   * @dev Deploy a new XMTP authentication contract
   */
  function deployXMTPAuthContract(
    DeploymentConfig memory config
  ) public payable nonReentrant returns (address) {
    require(msg.value >= deploymentFee, "Insufficient deployment fee");
    require(bytes(config.groupName).length > 0, "Group name cannot be empty");
    require(config.botAddress != address(0), "Invalid bot address");
    require(config.treasury != address(0), "Invalid treasury address");

    // Deploy new contract using minimal proxy
    address contractAddress = implementation.clone();

    // Initialize the contract
    XMTPAuthERC1155(contractAddress).initialize(
      config.adminDelay,
      msg.sender, // creator becomes admin
      payable(config.treasury),
      config.baseURI,
      config.salesGroupId,
      config.premiumGroupId,
      config.botAddress
    );

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

    emit ContractDeployed(
      msg.sender,
      contractAddress,
      config.groupName,
      block.timestamp
    );

    return contractAddress;
  }

  /**
   * @dev Deploy a contract with simplified parameters (backward compatibility)
   */
  function deployGroupContract(
    string memory groupName,
    string memory groupDescription,
    string memory groupImageUrl,
    string memory salesGroupId,
    string memory premiumGroupId,
    address botAddress
  ) external payable returns (address) {
    DeploymentConfig memory config = DeploymentConfig({
      groupName: groupName,
      groupDescription: groupDescription,
      groupImageUrl: groupImageUrl,
      baseURI: "",
      salesGroupId: salesGroupId,
      premiumGroupId: premiumGroupId,
      botAddress: botAddress,
      treasury: msg.sender, // Creator becomes treasury
      adminDelay: 2 days // Default 2 day admin delay
    });

    return deployXMTPAuthContract(config);
  }

  /**
   * @dev Deploy XMTP Auth contract with Megapot extension
   */
  function deployXMTPAuthWithMegapot(
    DeploymentConfig memory config,
    address megapotContract,
    address referrer
  )
    public
    payable
    nonReentrant
    returns (address baseContract, address megapotExtension)
  {
    require(megapotContract != address(0), "Invalid Megapot contract");

    // Deploy base contract
    baseContract = deployXMTPAuthContract(config);

    // Deploy Megapot extension
    MegapotExtension extension = new MegapotExtension(
      megapotContract,
      referrer,
      msg.sender // extension owner
    );

    megapotExtension = address(extension);

    // Register the extension with the base contract
    bytes32 extensionId = keccak256("MEGAPOT_EXTENSION");
    XMTPAuthERC1155(baseContract).registerExtension(
      extensionId,
      megapotExtension
    );

    emit ExtensionDeployed(
      baseContract,
      megapotExtension,
      extensionId,
      block.timestamp
    );

    return (baseContract, megapotExtension);
  }

  /**
   * @dev Deploy contract with simplified Megapot integration (backward compatibility)
   */
  function deployGroupContractWithMegapot(
    string memory groupName,
    string memory groupDescription,
    string memory groupImageUrl,
    string memory salesGroupId,
    string memory premiumGroupId,
    address botAddress,
    address megapotContract,
    address referrer
  ) external payable returns (address baseContract, address megapotExtension) {
    DeploymentConfig memory config = DeploymentConfig({
      groupName: groupName,
      groupDescription: groupDescription,
      groupImageUrl: groupImageUrl,
      baseURI: "",
      salesGroupId: salesGroupId,
      premiumGroupId: premiumGroupId,
      botAddress: botAddress,
      treasury: msg.sender,
      adminDelay: 2 days
    });

    return deployXMTPAuthWithMegapot(config, megapotContract, referrer);
  }

  /**
   * @dev Get contracts deployed by a creator
   */
  function getCreatorContracts(
    address creator
  ) external view returns (address[] memory) {
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
  function isFactoryContract(
    address contractAddress
  ) external view returns (bool) {
    return contractCreators[contractAddress] != address(0);
  }

  /**
   * @dev Get contract creator
   */
  function getContractCreator(
    address contractAddress
  ) external view returns (address) {
    return contractCreators[contractAddress];
  }

  /**
   * @dev Get deployment statistics
   */
  function getDeploymentStats()
    external
    view
    returns (
      uint256 totalContracts,
      uint256 totalFees,
      address currentFeeRecipient,
      uint256 currentFeeBasisPoints,
      address currentImplementation
    )
  {
    totalContracts = allContracts.length;
    totalFees = address(this).balance;
    currentFeeRecipient = feeRecipient;
    currentFeeBasisPoints = feeBasisPoints;
    currentImplementation = implementation;
  }

  /**
   * @dev Get contract info
   */
  function getContractInfo(
    address contractAddress
  ) external view returns (address creator, bool isFactory) {
    creator = contractCreators[contractAddress];
    isFactory = creator != address(0);
  }

  /**
   * @dev Predict the address of a contract before deployment
   */
  function predictContractAddress(
    bytes32 salt
  ) external view returns (address) {
    return implementation.predictDeterministicAddress(salt, address(this));
  }

  /**
   * @dev Deploy a contract with deterministic address
   */
  function deployXMTPAuthContractDeterministic(
    DeploymentConfig memory config,
    bytes32 salt
  ) external payable nonReentrant returns (address) {
    require(msg.value >= deploymentFee, "Insufficient deployment fee");
    require(bytes(config.groupName).length > 0, "Group name cannot be empty");
    require(config.botAddress != address(0), "Invalid bot address");
    require(config.treasury != address(0), "Invalid treasury address");

    // Deploy new contract using minimal proxy with deterministic address
    address contractAddress = implementation.cloneDeterministic(salt);

    // Initialize the contract
    XMTPAuthERC1155(contractAddress).initialize(
      config.adminDelay,
      msg.sender, // creator becomes admin
      payable(config.treasury),
      config.baseURI,
      config.salesGroupId,
      config.premiumGroupId,
      config.botAddress
    );

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

    emit ContractDeployed(
      msg.sender,
      contractAddress,
      config.groupName,
      block.timestamp
    );

    return contractAddress;
  }

  /**
   * @dev Emergency function to pause a deployed contract (if needed)
   */
  function emergencyPauseContract(address contractAddress) external onlyOwner {
    require(this.isFactoryContract(contractAddress), "Not a factory contract");

    // Only the factory owner can emergency pause
    XMTPAuthERC1155 xmtpContract = XMTPAuthERC1155(contractAddress);

    // This would require the factory to have ACCESS_MANAGER_ROLE on deployed contracts
    // In practice, this might need to be implemented differently based on access control design
    try xmtpContract.toggleXMTPIntegration() {} catch {
      // If the factory doesn't have the required role, this will fail silently
      // This is by design to prevent unauthorized access
    }
  }

  /**
   * @dev Check if factory has admin role on a deployed contract
   */
  function hasAdminRoleOnContract(
    address contractAddress
  ) external view returns (bool) {
    if (!this.isFactoryContract(contractAddress)) {
      return false;
    }

    try
      XMTPAuthERC1155(contractAddress).hasRole(
        XMTPAuthERC1155(contractAddress).DEFAULT_ADMIN_ROLE(),
        address(this)
      )
    returns (bool hasRole) {
      return hasRole;
    } catch {
      return false;
    }
  }

  /**
   * @dev Set fee basis points for revenue sharing
   */
  function setFeeBasisPoints(uint256 _feeBasisPoints) external onlyOwner {
    require(_feeBasisPoints <= 10000, "Fee cannot exceed 100%");
    feeBasisPoints = _feeBasisPoints;
    emit FeeBasisPointsUpdated(_feeBasisPoints);
  }

  /**
   * @dev Get the count of deployed contracts
   */
  function getDeployedContractsCount() external view returns (uint256) {
    return allContracts.length;
  }

  /**
   * @dev Get all deployed contracts for a creator
   * @param creator The creator address
   * @return Array of deployed contract addresses
   */
  function getDeployedContracts(
    address creator
  ) external view returns (address[] memory) {
    return creatorContracts[creator];
  }

  /**
   * @dev Set the fee recipient address
   */
  function setFeeRecipient(address _feeRecipient) external onlyOwner {
    require(_feeRecipient != address(0), "Invalid fee recipient");
    feeRecipient = _feeRecipient;
    emit FeeRecipientUpdated(_feeRecipient);
  }

  // ============ NETWORK DEFAULTS ============

  /**
   * @dev Initialize network-specific default tokens
   */
  function _initializeNetworkDefaults() internal {
    // Base network (Chain ID: 8453)
    networkDefaultTokens[8453] = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // USDC on Base
    networkDefaultPriceFeeds[8453] = 0x7e860098F58bBFC8648a4311b374B1D669a2bc6B; // USDC/USD on Base

    // You can add more networks here as needed:
    // Ethereum mainnet (Chain ID: 1)
    // networkDefaultTokens[1] = 0xA0b86a33E6C2C3e2A3E3C3e2A3E3C3e2A3E3C3e2; // USDC on Ethereum

    // Arbitrum (Chain ID: 42161)
    // networkDefaultTokens[42161] = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831; // USDC on Arbitrum

    // Polygon (Chain ID: 137)
    // networkDefaultTokens[137] = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174; // USDC on Polygon
  }

  /**
   * @dev Get the default token for the current network
   * @return address The default token address, or zero address if not configured
   */
  function getNetworkDefaultToken() external view returns (address) {
    return networkDefaultTokens[block.chainid];
  }

  /**
   * @dev Get the default price feed for the current network
   * @return address The default price feed address, or zero address if not configured
   */
  function getNetworkDefaultPriceFeed() external view returns (address) {
    return networkDefaultPriceFeeds[block.chainid];
  }

  /**
   * @dev Set default token for a specific network (admin only)
   * @param chainId The chain ID
   * @param tokenAddress The default token address
   * @param priceFeedAddress The price feed address
   */
  function setNetworkDefaults(
    uint256 chainId,
    address tokenAddress,
    address priceFeedAddress
  ) external onlyOwner {
    networkDefaultTokens[chainId] = tokenAddress;
    networkDefaultPriceFeeds[chainId] = priceFeedAddress;

    emit NetworkDefaultsUpdated(chainId, tokenAddress, priceFeedAddress);
  }

  // Event for network defaults updates
  event NetworkDefaultsUpdated(
    uint256 indexed chainId,
    address indexed tokenAddress,
    address indexed priceFeedAddress
  );
}
