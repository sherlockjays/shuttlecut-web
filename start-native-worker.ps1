# ShuttleCut 네이티브 Windows Celery 워커
# OpenCL + NVDEC + NVENC 전부 활성 (WSL2 제한 없음)

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$ENV_FILE = "$ROOT\.env.native-worker"
$VENV = "$ROOT\worker-venv\Scripts"
$BACKEND = "$ROOT\backend"

# .env.native-worker 로드
Get-Content $ENV_FILE | ForEach-Object {
    if ($_ -match "^([^#][^=]+)=(.+)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}

# STORAGE_PATH 디렉토리 생성
New-Item -ItemType Directory -Force $env:STORAGE_PATH | Out-Null
New-Item -ItemType Directory -Force "$env:STORAGE_PATH\exports" | Out-Null

$env:PYTHONPATH = $BACKEND

Write-Host "[shuttlecut] 네이티브 워커 시작 (ENABLE_GPU=1, ENABLE_OPENCL=1, ENABLE_NVDEC=1)"
Write-Host "[shuttlecut] PYTHONPATH=$env:PYTHONPATH"

Set-Location $BACKEND
& "$VENV\celery" -A workers.tasks.celery worker --loglevel=info --pool=solo
