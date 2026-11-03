param([Parameter(Mandatory=$true)][string]$SerialNumber,[string]$Python='python')
$ErrorActionPreference='Stop'
& $Python (Join-Path (Split-Path $PSScriptRoot -Parent) 'src/host/camera_bridge.py') --serial $SerialNumber
exit $LASTEXITCODE
