# Installs Pilot on Windows without the setup program: the newest release (or the version given),
# checked against the release's SHA256SUMS.txt, into %LOCALAPPDATA%\Programs\Pilot (where the setup
# puts it), added to your PATH. Run it again to update, or use `pilot update`.
#   powershell -ExecutionPolicy Bypass -File pilot-install.ps1 [-Version 0.2.0]
param([string]$Version = '')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# PILOT_INSTALL_BASE: where the releases are (a test's stand-in for GitHub).
$Base = if ($env:PILOT_INSTALL_BASE) { $env:PILOT_INSTALL_BASE } else { 'https://github.com/FranciscoNunes-dxspark/pilot' }
$Dir = if ($env:PILOT_INSTALL_DIR) { $env:PILOT_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\Pilot' }
$File = 'pilot-windows-x64.exe'
if (-not [Environment]::Is64BitOperatingSystem) { throw 'Pilot is built for 64-bit Windows.' }
# Windows PowerShell 5.1 may not offer TLS 1.2 to GitHub by itself.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

if ($Version) {
  $from = "$Base/releases/download/v$($Version.TrimStart('v'))"
  $which = "v$($Version.TrimStart('v'))"
} else {
  $from = "$Base/releases/latest/download"
  $which = 'the newest release'
}

$work = Join-Path ([IO.Path]::GetTempPath()) ('pilot-install-' + [Guid]::NewGuid())
New-Item -ItemType Directory $work | Out-Null
try {
  Write-Host "Downloading $File from $which..."
  foreach ($name in @($File, 'SHA256SUMS.txt')) {
    Invoke-WebRequest -Uri "$from/$name" -OutFile (Join-Path $work $name) -UseBasicParsing -Headers @{ 'User-Agent' = 'pilot-install' }
  }
  $line = Get-Content (Join-Path $work 'SHA256SUMS.txt') | Where-Object { $_ -match "^([0-9a-f]{64}) [ *]$([regex]::Escape($File))$" } | Select-Object -First 1
  if (-not $line) { throw "SHA256SUMS.txt has no checksum for $File." }
  $want = ($line -split ' ')[0]
  $got = (Get-FileHash (Join-Path $work $File) -Algorithm SHA256).Hash.ToLower()
  if ($got -ne $want) { throw "The download doesn't match its checksum: not installed." }

  New-Item -ItemType Directory $Dir -Force | Out-Null
  $exe = Join-Path $Dir 'pilot.exe'
  # Windows won't overwrite a running program but will rename it: a Pilot running now keeps going.
  if (Test-Path $exe) { Move-Item $exe "$exe.old.$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -Force }
  Move-Item (Join-Path $work $File) $exe -Force
} finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}

# On the user's PATH, once.
$path = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (($path -split ';') -contains $Dir)) {
  [Environment]::SetEnvironmentVariable('Path', (($path.TrimEnd(';'), $Dir) -join ';').TrimStart(';'), 'User')
  Write-Host "Added $Dir to your PATH: open a new terminal to use pilot."
}
Write-Host "Installed $(& $exe --version) in $exe."
Write-Host ''
Write-Host 'Next:'
Write-Host '  pilot app                 Pilot''s window: recent projects, Open a folder'
Write-Host '  pilot ui                  the UI in your browser, for the project in this folder'
Write-Host '  pilot init --mcp          connect Claude Code to the project in this folder'
