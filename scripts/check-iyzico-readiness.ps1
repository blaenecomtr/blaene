param(
  [string]$EnvFile = ".env.local"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path $EnvFile)) {
  Write-Error "Env file not found: $EnvFile"
}

$raw = Get-Content -Raw -Path $EnvFile

function Get-EnvValue([string]$name) {
  $m = [regex]::Match($raw, "(?m)^$name=""?([^""\r\n]+)""?$")
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  return ""
}

$supabaseUrl = Get-EnvValue "SUPABASE_URL"
$serviceRole = Get-EnvValue "SUPABASE_SERVICE_ROLE_KEY"
$checkoutMode = Get-EnvValue "CHECKOUT_MODE"
$mockMode = Get-EnvValue "MOCK_CHECKOUT_MODE"
$iyzicoKey = Get-EnvValue "IYZICO_API_KEY"
$iyzicoSecret = Get-EnvValue "IYZICO_SECRET_KEY"
$iyzicoBase = Get-EnvValue "IYZICO_BASE_URL"

$checkoutModeText = if ($checkoutMode) { $checkoutMode } else { "(missing)" }
$mockModeText = if ($mockMode) { $mockMode } else { "(missing)" }
$iyzicoBaseText = if ($iyzicoBase) { $iyzicoBase } else { "(default or missing)" }

Write-Output "=== Iyzico Readiness ==="
Write-Output ("CHECKOUT_MODE        : " + $checkoutModeText)
Write-Output ("MOCK_CHECKOUT_MODE   : " + $mockModeText)
Write-Output ("IYZICO_API_KEY       : " + ($(if ($iyzicoKey) { "set" } else { "missing" })))
Write-Output ("IYZICO_SECRET_KEY    : " + ($(if ($iyzicoSecret) { "set" } else { "missing" })))
Write-Output ("IYZICO_BASE_URL      : " + $iyzicoBaseText)

if (-not $supabaseUrl -or -not $serviceRole) {
  Write-Warning "Supabase env eksik; DB tablo kontrolu atlandi."
  exit 0
}

$tables = @(
  "customer_addresses",
  "return_requests",
  "refund_transactions",
  "order_status_logs"
)

Write-Output ""
Write-Output "=== DB Schema Check ==="
$nodeScript = @'
const supabaseUrl = process.env.CHECK_SUPABASE_URL;
const serviceRole = process.env.CHECK_SERVICE_ROLE;
const tables = process.env.CHECK_TABLES.split(',');

(async () => {
  const headers = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
    'User-Agent': 'blaene-readiness-check/1.0',
  };

  for (const table of tables) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, { headers });
      if (res.ok) {
        console.log(`OK      ${table} (${res.status})`);
      } else {
        const text = await res.text();
        console.log(`FAILED  ${table} (${res.status}) ${text.slice(0, 120)}`);
      }
    } catch (error) {
      console.log(`FAILED  ${table} (${String(error && error.message || 'unknown')})`);
    }
  }
})();
'@

$oldUrl = $env:CHECK_SUPABASE_URL
$oldRole = $env:CHECK_SERVICE_ROLE
$oldTables = $env:CHECK_TABLES

$env:CHECK_SUPABASE_URL = $supabaseUrl
$env:CHECK_SERVICE_ROLE = $serviceRole
$env:CHECK_TABLES = ($tables -join ",")

try {
  $nodeScript | node -
} finally {
  if ($null -ne $oldUrl) { $env:CHECK_SUPABASE_URL = $oldUrl } else { Remove-Item Env:CHECK_SUPABASE_URL -ErrorAction SilentlyContinue }
  if ($null -ne $oldRole) { $env:CHECK_SERVICE_ROLE = $oldRole } else { Remove-Item Env:CHECK_SERVICE_ROLE -ErrorAction SilentlyContinue }
  if ($null -ne $oldTables) { $env:CHECK_TABLES = $oldTables } else { Remove-Item Env:CHECK_TABLES -ErrorAction SilentlyContinue }
}

Write-Output ""
Write-Output "=== Recommended ==="
if (-not $iyzicoKey -or -not $iyzicoSecret) {
  Write-Output "- IYZICO_API_KEY ve IYZICO_SECRET_KEY ekleyin."
}
if ($checkoutMode -eq "mock") {
  Write-Output "- CHECKOUT_MODE=auto (veya iyzico) yapin."
}
if ($mockMode -eq "true") {
  Write-Output "- MOCK_CHECKOUT_MODE=false yapin."
}
