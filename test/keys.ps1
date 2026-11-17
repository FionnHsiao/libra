param([string]$Match = "Libra", [string]$Keys = "^b")
$shell = New-Object -ComObject WScript.Shell
$ok = $shell.AppActivate($Match)
Start-Sleep -Milliseconds 400
$shell.SendKeys($Keys)
Write-Output ("SENT " + $Keys + " activate=" + $ok)