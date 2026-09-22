# ShuttleCut 네이티브 Windows Celery 워커
# OpenCL + NVDEC + NVENC 전부 활성 (WSL2 제한 없음)
#
# 이 스크립트가 있는 디렉터리의 backend/ 를 실행한다. 그래서 운영 워커는
# 개발 체크아웃이 아니라 배포 커밋에 고정된 전용 체크아웃에서 띄워야 한다.
# 배포는 scripts/deploy-worker.ps1 이 한다.

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$ENV_FILE = "$ROOT\.env.native-worker"
$VENV = "$ROOT\worker-venv\Scripts"
$BACKEND = "$ROOT\backend"

# 이 파일이 있는 체크아웃이 곧 워커 체크아웃이다. 없으면 개발 체크아웃에서 잘못 띄운 것이다.
if (-not (Test-Path $ENV_FILE)) {
    Write-Host "[shuttlecut] $ENV_FILE 이 없습니다." -ForegroundColor Red
    Write-Host "             워커 전용 체크아웃에서 실행해주세요."
    Write-Host "             템플릿은 .env.native-worker.example 입니다."
    exit 1
}

# .env.native-worker 로드. -Encoding UTF8 이 없으면 Windows PowerShell 5.1이
# 파일을 ANSI로 읽어 한글 주석이 깨진다.
Get-Content $ENV_FILE -Encoding UTF8 | ForEach-Object {
    if ($_ -match "^([^#][^=]+)=(.+)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}

# STORAGE_PATH 디렉토리 생성
New-Item -ItemType Directory -Force $env:STORAGE_PATH | Out-Null
New-Item -ItemType Directory -Force "$env:STORAGE_PATH\exports" | Out-Null

$env:PYTHONPATH = $BACKEND

# 지금 어느 커밋을 실행하는지 남긴다. 워커는 NAS 백엔드와 같은 커밋이어야 한다.
$COMMIT = (& git -C $ROOT rev-parse --short=12 HEAD 2>$null)
if (-not $COMMIT) { $COMMIT = "(git 체크아웃 아님)" }
$Host.UI.RawUI.WindowTitle = "shuttlecut worker - $COMMIT"

# 인터프리터는 requirements.txt가 고정해주지 않는다. NAS Dockerfile과 맞는지 확인한다.
$VERSION_FILE = "$ROOT\.python-version"
if (Test-Path $VERSION_FILE) {
    $WANTED = (Get-Content $VERSION_FILE -Encoding UTF8 | Select-Object -First 1).Trim()
    $ACTUAL = ((& "$VENV\python.exe" -V 2>&1 | Out-String).Trim() -replace '^Python\s+', '')
    if (-not ($ACTUAL -like "$WANTED.*" -or $ACTUAL -eq $WANTED)) {
        Write-Host "[shuttlecut] 경고: venv 파이썬이 $ACTUAL 인데 .python-version은 $WANTED 입니다." -ForegroundColor Yellow
        Write-Host "             NAS 백엔드와 C 확장 바이너리가 달라집니다."
    }
}

Write-Host "[shuttlecut] 네이티브 워커 시작 (ENABLE_GPU=1, ENABLE_OPENCL=1, ENABLE_NVDEC=1)"
Write-Host "[shuttlecut] 커밋=$COMMIT"
Write-Host "[shuttlecut] PYTHONPATH=$env:PYTHONPATH"

Set-Location $BACKEND
& "$VENV\celery" -A workers.tasks.celery worker --loglevel=info --pool=solo

# 배포 스크립트가 -NoExit으로 띄우므로 celery가 끝나도 창이 남는다. 로그를 읽으라고
# 남기는 것이지만, 제목에 커밋만 박혀 있으면 죽은 창이 살아있는 워커처럼 보인다.
$Host.UI.RawUI.WindowTitle = "shuttlecut worker [종료됨] - $COMMIT"
Write-Host "[shuttlecut] 워커가 종료되었습니다 (커밋=$COMMIT, 종료코드=$LASTEXITCODE)" -ForegroundColor Yellow
Write-Host "[shuttlecut] 이 창은 로그 확인용으로 남은 것입니다. 닫아도 됩니다."
