$log = "C:\Users\NARENDER KESWANI\Documents\OpenBI\scripts\push_acr_log.txt"
$az = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"

function Log($msg) {
    $ts = Get-Date -Format "HH:mm:ss"
    Add-Content -Path $log -Value "$ts  $msg" -Encoding UTF8
    Write-Host "$ts  $msg"
}

"" | Set-Content $log -Encoding UTF8
Log "=== ACR Push started ==="

Log "Logging in to ACR..."
$loginOut = & $az acr login --name openbiacr2024 2>&1
Log "$loginOut"

$images = @(
    "openbiacr2024.azurecr.io/openbi-backend:latest",
    "openbiacr2024.azurecr.io/openbi-frontend:latest",
    "openbiacr2024.azurecr.io/openbi-mindsdb:latest",
    "openbiacr2024.azurecr.io/openbi-presenton:latest"
)

foreach ($img in $images) {
    Log ">>> Pushing $img ..."
    $out = docker push $img 2>&1
    $out | ForEach-Object { Log $_ }
    if ($LASTEXITCODE -ne 0) {
        Log "ERROR pushing $img (exit $LASTEXITCODE)"
    } else {
        Log "OK: $img pushed successfully"
    }
}

Log "=== All done ==="
