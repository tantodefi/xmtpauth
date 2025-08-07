#!/bin/bash

echo "🚀 Setting up Complete XMTP EVMAuth Integration"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "index.ts" ]; then
    echo -e "${RED}❌ Please run this script from the examples/xmtp-evmauth-groups directory${NC}"
    exit 1
fi

echo -e "${BLUE}Step 1: Setting up smart contracts...${NC}"
cd ../../contracts

# Make setup script executable if not already
chmod +x setup.sh install-foundry.sh

# Check if forge is installed
if ! command -v forge &> /dev/null; then
    echo -e "${YELLOW}⚠️  Foundry not found. Installing...${NC}"
    ./install-foundry.sh
    
    # Source environment
    source ~/.bashrc
    
    # Check again
    if ! command -v forge &> /dev/null; then
        echo -e "${RED}❌ Foundry installation failed. Please install manually: https://book.getfoundry.sh/getting-started/installation${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Foundry is installed${NC}"

# Run setup
echo -e "${BLUE}Running contract setup...${NC}"
./setup.sh

# Check if setup was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Contracts setup completed${NC}"
else
    echo -e "${RED}❌ Contract setup failed${NC}"
    exit 1
fi

echo -e "${BLUE}Step 2: Configuring environment...${NC}"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit contracts/.env with your values:${NC}"
    echo "   - PRIVATE_KEY (your wallet private key)"
    echo "   - BASE_RPC_URL (Base network RPC)"
    echo "   - FEE_RECIPIENT (your fee collection address)"
    echo ""
    echo -e "${BLUE}Press any key to continue after editing .env...${NC}"
    read -n 1 -s
fi

echo -e "${BLUE}Step 3: Deploying contracts to testnet...${NC}"

# Deploy to Base Sepolia
echo -e "${YELLOW}Deploying to Base Sepolia testnet...${NC}"
npm run deploy:base-sepolia

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Factory contract deployed${NC}"
else
    echo -e "${RED}❌ Factory deployment failed${NC}"
    exit 1
fi

# Deploy test group
echo -e "${YELLOW}Deploying test group...${NC}"
npm run deploy-test:base-sepolia

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Test group deployed${NC}"
else
    echo -e "${RED}❌ Test group deployment failed${NC}"
    exit 1
fi

echo -e "${BLUE}Step 4: Configuring XMTP Agent...${NC}"
cd ../examples/xmtp-evmauth-groups

# Check if deployment info exists
if [ -f "../../contracts/deployment-info.env" ]; then
    echo -e "${YELLOW}Updating agent configuration with deployed contract addresses...${NC}"
    
    # Extract factory address from deployment info
    FACTORY_ADDRESS=$(grep "EVMAUTH_FACTORY_ADDRESS" ../../contracts/deployment-info.env | cut -d'=' -f2)
    
    if [ ! -z "$FACTORY_ADDRESS" ]; then
        # Update or create agent .env
        if [ ! -f ".env" ]; then
            cp .env.example .env 2>/dev/null || echo "# XMTP EVMAuth Groups Agent Configuration" > .env
        fi
        
        # Add factory address to agent .env
        echo "EVMAUTH_FACTORY_ADDRESS=$FACTORY_ADDRESS" >> .env
        echo -e "${GREEN}✅ Factory address added to agent configuration${NC}"
    else
        echo -e "${RED}❌ Could not find factory address in deployment info${NC}"
    fi
else
    echo -e "${RED}❌ Deployment info file not found${NC}"
fi

# Generate agent keys if needed
if [ ! -f ".env" ] || ! grep -q "WALLET_KEY" .env; then
    echo -e "${YELLOW}Generating XMTP agent keys...${NC}"
    yarn gen:keys
    echo -e "${GREEN}✅ Agent keys generated${NC}"
fi

echo -e "${BLUE}Step 5: Testing integration...${NC}"

# Build the agent
echo -e "${YELLOW}Building agent...${NC}"
yarn build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Agent built successfully${NC}"
else
    echo -e "${RED}❌ Agent build failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Complete Integration Setup Completed!${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Start the agent: ${YELLOW}yarn dev${NC}"
echo "2. Test group creation: Send ${YELLOW}/create-group \"Test Community\"${NC}"
echo "3. Test token purchase: Send ${YELLOW}/buy-access <group_id> basic${NC}"
echo ""
echo -e "${BLUE}Deployment Info:${NC}"
if [ -f "../../contracts/deployment-info.env" ]; then
    cat ../../contracts/deployment-info.env | sed 's/^/   /'
fi
echo ""
echo -e "${BLUE}Test Group Info:${NC}"
if [ -f "../../contracts/test-group-info.env" ]; then
    cat ../../contracts/test-group-info.env | sed 's/^/   /'
fi
echo ""
echo -e "${YELLOW}📚 For complete documentation, see:${NC}"
echo "   - Smart Contracts: contracts/README.md"
echo "   - XMTP Agent: examples/xmtp-evmauth-groups/README.md"
echo "   - Integration Guide: COMPLETE_INTEGRATION_GUIDE.md"
echo ""
echo -e "${GREEN}🚀 Your XMTP EVMAuth Groups Agent is ready to monetize communities!${NC}"