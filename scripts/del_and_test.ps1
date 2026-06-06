# Delete all chat sessions in the Finance project, then route + answer a fresh
# set of NEW questions (route-agent picks the agent, then chat answers).
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:8000"; $PROJ = "6a1b6645a6ace21ecae80767"
$tok = (& curl.exe -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "@$env:TEMP\login.json" | ConvertFrom-Json).access_token
$papi = "$BASE/api/projects/$PROJ"

function PostJson($url, $obj) {
  $obj | ConvertTo-Json -Depth 12 | Out-File -Encoding ascii "$env:TEMP\body.json"
  & curl.exe -s --max-time 240 -X POST $url -H "Authorization: Bearer $tok" -H "Content-Type: application/json" -d "@$env:TEMP\body.json" | ConvertFrom-Json
}

# ── 1. Delete old chat sessions ──
$sessions = & curl.exe -s "$papi/chat/sessions" -H "Authorization: Bearer $tok" | ConvertFrom-Json
$delCount = 0
foreach ($s in $sessions) {
  & curl.exe -s -X DELETE "$papi/chat/sessions/$($s._id)" -H "Authorization: Bearer $tok" | Out-Null
  $delCount++
}
Write-Host "deleted $delCount old chat session(s)"
$after = & curl.exe -s "$papi/chat/sessions" -H "Authorization: Bearer $tok" | ConvertFrom-Json
Write-Host ("sessions remaining: " + (@($after).Count))

# ── 2. Agents + router candidates ──
$agents = & curl.exe -s "$papi/agents" -H "Authorization: Bearer $tok" | ConvertFrom-Json
$candidates = $agents | ForEach-Object { @{ id = $_._id; name = $_.name; description = $_.description } }
$byId = @{}; $agents | ForEach-Object { $byId[$_._id] = $_.name }
Write-Host ("agents: " + (($agents | ForEach-Object { $_.name }) -join ', '))

# ── 3. NEW questions: route -> chat -> answer ──
$questions = @(
  "Which product category generated the most revenue in 2024, and how much?",
  "What was our total marketing spend across all regions, and which channel cost the most?",
  "How many people work in the East region and who is its manager?",
  "Beyond the revenue target, what guidance or priorities did the board report mention for FY2024?",
  "According to the research, what does a high ROI indicate?"
)

foreach ($q in $questions) {
  Write-Host "`n============================================================"
  Write-Host ("Q: " + $q)
  # route
  $route = PostJson "$BASE/api/llm/route-agent" @{ message = $q; agents = $candidates }
  $aid = $route.agent_id
  $picked = if ($aid -and $byId[$aid]) { $byId[$aid] } else { "(none)" }
  Write-Host ("routed -> {0}  (confident={1})" -f $picked, $route.confident)
  if (-not $aid) { Write-Host "  no agent chosen; skipping"; Start-Sleep -Seconds 3; continue }
  Start-Sleep -Seconds 2
  # chat (fresh session)
  $r = PostJson "$papi/chat" @{ agent_id = $aid; message = $q; stream = $false }
  Write-Host ("A: " + $r.answer)
  if ($r.rows -and $r.rows.Count -gt 0) { Write-Host ("   [rows=$($r.rows.Count) cols=$($r.columns -join ', ')]") }
  Start-Sleep -Seconds 3
}
Write-Host "`nDONE."