param([string]$ProjectRoot='E:\AMD_COMPETITION\Control')
$ErrorActionPreference='Continue'
$results=[ordered]@{ProjectRoot=$ProjectRoot;ReadOnly=$true;ProjectExists=(Test-Path -LiteralPath $ProjectRoot);Paths=@();Listeners=@();Devices=@();Notes=@()}
foreach($relative in @('AMD_fpga\package.json','host\camera_bridge.py','fpga\board_top.v','fpga\build_release.tcl')){
 $results.Paths+=@{Path=$relative;Exists=(Test-Path -LiteralPath (Join-Path $ProjectRoot $relative))}
}
try {
 $results.Listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {$_.LocalPort -in @(4173,8765)} | Select-Object LocalAddress,LocalPort,OwningProcess)
} catch {$results.Notes+='Listener inventory unavailable: '+$_.Exception.Message}
try {
 $results.Devices=@(Get-PnpDevice -PresentOnly -ErrorAction Stop | Where-Object {$_.InstanceId -match 'VID_0403|VID_1A86' -or $_.FriendlyName -match 'CH340'} | Select-Object Status,FriendlyName,InstanceId)
} catch {$results.Notes+='Device inventory unavailable: '+$_.Exception.Message}
$results | ConvertTo-Json -Depth 5
