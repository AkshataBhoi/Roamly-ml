$ErrorActionPreference = "Stop"

$pythonVersion = "3.12.2"
$installerUrl = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-amd64.exe"
$installerPath = "$env:TEMP\python-installer.exe"
$installDir = "$PWD\.python312"

Write-Host "Downloading Python $pythonVersion..."
Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath

Write-Host "Installing Python locally to $installDir (no admin required)..."
Start-Process -FilePath $installerPath -ArgumentList "/quiet InstallAllUsers=0 TargetDir=$installDir Include_test=0" -Wait

Write-Host "Removing old .venv..."
if (Test-Path "ml\.venv") {
    Remove-Item -Recurse -Force "ml\.venv"
}

Write-Host "Creating new .venv with Python $pythonVersion..."
& "$installDir\python.exe" -m venv ml\.venv

Write-Host "Installing dependencies (this will now use pre-compiled binaries instead of compiling from source)..."
& "ml\.venv\Scripts\pip.exe" install -r ml\requirements.txt

Write-Host "Done!"
