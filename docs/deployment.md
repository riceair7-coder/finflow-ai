# FinFlow AI — 배포 가이드

## 사전 요구사항

- AWS 계정 (IAM 권한: ECS, ECR, RDS, ElastiCache, VPC, SecretsManager, ALB)
- Terraform >= 1.7
- AWS CLI v2
- GitHub Secrets 설정

## GitHub Secrets 설정

| Secret | 설명 |
|--------|------|
| `AWS_ACCOUNT_ID` | AWS 계정 ID |
| `AWS_ACCESS_KEY_ID` | IAM 액세스 키 |
| `AWS_SECRET_ACCESS_KEY` | IAM 시크릿 키 |
| `PRIVATE_SUBNET_IDS` | ECS 마이그레이션용 서브넷 (쉼표 구분) |
| `ECS_SG_ID` | ECS 보안 그룹 ID |
| `SLACK_WEBHOOK_URL` | 배포 알림 Slack Webhook |

## 최초 인프라 프로비저닝

```bash
cd infra/terraform

# 1. Terraform 상태 버킷 생성 (최초 1회)
aws s3 mb s3://finflow-terraform-state --region ap-northeast-2
aws dynamodb create-table \
  --table-name finflow-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-northeast-2

# 2. versions.tf의 backend 설정 주석 해제

# 3. Staging 배포
terraform init
terraform workspace new staging
terraform plan -var-file=environments/staging/terraform.tfvars
terraform apply -var-file=environments/staging/terraform.tfvars

# 4. Prod 배포
terraform workspace new prod
terraform plan -var-file=environments/prod/terraform.tfvars
terraform apply -var-file=environments/prod/terraform.tfvars
```

## CI/CD 플로우

```
git push origin develop  →  staging 자동 배포
git push origin main     →  prod 자동 배포
```

### 파이프라인 단계

1. **Test** — pytest + ruff lint (PR/push 시 실행)
2. **Build** — Docker 이미지 빌드 → ECR 푸시
3. **Migrate** — ECS RunTask로 `alembic upgrade head` 실행
4. **Deploy** — ECS 서비스 task-definition 업데이트 → 안정화 대기
5. **Notify** — Slack 성공/실패 알림

### 롤백

ECS에서 circuit breaker가 활성화되어 있어 배포 실패 시 자동 롤백됩니다.
수동 롤백:
```bash
aws ecs update-service \
  --cluster finflow-prod \
  --service finflow-prod-api \
  --task-definition finflow-prod-api:<이전_리비전번호>
```

## 모니터링

```bash
# 로컬에서 Prometheus + Grafana 포함 실행
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# 대시보드
open http://localhost:9090   # Prometheus
open http://localhost:3001   # Grafana (admin/admin)
```

### 알림 임계값

| 알림 | 조건 | 심각도 |
|------|------|--------|
| APIHighErrorRate | 5분간 오류율 > 5% | Critical |
| APIHighLatency | P95 지연 > 2s | Warning |
| APIDown | 1분 이상 다운 | Critical |
| DBConnectionsHigh | 연결 수 > 80 | Warning |

## 프로덕션 체크리스트

- [ ] `SECRET_KEY` 32자 이상 랜덤값으로 설정
- [ ] RDS 자동 백업 활성화 확인
- [ ] ALB 삭제 방지 활성화
- [ ] CloudWatch 로그 보존 기간 30일 설정
- [ ] ECR 이미지 취약점 스캔 활성화
- [ ] Secrets Manager로 DB 자격증명 관리
- [ ] VPC에서 퍼블릭 DB 접근 차단
- [ ] Redis transit encryption 활성화
