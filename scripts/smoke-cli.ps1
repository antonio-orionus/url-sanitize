param(
  [string]$Command = "url-sanitize",
  [string]$ExpectedVersion = "",
  [string]$ExpectedCatalogHash = ""
)

$ErrorActionPreference = "Stop"

$TestUrl = "https://example.com/article?utm_source=newsletter&id=123"
$ExpectedUrl = "https://example.com/article?id=123"

$VersionOutput = (& $Command --version) -join "`n"
if ($VersionOutput -notmatch '^url-sanitize\s+(\S+)\s+\(catalog\s+([0-9a-fA-F]{64})\s+([^\)]+)\)$') {
  throw "unexpected --version output: $VersionOutput"
}

$ActualVersion = $Matches[1]
$ActualCatalogHash = $Matches[2]
$ActualCatalogDate = $Matches[3]

if ($ExpectedVersion -and $ActualVersion -ne $ExpectedVersion) {
  throw "unexpected version: expected $ExpectedVersion, got $ActualVersion"
}

if ($ActualCatalogDate -notmatch '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*Z$') {
  throw "unexpected catalog date: $ActualCatalogDate"
}

if ($ExpectedCatalogHash -and $ActualCatalogHash -ne $ExpectedCatalogHash) {
  throw "unexpected catalog hash: expected $ExpectedCatalogHash, got $ActualCatalogHash"
}

$DefaultOutput = (& $Command $TestUrl) -join "`n"
if ($DefaultOutput -ne $ExpectedUrl) {
  throw "unexpected default output: $DefaultOutput"
}

$JsonOutput = (& $Command --json $TestUrl) -join "`n"
if (
  -not $JsonOutput.Contains('"kind":"cleaned"') -or
  -not $JsonOutput.Contains('"url":"https://example.com/article?id=123"') -or
  -not $JsonOutput.Contains('"strippedParams":["utm_source"]')
) {
  throw "unexpected --json output: $JsonOutput"
}

$StdinOutput = ($TestUrl | & $Command -) -join "`n"
if ($StdinOutput -ne $ExpectedUrl) {
  throw "unexpected stdin output: $StdinOutput"
}

Write-Host "smoke passed for $Command ($ActualVersion catalog $ActualCatalogHash $ActualCatalogDate)"
