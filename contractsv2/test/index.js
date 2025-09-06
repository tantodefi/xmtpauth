/**
 * XMTP Auth V2 - Comprehensive Test Suite
 *
 * Clean test organization following evmauth-core patterns
 *
 * Test Structure:
 * - unit/        - Individual component tests
 * - integration/ - Cross-component and end-to-end tests
 * - helpers/     - Mock contracts and utilities
 * - BaseTest.js  - Shared test utilities
 */

const { BaseTest } = require("./BaseTest");

describe("XMTP Auth V2 - Complete Test Suite", function () {
  // Global test timeout for complex operations
  this.timeout(60000);

  let globalTest;

  before(async function () {
    globalTest = new BaseTest();
    console.log("\n🎯 Starting XMTP Auth V2 Test Suite");
    console.log("====================================");
  });

  describe("🔧 Unit Tests", function () {
    require("./unit/XMTPAuth.core.test");
    require("./unit/XMTPAuth.payments.test");
    require("./unit/XMTPAuth.extensions.test");
    require("./unit/XMTPAuth.evmauth-core.test");
    require("./unit/XMTPAuth.megapot-direct-funding.test");
  });

  describe("🔗 Integration Tests", function () {
    require("./integration/Factory.test");
    require("./integration/EndToEnd.test");
  });

  after(async function () {
    console.log("\n✅ XMTP Auth V2 Test Suite Complete");
    console.log("====================================");
  });
});
