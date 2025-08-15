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
const INTERNAL_DB_URL = process.env.DATABASE_URL_INTERNAL;
const PORT = process.env.PORT || 4350;

console.log(`📊 Database: ${DB_URL ? "Connected" : "Local"}`);
console.log(`🔗 DATABASE_URL: ${DB_URL ? "Set" : "Missing"}`);
console.log(`🔗 DATABASE_URL_INTERNAL: ${INTERNAL_DB_URL ? "Set" : "Missing"}`);
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

  // Start processor in background with proper database URL
  const dbUrl = INTERNAL_DB_URL || DB_URL;
  console.log(`🔗 Using database URL: ${dbUrl ? "Available" : "Missing"}`);

  const processor = spawn("node", ["-r", "dotenv/config", "lib/main.js"], {
    stdio: "pipe", // Capture output for better debugging
    detached: false,
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  processor.stdout.on("data", (data) => {
    console.log(`[PROCESSOR] ${data.toString().trim()}`);
  });

  processor.stderr.on("data", (data) => {
    console.error(`[PROCESSOR] ${data.toString().trim()}`);
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

  // Give processor time to start and create database schema
  console.log("⏳ Waiting for processor to initialize database...");
  await new Promise((resolve) => setTimeout(resolve, 10000));

  // Start GraphQL server as main process (this will bind to the port)
  console.log(`🌐 Starting GraphQL server on port ${PORT}...`);

  // Use exec instead of spawn for the GraphQL server to replace the main process
  const { exec } = require("child_process");

  // Handle graceful shutdown
  process.on("SIGTERM", () => {
    console.log("🛑 Shutting down...");
    processor.kill();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("🛑 Shutting down...");
    processor.kill();
    process.exit(0);
  });

  console.log("✅ Processor started successfully");
  console.log(`🌐 Starting GraphQL API on port ${PORT}...`);

  // Start GraphQL server and keep process alive
  const graphqlProcess = spawn("npx", ["squid-graphql-server"], {
    stdio: "inherit",
    env: { ...process.env, PORT: PORT.toString(), DATABASE_URL: dbUrl },
  });

  graphqlProcess.on("error", (err) => {
    console.error(`❌ GraphQL server error: ${err.message}`);
    process.exit(1);
  });

  graphqlProcess.on("exit", (code) => {
    console.error(`❌ GraphQL server exited with code ${code}`);
    process.exit(1);
  });

  // Keep the main process alive
  process.stdin.resume();
}

async function main() {
  try {
    await setupDatabase();
    await startServices();
  } catch (error) {
    console.error("💥 Startup failed:", error.message);
    process.exit(1);
  }
}

main();
