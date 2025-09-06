require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("hardhat-gas-reporter");
require("solidity-coverage");

// Load environment variables
require("dotenv").config();

const PRIVATE_KEY =
  process.env.PRIVATE_KEY ||
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const INFURA_PROJECT_ID = process.env.INFURA_PROJECT_ID || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1, // Lower runs for smaller bytecode size
      },
      viaIR: false, // Disable via-IR to fix compilation hanging
      evmVersion: "cancun", // Support for transient storage
    },
  },

  networks: {
    hardhat: {
      chainId: 31337,
      gas: 12000000,
      blockGasLimit: 12000000,
      allowUnlimitedContractSize: true,
      timeout: 1800000,
    },

    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      accounts: [PRIVATE_KEY],
    },

    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_PROJECT_ID}`,
      chainId: 11155111,
      accounts: [PRIVATE_KEY],
      gas: 6000000,
      gasPrice: 20000000000, // 20 gwei
    },

    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
      chainId: 1,
      accounts: [PRIVATE_KEY],
      gas: 6000000,
      gasPrice: 20000000000, // 20 gwei
    },

    polygon: {
      url: `https://polygon-mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
      chainId: 137,
      accounts: [PRIVATE_KEY],
      gas: 6000000,
      gasPrice: 30000000000, // 30 gwei
    },

    polygonMumbai: {
      url: `https://polygon-mumbai.infura.io/v3/${INFURA_PROJECT_ID}`,
      chainId: 80001,
      accounts: [PRIVATE_KEY],
      gas: 6000000,
      gasPrice: 20000000000, // 20 gwei
    },

    base: {
      url: process.env.BASE_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts: [PRIVATE_KEY],
      gas: 6000000,
      gasPrice: 1000000000, // 1 gwei
    },

    "base-sepolia": {
      url: process.env.BASE_SEPOLIA_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts: [PRIVATE_KEY],
      gas: 6000000,
      gasPrice: 1000000000, // 1 gwei
    },
  },

  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      sepolia: ETHERSCAN_API_KEY,
      polygon: POLYGONSCAN_API_KEY,
      polygonMumbai: POLYGONSCAN_API_KEY,
      base: BASESCAN_API_KEY,
      "base-sepolia": BASESCAN_API_KEY,
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    coinmarketcap: COINMARKETCAP_API_KEY,
    gasPrice: 20,
  },

  mocha: {
    timeout: 300000, // 5 minutes
  },

  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
