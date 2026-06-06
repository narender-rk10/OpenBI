# Enumerate all schedules across projects over HTTP and flag stale/failing ones.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:8000"
$login = Invoke-RestMethod -Uri "$BASE/api/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = "admin@openbi.dev"; password = "changeme123" } | ConvertTo-Json)
$H = @{ Authorization = "Bearer $($login.access_token)" }

$projects = Invoke-RestMethod -Uri "$BASE/api/projects" -Headers $H
foreach ($p in $projects) {
  try {
    $scheds = Invoke-RestMethod -Uri "$BASE/api/projects/$($p._id)/schedules" -Headers $H
  } catch {
    $msg = $_.Exception.Message; if ($_.ErrorDetails) { $msg = $_.ErrorDetails.Message }
    Write-Host "PROJECT '$($p.name)' ($($p._id)) -> schedules ERROR: $msg"
    continue
  }
  if (-not $scheds) { continue }
  foreach ($s in $scheds) {
    Write-Host "PROJECT '$($p.name)' ($($p._id))"
    Write-Host "  schedule: $($s._id)  name='$($s.name)'  cron='$($s.cron)'  active=$($s.is_active)"
    Write-Host "    dashboard_id : $($s.dashboard_id)"
    Write-Host "    next_run_at  : $($s.next_run_at)"
    Write-Host "    last_status  : $($s.last_run_status)"
    Write-Host "    last_error   : $($s.last_run_error)"
  }
  # recent runs
  try {
    $runs = Invoke-RestMethod -Uri "$BASE/api/projects/$($p._id)/schedules/runs?limit=3" -Headers $H
    foreach ($r in $runs) { Write-Host "    run: $($r.started_at) status=$($r.status) error=$($r.error)" }
  } catch {}
}
