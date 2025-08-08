// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./EVMAuthV2.sol";
import "./extensions/XMTPGroupExtension.sol";
import "./extensions/MegapotExtension.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SimpleFactoryV2
 * @dev Simplified factory contract for deploying EVMAuth V2 systems
 * Focuses on core functionality to stay within contract size limits
 */
contract SimpleFactoryV2 is Ownable, ReentrancyGuard {
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
    string name,
    uint256 timestamp
  );

  event ExtensionDeployed(
    address indexed baseContract,
    address indexed extensionAddress,
    uint256 timestamp
  );

  event FeeConfigurationUpdated(
    address indexed newFeeRecipient,
    uint256 newFeeBasisPoints
  );

  constructor(
    address _feeRecipient,
    uint256 _feeBasisPoints,
    address _initialOwner
  ) Ownable(_initialOwner) {
    require(_feeRecipient != address(0), "Invalid fee recipient");
    require(_feeBasisPoints <= 1000, "Fee basis points too high"); // Max 10%

    feeRecipient = _feeRecipient;
    feeBasisPoints = _feeBasisPoints;
    deploymentFee = 0; // Free deployment initially
  }

  /**
   * @dev Deploy a complete EVMAuth system with XMTP extension
   */
  function deployEVMAuthWithXMTP(
    string memory name,
    string memory version,
    string memory uri,
    uint48 delay,
    string memory salesGroupId,
    string memory premiumGroupId,
    address botAddress
  )
    external
    payable
    nonReentrant
    returns (address baseContract, address xmtpExtension)
  {
    require(msg.value >= deploymentFee, "Insufficient deployment fee");
    require(bytes(name).length > 0, "Name cannot be empty");
    require(botAddress != address(0), "Invalid bot address");

    // Deploy base EVMAuth contract
    EVMAuthV2 newContract = new EVMAuthV2(
      name,
      version,
      uri,
      delay,
      msg.sender // owner (creator)
    );

    baseContract = address(newContract);

    // Deploy XMTP extension
    XMTPGroupExtension xmtpExt = new XMTPGroupExtension(
      baseContract,
      salesGroupId,
      premiumGroupId,
      botAddress,
      msg.sender // owner
    );

    xmtpExtension = address(xmtpExt);

    // Register the extension with the base contract
    bytes32 xmtpExtensionId = keccak256("XMTP_GROUP_EXTENSION");
    newContract.registerExtension(xmtpExtensionId, xmtpExtension);

    // Update tracking
    creatorContracts[msg.sender].push(baseContract);
    contractCreators[baseContract] = msg.sender;
    allContracts.push(baseContract);

    // Handle deployment fee
    if (deploymentFee > 0 && feeRecipient != address(0)) {
      payable(feeRecipient).transfer(deploymentFee);
    }

    // Refund excess payment
    if (msg.value > deploymentFee) {
      payable(msg.sender).transfer(msg.value - deploymentFee);
    }

    emit ContractDeployed(msg.sender, baseContract, name, block.timestamp);
    emit ExtensionDeployed(baseContract, xmtpExtension, block.timestamp);

    return (baseContract, xmtpExtension);
  }

  /**
   * @dev Deploy EVMAuth with Megapot extension for gamified token purchases
   */
  function deployEVMAuthWithMegapot(
    string memory name,
    string memory version,
    string memory uri,
    uint48 delay,
    address megapotContract,
    address referrer
  )
    external
    payable
    nonReentrant
    returns (address baseContract, address megapotExtension)
  {
    require(msg.value >= deploymentFee, "Insufficient deployment fee");
    require(bytes(name).length > 0, "Name cannot be empty");
    require(megapotContract != address(0), "Invalid Megapot contract");

    // Deploy base EVMAuth contract
    EVMAuthV2 newContract = new EVMAuthV2(
      name,
      version,
      uri,
      delay,
      msg.sender // owner (creator)
    );

    baseContract = address(newContract);

    // Deploy Megapot extension
    MegapotExtension megapotExt = new MegapotExtension(
      baseContract,
      megapotContract,
      referrer,
      msg.sender // owner
    );

    megapotExtension = address(megapotExt);

    // Register the extension with the base contract
    bytes32 megapotExtensionId = keccak256("MEGAPOT_EXTENSION");
    newContract.registerExtension(megapotExtensionId, megapotExtension);

    // Update tracking
    creatorContracts[msg.sender].push(baseContract);
    contractCreators[baseContract] = msg.sender;
    allContracts.push(baseContract);

    // Handle deployment fee
    if (deploymentFee > 0 && feeRecipient != address(0)) {
      payable(feeRecipient).transfer(deploymentFee);
    }

    // Refund excess payment
    if (msg.value > deploymentFee) {
      payable(msg.sender).transfer(msg.value - deploymentFee);
    }

    emit ContractDeployed(msg.sender, baseContract, name, block.timestamp);
    emit ExtensionDeployed(baseContract, megapotExtension, block.timestamp);

    return (baseContract, megapotExtension);
  }

  /**
   * @dev Deploy complete gamified system with both XMTP and Megapot extensions
   */
  function deployFullGamifiedSystem(
    string memory name,
    string memory version,
    string memory uri,
    uint48 delay,
    string memory salesGroupId,
    string memory premiumGroupId,
    address botAddress,
    address megapotContract,
    address referrer
  )
    external
    payable
    nonReentrant
    returns (
      address baseContract,
      address xmtpExtension,
      address megapotExtension
    )
  {
    require(msg.value >= deploymentFee, "Insufficient deployment fee");
    require(bytes(name).length > 0, "Name cannot be empty");
    require(botAddress != address(0), "Invalid bot address");
    require(megapotContract != address(0), "Invalid Megapot contract");

    // Deploy base EVMAuth contract
    EVMAuthV2 newContract = new EVMAuthV2(
      name,
      version,
      uri,
      delay,
      msg.sender // owner (creator)
    );

    baseContract = address(newContract);

    // Deploy XMTP extension
    XMTPGroupExtension xmtpExt = new XMTPGroupExtension(
      baseContract,
      salesGroupId,
      premiumGroupId,
      botAddress,
      msg.sender // owner
    );

    xmtpExtension = address(xmtpExt);

    // Deploy Megapot extension
    MegapotExtension megapotExt = new MegapotExtension(
      baseContract,
      megapotContract,
      referrer,
      msg.sender // owner
    );

    megapotExtension = address(megapotExt);

    // Register both extensions with the base contract
    bytes32 xmtpExtensionId = keccak256("XMTP_GROUP_EXTENSION");
    bytes32 megapotExtensionId = keccak256("MEGAPOT_EXTENSION");

    newContract.registerExtension(xmtpExtensionId, xmtpExtension);
    newContract.registerExtension(megapotExtensionId, megapotExtension);

    // Update tracking
    creatorContracts[msg.sender].push(baseContract);
    contractCreators[baseContract] = msg.sender;
    allContracts.push(baseContract);

    // Handle deployment fee
    if (deploymentFee > 0 && feeRecipient != address(0)) {
      payable(feeRecipient).transfer(deploymentFee);
    }

    // Refund excess payment
    if (msg.value > deploymentFee) {
      payable(msg.sender).transfer(msg.value - deploymentFee);
    }

    emit ContractDeployed(msg.sender, baseContract, name, block.timestamp);
    emit ExtensionDeployed(baseContract, xmtpExtension, block.timestamp);
    emit ExtensionDeployed(baseContract, megapotExtension, block.timestamp);

    return (baseContract, xmtpExtension, megapotExtension);
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
}
