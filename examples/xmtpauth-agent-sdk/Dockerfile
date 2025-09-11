FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./
COPY .yarnrc.yml ./

# Install dependencies
RUN yarn install --no-immutable

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build the application
RUN yarn build

# Start the agent
CMD ["yarn", "start"]
