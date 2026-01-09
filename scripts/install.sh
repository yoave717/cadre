#!/bin/bash
#
# Cadre CLI Installation Script for Mac/Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/yoave717/cadre/main/scripts/install.sh | bash
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Cadre CLI Installation          ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo -e "${YELLOW}Please install Node.js 20+ from https://nodejs.org${NC}"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}Error: Node.js version 20+ is required.${NC}"
    echo -e "${YELLOW}Current version: $(node -v)${NC}"
    echo -e "${YELLOW}Please upgrade Node.js from https://nodejs.org${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v) detected${NC}"

# Check for npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ npm $(npm -v) detected${NC}"

# Install cadre globally
echo ""
echo -e "${BLUE}Installing Cadre CLI...${NC}"

if npm install -g cadre 2>/dev/null; then
    echo -e "${GREEN}✓ Cadre installed successfully!${NC}"
else
    # If npm registry install fails, try from git
    echo -e "${YELLOW}Installing from GitHub...${NC}"
    npm install -g git+https://github.com/yoave717/cadre.git
    echo -e "${GREEN}✓ Cadre installed from GitHub!${NC}"
fi

# Verify installation
if command -v cadre &> /dev/null; then
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     Installation Complete!            ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
    echo ""
    echo -e "To get started:"
    echo -e "  1. Configure your API key:"
    echo -e "     ${BLUE}cadre config --key <your-openai-api-key>${NC}"
    echo -e ""
    echo -e "  2. Or create a ${BLUE}.env${NC} file:"
    echo -e "     ${BLUE}echo 'OPENAI_API_KEY=sk-...' > .env${NC}"
    echo -e ""
    echo -e "  3. Start Cadre:"
    echo -e "     ${BLUE}cadre${NC}"
    echo ""
    echo -e "Run ${BLUE}cadre --help${NC} for more options."
else
    echo -e "${RED}Installation may have failed. Please try manually:${NC}"
    echo -e "${YELLOW}npm install -g cadre${NC}"
    exit 1
fi
