// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IMegapot
 * @dev Interface for Megapot lottery contract integration
 * Based on Megapot documentation: https://docs.megapot.io/developers/developer-reference/contract-overview
 */
interface IMegapot {
  /**
   * @dev Purchase lottery tickets
   * @param referrer Address of referrer (for fee sharing)
   * @param value Amount of tokens to spend on tickets
   * @param recipient Address to receive the tickets
   * @return success Whether the purchase was successful
   */
  function purchaseTickets(
    address referrer,
    uint256 value,
    address recipient
  ) external returns (bool success);

  /**
   * @dev Get current ticket price
   * @return price Current price per lottery ticket
   */
  function ticketPrice() external view returns (uint256 price);

  /**
   * @dev Get payment token address
   * @return token Address of the ERC20 token used for payments (typically USDC)
   */
  function token() external view returns (address token);

  /**
   * @dev Check if ticket purchasing is currently allowed
   * @return allowed Whether ticket purchases are currently enabled
   */
  function allowPurchasing() external view returns (bool allowed);

  // Additional view functions that might be available
  function currentPot() external view returns (uint256);
  function ticketsInCurrentDraw() external view returns (uint256);
  function nextDrawTime() external view returns (uint256);
}
