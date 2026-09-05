$ErrorActionPreference = 'Stop'
$root = 'C:\ProgramData\TimeClockCloudBackup'
& 'C:\Program Files\nodejs\node.exe' (Join-Path $root 'pull-backup.mjs') *> (Join-Path $root 'pull.log')
exit $LASTEXITCODE
