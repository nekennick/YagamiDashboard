param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$EnvFile = ".env",
  [switch]$Force
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

function Get-PgRestorePath {
  $command = Get-Command pg_restore -ErrorAction SilentlyContinue

  if ($command) {
    return $command.Source
  }

  $candidate = Get-ChildItem -Path "C:\Program Files\PostgreSQL" -Recurse -Filter "pg_restore.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1

  if ($candidate) {
    return $candidate.FullName
  }

  throw "Khong tim thay pg_restore. Hay them PostgreSQL bin vao PATH hoac cai PostgreSQL client tools."
}

function Convert-ToPostgresToolUrl {
  param([string]$DatabaseUrl)

  return ($DatabaseUrl -replace "([?&])schema=[^&]*&?", '$1').TrimEnd("?").TrimEnd("&")
}

if (-not (Test-Path -LiteralPath $BackupFile)) {
  throw "Khong tim thay file backup: $BackupFile"
}

if (-not $Force) {
  Write-Host "Restore se ghi de du lieu trong database hien tai."
  $answer = Read-Host "Go YES de tiep tuc"

  if ($answer -ne "YES") {
    Write-Host "Da huy restore."
    exit 0
  }
}

$databaseUrl = Get-DatabaseUrl -Path $EnvFile
$databaseUrl = Convert-ToPostgresToolUrl -DatabaseUrl $databaseUrl
$pgRestore = Get-PgRestorePath

& $pgRestore --clean --if-exists --no-owner --no-acl --dbname=$databaseUrl $BackupFile

if ($LASTEXITCODE -ne 0) {
  throw "Restore that bai voi exit code $LASTEXITCODE"
}

Write-Host "Restore thanh cong tu: $BackupFile"
