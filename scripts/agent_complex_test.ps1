# Create a complex multi-source agent and exercise pdf+sql, sql1+sql2 (federated),
# web RAG, and ETL-style prompts. All over HTTP/JWT.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:8000"; $PROJ = "6a1b6645a6ace21ecae80767"
$pgConn = "6a1b67dea6ace21ecae80768"   # Finance Postgres (sales, budget)
$myConn = "6a1b67dfa6ace21ecae80769"   # Ops MySQL (marketing_spend, region_info)
$boardKb = "6a1b67e0a6ace21ecae8076a"  # Board Reports (file)
$webKb = "6a1b68a4a6ace21ecae8076b"    # Web Research (crawl)

$tok = (& curl.exe -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "@$env:TEMP\login.json" | ConvertFrom-Json).access_token
$base = "$BASE/api/projects/$PROJ"

# ── Create complex agent wired to BOTH SQL sources + BOTH KBs ──
$prompt = @"
You are a senior finance data analyst for Acme Corp. You have:
- SQL access to PostgreSQL (tables: sales [region, product_category, units, revenue, sale_date], budget [region, product_category, month, budget_amount]).
- SQL access to MySQL (tables: marketing_spend [region, month, channel, spend], region_info [region, manager, hq_city, headcount]).
- A 'Board Reports' knowledge base with FY2024 targets and guidance.
- A 'Web Research' knowledge base about Return on Investment.
You can run cross-source (federated) SQL joining PostgreSQL and MySQL tables in the same query.
For ETL-style requests: EXTRACT from the right sources, TRANSFORM (aggregate, join, compute derived metrics like budget variance % and marketing ROI = revenue/spend), and present clear, specific numbers in a table. Cite the board report for targets. Be concise and quantitative.
"@
$agentBody = @{
  name = "Finance Analyst"
  description = "Cross-source analyst: Postgres + MySQL + board report + web research"
  icon = "bot"
  skills = @(
    @{ type = "text2sql"; connection_id = $pgConn; tables = @("sales","budget"); description = "PostgreSQL finance: revenue/units (sales) and budget_amount (budget)" },
    @{ type = "text2sql"; connection_id = $myConn; tables = @("marketing_spend","region_info"); description = "MySQL ops: marketing spend by channel and region info" },
    @{ type = "knowledge_base"; kb_id = $boardKb; description = "Board report: FY2024 revenue target and guidance" },
    @{ type = "knowledge_base"; kb_id = $webKb; description = "Web research: how ROI is defined/calculated" }
  )
  prompt_template = $prompt
}
$agentBody | ConvertTo-Json -Depth 12 | Out-File -Encoding ascii "$env:TEMP\agent.json"
$agent = & curl.exe -s -X POST "$base/agents" -H "Authorization: Bearer $tok" -H "Content-Type: application/json" -d "@$env:TEMP\agent.json" | ConvertFrom-Json
if (-not $agent._id) { Write-Host ("AGENT CREATE FAILED: " + ($agent | ConvertTo-Json -Compress)); exit 1 }
Write-Host ("agent created: $($agent._id) ($($agent.name))  skills=$($agent.skills.Count)")
$aid = $agent._id

function Chat($label, $msg, $sid) {
  $b = @{ agent_id = $aid; message = $msg; stream = $false }
  if ($sid) { $b.session_id = $sid }
  $b | ConvertTo-Json -Compress | Out-File -Encoding ascii "$env:TEMP\chat.json"
  $r = & curl.exe -s --max-time 240 -X POST "$base/chat" -H "Authorization: Bearer $tok" -H "Content-Type: application/json" -d "@$env:TEMP\chat.json" | ConvertFrom-Json
  Write-Host "`n========================================================"
  Write-Host "[$label]"
  Write-Host ("Q: " + $msg)
  Write-Host ("A: " + $r.answer)
  if ($r.rows -and $r.rows.Count -gt 0) { Write-Host ("rows: " + $r.rows.Count + " | cols: " + ($r.columns -join ', ')) }
  return $r.session_id
}

$sid = Chat "1. pdf+sql (board target vs actual)" "According to the board report, what was the FY2024 revenue target, and how does our actual total revenue from the sales table compare to it? State both figures and the gap." $null
Chat "2. sql1+sql2 (federated ROI)" "Calculate marketing ROI by region = total revenue from the sales table (PostgreSQL) divided by total marketing spend from marketing_spend (MySQL). Show region, revenue, spend, and ROI, sorted by ROI descending." $sid | Out-Null
Chat "3. web RAG" "Using the web research knowledge base, how is Return on Investment (ROI) defined or calculated?" $sid | Out-Null
Chat "4. ETL: regional performance summary" "Build a regional performance summary: for each region show total revenue, total budget_amount, budget variance percent ((revenue-budget)/budget*100), total marketing spend, and ROI (revenue/spend). Sort by ROI descending." $sid | Out-Null
Chat "5. ETL: monthly trend (West)" "For the West region, show the monthly 2024 trend of total revenue versus total marketing spend, month by month." $sid | Out-Null

Write-Host "`n========================================================"
Write-Host ("DONE. agent_id=$aid session_id=$sid")