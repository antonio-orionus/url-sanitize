$ErrorActionPreference = "Stop"

$Repo = "antonio-orionus/url-sanitize"
$InstallDir = if ($env:URL_SANITIZE_INSTALL_DIR) { $env:URL_SANITIZE_INSTALL_DIR } else { Join-Path $env:USERPROFILE ".local\bin" }

if ($env:PROCESSOR_ARCHITECTURE -ne "AMD64" -and $env:PROCESSOR_ARCHITEW6432 -ne "AMD64") {
  throw "unsupported Windows architecture: $env:PROCESSOR_ARCHITECTURE"
}

$Asset = "url-sanitize-x86_64-pc-windows-msvc.zip"
$Url = "https://github.com/$Repo/releases/latest/download/$Asset"
$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())

New-Item -ItemType Directory -Path $Tmp | Out-Null
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

try {
  $Archive = Join-Path $Tmp $Asset
  Invoke-WebRequest -Uri $Url -OutFile $Archive
  Expand-Archive -Path $Archive -DestinationPath $Tmp
  Copy-Item (Join-Path $Tmp "url-sanitize.exe") (Join-Path $InstallDir "url-sanitize.exe") -Force
  Write-Host "installed url-sanitize to $(Join-Path $InstallDir "url-sanitize.exe")"
} finally {
  Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
