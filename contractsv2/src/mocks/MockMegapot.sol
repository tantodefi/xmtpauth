// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IMegapot.sol";

/**
 * @title MockMegapot
 * @dev Mock Megapot contract for testing
 */
contract MockMegapot is IMegapot {
  address private _token;
  uint256 public override ticketPrice = 1e6; // 1 USDC
  bool public override allowPurchasing = true;
  uint256 public override currentPot = 10000e6; // 10,000 USDC
  uint256 public override ticketsInCurrentDraw = 0;
  uint256 public override nextDrawTime = block.timestamp + 7 days;

  mapping(address => uint256) public ticketsPurchased;
  mapping(address => uint256) public totalSpent;
  uint256 public purchasesMade = 0;
  uint256 public totalTicketsSold;
  uint256 public totalRevenue;

  event TicketsPurchased(
    address indexed referrer,
    uint256 value,
    address indexed recipient,
    uint256 ticketCount
  );

  event ConfigUpdated(uint256 newTicketPrice, bool purchasingAllowed);

  constructor(address tokenAddress) {
    _token = tokenAddress;
  }

  function token() external view override returns (address) {
    return _token;
  }

  function purchaseTickets(
    address referrer,
    uint256 value,
    address recipient
  ) external override returns (bool) {
    require(allowPurchasing, "Purchasing disabled");
    require(value > 0, "Invalid value");
    require(value >= ticketPrice, "Insufficient value");

    // Calculate number of tickets
    uint256 ticketCount = value / ticketPrice;
    require(ticketCount > 0, "No tickets to purchase");

    // Transfer tokens from sender
    require(
      IERC20(_token).transferFrom(msg.sender, address(this), value),
      "Transfer failed"
    );

    // Update tracking
    ticketsPurchased[recipient] += ticketCount;
    totalSpent[recipient] += value;
    totalTicketsSold += ticketCount;
    totalRevenue += value;
    ticketsInCurrentDraw += ticketCount;
    purchasesMade += 1;

    // Handle referrer fee (5% to referrer if provided)
    if (referrer != address(0) && referrer != recipient) {
      uint256 referrerFee = (value * 5) / 100; // 5%
      if (
        referrerFee > 0 &&
        IERC20(_token).balanceOf(address(this)) >= referrerFee
      ) {
        IERC20(_token).transfer(referrer, referrerFee);
      }
    }

    emit TicketsPurchased(referrer, value, recipient, ticketCount);
    return true;
  }

  // Admin functions for testing
  function setTicketPrice(uint256 _price) external {
    ticketPrice = _price;
    emit ConfigUpdated(_price, allowPurchasing);
  }

  function setAllowPurchasing(bool _allow) external {
    allowPurchasing = _allow;
    emit ConfigUpdated(ticketPrice, _allow);
  }

  function setCurrentPot(uint256 _pot) external {
    currentPot = _pot;
  }

  function setNextDrawTime(uint256 _time) external {
    nextDrawTime = _time;
  }

  // View functions for testing
  function getUserTickets(address user) external view returns (uint256) {
    return ticketsPurchased[user];
  }

  function getUserSpent(address user) external view returns (uint256) {
    return totalSpent[user];
  }

  function getContractBalance() external view returns (uint256) {
    return IERC20(_token).balanceOf(address(this));
  }

  // Simulate drawing (for testing)
  function simulateDraw() external {
    ticketsInCurrentDraw = 0;
    nextDrawTime = block.timestamp + 7 days;
    currentPot = (totalRevenue * 80) / 100; // 80% of revenue goes to pot
  }

  // Emergency functions
  function emergencyWithdraw(address to, uint256 amount) external {
    require(
      amount <= IERC20(_token).balanceOf(address(this)),
      "Insufficient balance"
    );
    IERC20(_token).transfer(to, amount);
  }

  function pause() external {
    allowPurchasing = false;
  }

  function unpause() external {
    allowPurchasing = true;
  }
}
