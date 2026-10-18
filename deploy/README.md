# Argon Production Deployment Guide (GCP Compute Engine)

This guide walks you through deploying **Argon** on a single Google Cloud Platform (GCP) Compute Engine VM with Docker Compose, FalkorDB, and Caddy (automatic HTTPS).

---

## 1. Prerequisites

- A GCP account with a project created.
- The `gcloud` CLI authenticated (`gcloud auth login`) or access to the [Google Cloud Console](https://console.cloud.google.com).
- A domain name (e.g., `argon.yourdomain.com`) pointing to your VM's external IP address via an **A Record**.

---

## 2. Provision the GCP VM

Run the following commands with `gcloud` (or configure via the GCP Console):

### A. Create the VM Instance
Create an `e2-medium` (2 vCPUs burstable, 4 GB RAM, 30 GB balanced disk):

```bash
gcloud compute instances create argon-prod \
    --project="YOUR_GCP_PROJECT_ID" \
    --zone="us-central1-a" \
    --machine-type="e2-medium" \
    --image-family="ubuntu-2404-lts-amd64" \
    --image-project="ubuntu-os-cloud" \
    --boot-disk-size="30GB" \
    --boot-disk-type="pd-balanced" \
    --tags="http-server,https-server"
```

### B. Ensure Firewall Rules are Open for Ports 80 and 443

```bash
# Allow HTTP
gcloud compute firewall-rules create allow-http \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:80 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=http-server

# Allow HTTPS
gcloud compute firewall-rules create allow-https \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:443 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=https-server
```

### C. Find the External IP Address
```bash
gcloud compute instances describe argon-prod \
    --zone="us-central1-a" \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

Point your domain's DNS `A` record (e.g. `argon.example.com`) to this IP address.

---

## 3. Bootstrap the VM

SSH into the VM:

```bash
gcloud compute ssh argon-prod --zone="us-central1-a"
```

Clone your repository (or copy the project directory to the VM):

```bash
git clone https://github.com/your-username/argon.git
cd argon
```

Run the automated VM bootstrap script to install Docker, Docker Compose, and configure UFW:

```bash
./deploy/setup-gcp-vm.sh
```

Apply the new Docker group to your current shell:

```bash
newgrp docker
```

---

## 4. Configure Environment Variables

Copy the production environment template:

```bash
cp .env.production.example .env.production
```

Edit `.env.production` with your favorite editor (`nano .env.production`):

```bash
# Public Domain
DOMAIN=argon.yourdomain.com
ACME_EMAIL=your-email@example.com

# Generate with: openssl rand -hex 32
GATEWAY_SECRET=<your-64-char-hex-secret>
BETTER_AUTH_SECRET=<your-64-char-hex-secret>

# Google Gemini API key
GEMINI_API_KEY=<your-gemini-api-key>

# Embedding Provider ('gemini' is recommended in production)
EMBEDDING_PROVIDER=gemini

# GitHub OAuth App credentials (from https://github.com/settings/developers)
# - Homepage URL: https://argon.yourdomain.com
# - Authorization callback URL: https://argon.yourdomain.com/api/auth/callback/github
GITHUB_CLIENT_ID=<your-github-client-id>
GITHUB_CLIENT_SECRET=<your-github-client-secret>
```

---

## 5. Launch the Application

Build the containers and start the services in detached mode:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Monitor container health and startup logs:

```bash
# Check running container statuses
docker compose -f docker-compose.prod.yml ps

# Follow logs
docker compose -f docker-compose.prod.yml logs -f
```

Caddy will automatically contact Let's Encrypt, issue a TLS certificate for `DOMAIN`, and start reverse proxying traffic. You can now visit `https://argon.yourdomain.com` in your browser!

---

## 6. Maintenance & Operations

### Stopping and Restarting
```bash
# Stop services
docker compose -f docker-compose.prod.yml down

# Start services
docker compose -f docker-compose.prod.yml up -d
```

### Applying Code Updates
```bash
git pull origin main
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

### Backing Up Data
All critical data is persisted across container updates in Docker volumes:
- `falkordb_data`: FalkorDB knowledge graph and IngestJob records (`/var/lib/falkordb/data`).
- `web_auth_data`: Better Auth user accounts and sessions SQLite database (`/app/data/auth.sqlite`).

To back up:
```bash
# Create a timestamped backup of the volumes
docker run --rm \
  -v argon_falkordb_data:/falkor_data:ro \
  -v argon_web_auth_data:/web_data:ro \
  -v $(pwd):/backup \
  alpine tar czf /backup/argon-backup-$(date +%F).tar.gz -C / falkor_data web_data
```

