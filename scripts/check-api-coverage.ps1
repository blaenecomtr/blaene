param(
  [string]$Root = "."
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolvedRoot = Resolve-Path $Root
Set-Location $resolvedRoot

function Get-FileList {
  $list = @()
  $list += @("account.html", "checkout.html") | Where-Object { Test-Path $_ }

  if (Test-Path "assets/js") {
    $list += Get-ChildItem "assets/js" -Recurse -File | ForEach-Object { $_.FullName }
  }
  if (Test-Path "admin-panel/src") {
    $list += Get-ChildItem "admin-panel/src" -Recurse -File | ForEach-Object { $_.FullName }
  }

  return $list
}

function Collect-ApiPaths([string[]]$files) {
  $paths = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($file in $files) {
    if (-not (Test-Path $file)) { continue }
    $raw = Get-Content -Raw -Path $file
    $matches = [regex]::Matches($raw, '/api/[A-Za-z0-9_\-\./\?=&%]+')
    foreach ($match in $matches) {
      $clean = $match.Value.Split('?')[0]
      [void]$paths.Add($clean)
    }
  }
  return $paths
}

function Get-RouteKeys([string]$file, [string]$pattern) {
  if (-not (Test-Path -LiteralPath $file)) { return @() }
  $raw = Get-Content -Raw -LiteralPath $file
  $results = @()
  foreach ($match in [regex]::Matches($raw, $pattern)) {
    $key = $match.Groups[1].Value
    if (-not $key -and $match.Groups.Count -gt 2) {
      $key = $match.Groups[2].Value
    }
    if ($key) {
      $results += $key
    }
  }
  return $results | Select-Object -Unique
}

$files = Get-FileList
$paths = Collect-ApiPaths $files

$adminKeys = Get-RouteKeys "api/admin/[...route].js" "routeKey === '([^']+)'"
$publicKeys = Get-RouteKeys "api/public/[...pub].js" "(?m)^\s*(?:'([^']+)'|([A-Za-z0-9_-]+))\s*:"

$missing = @()

Write-Output "API COVERAGE REPORT"
foreach ($path in ($paths | Sort-Object)) {
  $relative = $path.Substring(5) # trim "/api/"
  $segments = $relative.Split('/')
  $isCovered = $false

  if (Test-Path ("api/" + $relative + ".js")) {
    $isCovered = $true
  } elseif ($segments[0] -eq "admin") {
    $key = ($segments | Select-Object -Skip 1) -join "/"
    if ($adminKeys -contains $key) { $isCovered = $true }
  } elseif ($segments[0] -eq "public") {
    $key = ($segments | Select-Object -Skip 1) -join "/"
    if ($publicKeys -contains $key) { $isCovered = $true }
  }

  if ($isCovered) {
    Write-Output ("OK      " + $path)
  } else {
    $missing += $path
    Write-Output ("MISSING " + $path)
  }
}

if ($missing.Count -gt 0) {
  Write-Error ("Missing API routes found: " + ($missing -join ", "))
}

Write-Output "Coverage check passed."
