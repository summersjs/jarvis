$ErrorActionPreference = "Stop"
$drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object -First 1
if (-not $drive) { throw "C drive was not found." }
@{
  drive = "C:"
  filesystem = $drive.FileSystem
  volumeLabel = $drive.VolumeName
  totalBytes = [uint64]$drive.Size
  freeBytes = [uint64]$drive.FreeSpace
} | ConvertTo-Json -Compress
