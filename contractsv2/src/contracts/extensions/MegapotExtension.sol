// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IExtension } from "../../interfaces/IExtension.sol";
import { IMegapot } from "../../interfaces/IMegapot.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MegapotExtension
 * @dev Extension that automatically purchases Megapot lottery tickets when users buy access tokens
 */
contract MegapotExtension is IExtension, Ownable, ReentrancyGuard {
  // Megapot integration
  IMegapot public megapot;
  IERC20 public megapotToken;
  address public referrer;

  // Configuration
  struct MegapotConfig {
    bool isActive;
    uint256 ticketsPerPurchase;
    uint256 minPurchaseForTicket;
    bool useTokenValue;
    uint256 maxTicketsPerPurchase;
    uint256 linkedAt;
    // New configurable funding options
    bool useDirectFunding; // Use USDC from purchases vs pre-funding
    uint256 fundingPercentage; // Percentage of purchase to use (basis points)
    uint256 minTicketAmount; // Minimum USDC for 1 ticket (e.g., 1000000 = $1 USDC)
    uint256 maxTicketAmount; // Maximum USDC per purchase for tickets
  }

  MegapotConfig public config;

  // Tracking
  mapping(address => uint256) public userTicketsPurchased;
  mapping(address => uint256) public userTokenPurchases;
  uint256 public totalTicketsPurchased;
  uint256 public totalTokensSold;

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
    uint256 totalPrice,
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
  event ExtensionError(
    address indexed user,
    uint256 indexed tokenId,
    string reason
  );
  event DirectFundingConfigUpdated(
    bool useDirectFunding,
    uint256 fundingPercentage,
    uint256 minTicketAmount,
    uint256 maxTicketAmount
  );

  constructor(
    address _megapot,
    address _referrer,
    address _owner
  ) Ownable(_owner) {
    require(_megapot != address(0), "Invalid Megapot address");

    megapot = IMegapot(_megapot);
    megapotToken = IERC20(megapot.token());
    referrer = _referrer;

    config = MegapotConfig({
      isActive: true,
      ticketsPerPurchase: 1,
      minPurchaseForTicket: 1e6, // 1 USDC (6 decimals) minimum for ERC20 purchases
      useTokenValue: false,
      maxTicketsPerPurchase: 10,
      linkedAt: block.timestamp,
      // New direct funding defaults
      useDirectFunding: true, // Enable direct funding by default
      fundingPercentage: 250, // 2.5% of purchase amount
      minTicketAmount: 1e6, // $1 USDC minimum for 1 ticket
      maxTicketAmount: 10e6 // $10 USDC maximum per purchase
    });

    emit MegapotLinked(
      _megapot,
      address(megapotToken),
      megapot.ticketPrice(),
      block.timestamp
    );
  }

  function onTokenPurchased(
    address buyer,
    uint256 tokenId,
    uint256 amount,
    uint256 totalPrice,
    address paymentToken
  ) external override {
    if (
      !config.isActive ||
      !megapot.allowPurchasing() ||
      totalPrice < config.minPurchaseForTicket
    ) {
      return;
    }

    uint256 ticketsToBuy;
    uint256 ticketCost;
    bool success;

    if (config.useDirectFunding && paymentToken == address(megapotToken)) {
      // Try direct funding from purchase amount
      (ticketsToBuy, ticketCost) = _calculateDirectFundingTickets(totalPrice);

      if (ticketsToBuy > 0) {
        // Direct funding is viable, use it
        success = _purchaseMegapotTicketsWithDirectFunding(
          buyer,
          ticketsToBuy,
          ticketCost
        );
      } else {
        // Direct funding not viable, fallback to pre-funding
        ticketsToBuy = _calculateTicketCount(amount, totalPrice);
        ticketCost = ticketsToBuy * megapot.ticketPrice();

        if (ticketsToBuy == 0) return;

        success = _purchaseMegapotTickets(buyer, ticketsToBuy);
      }
    } else {
      // Use pre-funded approach (backward compatibility)
      ticketsToBuy = _calculateTicketCount(amount, totalPrice);
      ticketCost = ticketsToBuy * megapot.ticketPrice();

      if (ticketsToBuy == 0) return;

      success = _purchaseMegapotTickets(buyer, ticketsToBuy);
    }

    if (success) {
      userTicketsPurchased[buyer] += ticketsToBuy;
      userTokenPurchases[buyer] += amount;
      totalTicketsPurchased += ticketsToBuy;
      totalTokensSold += amount;

      emit AutoTicketPurchased(
        buyer,
        tokenId,
        amount,
        ticketsToBuy,
        ticketCost,
        block.timestamp
      );
    }
  }

  function onTokenGranted(
    address,
    uint256,
    uint256,
    address
  ) external override {
    // No action needed for grants
  }

  function onTokenRevoked(
    address,
    uint256,
    uint256,
    string memory
  ) external override {
    // No action needed for revocations
  }

  function onTokenConfigUpdated(
    uint256,
    uint256,
    string memory
  ) external override {
    // No action needed for config updates
  }

  function getExtensionInfo()
    external
    view
    override
    returns (string memory, string memory, bool)
  {
    return ("MegapotExtension", "2.0.0", config.isActive);
  }

  function _calculateTicketCount(
    uint256,
    uint256 totalPrice
  ) internal view returns (uint256) {
    uint256 tickets;
    if (config.useTokenValue) {
      uint256 ticketPrice = megapot.ticketPrice();
      if (ticketPrice == 0) return 0;
      tickets = (totalPrice * 10) / (ticketPrice * 100);
      if (tickets == 0) tickets = 1;
    } else {
      tickets = config.ticketsPerPurchase;
    }
    return
      tickets > config.maxTicketsPerPurchase
        ? config.maxTicketsPerPurchase
        : tickets;
  }

  function _purchaseMegapotTickets(
    address user,
    uint256 ticketCount
  ) internal returns (bool) {
    uint256 ticketPrice = megapot.ticketPrice();
    uint256 totalCost = ticketPrice * ticketCount;
    uint256 balance = megapotToken.balanceOf(address(this));

    if (balance < totalCost) {
      ticketCount = balance / ticketPrice;
      if (ticketCount == 0) {
        emit ExtensionError(user, 0, "Insufficient USDC balance");
        return false;
      }
      totalCost = ticketPrice * ticketCount;
    }

    megapotToken.approve(address(megapot), totalCost);
    try megapot.purchaseTickets(referrer, totalCost, user) returns (
      bool success
    ) {
      return success;
    } catch Error(string memory reason) {
      emit ExtensionError(user, 0, reason);
      return false;
    } catch {
      emit ExtensionError(user, 0, "Unknown Megapot error");
      return false;
    }
  }

  /**
   * @dev Calculate tickets to buy using direct funding from purchase amount
   */
  function _calculateDirectFundingTickets(
    uint256 purchaseAmount
  ) internal view returns (uint256 ticketsToBuy, uint256 ticketCost) {
    // Calculate available funding based on percentage
    uint256 availableFunding = (purchaseAmount * config.fundingPercentage) /
      10000;

    // Check minimum funding requirement
    if (availableFunding < config.minTicketAmount) {
      return (0, 0);
    }

    // Get current ticket price from Megapot
    uint256 ticketPrice = megapot.ticketPrice();
    if (ticketPrice == 0) {
      return (0, 0);
    }

    // Calculate maximum tickets we can buy
    uint256 maxTickets = availableFunding / ticketPrice;

    // Apply limits
    if (maxTickets > config.maxTicketsPerPurchase) {
      maxTickets = config.maxTicketsPerPurchase;
    }

    // Ensure at least 1 ticket if we have enough funding
    if (maxTickets == 0 && availableFunding >= ticketPrice) {
      maxTickets = 1;
    }

    // Cap by maximum ticket amount setting (limit total cost, not ticket count)
    uint256 maxCostAllowed = config.maxTicketAmount;
    uint256 calculatedCost = maxTickets * ticketPrice;

    if (calculatedCost > maxCostAllowed) {
      // Reduce tickets to fit within cost limit
      maxTickets = maxCostAllowed / ticketPrice;
    }

    ticketsToBuy = maxTickets;
    ticketCost = ticketsToBuy * ticketPrice;

    return (ticketsToBuy, ticketCost);
  }

  /**
   * @dev Purchase Megapot tickets using direct funding (USDC received from purchase)
   */
  function _purchaseMegapotTicketsWithDirectFunding(
    address user,
    uint256 ticketCount,
    uint256 totalCost
  ) internal returns (bool) {
    // Check if we have enough USDC balance (should have been transferred to us)
    uint256 balance = megapotToken.balanceOf(address(this));
    if (balance < totalCost) {
      emit ExtensionError(user, 0, "Insufficient direct funding balance");
      return false;
    }

    // Approve and purchase tickets
    megapotToken.approve(address(megapot), totalCost);
    try megapot.purchaseTickets(referrer, totalCost, user) returns (
      bool success
    ) {
      return success;
    } catch Error(string memory reason) {
      emit ExtensionError(user, 0, reason);
      return false;
    } catch {
      emit ExtensionError(user, 0, "Unknown Megapot error");
      return false;
    }
  }

  // Management functions
  function updateConfiguration(
    bool _isActive,
    uint256 _ticketsPerPurchase,
    uint256 _minPurchaseForTicket,
    bool _useTokenValue,
    uint256 _maxTicketsPerPurchase
  ) external onlyOwner {
    require(_maxTicketsPerPurchase > 0, "Max tickets must be > 0");
    if (!_useTokenValue) {
      require(_ticketsPerPurchase > 0, "Tickets per purchase must be > 0");
      require(
        _ticketsPerPurchase <= _maxTicketsPerPurchase,
        "Invalid ticket limits"
      );
    }

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
   * @dev Update direct funding configuration
   */
  function updateDirectFundingConfig(
    bool _useDirectFunding,
    uint256 _fundingPercentage,
    uint256 _minTicketAmount,
    uint256 _maxTicketAmount
  ) external onlyOwner {
    require(
      _fundingPercentage <= 1000,
      "Funding percentage too high (max 10%)"
    );
    require(_minTicketAmount > 0, "Min ticket amount must be > 0");
    require(_maxTicketAmount >= _minTicketAmount, "Max must be >= min");

    config.useDirectFunding = _useDirectFunding;
    config.fundingPercentage = _fundingPercentage;
    config.minTicketAmount = _minTicketAmount;
    config.maxTicketAmount = _maxTicketAmount;

    emit DirectFundingConfigUpdated(
      _useDirectFunding,
      _fundingPercentage,
      _minTicketAmount,
      _maxTicketAmount
    );
  }

  function updateReferrer(address _newReferrer) external onlyOwner {
    address oldReferrer = referrer;
    referrer = _newReferrer;
    emit ReferrerUpdated(oldReferrer, _newReferrer);
  }

  function depositMegapotTokens(uint256 amount) external {
    require(amount > 0, "Amount must be > 0");
    megapotToken.transferFrom(msg.sender, address(this), amount);
    emit MegapotTokensDeposited(msg.sender, amount);
  }

  function withdrawMegapotTokens(uint256 amount) external onlyOwner {
    require(amount > 0, "Amount must be > 0");
    uint256 balance = megapotToken.balanceOf(address(this));
    require(balance >= amount, "Insufficient balance");
    megapotToken.transfer(owner(), amount);
    emit MegapotTokensWithdrawn(owner(), amount);
  }

  function emergencyWithdrawAll() external onlyOwner {
    uint256 balance = megapotToken.balanceOf(address(this));
    if (balance > 0) {
      megapotToken.transfer(owner(), balance);
      emit MegapotTokensWithdrawn(owner(), balance);
    }
  }

  // View functions
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
    uint256 balance = megapotToken.balanceOf(address(this));
    uint256 ticketPrice = megapot.ticketPrice();
    estimatedTicketsFromBalance = ticketPrice > 0 ? balance / ticketPrice : 0;
  }

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

  function getConfiguration() external view returns (MegapotConfig memory) {
    return config;
  }

  function canPurchaseTickets(
    uint256 ticketCount
  ) external view returns (bool) {
    if (!config.isActive || !megapot.allowPurchasing()) return false;
    uint256 ticketPrice = megapot.ticketPrice();
    uint256 totalCost = ticketPrice * ticketCount;
    uint256 balance = megapotToken.balanceOf(address(this));
    return balance >= totalCost;
  }
}
