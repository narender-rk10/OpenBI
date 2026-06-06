# Create the complex data layer for the Finance project over HTTP/JWT:
#   - Postgres data source (sales, budget)
#   - MySQL data source (marketing_spend, region_info)
#   - File KB (board-report.md)
#   - Web KB (crawl a live URL)
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:8000"
$PROJ = "6a1b6645a6ace21ecae80767"   # Finance project
function Body($o) { $o | ConvertTo-Json -Depth 12 -Compress }

$login = Invoke-RestMethod -Uri "$BASE/api/auth/login" -Method Post -ContentType "application/json" -Body (Body @{ email = "admin@openbi.dev"; password = "changeme123" })
$tok = $login.access_token
$H = @{ Authorization = "Bearer $tok" }
$base = "$BASE/api/projects/$PROJ"

Write-Host "=== Data Source 1: PostgreSQL (finance-pg) ==="
$pg = @{ host = "finance-pg"; port = 5432; database = "openbi_finance"; user = "demo"; password = "demo" }
$cPg = Invoke-RestMethod -Uri "$base/connections" -Method Post -Headers $H -ContentType "application/json" -Body (Body @{ name = "Finance Postgres"; engine = "postgres"; category = "Database"; parameters = $pg })
Write-Host ("  conn_id=$($cPg._id)  mindsdb_db=$($cPg.mindsdb_db_name)  tables=$($cPg.tables -join ', ')")

Write-Host "`n=== Data Source 2: MySQL (finance-mysql) ==="
$my = @{ host = "finance-mysql"; port = 3306; database = "openbi_ops"; user = "demo"; password = "demo" }
$cMy = Invoke-RestMethod -Uri "$base/connections" -Method Post -Headers $H -ContentType "application/json" -Body (Body @{ name = "Ops MySQL"; engine = "mysql"; category = "Database"; parameters = $my })
Write-Host ("  conn_id=$($cMy._id)  mindsdb_db=$($cMy.mindsdb_db_name)  tables=$($cMy.tables -join ', ')")

Write-Host "`n=== Knowledge Base 1: File (board-report.md) ==="
$kbFile = Invoke-RestMethod -Uri "$base/knowledge-bases" -Method Post -Headers $H -ContentType "application/json" -Body (Body @{ name = "Board Reports" })
$mdPath = Join-Path $PSScriptRoot "..\docs\test-scenario\finance\board-report.md"
$up = & curl.exe -s -X POST "$base/knowledge-bases/$($kbFile._id)/upload" -H "Authorization: Bearer $tok" -F "file=@$mdPath;type=text/markdown"
Write-Host ("  kb_id=$($kbFile._id)  upload=$up")

Write-Host "`n=== Knowledge Base 2: Web crawl ==="
$kbWeb = Invoke-RestMethod -Uri "$base/knowledge-bases" -Method Post -Headers $H -ContentType "application/json" -Body (Body @{ name = "Web Research" })
$crawlUrl = "https://en.wikipedia.org/wiki/Return_on_investment"
try {
  $cr = Invoke-RestMethod -Uri "$base/knowledge-bases/$($kbWeb._id)/crawl" -Method Post -Headers $H -ContentType "application/json" -Body (Body @{ url = $crawlUrl; recurring = $false })
  Write-Host ("  kb_id=$($kbWeb._id)  crawl status=$($cr.status) crawl_id=$($cr.crawl_id)  url=$crawlUrl")
} catch {
  $msg = $_.Exception.Message; if ($_.ErrorDetails) { $msg = $_.ErrorDetails.Message }
  Write-Host ("  kb_id=$($kbWeb._id)  CRAWL FAILED: $msg")
}

Write-Host "`n=== Summary: project assets ==="
$conns = Invoke-RestMethod -Uri "$base/connections" -Headers $H
$kbs = Invoke-RestMethod -Uri "$base/knowledge-bases" -Headers $H
Write-Host ("connections: " + ($conns | ForEach-Object { "$($_.name)[$($_.engine)]" }) -join ", ")
Write-Host ("knowledge_bases: " + ($kbs | ForEach-Object { "$($_.name)" }) -join ", ")
Write-Host ("`nIDs -> pgConn=$($cPg._id) myConn=$($cMy._id) fileKB=$($kbFile._id) webKB=$($kbWeb._id)")
Write-Host ("mindsdb dbs -> pg=$($cPg.mindsdb_db_name) my=$($cMy.mindsdb_db_name)")