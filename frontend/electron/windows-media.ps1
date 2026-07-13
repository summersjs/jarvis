param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("playPause", "nextTrack", "previousTrack", "volumeUp", "volumeDown", "mute", "getNowPlaying", "openYouTubeMusic")]
  [string]$Action,
  [ValidatePattern('^https://music\.youtube\.com(?:/.*)?$')]
  [string]$MusicUrl = "https://music.youtube.com/"
)

$ErrorActionPreference = "Stop"

function Write-Result([hashtable]$Value) {
  $Value | ConvertTo-Json -Compress -Depth 4
}

function Await-WinRt($AsyncOperation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq "AsTask" -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($AsyncOperation))
  $task.Wait()
  return $task.Result
}

if ($Action -eq "openYouTubeMusic") {
  $app = Get-StartApps | Where-Object { $_.Name -eq "YouTube Music" } | Select-Object -First 1
  if ($app) {
    Start-Process explorer.exe -ArgumentList "shell:AppsFolder\$($app.AppID)"
    Write-Result @{ available = $true; opened = "installedApp" }
  } else {
    Start-Process $MusicUrl
    Write-Result @{ available = $true; opened = "browser" }
  }
  exit 0
}

if ($Action -in @("volumeUp", "volumeDown", "mute")) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class JarvisMediaKeys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static void Press(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }
}
"@
  $keys = @{ volumeUp = 0xAF; volumeDown = 0xAE; mute = 0xAD }
  [JarvisMediaKeys]::Press($keys[$Action])
  Write-Result @{ available = $true; action = $Action }
  exit 0
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
$manager = Await-WinRt ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$session = $manager.GetCurrentSession()
if (-not $session) {
  Write-Result @{ available = $false; reason = "No compatible Windows media session is active." }
  exit 0
}

if ($Action -eq "getNowPlaying") {
  $properties = Await-WinRt ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $status = $session.GetPlaybackInfo().PlaybackStatus.ToString()
  Write-Result @{
    available = $true
    title = $properties.Title
    artist = $properties.Artist
    album = $properties.AlbumTitle
    isPlaying = $status -eq "Playing"
    playbackStatus = $status
    source = $session.SourceAppUserModelId
  }
  exit 0
}

$operation = switch ($Action) {
  "playPause" { $session.TryTogglePlayPauseAsync() }
  "nextTrack" { $session.TrySkipNextAsync() }
  "previousTrack" { $session.TrySkipPreviousAsync() }
}
$success = Await-WinRt $operation ([bool])
Write-Result @{ available = [bool]$success; action = $Action }
