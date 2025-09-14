#!/bin/bash

# Nginx Setup Script for Advanced Video Player Browser
# This script helps you configure Nginx for the video player application
# All endpoints are under /player/ path

echo "🎬 Setting up Nginx for Advanced Video Player Browser..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the current directory
CURRENT_DIR=$(pwd)
echo -e "${BLUE}Current directory: $CURRENT_DIR${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}Warning: This script should be run with sudo for Nginx configuration${NC}"
    echo "You may need to run: sudo ./setup-nginx.sh"
fi

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
    echo -e "${RED}Nginx is not installed. Please install Nginx first:${NC}"
    echo "Ubuntu/Debian: sudo apt update && sudo apt install nginx"
    echo "CentOS/RHEL: sudo yum install nginx"
    echo "macOS: brew install nginx"
    exit 1
fi

echo -e "${GREEN}✓ Nginx is installed${NC}"

# Create Nginx site configuration
NGINX_SITE_CONFIG="/etc/nginx/sites-available/video-player"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/video-player"

echo -e "${BLUE}Creating Nginx site configuration...${NC}"

# Update the nginx.conf with the correct paths
sed "s|/Users/gtoptuno/Code/videoPlayer|$CURRENT_DIR|g" nginx.conf > temp_nginx.conf

# Copy configuration to Nginx sites-available
if [ -w "/etc/nginx/sites-available/" ]; then
    sudo cp temp_nginx.conf "$NGINX_SITE_CONFIG"
    echo -e "${GREEN}✓ Configuration copied to $NGINX_SITE_CONFIG${NC}"
else
    echo -e "${YELLOW}Please copy the nginx.conf file to /etc/nginx/sites-available/video-player manually${NC}"
    echo "Command: sudo cp nginx.conf /etc/nginx/sites-available/video-player"
fi

# Create symbolic link to sites-enabled
if [ -w "/etc/nginx/sites-enabled/" ]; then
    if [ -L "$NGINX_SITE_ENABLED" ]; then
        sudo rm "$NGINX_SITE_ENABLED"
    fi
    sudo ln -s "$NGINX_SITE_CONFIG" "$NGINX_SITE_ENABLED"
    echo -e "${GREEN}✓ Site enabled${NC}"
else
    echo -e "${YELLOW}Please create a symbolic link manually:${NC}"
    echo "sudo ln -s /etc/nginx/sites-available/video-player /etc/nginx/sites-enabled/"
fi

# Test Nginx configuration
echo -e "${BLUE}Testing Nginx configuration...${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}✓ Nginx configuration is valid${NC}"
else
    echo -e "${RED}✗ Nginx configuration has errors${NC}"
    echo "Please check the configuration and try again"
    exit 1
fi

# Create necessary directories
echo -e "${BLUE}Creating necessary directories...${NC}"
mkdir -p "$CURRENT_DIR/thumbnails"
mkdir -p "$CURRENT_DIR/videos"
mkdir -p "$CURRENT_DIR/logs"

# Set proper permissions
chmod 755 "$CURRENT_DIR/thumbnails"
chmod 755 "$CURRENT_DIR/videos"
chmod 755 "$CURRENT_DIR/logs"

echo -e "${GREEN}✓ Directories created with proper permissions${NC}"

# Create systemd service file for Node.js app
echo -e "${BLUE}Creating systemd service for Node.js application...${NC}"

SERVICE_FILE="/etc/systemd/system/video-player.service"
cat > temp_service << EOF
[Unit]
Description=Advanced Video Player Browser
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$CURRENT_DIR
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=4000

[Install]
WantedBy=multi-user.target
EOF

if [ -w "/etc/systemd/system/" ]; then
    sudo cp temp_service "$SERVICE_FILE"
    sudo systemctl daemon-reload
    sudo systemctl enable video-player
    echo -e "${GREEN}✓ Systemd service created and enabled${NC}"
else
    echo -e "${YELLOW}Please create the systemd service manually:${NC}"
    echo "Copy the service file to /etc/systemd/system/video-player.service"
fi

# Clean up temporary files
rm -f temp_nginx.conf temp_service

echo -e "${GREEN}🎉 Nginx setup completed!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Start the Node.js application:"
echo "   sudo systemctl start video-player"
echo "   # or manually: node server.js"
echo ""
echo "2. Restart Nginx:"
echo "   sudo systemctl restart nginx"
echo ""
echo "3. Check status:"
echo "   sudo systemctl status video-player"
echo "   sudo systemctl status nginx"
echo ""
echo "4. Access your application:"
echo "   http://localhost/player/"
echo ""
echo -e "${YELLOW}Note: Make sure to update the server_name in the Nginx configuration${NC}"
echo "if you're using a domain name instead of localhost."
echo ""
echo -e "${BLUE}Configuration files created:${NC}"
echo "- Nginx config: $NGINX_SITE_CONFIG"
echo "- Systemd service: $SERVICE_FILE"
echo "- Application logs: $CURRENT_DIR/logs/"
