<#
.SYNOPSIS
    ShuttleCut 워커 배포 스크립트

.DESCRIPTION
    진행 중인 인코딩이 끝나기를 기다린 뒤 celery를 내리고, 체크아웃을 배포 커밋으로
    맞추고, 필요하면 worker-venv를 재설치하고, 다시 띄운다.
    절차의 정본은 README "배포" 절이다.

    대상은 워커 전용 체크아웃이다. 개발 체크아웃에서 돌면 작업 브랜치가 날아가므로
    .env.native-worker 가 있는지로 판별하고, 없으면 시작하지 않는다.

.PARAMETER Ref
    배포할 커밋 또는 브랜치. 생략하면 origin/main. 보통 NAS 배포가 출력한 SHA를 넣는다.

.PARAMETER WorkerRoot
    워커 전용 체크아웃의 경로. 생략하면 이 스크립트가 들어 있는 체크아웃.

.PARAMETER Yes
    나갈 내용 확인 프롬프트를 생략한다.

.PARAMETER QueueTimeoutMinutes
    진행 중인 작업이 끝나기를 기다리는 한도. 넘으면 중단한다(작업을 죽이지 않는다).

.EXAMPLE
    scripts\deploy-worker.ps1 efbecf35daaf
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Ref = "origin/main",

    [string]$WorkerRoot,

    [switch]$Yes,

    [int]$QueueTimeoutMinutes = 30
)

# deploy-nas.sh 와 달리 /tmp 사본으로 옮겨 탈 필요가 없다. bash는 스크립트를 스트리밍으로
# 읽어서 실행 중에 파일이 바뀌면 오프셋이 어긋나지만, PowerShell은 실행 전에 전부 읽어
# 파싱하기 때문이다. 그래도 -WorkerRoot 로 대상을 명시하면 실행 위치와 무관하게 동작한다.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── 출력 ───────────────────────────────────────────────────────────────────
$script:Warnings = 0
$script:Stage = 0

function Write-Stage($Message) {
    if ($Message -match '^(\d+)\.') { $script:Stage = [int]$matches[1] }
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}
function Write-Detail($Message) { Write-Host "    $Message" }

function Write-Warn($Message) {
    Write-Host "[경고] " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
    $script:Warnings++
}

function Stop-Deploy($Message) {
    Write-Host "`n[중단] " -ForegroundColor Red -NoNewline
    Write-Host $Message
    # 체크아웃 단계(4) 전에는 디스크가 그대로라 되돌릴 것이 없다.
    if ($script:Stage -ge 4 -and $script:PrevSha) {
        Write-Host "    되돌리려면 이전 커밋으로 다시 실행합니다:"
        Write-Host "      $PSCommandPath $($script:PrevSha.Substring(0, 12))"
    }
    exit 1
}

# ── 경로와 사전 조건 ───────────────────────────────────────────────────────
$script:PrevSha = ""

if (-not $WorkerRoot) { $WorkerRoot = Split-Path -Parent $PSScriptRoot }
$WorkerRoot = (Resolve-Path $WorkerRoot -ErrorAction SilentlyContinue).Path
if (-not $WorkerRoot) { Stop-Deploy "워커 체크아웃 경로를 찾을 수 없습니다." }

$EnvFile = Join-Path $WorkerRoot ".env.native-worker"
$BackendDir = Join-Path $WorkerRoot "backend"
$CeleryExe = Join-Path $WorkerRoot "worker-venv\Scripts\celery.exe"
$PythonExe = Join-Path $WorkerRoot "worker-venv\Scripts\python.exe"
$PipExe = Join-Path $WorkerRoot "worker-venv\Scripts\pip.exe"
$StartScript = Join-Path $WorkerRoot "start-native-worker.ps1"

# 배포 로그가 페이저를 타면 출력이 한 화면을 넘을 때 입력을 기다리며 멈춘다.
$env:GIT_PAGER = "cat"

# Windows PowerShell 5.1은 네이티브 명령의 stderr를 2>&1로 합칠 때 각 줄을 ErrorRecord로
# 감싸고, $ErrorActionPreference='Stop' 이면 그것을 예외로 던진다. git·celery·pip은 정상
# 동작 중에도 stderr를 쓰므로(fetch 진행률 등) 그대로 두면 멀쩡한 명령이 실패로 잡힌다.
# 그래서 네이티브 호출 동안만 Continue로 내리고, 성패는 종료코드로 판정한다.
$script:NativeExitCode = 0

function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $lines = @(& $Exe @Arguments 2>&1 | ForEach-Object { "$_" })
        $script:NativeExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    return ($lines -join "`n")
}

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments)][string[]]$GitArgs)
    $output = Invoke-Native "git" (@("-C", $WorkerRoot) + $GitArgs)
    if ($script:NativeExitCode -ne 0) {
        Stop-Deploy "git $($GitArgs -join ' ') 가 실패했습니다.`n$output"
    }
    return $output
}

# celery는 REDIS_URL과 PYTHONPATH가 있어야 하고 backend 디렉터리에서 불러야 한다.
function Invoke-Celery {
    param([Parameter(ValueFromRemainingArguments)][string[]]$CeleryArgs)
    Push-Location $BackendDir
    try {
        return (Invoke-Native $CeleryExe (@("-A", "workers.tasks.celery") + $CeleryArgs))
    } finally {
        Pop-Location
    }
}

# idle(떠 있고 한가함) / busy(작업 중) / down(브로커는 붙지만 워커가 없음) / error(그 외)
#
# 실측한 출력이다. 둘 다 종료코드 69라 종료코드로는 구분할 수 없다.
#   워커 없음   Error: No nodes replied within time constraint
#   브로커 없음 Error: Could not connect to the message broker ...
# 브로커에 못 붙는 것은 error다. 그 상태로 체크아웃을 건드리면 안 된다.
$script:LastCeleryOutput = ""

function Get-WorkerState {
    $script:LastCeleryOutput = Invoke-Celery inspect active --timeout 5
    $output = $script:LastCeleryOutput
    if ($output -match "- empty -") { return "idle" }
    if ($output -match "No nodes replied") { return "down" }
    if ($output -match "Error:") { return "error" }
    if ($output -match ": OK") { return "busy" }
    return "error"
}

# ── 0. 사전 조건 ───────────────────────────────────────────────────────────
Write-Stage "0. 사전 조건"
Write-Detail "워커 체크아웃: $WorkerRoot"

if (-not (Test-Path (Join-Path $WorkerRoot ".git"))) {
    Stop-Deploy "$WorkerRoot 가 git 체크아웃이 아닙니다."
}

# ★ 개발 체크아웃을 갈아엎지 않기 위한 방어선이다.
if (-not (Test-Path $EnvFile)) {
    Stop-Deploy @"
$WorkerRoot 에 .env.native-worker 가 없습니다. 워커 전용 체크아웃이 아닙니다.
    개발 체크아웃에서 돌면 작업 중인 브랜치가 날아갑니다. -WorkerRoot 를 확인해주세요.
"@
}

foreach ($required in @($CeleryExe, $PythonExe, $StartScript)) {
    if (-not (Test-Path $required)) { Stop-Deploy "$required 가 없습니다." }
}

# celery는 REDIS_URL로 브로커를 찾고 PYTHONPATH로 workers 패키지를 찾는다. 둘 다 없으면
# compose용 기본값(redis:6379)을 보게 되어, 워커가 멀쩡히 떠 있어도 못 붙는다.
# start-native-worker.ps1 과 같은 방식으로 읽는다.
Get-Content $EnvFile -Encoding UTF8 | ForEach-Object {
    if ($_ -match "^([^#][^=]+)=(.+)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}
$env:PYTHONPATH = $BackendDir

# 체크아웃이 깨끗한지가 "워커가 어느 커밋을 도나"를 확인하는 유일한 수단이다.
$dirty = Invoke-Git status --porcelain
if ($dirty) {
    Write-Host $dirty
    Stop-Deploy "워커 체크아웃에 변경이 있습니다. 비추적 파일은 gitignore 대상이어야 합니다."
}
Write-Detail "체크아웃 깨끗함"

# 파이썬 버전 대조는 start-native-worker.ps1 이 기동할 때마다 하므로 여기서 또 보지 않는다.
$script:PrevSha = (Invoke-Git rev-parse HEAD).Trim()
Write-Detail "현재 커밋: $($script:PrevSha.Substring(0, 12))"

# ── 1. 나갈 내용 ───────────────────────────────────────────────────────────
Write-Stage "1. 나갈 내용"

Invoke-Git fetch origin main | Out-Null

# 이 호출은 실패가 정상 경로다(못 찾는 ref). Invoke-Git을 쓰면 die하므로 직접 부른다.
Invoke-Native "git" @("-C", $WorkerRoot, "rev-parse", "--verify", "--quiet", "$Ref^{commit}") | Out-Null
if ($script:NativeExitCode -ne 0) { Stop-Deploy "ref를 찾을 수 없습니다: $Ref" }
$NewSha = (Invoke-Git rev-parse "$Ref^{commit}").Trim()

if ($NewSha -eq $script:PrevSha) {
    Write-Detail "이미 $Ref 와 같은 커밋입니다. celery 재시작만 하게 됩니다."
    $changed = @()
} else {
    # 되돌리는 방향이면 A..B 가 비어 아무것도 안 보인다. 그때도 무엇이 바뀌는지는 보여야 한다.
    $log = Invoke-Git log --oneline "$($script:PrevSha)..$NewSha"
    if ($log) {
        $log -split "`n" | ForEach-Object { if ($_) { Write-Host "    $_" } }
    } else {
        Write-Detail "앞서는 커밋이 없습니다. 되돌리는 방향입니다."
    }
    (Invoke-Git diff --stat $script:PrevSha $NewSha) -split "`n" |
        ForEach-Object { if ($_) { Write-Host "    $_" } }
    $changed = @((Invoke-Git diff --name-only $script:PrevSha $NewSha) -split "`n" | Where-Object { $_ })
}

$ReqsChanged = $changed -contains "backend/requirements.txt"
$BackendChanged = @($changed | Where-Object { $_ -like "backend/*" }).Count -gt 0

Write-Host ""
if ($ReqsChanged) {
    Write-Detail "backend/requirements.txt 가 바뀝니다. worker-venv를 재설치합니다."
} elseif ($BackendChanged) {
    Write-Detail "backend/ 가 바뀝니다."
} elseif ($NewSha -ne $script:PrevSha) {
    Write-Warn "backend/ 변경이 없습니다. 워커를 재시작할 이유가 없을 수 있습니다."
}

if (-not $Yes) {
    $answer = Read-Host "    이 내용으로 배포할까요? [y/N]"
    if ($answer -notmatch '^[Yy]$') { Stop-Deploy "사용자가 중단했습니다." }
}

# ── 2. 큐가 비기를 기다린다 ────────────────────────────────────────────────
Write-Stage "2. 진행 중인 작업 확인"

$state = Get-WorkerState
if ($state -eq "error") {
    Stop-Deploy @"
celery 상태를 확인하지 못했습니다. 체크아웃은 건드리지 않았습니다.

$script:LastCeleryOutput
    .env.native-worker 의 REDIS_URL과 NAS가 떠 있는지 확인해주세요.
"@
}
if ($state -eq "down") {
    Write-Detail "워커가 떠 있지 않습니다. 기다릴 것이 없습니다."
} else {
    $deadline = (Get-Date).AddMinutes($QueueTimeoutMinutes)
    while ($state -eq "busy") {
        if ((Get-Date) -gt $deadline) {
            Stop-Deploy @"
$QueueTimeoutMinutes 분을 기다렸는데 작업이 끝나지 않았습니다.
    강제로 죽이면 그 내보내기는 날아갑니다. -QueueTimeoutMinutes 를 늘려 다시 실행해주세요.
"@
        }
        Write-Host "    작업이 진행 중입니다. 30초 뒤 다시 봅니다. (한도 $QueueTimeoutMinutes 분)"
        Start-Sleep -Seconds 30
        $state = Get-WorkerState
    }
    Write-Detail "진행 중인 작업 없음"
}

# ── 3. 정상 종료 ───────────────────────────────────────────────────────────
Write-Stage "3. celery 종료"

if ($state -eq "down") {
    Write-Detail "이미 꺼져 있습니다."
} else {
    # taskkill은 권한이 거부되는 경우가 있어 쓰지 않는다.
    Invoke-Celery control shutdown | Out-Null

    $stopped = $false
    foreach ($i in 1..20) {
        Start-Sleep -Seconds 2
        if ((Get-WorkerState) -eq "down") { $stopped = $true; break }
    }
    if (-not $stopped) { Stop-Deploy "celery가 종료되지 않았습니다. 워커 창을 직접 확인해주세요." }
    Write-Detail "종료됨"
}

# ── 4. 체크아웃 ────────────────────────────────────────────────────────────
Write-Stage "4. 체크아웃"

# --detach 여야 한다. 워커 체크아웃이 브랜치를 따라가면 배포 커밋 고정이 깨진다.
Invoke-Git checkout --force --detach $NewSha | Out-Null

$afterSha = (Invoke-Git rev-parse HEAD).Trim()
if ($afterSha -ne $NewSha) { Stop-Deploy "체크아웃이 $NewSha 로 가지 않았습니다." }
if (Invoke-Git status --porcelain) { Stop-Deploy "체크아웃 후 워킹트리가 깨끗하지 않습니다." }
Write-Detail "$($script:PrevSha.Substring(0, 12)) -> $($NewSha.Substring(0, 12))"

# ── 5. 의존성 ──────────────────────────────────────────────────────────────
Write-Stage "5. 의존성"

if ($ReqsChanged) {
    # NAS는 도커 빌드가 알아서 하지만 워커는 네이티브라 아무도 해주지 않는다.
    $pipOutput = Invoke-Native $PipExe @("install", "-r", (Join-Path $BackendDir "requirements.txt"))
    if ($script:NativeExitCode -ne 0) { Stop-Deploy "pip install이 실패했습니다.`n$pipOutput" }
    Write-Detail "worker-venv 재설치 완료"
} else {
    Write-Detail "requirements.txt 변경 없음. 건너뜁니다."
}

# ── 6. 기동 ────────────────────────────────────────────────────────────────
Write-Stage "6. celery 기동"

# -NoExit: celery가 죽어도 창이 남아야 로그를 읽을 수 있다.
Start-Process powershell `
    -ArgumentList "-NoExit", "-NoProfile", "-File", "`"$StartScript`"" `
    -WorkingDirectory $WorkerRoot | Out-Null
Write-Detail "새 창에서 start-native-worker.ps1 을 실행했습니다."

# ── 7. 확인 ────────────────────────────────────────────────────────────────
Write-Stage "7. 확인"

$alive = $false
foreach ($i in 1..30) {
    Start-Sleep -Seconds 2
    if ((Get-WorkerState) -in @("idle", "busy")) { $alive = $true; break }
}
if (-not $alive) { Stop-Deploy "워커가 응답하지 않습니다. 방금 뜬 창의 로그를 확인해주세요." }
Write-Detail "pong"

# ── 8. 마무리 ──────────────────────────────────────────────────────────────
Write-Stage "8. 워커 배포 완료"

Write-Detail "커밋: $($script:PrevSha.Substring(0, 12)) -> $($NewSha.Substring(0, 12))"
if ($script:Warnings -eq 0) {
    Write-Detail "경고 없음"
} else {
    Write-Warn "경고 $($script:Warnings)건이 있었습니다. 위로 올려서 확인해주세요."
}

Write-Host @"

    워커가 도는 커밋은 이제 이 명령이 답합니다. NAS 백엔드와 같아야 합니다.
      git -C "$WorkerRoot" rev-parse HEAD

    되돌리려면:
      $PSCommandPath $($script:PrevSha.Substring(0, 12))

"@
