// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./IExtension.sol";

/**
 * @title IMegapotExtension
 * @dev Interface for Megapot extension functionality
 */
interface IMegapotExtension is IExtension {
  /**
   * @dev Get the current funding percentage for Megapot ticket purchases
   * @return percentage Funding percentage in basis points (100 = 1%)
   */
  function getFundingPercentage() external view returns (uint256 percentage);

  /**
   * @dev Get the number of tickets purchased by a user
   * @param user Address to check
   * @return ticketCount Number of tickets purchased
   */
  function userTicketsPurchased(
    address user
  ) external view returns (uint256 ticketCount);

  /**
   * @dev Get the extension configuration
   */
  function config()
    external
    view
    returns (
      bool isActive,
      uint256 ticketsPerPurchase,
      uint256 minPurchaseForTicket,
      bool useTokenValue,
      uint256 maxTicketsPerPurchase,
      uint256 linkedAt,
      bool useDirectFunding,
      uint256 fundingPercentage,
      uint256 minTicketAmount,
      uint256 maxTicketAmount
    );
}
