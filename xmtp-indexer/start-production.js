#!/usr/bin/env node

/**
 * Production startup script for Render deployment
 * Handles database setup and starts both processor and GraphQL server
 */

const { spawn, exec } = require('child_process');
const path = require('path');

console.log('🚀 Starting XMTP Indexer in production mode...');

// Environment setup
const DB_URL = process.env.DATABASE_URL;
const PORT = process.env.PORT || 4350;

console.log(`📊 Database: ${DB_URL ? 'Connected' : 'Local'}`);
console.log(`🌐 GraphQL Port: ${PORT}`);

async function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`🔧 Running: ${command} ${args.join(' ')}`);
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options
    });
    
    child.on('close', (code) => {
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
    console.log('🗄️ Setting up database...');
    
    // FIRST: Generate TypeORM models from schema.graphql
    console.log('🔧 Generating TypeORM models...');
    await runCommand('npx', ['squid-typeorm-codegen']);
    console.log('✅ TypeORM models generated');
    
    // Generate migrations if needed
    try {
      await runCommand('npx', ['squid-typeorm-migration', 'generate']);
      console.log('✅ Migrations generated');
    } catch (error) {
      console.log('ℹ️ No new migrations needed');
    }
    
    // Apply migrations
    await runCommand('npx', ['squid-typeorm-migration', 'apply']);
    console.log('✅ Database migrations applied');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    throw error;
  }
}

async function startServices() {
  console.log('🔄 Starting indexer services...');
  
  // Start processor in background
  const processor = spawn('node', ['-r', 'dotenv/config', 'lib/main.js'], {
    stdio: 'inherit',
    detached: false
  });
  
  // Give processor time to start
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Start GraphQL server
  const graphql = spawn('npx', ['squid-graphql-server', '--port', PORT], {
    stdio: 'inherit',
    detached: false
  });
  
  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 Shutting down...');
    processor.kill();
    graphql.kill();
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    console.log('🛑 Shutting down...');
    processor.kill();
    graphql.kill();
    process.exit(0);
  });
  
  console.log('✅ Services started successfully');
  console.log(`🌐 GraphQL API available at port ${PORT}`);
}

async function main() {
  try {
    await setupDatabase();
    await startServices();
    
    // Keep the process alive
    process.stdin.resume();
    
  } catch (error) {
    console.error('💥 Startup failed:', error.message);
    process.exit(1);
  }
}

main();
