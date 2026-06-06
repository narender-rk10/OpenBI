# End-to-end finance test driven entirely over HTTP from the host (no docker exec).
# Auth via real JWT login. Uses Invoke-RestMethod for JSON, curl.exe for multipart
# upload, Invoke-WebRequest for binary PDF/PPTX downloads.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:8000"
$results = @()
function Rec($name, $ok, $detail) {
  $status = if ($ok) { "PASS" } else { "FAIL" }
  $script:results += [pscustomobject]@{ name = $name; status = $status; detail = "$detail" }
  Write-Host "[$status] $name :: $detail"
}
function Body($o) { $o | ConvertTo-Json -Depth 12 -Compress }

# ── 1. JWT login ──
$login = Invoke-RestMethod -Uri "$BASE/api/auth/login" -Method Post -ContentType "application/json" -Body (Body @{ email = "admin@openbi.dev"; password = "changeme123" })
$tok = $login.access_token
$H = @{ Authorization = "Bearer $tok" }
Rec "auth.login" ($tok.Length -gt 50) "role=$($login.user.role) token_len=$($tok.Length)"

$ts = [int][double]::Parse((Get-Date -UFormat %s))

# ── 2. project ──
$proj = Invoke-RestMethod -Uri "$BASE/api/projects" -Method Post -Headers $H -ContentType "application/json" -Body (Body @{ name = "Finance_HTTP_$ts"; description = "finance via http api" })
$projId = $proj._id; $base = "$BASE/api/projects/$projId"
Rec "project.create" ($projId.Length -gt 0) $projId

# ── 3. connection (finance-pg) ──
$pg = @{ host = "finance-pg"; port = 5432; database = "openbi_finance"; user = "demo"; password = "demo" }
$conn = Invoke-RestMethod -Uri "$base/connections" -Method Post -Headers $H -ContentType "application/json" -Body (Body @{ name = "FinancePG"; engine = "postgres"; category = "Database"; parameters = $pg })
$connId = $conn._id; $connDb = $conn.mindsdb_db_name
Rec "connection.create" ($conn.tables -contains "sales") "$connDb tables=$($conn.tables -join ',')"

# ── 4. KB + upload board-report.md (multipart via curl.exe) ──
$kb = Invoke-RestMethod -Uri "$base/knowledge-bases" -Method Post -Headers $H -ContentType "application/json" -Body (Body @{ name = "BoardKB_$ts" })
$kbId = $kb._id
$mdPath = Join-Path $PSScriptRoot "..\docs\test-scenario\finance\board-report.md"
$up = & curl.exe -s -X POST "$base/knowledge-bases/$kbId/upload" -H "Authorization: Bearer $tok" -F "file=@$mdPath;type=text/markdown"
Rec "kb.upload(.md)" ($up -match "processing|file_id") $up

# ── 5. agent (sql + kb) ──
$skills = @(
  @{ type = "text2sql"; connection_id = $connId; tables = @("sales", "budget"); description = "sql" },
  @{ type = "knowledge_base"; kb_id = $kbId; description = "rag" }
)
$agent = Invoke-RestMethod -Uri "$base/agents" -Method Post -Headers $H -ContentType "application/json" -Body (Body @{ name = "FinanceAgent_$ts"; description = "finance"; skills = $skills; prompt_template = "You are a finance analyst. Use SQL for numbers and the board report for targets." })
$aid = $agent._id
Rec "agent.create" ($aid.Length -gt 0) $aid

# ── 6. dashboard + widgets ──
$dash = Invoke-RestMethod -Uri "$base/dashboards" -Method Post -Headers $H -ContentType "application/json" -Body (Body @{ name = "Finance Dashboard $ts"; description = "finance" })
$did = $dash._id; $ddb = "$base/dashboards/$did"
Rec "dashboard.create" ($did.Length -gt 0) $did

$widgets = @(
  @{ t = "Revenue by Region"; d = "chart"; q = "SELECT region, SUM(revenue) AS revenue FROM $connDb.sales GROUP BY region" },
  @{ t = "Revenue by Category"; d = "chart"; q = "SELECT product_category, SUM(revenue) AS revenue FROM $connDb.sales GROUP BY product_category" },
  @{ t = "Monthly Revenue Trend"; d = "chart"; q = "SELECT sale_date, SUM(revenue) AS revenue FROM $connDb.sales GROUP BY sale_date ORDER BY sale_date" },
  @{ t = "Units by Region"; d = "chart"; q = "SELECT region, SUM(units) AS units FROM $connDb.sales GROUP BY region" },
  @{ t = "Budget by Region"; d = "table"; q = "SELECT region, SUM(budget_amount) AS budget FROM $connDb.budget GROUP BY region" }
)
$i = 0
foreach ($w in $widgets) {
  $pos = @{ x = ($i % 2) * 6; y = [math]::Floor($i / 2) * 4; w = 6; h = 4 }
  $binding = @{ query = $w.q; mindsdb_db_name = $connDb; connection_id = $connId }
  $created = Invoke-RestMethod -Uri "$ddb/widgets" -Method Post -Headers $H -ContentType "application/json" -Body (Body @{ source_type = "manual"; display_type = $w.d; title = $w.t; data_binding = $binding; position = $pos })
  $wid = $created.widget_id
  $ref = Invoke-RestMethod -Uri "$ddb/widgets/$wid/refresh" -Method Post -Headers $H
  $nrows = 0; if ($ref.cached_data -and $ref.cached_data.rows) { $nrows = $ref.cached_data.rows.Count }
  Rec "widget[$($w.t)]" ($nrows -gt 0) "$wid rows=$nrows"
  $i++
}

# ── 7. AI summary widget ──
$sum = Invoke-RestMethod -Uri "$ddb/summary-widget" -Method Post -Headers $H
Rec "summary_widget" ($sum.cached_text.Length -gt 0) ($sum.cached_text.Substring(0, [math]::Min(110, $sum.cached_text.Length)))

# ── 8. PDF export (binary) ──
$pdfOut = Join-Path $PSScriptRoot "..\finance_dash_http.pdf"
try {
  $resp = Invoke-WebRequest -Uri "$ddb/pdf" -Method Post -Headers $H -ContentType "application/json" -Body (Body @{ chart_images = @{} }) -OutFile $pdfOut -PassThru
  $sz = (Get-Item $pdfOut).Length
  $head = [System.IO.File]::ReadAllBytes($pdfOut)[0..3] -join ','
  Rec "export.PDF" ($sz -gt 1000) "$sz bytes (header bytes $head) -> finance_dash_http.pdf"
} catch {
  $msg = $_.Exception.Message; if ($_.ErrorDetails) { $msg = $_.ErrorDetails.Message }
  Rec "export.PDF" $false $msg
}

# ── 9. PPTX session + download ──
try {
  $pptx = Invoke-RestMethod -Uri "$ddb/pptx/session" -Method Post -Headers $H -ContentType "application/json" -Body (Body @{ message = "6 slides, title 'Finance Review 2024', emphasize revenue vs budget" })
  $slides = 0; if ($pptx.spec -and $pptx.spec.slides) { $slides = $pptx.spec.slides.Count }
  Rec "export.PPTX" ($pptx.export_id.Length -gt 0) "export_id=$($pptx.export_id) provider=$($pptx.provider) slides=$slides"
  $pptxOut = Join-Path $PSScriptRoot "..\finance_dash_http.pptx"
  Invoke-WebRequest -Uri "$ddb/pptx-exports/$($pptx.export_id)/download" -Headers $H -OutFile $pptxOut | Out-Null
  Rec "export.PPTX.download" ((Get-Item $pptxOut).Length -gt 1000) "$((Get-Item $pptxOut).Length) bytes -> finance_dash_http.pptx"
} catch {
  $msg = $_.Exception.Message; if ($_.ErrorDetails) { $msg = $_.ErrorDetails.Message }
  Rec "export.PPTX" $false $msg
}

# ── 10. RAG chat sanity ──
$rag = Invoke-RestMethod -Uri "$base/chat" -Method Post -Headers $H -ContentType "application/json" -Body (Body @{ agent_id = $aid; stream = $false; message = "What was the FY2024 revenue target from the board report? Reply with the figure." })
Rec "chat.rag" ($rag.answer -match "9\.8|9,800") $rag.answer

# ── summary ──
$pass = ($results | Where-Object status -eq "PASS").Count
Write-Host "`n======================================================================"
Write-Host "SUMMARY: $pass/$($results.Count) passed"
$results | ForEach-Object { Write-Host "  $($_.status)  $($_.name)" }
Write-Host "`nIDs: project=$projId dashboard=$did agent=$aid conn=$connDb"
