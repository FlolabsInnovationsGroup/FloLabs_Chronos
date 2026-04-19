param(
  [string]$SourceUrl,
  [string]$TargetUrl
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ProvisionPath = Join-Path $PSScriptRoot 'provision-output.json'

function Get-EnvMap {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    if ($trimmed -match '^([A-Z0-9_]+)=(.*)$') {
      $value = $Matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $map[$Matches[1]] = $value
    }
  }
  return $map
}

if (-not $SourceUrl) {
  $envMap = Get-EnvMap -Path (Join-Path $ProjectRoot '.env.production.local')
  if ($envMap.Count -eq 0) { $envMap = Get-EnvMap -Path (Join-Path $ProjectRoot '.env.local') }
  $SourceUrl = $envMap['FL_CHRONOS_DATABASE_URL_UNPOOLED']
  if (-not $SourceUrl) { $SourceUrl = $envMap['DATABASE_URL'] }
}

if (-not $TargetUrl -and (Test-Path $ProvisionPath)) {
  $TargetUrl = (Get-Content $ProvisionPath -Raw | ConvertFrom-Json).databaseUrl
}

if (-not $SourceUrl -or -not $TargetUrl) { throw 'SourceUrl and TargetUrl are required' }

$dumpFile = Join-Path $env:TEMP 'chronos_dump.sql'
if (Test-Path $dumpFile) { Remove-Item $dumpFile -Force }

$psqlAvailable = $null -ne (Get-Command psql -ErrorAction SilentlyContinue)
$pgDumpAvailable = $null -ne (Get-Command pg_dump -ErrorAction SilentlyContinue)

if ($psqlAvailable -and $pgDumpAvailable) {
  pg_dump --no-owner --no-privileges --format=plain --dbname "$SourceUrl" --file "$dumpFile"
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
  psql "$TargetUrl" -f "$dumpFile"
  if ($LASTEXITCODE -ne 0) { throw 'psql import failed' }
} else {
  docker pull postgres:17 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to pull postgres:17 image for migration tooling' }

  docker run --rm -v "${env:TEMP}:/work" postgres:17 pg_dump --no-owner --no-privileges --format=plain --dbname "$SourceUrl" --file /work/chronos_dump.sql
  if ($LASTEXITCODE -ne 0) { throw 'dockerized pg_dump failed' }

  docker run --rm -v "${env:TEMP}:/work" postgres:17 psql "$TargetUrl" -f /work/chronos_dump.sql
  if ($LASTEXITCODE -ne 0) { throw 'dockerized psql import failed' }
}

Write-Host "Migration complete: $dumpFile"
