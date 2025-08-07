// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./EVMAuthV2.sol";
import "./extensions/XMTPGroupExtension.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EVMAuthFactoryV2
 * @dev Enhanced factory contract for deploying EVMAuth contracts with extension support
 * Supports plugin-style extensions for modular functionality
 */
contract EVMAuthFactoryV2 is Ownable, ReentrancyGuard {
  // Platform configuration
  address public feeRecipient;
  uint256 public feeBasisPoints;
  uint256 public deploymentFee;

  // Extension registry
  struct ExtensionTemplate {
    string name;
    string version;
    address implementation;
    bool isActive;
    uint256 registeredAt;
  }

  mapping(bytes32 => ExtensionTemplate) public extensionTemplates;
  bytes32[] public registeredExtensions;

  // Contract tracking
  mapping(address => address[]) public creatorContracts; // creator => deployed contracts
  mapping(address => address) public contractCreators; // contract => creator
  mapping(address => address[]) public contractExtensions; // contract => extensions
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
    bytes32 indexed extensionType,
    uint256 timestamp
  );

  event ExtensionTemplateRegistered(
    bytes32 indexed extensionType,
    address indexed implementation,
    string name,
    string version
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
  ) Ownable(_initialOwner) {
    require(_feeRecipient != address(0), "Invalid fee recipient");
    require(_feeBasisPoints <= 1000, "Fee basis points too high"); // Max 10%

    feeRecipient = _feeRecipient;
    feeBasisPoints = _feeBasisPoints;
    deploymentFee = 0; // Free deployment initially

    // Ownership is already set in constructor
  }

  /**
   * @dev Register an extension template
   */
  function registerExtensionTemplate(
    bytes32 extensionType,
    address implementation,
    string memory name,
    string memory version
  ) external onlyOwner {
    require(implementation != address(0), "Invalid implementation");
    require(bytes(name).length > 0, "Name required");
    require(bytes(version).length > 0, "Version required");

    // Check if this is a new extension type
    bool isNewExtension = extensionTemplates[extensionType].implementation ==
      address(0);

    extensionTemplates[extensionType] = ExtensionTemplate({
      name: name,
      version: version,
      implementation: implementation,
      isActive: true,
      registeredAt: block.timestamp
    });

    // Add to registered extensions list if new
    if (isNewExtension) {
      registeredExtensions.push(extensionType);
    }

    emit ExtensionTemplateRegistered(
      extensionType,
      implementation,
      name,
      version
    );
  }

  /**
   * @dev Deploy a new EVMAuth contract
   */
  function deployEVMAuthContract(
    string memory name,
    string memory version,
    string memory uri,
    uint48 delay
  ) external payable nonReentrant returns (address) {
    require(msg.value >= deploymentFee, "Insufficient deployment fee");
    require(bytes(name).length > 0, "Name cannot be empty");

    // Deploy new contract
    EVMAuthV2 newContract = new EVMAuthV2(
      name,
      version,
      uri,
      delay,
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

    emit ContractDeployed(msg.sender, contractAddress, name, block.timestamp);

    return contractAddress;
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
    contractExtensions[baseContract].push(xmtpExtension);
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
    emit ExtensionDeployed(
      baseContract,
      xmtpExtension,
      xmtpExtensionId,
      block.timestamp
    );

    return (baseContract, xmtpExtension);
  }

  /**
   * @dev Deploy an extension for an existing contract
   */
  function deployExtension(
    address baseContract,
    bytes32 extensionType,
    bytes memory constructorData
  ) external nonReentrant returns (address) {
    require(
      contractCreators[baseContract] == msg.sender,
      "Not contract creator"
    );

    ExtensionTemplate memory template = extensionTemplates[extensionType];
    require(template.implementation != address(0), "Extension not found");
    require(template.isActive, "Extension not active");

    // For now, we only support XMTP extension deployment
    // In a more advanced system, this would use a factory pattern or clone library
    require(
      extensionType == keccak256("XMTP_GROUP_EXTENSION"),
      "Unsupported extension type"
    );

    // Decode constructor data for XMTP extension
    (
      string memory salesGroupId,
      string memory premiumGroupId,
      address botAddress
    ) = abi.decode(constructorData, (string, string, address));

    // Deploy XMTP extension
    XMTPGroupExtension extension = new XMTPGroupExtension(
      baseContract,
      salesGroupId,
      premiumGroupId,
      botAddress,
      msg.sender
    );

    address extensionAddress = address(extension);

    // Register the extension with the base contract
    EVMAuthV2(baseContract).registerExtension(extensionType, extensionAddress);

    // Update tracking
    contractExtensions[baseContract].push(extensionAddress);

    emit ExtensionDeployed(
      baseContract,
      extensionAddress,
      extensionType,
      block.timestamp
    );

    return extensionAddress;
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
   * @dev Get extensions for a contract
   */
  function getContractExtensions(
    address contractAddress
  ) external view returns (address[] memory) {
    return contractExtensions[contractAddress];
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
   * @dev Get all registered extension types
   */
  function getRegisteredExtensions() external view returns (bytes32[] memory) {
    return registeredExtensions;
  }

  /**
   * @dev Get extension template info
   */
  function getExtensionTemplate(
    bytes32 extensionType
  ) external view returns (ExtensionTemplate memory) {
    return extensionTemplates[extensionType];
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
   * @dev Emergency function to disable an extension template
   */
  function disableExtensionTemplate(bytes32 extensionType) external onlyOwner {
    require(
      extensionTemplates[extensionType].implementation != address(0),
      "Extension not found"
    );
    extensionTemplates[extensionType].isActive = false;
  }

  /**
   * @dev Get deployment statistics
   */
  function getDeploymentStats()
    external
    view
    returns (
      uint256 totalContracts,
      uint256 totalExtensions,
      uint256 totalFees,
      address currentFeeRecipient,
      uint256 currentFeeBasisPoints
    )
  {
    totalContracts = allContracts.length;
    totalExtensions = registeredExtensions.length;
    totalFees = address(this).balance;
    currentFeeRecipient = feeRecipient;
    currentFeeBasisPoints = feeBasisPoints;
  }

  /**
   * @dev Get contract info including extensions
   */
  function getContractInfo(
    address contractAddress
  )
    external
    view
    returns (address creator, address[] memory extensions, bool isFactory)
  {
    creator = contractCreators[contractAddress];
    extensions = contractExtensions[contractAddress];
    isFactory = creator != address(0);
  }
}
