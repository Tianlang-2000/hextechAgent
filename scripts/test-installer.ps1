param([string]$Installer)
$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskVersion = (Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
if (-not $Installer) { $Installer = Join-Path $taskRoot "release/Hextech-Agent-Setup-$taskVersion-x64.exe" }
$taskResults = Join-Path $taskRoot 'test-results'
New-Item -ItemType Directory -Path $taskResults -Force | Out-Null
$taskInstall = [System.IO.Path]::GetFullPath((Join-Path $taskResults 'installed-app'))
if (-not $taskInstall.StartsWith($taskRoot + [System.IO.Path]::DirectorySeparatorChar) -or $taskInstall -eq $taskRoot) { throw 'Unsafe installer test directory' }
$taskShortcutName = ([string][char]0x6D77) + [char]0x514B + [char]0x65AF + ' Agent.lnk'
$taskDesktop = Join-Path ([Environment]::GetFolderPath('Desktop')) $taskShortcutName
$taskStartMenu = Join-Path ([Environment]::GetFolderPath('Programs')) $taskShortcutName
$taskRegistry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$taskExisting = @(Get-ChildItem -LiteralPath $taskRegistry -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DisplayName -like 'Hextech Agent*' -or $_.DisplayName -like ($taskShortcutName.Replace('.lnk','') + '*') -or $_.UninstallString -like "*$taskInstall*" })
if ($taskExisting.Count -gt 0 -or (Test-Path -LiteralPath $taskDesktop) -or (Test-Path -LiteralPath $taskStartMenu)) { throw 'Existing installation or shortcut detected. Test stopped to protect it.' }
if (-not (Test-Path -LiteralPath $Installer)) { throw 'Build the installer first with npm run package' }
$taskInstalled = $false
try {
  $taskProcess = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$taskInstall") -WindowStyle Hidden -Wait -PassThru
  if ($taskProcess.ExitCode -ne 0) { throw "Installer exit code: $($taskProcess.ExitCode)" }
  $taskInstalled = $true
  $taskExe = Join-Path $taskInstall 'Hextech Agent.exe'
  if (-not (Test-Path -LiteralPath $taskExe)) { throw 'Installed app missing' }
  $taskLinkIndex = 0
  foreach ($taskLink in @($taskDesktop, $taskStartMenu)) {
    if (-not (Test-Path -LiteralPath $taskLink)) { throw "Shortcut missing: $taskLink" }
    # WSH cannot reliably open non-ANSI filenames on English Windows. Read an
    # exact byte copy under an ASCII filename; still verify the original link.
    $taskProbe = Join-Path $taskResults "shortcut-check-$taskLinkIndex.lnk"
    Copy-Item -LiteralPath $taskLink -Destination $taskProbe -Force
    $taskTarget = (New-Object -ComObject WScript.Shell).CreateShortcut($taskProbe).TargetPath
    if ([string]::IsNullOrWhiteSpace($taskTarget)) { throw 'Shortcut target could not be read' }
    if ([System.IO.Path]::GetFullPath($taskTarget) -ne $taskExe) { throw 'Shortcut points to wrong app' }
    $taskLinkIndex++
  }
  if (-not (Test-Path -LiteralPath (Join-Path $taskInstall 'resources/codex/LICENSE-Codex.txt'))) { throw 'Bundled component license missing' }
  $taskRuntime = Join-Path $taskInstall 'resources/codex/vendor/x86_64-pc-windows-msvc/bin/codex.exe'
  if ((Get-Item -LiteralPath $taskRuntime).Length -lt 1000000) { throw 'Bundled component is invalid' }
  $taskUninstallEntry = @(Get-ChildItem -LiteralPath $taskRegistry | Get-ItemProperty | Where-Object { $_.UninstallString -like "*$taskInstall*" })
  if ($taskUninstallEntry.Count -ne 1) { throw 'Uninstall registration missing' }
  $taskSmoke = Start-Process -FilePath $taskExe -ArgumentList '--smoke-test' -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskResults 'installed.stdout.log') -RedirectStandardError (Join-Path $taskResults 'installed.stderr.log') -Wait -PassThru
  if ($taskSmoke.ExitCode -ne 0) { throw "Installed app smoke test failed: $(Get-Content -LiteralPath (Join-Path $taskResults 'installed.stderr.log') -Raw)" }
  $taskSmokeResult = Get-Content -LiteralPath (Join-Path $taskResults 'smoke.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not $taskSmokeResult.passed -or -not $taskSmokeResult.welcomeVerified -or -not $taskSmokeResult.bundledConnectionVerified) { throw 'Installed app test did not verify onboarding and bundled connection' }
  $taskResult = [ordered]@{ version=$taskVersion; installed=$true; desktopShortcut=$true; startMenuShortcut=$true; uninstallRegistered=$true; installedAppSmoke=$true; bundledConnection=$true }
} finally {
  $taskUninstaller = Join-Path $taskInstall 'Uninstall Hextech Agent.exe'
  if (Test-Path -LiteralPath $taskUninstaller) {
    # _?= runs this uninstaller directly, so cleanup can be observed synchronously.
    $taskUninstall = Start-Process -FilePath $taskUninstaller -ArgumentList @('/S', "_?=$taskInstall") -WindowStyle Hidden -Wait -PassThru
    if ($taskUninstall.ExitCode -ne 0) { throw "Uninstall exit code: $($taskUninstall.ExitCode)" }
  } elseif ($taskInstalled) { throw 'Uninstaller missing' }
}
if ((Test-Path -LiteralPath $taskDesktop) -or (Test-Path -LiteralPath $taskStartMenu) -or (Test-Path -LiteralPath (Join-Path $taskInstall 'Hextech Agent.exe'))) { throw 'Uninstall did not remove installed app and shortcuts' }
$taskRemaining = @(Get-ChildItem -LiteralPath $taskRegistry | Get-ItemProperty | Where-Object { $_.UninstallString -like "*$taskInstall*" })
if ($taskRemaining.Count -gt 0) { throw 'Uninstall registry entry remained' }
$taskResult.uninstalled = $true
$taskResult | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskResults 'installer.json') -Encoding utf8
$taskResult | ConvertTo-Json
