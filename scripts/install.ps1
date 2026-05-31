$ErrorActionPreference = "Stop"

$Repo = "antonio-orionus/url-sanitize"
$InstallDir = if ($env:URL_SANITIZE_INSTALL_DIR) { $env:URL_SANITIZE_INSTALL_DIR } else { Join-Path $env:USERPROFILE ".local\bin" }

if ($env:PROCESSOR_ARCHITECTURE -ne "AMD64" -and $env:PROCESSOR_ARCHITEW6432 -ne "AMD64") {
  throw "unsupported Windows architecture: $env:PROCESSOR_ARCHITECTURE"
}

$Asset = "url-sanitize-x86_64-pc-windows-msvc.zip"
$Url = "https://github.com/$Repo/releases/latest/download/$Asset"
$SumsUrl = "https://github.com/$Repo/releases/latest/download/SHA256SUMS"
$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())

New-Item -ItemType Directory -Path $Tmp | Out-Null
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

try {
  $Archive = Join-Path $Tmp $Asset
  $Sums = Join-Path $Tmp "SHA256SUMS"
  Invoke-WebRequest -Uri $Url -OutFile $Archive
  Invoke-WebRequest -Uri $SumsUrl -OutFile $Sums

  $Expected = Select-String -Path $Sums -Pattern "^\s*([a-fA-F0-9]{64})\s+$([Regex]::Escape($Asset))\s*$" |
    ForEach-Object { $_.Matches[0].Groups[1].Value.ToLowerInvariant() } |
    Select-Object -First 1
  if (-not $Expected) {
    throw "checksum for $Asset not found in SHA256SUMS"
  }

  $Actual = (Get-FileHash -Algorithm SHA256 -Path $Archive).Hash.ToLowerInvariant()
  if ($Actual -ne $Expected) {
    throw "checksum mismatch for ${Asset}: expected $Expected, got $Actual"
  }

  Expand-Archive -Path $Archive -DestinationPath $Tmp
  Copy-Item (Join-Path $Tmp "url-sanitize.exe") (Join-Path $InstallDir "url-sanitize.exe") -Force
  Write-Host "installed url-sanitize to $(Join-Path $InstallDir "url-sanitize.exe")"
  if (($env:Path -split [IO.Path]::PathSeparator) -notcontains $InstallDir) {
    Write-Warning "$InstallDir is not on PATH"
  }
} finally {
  Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
