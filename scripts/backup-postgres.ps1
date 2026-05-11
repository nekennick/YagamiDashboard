param(
  [string]$EnvFile = ".env",
  [string]$OutputDir = "backups"
)

$ErrorActionPreference = "Stop"

function Get-DatabaseUrl {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Khong tim thay file env: $Path"
  }

  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^\s*DATABASE_URL\s*=" } | Select-Object -First 1

  if (-not $line) {
    throw "Khong tim thay DATABASE_URL trong $Path"
  }

  $value = ($line -replace "^\s*DATABASE_URL\s*=\s*", "").Trim()
  return $value.Trim('"').Trim("'")
}

function Get-PgDumpPath {
  $command = Get-Command pg_dump -ErrorAction SilentlyContinue

  if ($command) {
    return $command.Source
  }

  $candidate = Get-ChildItem -Path "C:\Program Files\PostgreSQL" -Recurse -Filter "pg_dump.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1

  if ($candidate) {
    return $candidate.FullName
  }

  throw "Khong tim thay pg_dump. Hay them PostgreSQL bin vao PATH hoac cai PostgreSQL client tools."
}

function Convert-ToPostgresToolUrl {
  param([string]$DatabaseUrl)

  return ($DatabaseUrl -replace "([?&])schema=[^&]*&?", '$1').TrimEnd("?").TrimEnd("&")
}

$databaseUrl = Get-DatabaseUrl -Path $EnvFile
$databaseUrl = Convert-ToPostgresToolUrl -DatabaseUrl $databaseUrl
$pgDump = Get-PgDumpPath

if (-not (Test-Path -LiteralPath $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputFile = Join-Path $OutputDir "yagami-dashboard-$timestamp.dump"

& $pgDump --format=custom --no-owner --no-acl --file=$outputFile $databaseUrl

if ($LASTEXITCODE -ne 0) {
  throw "Backup that bai voi exit code $LASTEXITCODE"
}

Write-Host "Backup thanh cong: $outputFile"
