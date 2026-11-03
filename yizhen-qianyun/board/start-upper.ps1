$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Set-Location (Join-Path $root 'src/upper')
if(!(Test-Path 'node_modules')) { & npm.cmd ci; if($LASTEXITCODE -ne 0){throw 'npm ci failed'} }
& node init-account.cjs
if($LASTEXITCODE -ne 0){throw 'Account setup failed'}
& npm.cmd run dev
