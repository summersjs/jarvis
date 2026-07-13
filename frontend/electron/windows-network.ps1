$ErrorActionPreference = "Stop"
$adapters = Get-NetAdapter -Physical -ErrorAction Stop | Where-Object Status -eq "Up"
$adapter = $adapters | Where-Object {
  (Get-NetIPConfiguration -InterfaceIndex $_.ifIndex -ErrorAction SilentlyContinue).IPv4DefaultGateway
} | Select-Object -First 1
if (-not $adapter) { $adapter = $adapters | Select-Object -First 1 }
if (-not $adapter) {
  @{ connected = $false } | ConvertTo-Json -Compress
  exit 0
}
$configuration = Get-NetIPConfiguration -InterfaceIndex $adapter.ifIndex -ErrorAction SilentlyContinue
$ipv4 = $configuration.IPv4Address | Select-Object -First 1
@{
  connected = $true
  interfaceName = $adapter.Name
  description = $adapter.InterfaceDescription
  ipv4Address = if ($ipv4) { $ipv4.IPAddress } else { $null }
  linkSpeedMbps = if ($adapter.ReceiveLinkSpeed) { [math]::Round([double]$adapter.ReceiveLinkSpeed / 1000000, 1) } else { $null }
} | ConvertTo-Json -Compress
