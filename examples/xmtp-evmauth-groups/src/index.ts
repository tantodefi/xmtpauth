/**
 * Barrel exports for clean imports
 */

// Handlers
export { EVMAuthHandler } from "./handlers/evmauth-handler";
export { USDCHandler } from "./handlers/usdc-handler";
export { IPFSMetadataHandler } from "./handlers/ipfs-metadata";
export { EventDrivenAccessManager } from "./handlers/event-driven-access";

// Managers
export { GroupManager } from "./managers/group-manager";
export { EnhancedTierSetup } from "./managers/enhanced-tier-setup";
export { EnhancedGroupManager } from "./managers/enhanced-group-flow";
export { RecoveryManager } from "./managers/recovery-mechanisms";

// Utils
export { TokenSalesHandler } from "./utils/token-sales";
export { handleEnhancedCreateGroup, handleEnhancedBuyAccess } from "./utils/enhanced-create-group";

// Test
export { TestFlowManager } from "./test/test-flow";

// Types
export type * from "./types/types";