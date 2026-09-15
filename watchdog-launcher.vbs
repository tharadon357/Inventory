' Runs watchdog.ps1 with a fully invisible window (0 = hidden, no flash at all).
' PowerShell's own -WindowStyle Hidden can still show a brief console flash when
' launched by Task Scheduler - this VBScript wrapper avoids that entirely.
Set objShell = CreateObject("WScript.Shell")
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\Users\aoaww\OneDrive\Desktop\Inventory-main\watchdog.ps1""", 0, False
