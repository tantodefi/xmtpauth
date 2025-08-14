/**
 * Drop-in replacement for your current PaymentMonitor
 * Just replace the import and constructor - everything else stays the same!
 */

import { HybridPaymentMonitor } from "./hybrid-payment-monitor";

// BEFORE:
// import { PaymentMonitor } from "./src/utils/payment-monitor";
// const paymentMonitor = new PaymentMonitor(
//   BASE_RPC_URL,
//   agentAddress,
//   enhancedGroupManager,
//   groupConfigs,
// );

// AFTER:
export { HybridPaymentMonitor as PaymentMonitor };

// Usage in index.ts:
// import { PaymentMonitor } from "./src/utils/payment-monitor-replacement";
// const paymentMonitor = new PaymentMonitor(
//   agentAddress,           // No BASE_RPC_URL needed
//   enhancedGroupManager,
//   groupConfigs,
// );

// All existing methods work the same:
// - paymentMonitor.registerPayment()
// - paymentMonitor.startPaymentMonitoring()
// - paymentMonitor.stopPaymentMonitoring()
// - paymentMonitor.getStats()
