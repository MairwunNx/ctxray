# Installs ctxray on Windows:
#   irm https://github.com/MairwunNx/ctxray/releases/latest/download/install.ps1 | iex
#
# CTXRAY_VERSION        a version like 0.2.0, the latest release when unset
# CTXRAY_DOWNLOAD_BASE  where the releases live, https://github.com/MairwunNx/ctxray/releases when unset. A mirror
#                       keeps GitHub's layout: <base>/latest/download/<asset>, <base>/download/v<version>/<asset>
# CTXRAY_INSTALL_DIR    where ctxray.exe goes, %LOCALAPPDATA%\Programs\ctxray when unset
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$base = if ($env:CTXRAY_DOWNLOAD_BASE) { $env:CTXRAY_DOWNLOAD_BASE.TrimEnd('/') } else { 'https://github.com/MairwunNx/ctxray/releases' }
$url = if ($env:CTXRAY_VERSION) { "$base/download/v$($env:CTXRAY_VERSION.TrimStart('v'))" } else { "$base/latest/download" }
$dir = if ($env:CTXRAY_INSTALL_DIR) { $env:CTXRAY_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\ctxray' }

$lang = if ($env:CTXRAY_LANG -and $env:CTXRAY_LANG -ne 'auto') { $env:CTXRAY_LANG } else { (Get-UICulture).Name }
function Say($en, $ru) { if ($lang -like 'ru*') { $ru } else { $en } }

$cpu = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
$asset = "ctxray-windows-$cpu.zip"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  foreach ($name in $asset, 'SHA256SUMS') {
    try { Invoke-WebRequest -UseBasicParsing -Uri "$url/$name" -OutFile (Join-Path $tmp $name) }
    catch { throw (Say "Couldn't download $url/$name" "Не удалось скачать $url/$name") }
  }
  $line = Get-Content (Join-Path $tmp 'SHA256SUMS') | Where-Object { $_.EndsWith(" $asset") } | Select-Object -First 1
  $actual = (Get-FileHash (Join-Path $tmp $asset) -Algorithm SHA256).Hash.ToLower()
  if (-not $line -or $line.Split(' ')[0] -ne $actual) {
    throw (Say "$asset doesn't match its checksum in SHA256SUMS." "$asset не совпадает с контрольной суммой из SHA256SUMS.")
  }
  Expand-Archive -Path (Join-Path $tmp $asset) -DestinationPath (Join-Path $tmp 'out')
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Copy-Item -Force (Join-Path (Join-Path $tmp 'out') 'ctxray.exe') (Join-Path $dir 'ctxray.exe')
} finally {
  Remove-Item -Recurse -Force $tmp
}

$version = & (Join-Path $dir 'ctxray.exe') --version
Say "Installed $version into $dir" "$version установлен в $dir"
$path = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($IsWindows -ne $false -and ($path -split ';') -notcontains $dir) {
  [Environment]::SetEnvironmentVariable('Path', $(if ($path) { "$path;$dir" } else { $dir }), 'User')
  Say "Added $dir to your PATH. Open a new terminal to run ctxray by name." "$dir добавлен в PATH. Откройте новый терминал, чтобы запускать ctxray по имени."
}
