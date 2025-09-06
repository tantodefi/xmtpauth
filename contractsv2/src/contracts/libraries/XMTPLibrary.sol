// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IFactory } from "../../interfaces/IFactory.sol";

/**
 * @title XMTPLibrary
 * @dev Library containing utility functions for XMTP payment processing
 */
library XMTPLibrary {
  /**
   * @dev Handle ETH platform fees (keep rest as TVL)
   */
  function handleETHPlatformFees(address factory, uint256 amount) external {
    // Get factory fee configuration
    try IFactory(factory).feeBasisPoints() returns (uint256 feeBasisPoints) {
      try IFactory(factory).feeRecipient() returns (address feeRecipient) {
        if (feeBasisPoints > 0 && feeRecipient != address(0)) {
          uint256 platformFee = (amount * feeBasisPoints) / 10000;
          if (platformFee > 0 && address(this).balance >= platformFee) {
            // Use call instead of transfer for better compatibility
            (bool success, ) = payable(feeRecipient).call{ value: platformFee }(
              ""
            );
            // If transfer fails, continue anyway (fees are optional)
            // require(success, "Fee transfer failed");
          }
          // Remaining ETH stays in contract as TVL
        }
      } catch {}
    } catch {}
  }

  /**
   * @dev Handle ERC20 platform fees and send revenue to creator
   */
  function handleERC20PlatformFeesAndRevenue(
    address factory,
    address paymentToken,
    uint256 amount,
    address treasury,
    address msgSender
  ) external {
    IERC20 token = IERC20(paymentToken);

    // Get factory fee configuration
    try IFactory(factory).feeBasisPoints() returns (uint256 feeBasisPoints) {
      try IFactory(factory).feeRecipient() returns (address feeRecipient) {
        uint256 platformFee = 0;
        if (feeBasisPoints > 0 && feeRecipient != address(0)) {
          platformFee = (amount * feeBasisPoints) / 10000;
          if (platformFee > 0) {
            // Transfer platform fee to fee recipient
            require(
              token.transferFrom(msgSender, feeRecipient, platformFee),
              "Platform fee transfer failed"
            );
          }
        }

        // Transfer remaining amount (97.5%) to treasury/creator
        uint256 creatorAmount = amount - platformFee;
        if (creatorAmount > 0) {
          require(
            token.transferFrom(msgSender, treasury, creatorAmount),
            "Creator revenue transfer failed"
          );
        }
      } catch {
        // Fallback: send all to treasury if factory call fails
        require(
          token.transferFrom(msgSender, treasury, amount),
          "Revenue transfer failed"
        );
      }
    } catch {
      // Fallback: send all to treasury if factory call fails
      require(
        token.transferFrom(msgSender, treasury, amount),
        "Revenue transfer failed"
      );
    }
  }

  /**
   * @dev Handle ERC20 platform fees with Megapot integration
   * @param factory Factory contract address
   * @param paymentToken ERC20 token address
   * @param amount Total purchase amount
   * @param treasury Treasury address for creator revenue
   * @param megapotExtension Megapot extension address (0x0 to disable)
   * @param megapotPercentage Percentage for Megapot (in basis points, e.g., 250 = 2.5%)
   * @param msgSender Original message sender
   * @return megapotAmount Amount allocated to Megapot
   */
  function handleERC20PlatformFeesWithMegapot(
    address factory,
    address paymentToken,
    uint256 amount,
    address treasury,
    address megapotExtension,
    uint256 megapotPercentage,
    address msgSender
  ) external returns (uint256 megapotAmount) {
    IERC20 token = IERC20(paymentToken);

    // Get factory fee configuration
    try IFactory(factory).feeBasisPoints() returns (uint256 feeBasisPoints) {
      try IFactory(factory).feeRecipient() returns (address feeRecipient) {
        // Calculate platform fee (2.5%)
        uint256 platformFee = 0;
        if (feeBasisPoints > 0 && feeRecipient != address(0)) {
          platformFee = (amount * feeBasisPoints) / 10000;
        }

        // Calculate Megapot amount (configurable %)
        megapotAmount = 0;
        if (megapotExtension != address(0) && megapotPercentage > 0) {
          megapotAmount = (amount * megapotPercentage) / 10000;
        }

        // Calculate creator amount (remainder)
        uint256 creatorAmount = amount - platformFee - megapotAmount;

        // Transfer platform fee
        if (platformFee > 0) {
          require(
            token.transferFrom(msgSender, feeRecipient, platformFee),
            "Platform fee transfer failed"
          );
        }

        // Transfer Megapot amount to extension
        if (megapotAmount > 0) {
          require(
            token.transferFrom(msgSender, megapotExtension, megapotAmount),
            "Megapot transfer failed"
          );
        }

        // Transfer creator amount to treasury
        if (creatorAmount > 0) {
          require(
            token.transferFrom(msgSender, treasury, creatorAmount),
            "Creator revenue transfer failed"
          );
        }

        return megapotAmount;
      } catch {
        // Fallback: send all to treasury if factory call fails
        require(
          token.transferFrom(msgSender, treasury, amount),
          "Revenue transfer failed"
        );
        return 0;
      }
    } catch {
      // Fallback: send all to treasury if factory call fails
      require(
        token.transferFrom(msgSender, treasury, amount),
        "Revenue transfer failed"
      );
      return 0;
    }
  }
}
