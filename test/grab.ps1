param([int]$ProcessId = 0, [string]$Out = "$env:TEMP\libra-shot.png")
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[NativeWin]::SetProcessDPIAware() | Out-Null
$proc = if ($ProcessId -gt 0) { Get-Process -Id $ProcessId -ErrorAction SilentlyContinue } else { Get-Process | Where-Object { $_.MainWindowTitle -like '*Libra*' } | Select-Object -First 1 }
if (-not $proc) { Write-Output "NO_WINDOW"; exit 1 }
$handle = $proc.MainWindowHandle
if ($handle -eq [IntPtr]::Zero) { Write-Output "NO_HANDLE"; exit 1 }
$rect = New-Object NativeWin+RECT
[NativeWin]::GetWindowRect($handle, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok = [NativeWin]::PrintWindow($handle, $hdc, 2)
$g.ReleaseHdc($hdc)
$g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output ("SAVED " + $Out + " " + $w + "x" + $h + " printwindow=" + $ok + " title=" + $proc.MainWindowTitle)