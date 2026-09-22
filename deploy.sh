#!/bin/bash
# finflow-ai 배포: git pull → 이미지 재빌드 → 재기동 → (필요 시) alembic 마이그레이션
#
# 운영은 docker-compose.prod.yml 기준이다(docker-compose.yml 은 dev 전용,
# node:20-alpine 을 참조하지만 실제로 쓰이지 않는다). alembic 이 컨테이너
# 기동 시 자동 적용되지 않아(main.py 확인) 마이그레이션 변경을 감지하면
# 이 스크립트가 alembic upgrade head 를 수동으로 돌린다.
#
# ⚠ docs/deployment.md 는 AWS ECS 기반 파이프라인을 설명하는데, 이 서버는
#   실제로는 plain docker compose 로 운영 중이라 그 문서와 맞지 않는다.
set -euo pipefail
cd "$(dirname "$0")"
source /home/opc/docker/scripts/deploy_lib.sh

deploy_git_pull

if [ "$DEPLOY_PULLED" = "1" ]; then
    deploy_compose_up docker-compose.prod.yml

    if git -c safe.directory='*' diff --name-only HEAD@{1} HEAD -- api-gateway/alembic | grep -q .; then
        deploy_log "새 alembic 마이그레이션 감지, alembic upgrade head 실행..."
        docker exec finflow-ai-api-1 alembic upgrade head
    fi
fi

deploy_done
