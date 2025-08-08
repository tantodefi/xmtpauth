// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../EVMAuthV2.sol";

// Megapot contract interface
interface IMegapot {
  function purchaseTickets(
    address referrer,
    uint256 value,
    address recipient
  ) external returns (bool);

  function ticketPrice() external view returns (uint256);
  function token() external view returns (address);
  function allowPurchasing() external view returns (bool);
}

/**
 * @title MegapotExtension
 * @dev Extension that automatically purchases Megapot tickets when users buy EVMAuth tokens
 * Creates a gamified experience where token purchases also enter users into jackpots
 */
contract MegapotExtension is Ownable, ReentrancyGuard {
  // Core EVMAuth contract this extension is attached to
  EVMAuthV2 public immutable evmAuth;

  // Megapot integration
  IMegapot public megapot;
  IERC20 public megapotToken; // Usually USDC
  address public referrer; // Optional referrer for Megapot fees

  // Configuration
  struct MegapotConfig {
    bool isActive; // Whether auto-ticket purchasing is active
    uint256 ticketsPerPurchase; // Number of tickets to buy per EVMAuth purchase
    uint256 minPurchaseForTicket; // Minimum EVMAuth purchase amount to trigger ticket
    bool useTokenValue; // If true, buy tickets proportional to token value
    uint256 maxTicketsPerPurchase; // Maximum tickets per single purchase
    uint256 linkedAt; // When Megapot was linked
  }

  MegapotConfig public config;

  // Tracking
  mapping(address => uint256) public userTicketsPurchased; // User => total tickets bought
  mapping(address => uint256) public userTokenPurchases; // User => total token purchases
  uint256 public totalTicketsPurchased; // Total tickets bought through this extension
  uint256 public totalTokensSold; // Total EVMAuth tokens sold

  // Events
  event MegapotLinked(
    address indexed megapotContract,
    address indexed token,
    uint256 ticketPrice,
    uint256 timestamp
  );

  event AutoTicketPurchased(
    address indexed user,
    uint256 indexed tokenId,
    uint256 tokenAmount,
    uint256 ticketsBought,
    uint256 timestamp
  );

  event ConfigurationUpdated(
    bool isActive,
    uint256 ticketsPerPurchase,
    uint256 minPurchaseForTicket,
    bool useTokenValue,
    uint256 maxTicketsPerPurchase
  );

  event ReferrerUpdated(
    address indexed oldReferrer,
    address indexed newReferrer
  );

  event MegapotTokensDeposited(address indexed depositor, uint256 amount);
  event MegapotTokensWithdrawn(address indexed recipient, uint256 amount);

  /**
   * @dev Constructor
   * @param _evmAuth Address of the EVMAuthV2 contract to extend
   * @param _megapot Address of the Megapot contract
   * @param _referrer Optional referrer address for Megapot fees
   * @param _owner Owner of this extension contract
   */
  constructor(
    address _evmAuth,
    address _megapot,
    address _referrer,
    address _owner
  ) Ownable(_owner) {
    require(_evmAuth != address(0), "Invalid EVMAuth address");
    require(_megapot != address(0), "Invalid Megapot address");

    evmAuth = EVMAuthV2(_evmAuth);
    megapot = IMegapot(_megapot);
    megapotToken = IERC20(megapot.token());
    referrer = _referrer;

    // Initialize configuration
    config = MegapotConfig({
      isActive: true,
      ticketsPerPurchase: 1, // 1 ticket per token purchase by default
      minPurchaseForTicket: 0, // No minimum by default
      useTokenValue: false, // Fixed ticket count by default
      maxTicketsPerPurchase: 10, // Max 10 tickets per purchase
      linkedAt: block.timestamp
    });

    emit MegapotLinked(
      _megapot,
      address(megapotToken),
      megapot.ticketPrice(),
      block.timestamp
    );
  }

  /**
   * @dev Hook called after successful token purchase
   * This is the main integration point with EVMAuth purchases
   */
  function onTokenPurchased(
    address buyer,
    uint256 tokenId,
    uint256 amount,
    uint256 totalPrice
  ) external {
    require(msg.sender == address(evmAuth), "Only EVMAuth contract can call");

    if (!config.isActive || !megapot.allowPurchasing()) {
      return; // Skip if disabled or Megapot not allowing purchases
    }

    // Check minimum purchase requirement
    if (totalPrice < config.minPurchaseForTicket) {
      return;
    }

    // Calculate number of tickets to purchase
    uint256 ticketsToBuy = _calculateTicketCount(amount, totalPrice);

    if (ticketsToBuy == 0) {
      return;
    }

    // Purchase tickets automatically
    _purchaseMegapotTickets(buyer, ticketsToBuy);

    // Update tracking
    userTicketsPurchased[buyer] += ticketsToBuy;
    userTokenPurchases[buyer] += amount;
    totalTicketsPurchased += ticketsToBuy;
    totalTokensSold += amount;

    emit AutoTicketPurchased(
      buyer,
      tokenId,
      amount,
      ticketsToBuy,
      block.timestamp
    );
  }

  /**
   * @dev Calculate number of tickets to purchase based on configuration
   */
  function _calculateTicketCount(
    uint256 /* tokenAmount */,
    uint256 totalPrice
  ) internal view returns (uint256) {
    uint256 tickets;

    if (config.useTokenValue) {
      // Buy tickets proportional to value spent
      uint256 ticketPrice = megapot.ticketPrice();
      if (ticketPrice == 0) return 0;

      // Use a percentage of the purchase value for tickets
      // For example, if they spend 0.01 ETH and ticket is 0.001 ETH, buy 1-2 tickets
      tickets = (totalPrice * 10) / (ticketPrice * 100); // 10% of value in tickets
      if (tickets == 0) tickets = 1; // Always at least 1 ticket
    } else {
      // Fixed number of tickets per purchase
      tickets = config.ticketsPerPurchase;
    }

    // Apply maximum limit
    if (tickets > config.maxTicketsPerPurchase) {
      tickets = config.maxTicketsPerPurchase;
    }

    return tickets;
  }

  /**
   * @dev Purchase Megapot tickets for a user
   */
  function _purchaseMegapotTickets(address user, uint256 ticketCount) internal {
    uint256 ticketPrice = megapot.ticketPrice();
    uint256 totalCost = ticketPrice * ticketCount;

    // Check if we have enough tokens
    uint256 balance = megapotToken.balanceOf(address(this));
    if (balance < totalCost) {
      // Not enough tokens, reduce ticket count
      ticketCount = balance / ticketPrice;
      if (ticketCount == 0) return;
      totalCost = ticketPrice * ticketCount;
    }

    // Approve Megapot to spend tokens
    megapotToken.approve(address(megapot), totalCost);

    // Purchase tickets for the user
    try megapot.purchaseTickets(referrer, totalCost, user) {
      // Success - tickets purchased
    } catch {
      // Failed to purchase, could log or emit event
      // For now, silently fail to not block token purchases
    }
  }

  /**
   * @dev Update Megapot configuration (owner only)
   */
  function updateConfiguration(
    bool _isActive,
    uint256 _ticketsPerPurchase,
    uint256 _minPurchaseForTicket,
    bool _useTokenValue,
    uint256 _maxTicketsPerPurchase
  ) external onlyOwner {
    require(_ticketsPerPurchase > 0, "Tickets per purchase must be > 0");
    require(_maxTicketsPerPurchase > 0, "Max tickets must be > 0");
    require(
      _ticketsPerPurchase <= _maxTicketsPerPurchase,
      "Invalid ticket limits"
    );

    config.isActive = _isActive;
    config.ticketsPerPurchase = _ticketsPerPurchase;
    config.minPurchaseForTicket = _minPurchaseForTicket;
    config.useTokenValue = _useTokenValue;
    config.maxTicketsPerPurchase = _maxTicketsPerPurchase;

    emit ConfigurationUpdated(
      _isActive,
      _ticketsPerPurchase,
      _minPurchaseForTicket,
      _useTokenValue,
      _maxTicketsPerPurchase
    );
  }

  /**
   * @dev Update referrer for Megapot purchases (owner only)
   */
  function updateReferrer(address _newReferrer) external onlyOwner {
    address oldReferrer = referrer;
    referrer = _newReferrer;
    emit ReferrerUpdated(oldReferrer, _newReferrer);
  }

  /**
   * @dev Update Megapot contract address (owner only)
   */
  function updateMegapotContract(address _newMegapot) external onlyOwner {
    require(_newMegapot != address(0), "Invalid Megapot address");

    megapot = IMegapot(_newMegapot);
    megapotToken = IERC20(megapot.token());

    emit MegapotLinked(
      _newMegapot,
      address(megapotToken),
      megapot.ticketPrice(),
      block.timestamp
    );
  }

  /**
   * @dev Deposit Megapot tokens to fund automatic ticket purchases
   */
  function depositMegapotTokens(uint256 amount) external {
    require(amount > 0, "Amount must be > 0");

    megapotToken.transferFrom(msg.sender, address(this), amount);
    emit MegapotTokensDeposited(msg.sender, amount);
  }

  /**
   * @dev Withdraw Megapot tokens (owner only)
   */
  function withdrawMegapotTokens(uint256 amount) external onlyOwner {
    require(amount > 0, "Amount must be > 0");

    uint256 balance = megapotToken.balanceOf(address(this));
    require(balance >= amount, "Insufficient balance");

    megapotToken.transfer(owner(), amount);
    emit MegapotTokensWithdrawn(owner(), amount);
  }

  /**
   * @dev Emergency withdraw all Megapot tokens (owner only)
   */
  function emergencyWithdrawAll() external onlyOwner {
    uint256 balance = megapotToken.balanceOf(address(this));
    if (balance > 0) {
      megapotToken.transfer(owner(), balance);
      emit MegapotTokensWithdrawn(owner(), balance);
    }
  }

  /**
   * @dev Get user's ticket and purchase statistics
   */
  function getUserStats(
    address user
  )
    external
    view
    returns (
      uint256 ticketsPurchased,
      uint256 tokenPurchases,
      uint256 estimatedTicketsFromBalance
    )
  {
    ticketsPurchased = userTicketsPurchased[user];
    tokenPurchases = userTokenPurchases[user];

    // Estimate tickets that could be bought with current balance
    uint256 balance = megapotToken.balanceOf(address(this));
    uint256 ticketPrice = megapot.ticketPrice();
    estimatedTicketsFromBalance = ticketPrice > 0 ? balance / ticketPrice : 0;
  }

  /**
   * @dev Get extension statistics
   */
  function getExtensionStats()
    external
    view
    returns (
      uint256 totalTickets,
      uint256 totalTokens,
      uint256 contractBalance,
      uint256 ticketPrice,
      bool megapotActive
    )
  {
    totalTickets = totalTicketsPurchased;
    totalTokens = totalTokensSold;
    contractBalance = megapotToken.balanceOf(address(this));
    ticketPrice = megapot.ticketPrice();
    megapotActive = megapot.allowPurchasing();
  }

  /**
   * @dev Get current configuration
   */
  function getConfiguration() external view returns (MegapotConfig memory) {
    return config;
  }

  /**
   * @dev Get Megapot contract information
   */
  function getMegapotInfo()
    external
    view
    returns (
      address megapotContract,
      address token,
      uint256 ticketPrice,
      bool allowPurchasing,
      address currentReferrer
    )
  {
    megapotContract = address(megapot);
    token = address(megapotToken);
    ticketPrice = megapot.ticketPrice();
    allowPurchasing = megapot.allowPurchasing();
    currentReferrer = referrer;
  }

  /**
   * @dev Check if extension can purchase tickets
   */
  function canPurchaseTickets(
    uint256 ticketCount
  ) external view returns (bool) {
    if (!config.isActive || !megapot.allowPurchasing()) {
      return false;
    }

    uint256 ticketPrice = megapot.ticketPrice();
    uint256 totalCost = ticketPrice * ticketCount;
    uint256 balance = megapotToken.balanceOf(address(this));

    return balance >= totalCost;
  }

  /**
   * @dev Get extension info for the base contract
   */
  function getExtensionInfo()
    external
    view
    returns (
      string memory name,
      string memory version,
      address baseContract,
      bool isActive
    )
  {
    return ("MegapotExtension", "1.0.0", address(evmAuth), config.isActive);
  }
}
