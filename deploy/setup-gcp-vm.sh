#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Argon GCP VM Bootstrap Script (Ubuntu 22.04 / 24.04 LTS)
# Installs Docker, Docker Compose plugin, Git, and configures UFW firewall
# ==============================================================================

echo "===> Updating package index..."
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    git \
    ufw

echo "===> Adding official Docker repository..."
sudo install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc
fi

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

echo "===> Installing Docker and Docker Compose plugin..."
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "===> Adding current user to docker group..."
sudo usermod -aG docker "$USER" || true

echo "===> Configuring UFW firewall (Allow SSH, HTTP, HTTPS)..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP Caddy'
sudo ufw allow 443/tcp comment 'HTTPS Caddy'
echo "y" | sudo ufw enable

echo "===> Verifying installation..."
docker --version
docker compose version

echo "================================================================================"
echo " VM setup complete! Log out and back in (or run 'newgrp docker') to use docker."
echo " Next steps:"
echo " 1. Clone your repo or copy the project files to this VM."
echo " 2. Copy .env.production.example to .env.production and fill in secrets."
echo " 3. Run: docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build"
echo "================================================================================"

