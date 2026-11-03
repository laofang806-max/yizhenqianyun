param([string]$VivadoBin=$env:VIVADO_BIN)
$ErrorActionPreference='Stop'
if(!$VivadoBin){$tool=Get-Command xvlog.bat -ErrorAction SilentlyContinue; if($tool){$VivadoBin=Split-Path $tool.Source}else{throw 'Set VIVADO_BIN to your Vivado bin directory.'}}
$root=Split-Path $PSScriptRoot -Parent
$out=Join-Path $PSScriptRoot 'output'
New-Item -ItemType Directory -Path $out -Force | Out-Null
Push-Location $out
try {
 $sources=@(Get-ChildItem (Join-Path $root 'src/rtl/*.v') | ForEach-Object {$_.FullName})
 $benches=@(Get-ChildItem (Join-Path $PSScriptRoot 'tb/*.v') | ForEach-Object {$_.FullName})
 & (Join-Path $VivadoBin 'xvlog.bat') -sv @sources @benches
 if($LASTEXITCODE -ne 0){throw 'Compilation failed'}
 foreach($test in @('tb_needle_ir','tb_needle_ir_top','tb_needle_led','tb_layer_reset_probe')){
  & (Join-Path $VivadoBin 'xelab.bat') $test -s $test -debug typical -mt 2
  if($LASTEXITCODE -ne 0){throw "Elaboration failed: $test"}
  & (Join-Path $VivadoBin 'xsim.bat') $test -runall -log "$test.log"
  if($LASTEXITCODE -ne 0 -or !(Select-String -LiteralPath "$test.log" -Pattern 'PASS:' -Quiet) -or (Select-String -LiteralPath "$test.log" -Pattern 'FAIL:|FATAL' -Quiet)){throw "Simulation failed: $test"}
 }
 Write-Output 'PASS: four real RTL simulations'
} finally { Pop-Location }
