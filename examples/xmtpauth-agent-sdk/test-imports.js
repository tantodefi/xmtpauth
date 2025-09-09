// Test imports to isolate the issue
console.log("Testing imports...");

try {
  const { Agent } = require("@xmtp/agent-sdk");
  console.log("✅ @xmtp/agent-sdk imported successfully");
} catch (e) {
  console.error("❌ Failed to import @xmtp/agent-sdk:", e.message);
}

try {
  const { createWalletClient } = require("viem");
  console.log("✅ viem imported successfully");
} catch (e) {
  console.error("❌ Failed to import viem:", e.message);
}

try {
  const { EnhancedGroupManager } = require("../../xmtp-evmauth-groups/src/index.js");
  console.log("✅ EnhancedGroupManager imported successfully");
} catch (e) {
  console.error("❌ Failed to import EnhancedGroupManager:", e.message);
}

console.log("Import test completed.");
