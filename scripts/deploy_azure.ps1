#!/usr/bin/env pwsh
# Azure Container Apps deployment script for OpenBI
# Usage: .\scripts\deploy_azure.ps1
#
# Prerequisites: populate .env (see .env.example) and run:
#   az login
#   az acr login --name openbiacr2024

$az = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
$RG = "openbi-rg"
$ENV = "openbi-env"
$ACR = "openbiacr2024"
$ACR_SERVER = "openbiacr2024.azurecr.io"
$ACR_USER = "openbiacr2024"

# ── Load secrets from .env ───────────────────────────────────────────────────
$envFile = Join-Path $PSScriptRoot ".." ".env"
if (-not (Test-Path $envFile)) {
    Write-Error ".env file not found at $envFile. Copy .env.example and fill in your values."
    exit 1
}
$envVars = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*([^#=]+)=(.*)$" } | ForEach-Object {
    $k, $v = $Matches[1].Trim(), $Matches[2].Trim()
    $envVars[$k] = $v
}

$ACR_PASS     = $envVars["ACR_PASS"]
$MONGO_URI    = $envVars["MONGODB_URI"]
$JWT_SECRET   = $envVars["JWT_SECRET_KEY"]
$FERNET_KEY   = $envVars["FERNET_KEY"]
$TELEGRAM     = $envVars["TELEGRAM_BOT_TOKEN"]
$ADMIN_EMAIL  = $envVars["SUPER_ADMIN_EMAIL"]
$ADMIN_PASS   = $envVars["SUPER_ADMIN_PASSWORD"]
$CORS_ORIGINS = $envVars["CORS_ORIGINS"]

if (-not $ACR_PASS -or -not $MONGO_URI -or -not $JWT_SECRET) {
    Write-Error "Missing required env vars. Check your .env file."
    exit 1
}

Write-Host "=== Deploying OpenBI to Azure Container Apps ===" -ForegroundColor Cyan

# ── 1. MindsDB (internal) ───────────────────────────────────────────────────
Write-Host "`n[1/4] Deploying MindsDB..." -ForegroundColor Yellow
& $az containerapp create `
  --name mindsdb `
  --resource-group $RG `
  --environment $ENV `
  --image "$ACR_SERVER/openbi-mindsdb:latest" `
  --registry-server $ACR_SERVER `
  --registry-username $ACR_USER `
  --registry-password $ACR_PASS `
  --target-port 47334 `
  --ingress internal `
  --transport http `
  --min-replicas 1 --max-replicas 1 `
  --cpu 1.0 --memory 2.0Gi `
  --env-vars "MINDSDB_APIS=http" "MINDSDB_API_HTTP_HOST=0.0.0.0" `
  --output table 2>&1
Write-Host "MindsDB deployed." -ForegroundColor Green

# ── 2. Backend (internal) ───────────────────────────────────────────────────
Write-Host "`n[2/4] Deploying Backend..." -ForegroundColor Yellow
& $az containerapp create `
  --name backend `
  --resource-group $RG `
  --environment $ENV `
  --image "$ACR_SERVER/openbi-backend:latest" `
  --registry-server $ACR_SERVER `
  --registry-username $ACR_USER `
  --registry-password $ACR_PASS `
  --target-port 8000 `
  --ingress internal `
  --transport http `
  --min-replicas 1 --max-replicas 2 `
  --cpu 0.5 --memory 1.0Gi `
  --env-vars `
    "MONGODB_URI=$MONGO_URI" `
    "MONGODB_DB_NAME=openbi" `
    "JWT_SECRET_KEY=$JWT_SECRET" `
    "JWT_ALGORITHM=HS256" `
    "JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440" `
    "MINDSDB_URL=http://mindsdb" `
    "FERNET_KEY=$FERNET_KEY" `
    "TELEGRAM_BOT_TOKEN=$TELEGRAM" `
    "UPLOAD_DIR=/app/uploads" `
    "MAX_UPLOAD_SIZE_MB=50" `
    "SUPER_ADMIN_EMAIL=$ADMIN_EMAIL" `
    "SUPER_ADMIN_PASSWORD=$ADMIN_PASS" `
    "CORS_ORIGINS=$CORS_ORIGINS" `
    "APP_URL=https://frontend.livelywave-96d95de9.eastus.azurecontainerapps.io" `
    "SMTP_HOST=smtp.gmail.com" `
    "SMTP_PORT=587" `
    "PDF_FONT=Inter" `
    "PRESENTON_USERNAME=openbi" `
    "PRESENTON_PASSWORD=openbi_pptx_2024" `
  --output table 2>&1
Write-Host "Backend deployed." -ForegroundColor Green

# ── 3. Presenton (internal) ─────────────────────────────────────────────────
Write-Host "`n[3/4] Deploying Presenton..." -ForegroundColor Yellow
& $az containerapp create `
  --name presenton `
  --resource-group $RG `
  --environment $ENV `
  --image "$ACR_SERVER/openbi-presenton:latest" `
  --registry-server $ACR_SERVER `
  --registry-username $ACR_USER `
  --registry-password $ACR_PASS `
  --target-port 80 `
  --ingress internal `
  --transport http `
  --min-replicas 1 --max-replicas 1 `
  --cpu 0.5 --memory 1.0Gi `
  --env-vars `
    "AUTH_USERNAME=openbi" `
    "AUTH_PASSWORD=openbi_pptx_2024" `
    "LLM=google" `
  --output table 2>&1
Write-Host "Presenton deployed." -ForegroundColor Green

# ── 4. Frontend (external / public) ─────────────────────────────────────────
Write-Host "`n[4/4] Deploying Frontend..." -ForegroundColor Yellow
& $az containerapp create `
  --name frontend `
  --resource-group $RG `
  --environment $ENV `
  --image "$ACR_SERVER/openbi-frontend:latest" `
  --registry-server $ACR_SERVER `
  --registry-username $ACR_USER `
  --registry-password $ACR_PASS `
  --target-port 3000 `
  --ingress external `
  --transport http `
  --min-replicas 1 --max-replicas 2 `
  --cpu 0.5 --memory 1.0Gi `
  --env-vars `
    "VITE_API_URL=" `
    "API_PROXY_TARGET=http://backend" `
    "WS_PROXY_TARGET=ws://backend" `
    "PRESENTON_PROXY_TARGET=http://presenton" `
  --output table 2>&1
Write-Host "Frontend deployed." -ForegroundColor Green

# ── Show final URL ───────────────────────────────────────────────────────────
Write-Host "`n=== Deployment complete! ===" -ForegroundColor Cyan
$fqdn = (& $az containerapp show --name frontend --resource-group $RG --query "properties.configuration.ingress.fqdn" -o tsv 2>&1)
Write-Host "OpenBI is live at: https://$fqdn" -ForegroundColor Green
