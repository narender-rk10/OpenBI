# Routing-only test against the 4 existing agents, throttled to avoid Gemini rate limits.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:8000"; $PROJ = "6a1b6645a6ace21ecae80767"
$tok = (& curl.exe -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "@$env:TEMP\login.json" | ConvertFrom-Json).access_token
$papi = "$BASE/api/projects/$PROJ"   # NOTE: PowerShell vars are case-insensitive — do NOT name this $base (would clobber $BASE)

# Pull current agents (id, name, description) straight from the API
$agents = & curl.exe -s "$papi/agents" -H "Authorization: Bearer $tok" | ConvertFrom-Json
$candidates = $agents | ForEach-Object { @{ id = $_._id; name = $_.name; description = $_.description } }
$byId = @{}; $agents | ForEach-Object { $byId[$_._id] = $_.name }
Write-Host ("agents: " + (($agents | ForEach-Object { $_.name }) -join ', '))

$cases = @(
  @{ q = "What was our total revenue by region in 2024?"; expect = "Sales Agent" },
  @{ q = "How much did we spend on marketing through the Events channel?"; expect = "Marketing Agent" },
  @{ q = "Who manages the West region and how many people are on the team?"; expect = "Marketing Agent" },
  @{ q = "What revenue target did the board set for FY2024?"; expect = "Board Report Agent" },
  @{ q = "How is return on investment calculated?"; expect = "ROI Research Agent" },
  @{ q = "Show budget variance percent by product category"; expect = "Sales Agent" }
)

Write-Host "`n================= ROUTING RESULTS ================="
$pass = 0
foreach ($c in $cases) {
  @{ message = $c.q; agents = $candidates } | ConvertTo-Json -Depth 12 | Out-File -Encoding ascii "$env:TEMP\body.json"
  $raw = & curl.exe -s --max-time 120 -X POST "$BASE/api/llm/route-agent" -H "Authorization: Bearer $tok" -H "Content-Type: application/json" -d "@$env:TEMP\body.json"
  try { $r = $raw | ConvertFrom-Json } catch { $r = $null }
  $picked = if ($r -and $r.agent_id -and $byId[$r.agent_id]) { $byId[$r.agent_id] } else { "(none)" }
  $ok = $picked -eq $c.expect
  if ($ok) { $pass++ }
  Write-Host ("[{0}] expect={1,-19} picked={2,-19} confident={3}" -f $(if($ok){"PASS"}else{"FAIL"}), $c.expect, $picked, $r.confident)
  Write-Host ("        Q: " + $c.q)
  if ($picked -eq "(none)") { Write-Host ("        RAW: " + $raw) } else { Write-Host ("        reason: " + $r.reason) }
  Start-Sleep -Seconds 3   # throttle to avoid Gemini rate limits
}
Write-Host "`nROUTING: $pass/$($cases.Count) correct"