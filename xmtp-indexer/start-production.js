#!/usr/bin/env node

/**
 * Production startup script for Render deployment
 * Handles database setup and starts both processor and GraphQL server
 */

const { spawn, exec } = require("child_process");
const path = require("path");

console.log("🚀 Starting XMTP Indexer in production mode...");

// Environment setup
const DB_URL = process.env.DATABASE_URL;
const PORT = process.env.PORT || 4350;

console.log(`📊 Database: ${DB_URL ? "Connected" : "Local"}`);
console.log(`🌐 GraphQL Port: ${PORT}`);

async function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`🔧 Running: ${command} ${args.join(" ")}`);

    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
  });
}

async function setupDatabase() {
  try {
    console.log("🗄️ Setting up database...");

    // Build project (generates models + compiles TypeScript)
    console.log("🔧 Building project (codegen + TypeScript compilation)...");
    await runCommand("npm", ["run", "build"]);
    console.log("✅ Project built successfully");

    // For Subsquid, the processor will handle database schema creation automatically
    console.log(
      "ℹ️ Database schema will be created automatically by the processor",
    );
  } catch (error) {
    console.error("❌ Database setup failed:", error.message);
    throw error;
  }
}

async function startServices() {
  console.log("🔄 Starting indexer services...");

  // Start processor in background
  const processor = spawn("node", ["-r", "dotenv/config", "lib/main.js"], {
    stdio: "inherit",
    detached: false,
  });

  processor.on("error", (err) => {
    console.error("❌ Processor failed to start:", err.message);
    process.exit(1);
  });

  processor.on("exit", (code) => {
    if (code !== 0) {
      console.error(`❌ Processor exited with code ${code}`);
      process.exit(1);
    }
  });

  // Give processor time to start
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Start GraphQL server with PORT environment variable
  const graphql = spawn("npx", ["squid-graphql-server"], {
    stdio: "inherit",
    detached: false,
    env: { ...process.env, PORT: PORT.toString() },
  });

  graphql.on("error", (err) => {
    console.error("❌ GraphQL server failed to start:", err.message);
    process.exit(1);
  });

  graphql.on("exit", (code) => {
    if (code !== 0) {
      console.error(`❌ GraphQL server exited with code ${code}`);
      process.exit(1);
    }
  });

  // Handle graceful shutdown
  process.on("SIGTERM", () => {
    console.log("🛑 Shutting down...");
    processor.kill();
    graphql.kill();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("🛑 Shutting down...");
    processor.kill();
    graphql.kill();
    process.exit(0);
  });

  console.log("✅ Services started successfully");
  console.log(`🌐 GraphQL API available at port ${PORT}`);
}

async function main() {
  try {
    await setupDatabase();
    await startServices();

    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    console.error("💥 Startup failed:", error.message);
    process.exit(1);
  }
}

main();
