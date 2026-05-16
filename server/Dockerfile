FROM node:24-alpine
WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the rest of the application files
COPY . .

# Expose the port the server runs on
EXPOSE 3001

# Start the server
CMD ["npm", "start"]
