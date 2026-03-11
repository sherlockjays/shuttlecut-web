#!/bin/bash
# ShuttleCut GPU Worker startup script (GCP VM metadata에 등록)
# 등록 명령: gcloud compute instances add-metadata shuttlecut-gpu-worker \
#   --project=shuttlecut --zone=asia-northeast3-a --metadata-from-file=startup-script=gpu-startup-script.sh
set -e

# Docker가 완전히 준비될 때까지 대기
for i in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 2
done

# 기존 컨테이너 제거 후 재시작
docker rm -f shuttlecut-worker 2>/dev/null || true

docker run -d \
  --name shuttlecut-worker \
  --restart=unless-stopped \
  --gpus all \
  --env-file /opt/shuttlecut/.env \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/gcs-key.json \
  -e ENABLE_GPU=1 \
  -e TZ=Asia/Seoul \
  -v /opt/shuttlecut/gcs-key.json:/app/gcs-key.json:ro \
  -v /tmp/shuttlecut-exports:/data/exports \
  shuttlecut-gpu-worker \
  celery -A workers.tasks.celery worker --loglevel=info --concurrency=1
