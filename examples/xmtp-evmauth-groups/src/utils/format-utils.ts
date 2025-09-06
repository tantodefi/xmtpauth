/**
 * Utility functions for formatting values for user display
 */

/**
 * Format wei amount to human-readable ETH string
 * @param weiValue - Value in wei (as string or number)
 * @param decimals - Number of decimal places to show (default: 3)
 * @returns Formatted ETH string (e.g., "0.001 ETH")
 */
export function formatEthAmount(
  weiValue: string | number,
  decimals: number = 3,
): string {
  const weiNum = typeof weiValue === "string" ? parseInt(weiValue) : weiValue;
  const ethAmount = weiNum / 1e18;
  return `${ethAmount.toFixed(decimals)} ETH`;
}

/**
 * Format USDC amount to human-readable string
 * @param usdcValue - Value in USDC base units (as string or number)
 * @param decimals - Number of decimal places to show (default: 2)
 * @returns Formatted USDC string (e.g., "10.00 USDC")
 */
export function formatUsdcAmount(
  usdcValue: string | number,
  decimals: number = 2,
): string {
  const usdcNum =
    typeof usdcValue === "string" ? parseInt(usdcValue) : usdcValue;
  const usdcAmount = usdcNum / 1e6;
  return `${usdcAmount.toFixed(decimals)} USDC`;
}

/**
 * Format payment amount based on token type
 * @param value - Payment value in base units
 * @param tokenType - Token type ("ETH", "USDC", etc.)
 * @param decimals - Number of decimal places to show
 * @returns Formatted payment string
 */
export function formatPaymentAmount(
  value: string | number,
  tokenType: string,
  decimals?: number,
): string {
  switch (tokenType.toLowerCase()) {
    case "eth":
      return formatEthAmount(value, decimals || 3);
    case "usdc":
      return formatUsdcAmount(value, decimals || 2);
    default:
      return `${value} ${tokenType}`;
  }
}

/**
 * Format contract address for display (shortened)
 * @param address - Full contract address
 * @returns Shortened address (e.g., "0x1234...5678")
 */
export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format large numbers with commas
 * @param num - Number to format
 * @returns Formatted number string
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}




