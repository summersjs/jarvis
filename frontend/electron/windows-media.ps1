param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("getSession", "playPause", "play", "pause", "next", "previous", "volumeUp", "volumeDown", "mute", "open")]
  [string]$Action,
  [ValidatePattern('^https://music\.youtube\.com(?:/.*)?$')]
  [string]$MusicUrl = "https://music.youtube.com/"
)

$ErrorActionPreference = "Stop"
$script:ArtworkDiagnostic = "not_requested"
$script:ArtworkContentType = $null
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
function Get-ImageContentType([byte[]]$Bytes, [string]$ReportedType) {
  if ($ReportedType -in @("image/jpeg", "image/png", "image/webp")) { return $ReportedType }
  if ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xFF -and $Bytes[1] -eq 0xD8 -and $Bytes[2] -eq 0xFF) { return "image/jpeg" }
  if ($Bytes.Length -ge 8 -and $Bytes[0] -eq 0x89 -and $Bytes[1] -eq 0x50 -and $Bytes[2] -eq 0x4E -and $Bytes[3] -eq 0x47) { return "image/png" }
  if ($Bytes.Length -ge 12 -and [Text.Encoding]::ASCII.GetString($Bytes, 0, 4) -eq "RIFF" -and [Text.Encoding]::ASCII.GetString($Bytes, 8, 4) -eq "WEBP") { return "image/webp" }
  return $null
}
function Read-ThumbnailDataUri($Thumbnail) {
  if (-not $Thumbnail) { $script:ArtworkDiagnostic = "missing_thumbnail"; return $null }
  $stream = $null
  $dotnetStream = $null
  $memory = $null
  $stage = "open"
  try {
    [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
    $stream = Await-WinRt ($Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $stage = "input_stream"
    $reportedContentType = [string]$stream.ContentType
    if ([uint64]$stream.Size -gt 1572864) { $script:ArtworkDiagnostic = "invalid_stream_size"; return $null }
    $getInputMethod = [Windows.Storage.Streams.IRandomAccessStream].GetMethod("GetInputStreamAt")
    $inputStream = $getInputMethod.Invoke($stream, @([uint64]0))
    $stage = "adapter"
    $asStreamMethod = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object {
      $_.Name -eq "AsStreamForRead" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq "IInputStream"
    } | Select-Object -First 1
    if (-not $asStreamMethod) { $script:ArtworkDiagnostic = "stream_adapter_unavailable"; return $null }
    $dotnetStream = $asStreamMethod.Invoke($null, @($inputStream))
    $stage = "copy"
    $memory = New-Object System.IO.MemoryStream
    $dotnetStream.CopyTo($memory)
    $stage = "validate"
    if ($memory.Length -eq 0 -or $memory.Length -gt 1572864) { $script:ArtworkDiagnostic = "invalid_image_size"; return $null }
    $bytes = $memory.ToArray()
    $contentType = Get-ImageContentType $bytes $reportedContentType
    $script:ArtworkContentType = $contentType
    if (-not $contentType) { $script:ArtworkDiagnostic = "unsupported_content_type"; return $null }
    $script:ArtworkDiagnostic = "available"
    return "data:$contentType;base64,$([Convert]::ToBase64String($bytes))"
  } catch {
    $script:ArtworkDiagnostic = "read_failed_${stage}_$($_.Exception.GetType().Name)"
    return $null
  } finally {
    if ($memory) { $memory.Dispose() }
    if ($dotnetStream) { $dotnetStream.Dispose() }
  }
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
  $artworkDataUrl = if ($properties) { Read-ThumbnailDataUri $properties.Thumbnail } else { $null }
  Write-Result @{ available = $true; provider = "Windows GSMTC"; source = $source; sourceAppId = $sourceId; title = if ($properties) { $properties.Title } else { $null }; artist = if ($properties) { $properties.Artist } else { $null }; album = if ($properties) { $properties.AlbumTitle } else { $null }; playbackStatus = $status; artworkUrl = $artworkDataUrl; artworkStatus = $script:ArtworkDiagnostic; artworkContentType = $script:ArtworkContentType; collectedAt = [DateTime]::UtcNow.ToString("o") }
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
