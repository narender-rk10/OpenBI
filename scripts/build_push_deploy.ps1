$log = "C:\Users\NARENDER KESWANI\Documents\OpenBI\scripts\build_deploy_log.txt"
$proj = "C:\Users\NARENDER KESWANI\Documents\OpenBI"
$az = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
$tag = "prod-20260628-v2"
$image = "openbiacr2024.azurecr.io/openbi-frontend:$tag"
$rg = "openbi-rg"
$env_name = "openbi-env"

function Log($m) { $ts = Get-Date -Format "HH:mm:ss"; Add-Content $log "$ts  $m" -Encoding UTF8; Write-Host "$ts  $m" }

"" | Set-Content $log -Encoding UTF8
Log "=== Build+Push+Deploy started ==="
Log "Tag: $tag"

Log "Building..."
docker build -t $image -f "$proj\Dockerfile.frontend" "$proj\frontend" 2>&1 | ForEach-Object { Log $_ }
if ($LASTEXITCODE -ne 0) { Log "BUILD FAILED"; exit 1 }
Log "Build OK"

Log "Logging in to ACR..."
& $az acr login --name openbiacr2024 2>&1 | ForEach-Object { Log $_ }

Log "Pushing..."
docker push $image 2>&1 | ForEach-Object { Log $_ }
if ($LASTEXITCODE -ne 0) { Log "PUSH FAILED"; exit 1 }
Log "Push OK"

Log "Deploying with https:// proxy targets..."
& $az containerapp update `
  --name frontend `
  --resource-group $rg `
  --image $image `
  --revision-suffix "v2" `
  --set-env-vars `
    "API_PROXY_TARGET=https://backend.internal.livelywave-96d95de9.eastus.azurecontainerapps.io" `
    "WS_PROXY_TARGET=https://backend.internal.livelywave-96d95de9.eastus.azurecontainerapps.io" `
    "PRESENTON_PROXY_TARGET=https://presenton.internal.livelywave-96d95de9.eastus.azurecontainerapps.io" `
  --query "properties.latestRevisionName" -o tsv 2>&1 | ForEach-Object { Log $_ }
Log "=== Done ==="
