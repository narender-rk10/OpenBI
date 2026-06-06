# Replace the single combined agent with 4 specialized single-domain agents,
# then test the LLM router (/api/llm/route-agent) picks the right one per question.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:8000"; $PROJ = "6a1b6645a6ace21ecae80767"
$pgConn = "6a1b67dea6ace21ecae80768"
$myConn = "6a1b67dfa6ace21ecae80769"
$boardKb = "6a1b67e0a6ace21ecae8076a"
$webKb = "6a1b68a4a6ace21ecae8076b"
$tok = (& curl.exe -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "@$env:TEMP\login.json" | ConvertFrom-Json).access_token
$papi = "$BASE/api/projects/$PROJ"   # NOTE: PowerShell vars are case-insensitive — never name this $base (clobbers $BASE)

function PostJson($url, $obj) {
  $obj | ConvertTo-Json -Depth 12 | Out-File -Encoding ascii "$env:TEMP\body.json"
  & curl.exe -s --max-time 120 -X POST $url -H "Authorization: Bearer $tok" -H "Content-Type: application/json" -d "@$env:TEMP\body.json" | ConvertFrom-Json
}

# ── Clean existing agents in this project (keep a clean routing test) ──
$existing = & curl.exe -s "$papi/agents" -H "Authorization: Bearer $tok" | ConvertFrom-Json
foreach ($a in $existing) {
  & curl.exe -s -X DELETE "$papi/agents/$($a._id)" -H "Authorization: Bearer $tok" | Out-Null
  Write-Host "deleted old agent: $($a.name)"
}

# ── Create 4 specialized agents with DISTINCT descriptions (router uses these) ──
$defs = @(
  @{ name = "Sales Agent"; description = "Answers questions about sales revenue, units sold, budgets, budget variance, regions and product categories. Backed by the PostgreSQL sales and budget tables.";
     skills = @(@{ type="text2sql"; connection_id=$pgConn; tables=@("sales","budget"); description="PostgreSQL sales revenue/units and budget_amount" }) },
  @{ name = "Marketing Agent"; description = "Answers questions about marketing spend, advertising cost by channel (Online, Retail, Events), and regional team info such as managers, HQ city and headcount. Backed by MySQL.";
     skills = @(@{ type="text2sql"; connection_id=$myConn; tables=@("marketing_spend","region_info"); description="MySQL marketing spend by channel and region_info" }) },
  @{ name = "Board Report Agent"; description = "Answers questions about FY2024 financial targets, the revenue goal, board guidance and strategic priorities. Backed by the company board report document.";
     skills = @(@{ type="knowledge_base"; kb_id=$boardKb; description="Board report with FY2024 targets" }) },
  @{ name = "ROI Research Agent"; description = "Answers conceptual finance questions such as how Return on Investment (ROI) is defined and calculated. Backed by web research articles.";
     skills = @(@{ type="knowledge_base"; kb_id=$webKb; description="Web research on ROI definitions" }) }
)
$agents = @()
foreach ($d in $defs) {
  $a = PostJson "$papi/agents" $d
  if (-not $a._id) { Write-Host ("CREATE FAILED for $($d.name): " + ($a | ConvertTo-Json -Compress)); continue }
  $agents += [pscustomobject]@{ id = $a._id; name = $a.name; description = $d.description }
  Write-Host "created agent: $($a.name)  ($($a._id))"
}

# Candidate list for the router (id, name, description)
$candidates = $agents | ForEach-Object { @{ id = $_.id; name = $_.name; description = $_.description } }
$byId = @{}; $agents | ForEach-Object { $byId[$_.id] = $_.name }

# ── Routing test cases: question -> expected agent ──
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
  $r = PostJson "$BASE/api/llm/route-agent" @{ message = $c.q; agents = $candidates }
  $picked = if ($r.agent_id -and $byId[$r.agent_id]) { $byId[$r.agent_id] } else { "(none)" }
  $ok = $picked -eq $c.expect
  if ($ok) { $pass++ }
  Write-Host ("[{0}] expect={1,-20} picked={2,-20} confident={3}" -f $(if($ok){"PASS"}else{"FAIL"}), $c.expect, $picked, $r.confident)
  Write-Host ("        Q: " + $c.q)
  Write-Host ("        reason: " + $r.reason)
}
Write-Host "`nROUTING: $pass/$($cases.Count) correct"
Write-Host ("agents: " + (($agents | ForEach-Object { $_.name }) -join ', '))