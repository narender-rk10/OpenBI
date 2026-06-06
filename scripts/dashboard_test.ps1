# Build a Finance dashboard with live widgets (Postgres + MySQL + a federated
# cross-source ROI table), AI summary, then export PDF and PPTX. All over HTTP/JWT.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:8000"; $PROJ = "6a1b6645a6ace21ecae80767"
$PG = "conn_3900eb42"; $MY = "conn_4a151ae1"
$pgId = "6a1b67dea6ace21ecae80768"; $myId = "6a1b67dfa6ace21ecae80769"
$tok = (& curl.exe -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "@$env:TEMP\login.json" | ConvertFrom-Json).access_token
$papi = "$BASE/api/projects/$PROJ"
function Body($o) { $o | ConvertTo-Json -Depth 14 -Compress }
function PostJ($url, $obj) { Body $obj | Out-File -Encoding ascii "$env:TEMP\b.json"; & curl.exe -s --max-time 240 -X POST $url -H "Authorization: Bearer $tok" -H "Content-Type: application/json" -d "@$env:TEMP\b.json" }

# ── Dashboard ──
$dash = PostJ "$papi/dashboards" @{ name = "Finance Overview"; description = "Sales, marketing and cross-source ROI" } | ConvertFrom-Json
$did = $dash._id; $ddb = "$papi/dashboards/$did"
Write-Host "dashboard: $did"

$roi = "SELECT rev.region, rev.revenue, sp.spend, ROUND(rev.revenue/sp.spend,2) AS roi " +
       "FROM (SELECT region, SUM(revenue) revenue FROM $PG.sales GROUP BY region) rev " +
       "JOIN (SELECT region, SUM(spend) spend FROM $MY.marketing_spend GROUP BY region) sp ON rev.region=sp.region ORDER BY roi DESC"

$widgets = @(
  @{ t="Revenue by Region";        d="chart"; db=$PG; cid=$pgId; q="SELECT region, SUM(revenue) AS revenue FROM $PG.sales GROUP BY region" },
  @{ t="Revenue by Category";      d="chart"; db=$PG; cid=$pgId; q="SELECT product_category, SUM(revenue) AS revenue FROM $PG.sales GROUP BY product_category" },
  @{ t="Monthly Revenue Trend";    d="chart"; db=$PG; cid=$pgId; q="SELECT sale_date, SUM(revenue) AS revenue FROM $PG.sales GROUP BY sale_date ORDER BY sale_date" },
  @{ t="Marketing Spend by Channel"; d="chart"; db=$MY; cid=$myId; q="SELECT channel, SUM(spend) AS spend FROM $MY.marketing_spend GROUP BY channel" },
  @{ t="ROI by Region (PG x MySQL)"; d="table"; db=$PG; cid=$pgId; q=$roi },
  @{ t="Budget by Region";         d="table"; db=$PG; cid=$pgId; q="SELECT region, SUM(budget_amount) AS budget FROM $PG.budget GROUP BY region" }
)

$i = 0; $ok = 0
foreach ($w in $widgets) {
  $pos = @{ x = ($i % 2) * 6; y = [math]::Floor($i / 2) * 4; w = 6; h = 4 }
  $created = PostJ "$ddb/widgets" @{ source_type="manual"; display_type=$w.d; title=$w.t; data_binding=@{ query=$w.q; mindsdb_db_name=$w.db; connection_id=$w.cid }; position=$pos } | ConvertFrom-Json
  $wid = $created.widget_id
  $ref = & curl.exe -s --max-time 120 -X POST "$ddb/widgets/$wid/refresh" -H "Authorization: Bearer $tok" | ConvertFrom-Json
  $n = 0; if ($ref.cached_data -and $ref.cached_data.rows) { $n = $ref.cached_data.rows.Count }
  if ($n -gt 0) { $ok++ }
  Write-Host ("  widget {0,-28} {1}  rows={2}" -f $w.t, $wid, $n)
  $i++
}
Write-Host "widgets with data: $ok/$($widgets.Count)"

# ── AI summary widget ──
$sum = & curl.exe -s --max-time 180 -X POST "$ddb/summary-widget" -H "Authorization: Bearer $tok" | ConvertFrom-Json
Write-Host ("`nAI summary: " + ($sum.cached_text.Substring(0,[math]::Min(180,$sum.cached_text.Length))))

# ── PDF export ──
$pdf = Join-Path $PSScriptRoot "..\finance_overview.pdf"
$resp = Invoke-WebRequest -Uri "$ddb/pdf" -Method Post -Headers @{ Authorization = "Bearer $tok" } -ContentType "application/json" -Body (Body @{ chart_images = @{} }) -OutFile $pdf -PassThru
$sz = (Get-Item $pdf).Length
$hdr = -join ([System.IO.File]::ReadAllBytes($pdf)[0..3] | ForEach-Object { [char]$_ })
Write-Host ("PDF: $sz bytes, header='$hdr' -> finance_overview.pdf")

# ── PPTX export ──
$pptx = PostJ "$ddb/pptx/session" @{ message = "7 slides titled 'Finance Overview 2024': cover, revenue by region, by category, monthly trend, marketing spend, cross-source ROI, and a summary." } | ConvertFrom-Json
if ($pptx.export_id) {
  $slides = 0; if ($pptx.spec -and $pptx.spec.slides) { $slides = $pptx.spec.slides.Count }
  Write-Host ("PPTX: export_id=$($pptx.export_id) provider=$($pptx.provider) slides=$slides")
  $pf = Join-Path $PSScriptRoot "..\finance_overview.pptx"
  Invoke-WebRequest -Uri "$ddb/pptx-exports/$($pptx.export_id)/download" -Headers @{ Authorization = "Bearer $tok" } -OutFile $pf | Out-Null
  Write-Host ("PPTX downloaded: $((Get-Item $pf).Length) bytes -> finance_overview.pptx")
} else {
  Write-Host ("PPTX FAILED: " + ($pptx | ConvertTo-Json -Compress))
}
Write-Host "`nDONE. dashboard=$did  open: /projects/$PROJ/dashboards/$did"