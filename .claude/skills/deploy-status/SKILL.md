---
name: deploy-status
description: 마지막 배포 이후 main에 쌓인 커밋, 이번 배포에서 갱신해야 할 대상(백엔드, 워커, 프론트엔드), 붙여넣을 배포 명령을 보여준다. "배포 밀린 거 있어?", "배포 대기 확인", "뭐가 아직 안 나갔어?", "배포 명령 뭐였지?" 같은 요청에 쓴다. 읽기 전용이고 배포를 실행하지 않는다.
allowed-tools: Bash(git fetch *) Bash(git describe *) Bash(git log *) Bash(git diff *)
---

# 배포 대기 확인

마지막 `deploy-*` 태그와 `origin/main`의 차이가 배포 대기 목록이다. 운영에 뭐가 떠 있는지 추측하지 않고 git으로 답한다.

**배포를 직접 실행하지 않는다.** `deploy-nas.sh`는 터미널 입력(나갈 내용 확인, sudo 비밀번호, 워커 갱신 후 Enter)을 받는데 Claude가 SSH로 돌리면 입력을 받을 터미널이 없어 중간에 멈춘다. 명령을 출력하고 사람이 실행한다.

## 절차

1. 원격 상태를 가져온다. 태그까지 받아야 다른 PC에서 찍은 배포 태그가 보인다.

   ```bash
   git fetch --quiet --tags origin main
   ```

2. `origin/main`에서 거슬러 올라가 가장 가까운 배포 태그를 찾는다.

   ```bash
   git describe --tags --match 'deploy-*' --abbrev=0 origin/main
   ```

3. 그 태그 이후의 커밋과 바뀐 파일을 본다.

   ```bash
   git log --oneline <태그>..origin/main
   git diff --name-only <태그>..origin/main
   ```

## 배포 대상 판정

바뀐 경로로 정한다.

| 바뀐 경로 | 갱신할 대상 |
| --- | --- |
| `backend/` | 백엔드와 워커. 워커가 `backend/`를 직접 import하므로 둘은 같은 커밋이어야 한다 |
| `backend/requirements.txt` | 위에 더해 워커 `worker-venv` 재설치. `deploy-worker.ps1`이 감지해서 처리한다 |
| `frontend/` | 프론트엔드 |
| `docker-compose.yml`, `.env.example` | 환경변수가 추가됐는지 확인한다. NAS 루트 `.env`에 없으면 기동이 멈춘다 |
| 그 밖(문서, `.claude/`, `.github/`, `scripts/`) | 갱신할 대상 없음 |

## 보고 형식

짧게 쓴다. 대기 커밋이 없으면 "배포 대기 없음"과 기준 태그만 적고 끝낸다.

1. 기준 태그와 대기 중인 커밋 수
2. 커밋 목록
3. 갱신할 대상. 워커가 포함되면 워커 PC가 켜져 있어야 한다는 점을 함께 적는다
4. 붙여넣을 배포 명령. 아래를 코드 블록으로 그대로 출력한다

   ```bash
   ssh -t shuttlecut-nas "cd /volume1/docker/shuttlecut-web && bash scripts/deploy-nas.sh"
   ```

   워커 갱신이 필요하면 스크립트가 중간에 멈춰 기다린다. 그때 워커 PC의 워커 전용 체크아웃에서 실행할 명령도 함께 출력한다.

   ```powershell
   .\scripts\deploy-worker.ps1 <배포 SHA>
   ```

   배포 후 태그 명령은 `deploy-nas.sh`가 끝에서 출력하므로 여기서 적지 않는다.

`shuttlecut-nas`는 SSH 별칭이다. 저장소가 공개라 NAS 주소를 여기 적지 않는다. `ssh`가 호스트를 못 찾으면 그 PC의 `~/.ssh/config`에 별칭이 없는 것이다.

절차의 정본은 README의 "배포" 절이다. 순서나 옵션을 설명해야 하면 그쪽을 읽고 답한다.

## 한계

이 결과는 태그 기준이다. 배포하고 태그를 push하지 않았으면 이미 나간 커밋이 대기로 보인다. 의심되면 NAS에서 확인한다.

```bash
ssh shuttlecut-nas "git -C /volume1/docker/shuttlecut-web rev-parse HEAD"
```
