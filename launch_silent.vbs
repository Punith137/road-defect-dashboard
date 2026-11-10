Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

WshShell.Run "cmd /c """ & currentDir & "\run_backend.bat""", 0, False
WshShell.Run "cmd /c """ & currentDir & "\run_frontend.bat""", 0, False