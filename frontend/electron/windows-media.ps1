param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("getSession", "playPause", "play", "pause", "next", "previous", "volumeUp", "volumeDown", "mute", "open")]
  [string]$Action,
  [ValidatePattern('^https://music\.youtube\.com(?:/.*)?$')]
  [string]$MusicUrl = "https://music.youtube.com/"
)

$ErrorActionPreference = "Stop"
function Write-Result([hashtable]$Value) { $Value | ConvertTo-Json -Compress -Depth 4 }
function Await-WinRt($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}
function Press-MediaKey([byte]$Key) {
  if (-not ("JarvisMediaKeys" -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class JarvisMediaKeys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static void Press(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }
}
"@
  }
  [JarvisMediaKeys]::Press($Key)
}

if ($Action -eq "open") {
  $app = Get-StartApps | Where-Object Name -eq "YouTube Music" | Select-Object -First 1
  if ($app) { Start-Process explorer.exe -ArgumentList "shell:AppsFolder\$($app.AppID)"; Write-Result @{ available = $true; provider = "Windows AppsFolder"; opened = "installedApp" } }
  else { Start-Process $MusicUrl; Write-Result @{ available = $true; provider = "system browser"; opened = "browser" } }
  exit 0
}

if ($Action -in @("volumeUp", "volumeDown", "mute")) {
  $keys = @{ volumeUp = 0xAF; volumeDown = 0xAE; mute = 0xAD }
  Press-MediaKey $keys[$Action]
  Write-Result @{ available = $true; provider = "Windows media keys"; action = $Action }
  exit 0
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
$manager = Await-WinRt ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$sessions = @($manager.GetSessions())
$session = $sessions | Where-Object { $_.SourceAppUserModelId -match "(?i)(youtube|cinhimbnkkghhklpknlkffjgod)" } | Select-Object -First 1
if (-not $session) { $session = $manager.GetCurrentSession() }

if (-not $session) {
  if ($Action -eq "getSession") { Write-Result @{ available = $false; provider = "Windows GSMTC"; reason = "no_session"; collectedAt = [DateTime]::UtcNow.ToString("o") }; exit 0 }
  $keys = @{ playPause = 0xB3; play = 0xB3; pause = 0xB3; next = 0xB0; previous = 0xB1 }
  Press-MediaKey $keys[$Action]
  Write-Result @{ available = $true; provider = "Windows media keys"; action = $Action }
  exit 0
}

if ($Action -eq "getSession") {
  $properties = $null
  try { $properties = Await-WinRt ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]) } catch {}
  $status = $session.GetPlaybackInfo().PlaybackStatus.ToString()
  $sourceId = $session.SourceAppUserModelId
  $source = if ($sourceId -match "(?i)(youtube|cinhimbnkkghhklpknlkffjgod)") { "YouTube Music" } else { $sourceId }
  Write-Result @{ available = $true; provider = "Windows GSMTC"; source = $source; sourceAppId = $sourceId; title = if ($properties) { $properties.Title } else { $null }; artist = if ($properties) { $properties.Artist } else { $null }; album = if ($properties) { $properties.AlbumTitle } else { $null }; playbackStatus = $status; artworkUrl = $null; collectedAt = [DateTime]::UtcNow.ToString("o") }
  exit 0
}

$operation = switch ($Action) {
  "playPause" { $session.TryTogglePlayPauseAsync() }
  "play" { $session.TryPlayAsync() }
  "pause" { $session.TryPauseAsync() }
  "next" { $session.TrySkipNextAsync() }
  "previous" { $session.TrySkipPreviousAsync() }
}
$success = Await-WinRt $operation ([bool])
Write-Result @{ available = [bool]$success; provider = "Windows GSMTC"; action = $Action }
