$ErrorActionPreference = "Stop"
$result = @{}

try {
  $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
  if ($drive -and $drive.Size -gt 0) { $result.storageUsage = [math]::Round((1 - ($drive.FreeSpace / $drive.Size)) * 100) }
} catch {}

try {
  $nvidia = Get-Command nvidia-smi.exe -ErrorAction Stop
  $line = & $nvidia.Source --query-gpu=utilization.gpu,temperature.gpu --format=csv,noheader,nounits 2>$null | Select-Object -First 1
  if ($line) {
    $values = $line -split ',' | ForEach-Object { $_.Trim() }
    if ($values.Count -ge 2) {
      $result.gpuUsage = [int]$values[0]
      $result.gpuTemp = [int]$values[1]
    }
  }
} catch {}

try {
  $sample = Get-Counter '\Network Interface(*)\Bytes Received/sec', '\Network Interface(*)\Bytes Sent/sec' -SampleInterval 1 -MaxSamples 1
  $down = ($sample.CounterSamples | Where-Object Path -like '*Bytes Received/sec' | Measure-Object CookedValue -Sum).Sum
  $up = ($sample.CounterSamples | Where-Object Path -like '*Bytes Sent/sec' | Measure-Object CookedValue -Sum).Sum
  if ($null -ne $down) { $result.networkDown = "{0:N1} MB/s" -f ($down / 1MB) }
  if ($null -ne $up) { $result.networkUp = "{0:N1} MB/s" -f ($up / 1MB) }
} catch {}

$result | ConvertTo-Json -Compress
