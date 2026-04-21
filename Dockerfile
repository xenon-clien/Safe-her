# Use Node.js 18 LTS
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application
COPY . .

# Environment variables
ENV NODE_ENV=production

# The port is handled by docker-compose or environment
EXPOSE 5000 3300

# Default command (can be overridden in docker-compose)
CMD ["node", "api/server.js"]
