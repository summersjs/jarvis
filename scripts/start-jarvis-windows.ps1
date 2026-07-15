$ErrorActionPreference = "Stop"

$distro = "Ubuntu"
$linuxProject = "/home/john/development/jarvis"
$windowsProject = "C:\Development\jarvis"
$ollamaExe = "C:\Users\johnf\AppData\Local\Programs\Ollama\ollama.exe"
$kokoroPython = Join-Path $windowsProject "services\kokoro-tts\.venv\Scripts\python.exe"
$kokoroDirectory = Join-Path $windowsProject "services\kokoro-tts"
# Starting WSL creates its virtual network adapter and starts systemd.
& wsl.exe -d $distro --exec /bin/true
$route = (& wsl.exe -d $distro --exec ip route show default | Select-Object -First 1)
$routeParts = $route -split "\s+"
$windowsHost = $routeParts[2]
if (-not $windowsHost) {
    throw "Could not determine the Windows host address from WSL."
}

# Jarvis owns the Ollama server process so it listens on the WSL-facing adapter.
Get-Process -Name "ollama", "ollama app", "ollama_llama_server" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
$env:OLLAMA_HOST = "${windowsHost}:11434"
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", $env:OLLAMA_HOST, "User")
Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden

# Remove a stale Kokoro instance before starting the checked, known environment.
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "uvicorn app:app" -and $_.CommandLine -match "8880" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
if (Test-Path $kokoroPython) {
    Start-Process -FilePath $kokoroPython `
        -ArgumentList "-m", "uvicorn", "app:app", "--host", $windowsHost, "--port", "8880" `
        -WorkingDirectory $kokoroDirectory -WindowStyle Hidden
} else {
    Write-Warning "Kokoro TTS environment is missing at $kokoroPython. Run the setup documented in services\kokoro-tts\README.md."
}

# User services supervise the Jarvis backend and frontend inside WSL.
& wsl.exe -d $distro --exec systemctl --user start jarvis.target
