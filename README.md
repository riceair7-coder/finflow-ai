# FinFlow AI

AI 기반 재무 관리 자동화 플랫폼 — 정산, 청구서, 미수금 추적, 비용 분석을 자동화합니다.

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                        FinFlow AI Platform                       │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│  Data Layer  │   AI Layer   │Business Layer│ Presentation Layer │
├──────────────┼──────────────┼──────────────┼────────────────────┤
│ • 홈택스 API  │ • OCR Engine │ • 정산 엔진  │ • Web Dashboard    │
│ • 카드사 API  │ • 분류 모델  │ • 청구서     │ • Mobile App       │
│ • 은행 API   │ • 이상 감지  │ • AR 추적    │ • 알림 센터        │
│ • RPA 봇     │ • 예측 모델  │ • 세금계산서 │ • BI 리포트        │
└──────────────┴──────────────┴──────────────┴────────────────────┘
                           │
              ┌────────────┴────────────┐
              │   Integration Layer      │
              │  Redis / PostgreSQL      │
              │  Elasticsearch / MLflow  │
              └─────────────────────────┘
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| Backend API | FastAPI 0.111 + Python 3.11 |
| AI/ML | PaddleOCR, HuggingFace, scikit-learn, MLflow |
| Database | PostgreSQL 16 + Redis 7 + Elasticsearch 8 |
| Frontend | React 18 + TypeScript + TailwindCSS |
| Cloud | AWS (ECS + RDS + S3) |
| CI/CD | GitHub Actions + Docker |
| Monitoring | Grafana |

## 퀵스타트

### 사전 요구사항
- Docker & Docker Compose
- Make

### 로컬 개발 환경 시작

```bash
# 1. 환경 변수 설정
cp .env.example api-gateway/.env

# 2. 전체 스택 기동
make up

# 3. DB 마이그레이션
make migrate

# 4. 서비스 확인
open http://localhost:8000/docs   # Swagger UI
open http://localhost:5000        # MLflow
open http://localhost:3001        # Grafana (admin/admin)
```

### 주요 명령어

```bash
make up           # 전체 스택 기동
make down         # 스택 중지
make logs         # API 로그 확인
make shell        # API 컨테이너 셸
make migrate      # DB 마이그레이션 실행
make test         # 테스트 실행
make lint         # 린트 검사
make db-reset     # DB 초기화 (데이터 삭제)
```

## 모듈 구조

```
finflow-ai/
├── api-gateway/           # FastAPI 백엔드
│   ├── app/
│   │   ├── models/        # SQLAlchemy ORM
│   │   ├── schemas/       # Pydantic 스키마
│   │   ├── routers/       # API 엔드포인트
│   │   ├── services/      # 비즈니스 로직
│   │   └── core/          # 보안, 예외 처리
│   └── tests/
├── services/              # 마이크로서비스
│   ├── collector/         # 데이터 수집
│   ├── ai-engine/         # AI/ML
│   ├── settlement/        # 정산
│   ├── billing/           # 청구서
│   ├── ar-tracker/        # 미수금 추적
│   └── notification/      # 알림
├── frontend/              # React 대시보드
├── ml-models/             # 학습 파이프라인
├── infra/                 # IaC (Terraform)
└── contracts/             # OpenAPI 스펙
```

## API 문서

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- OpenAPI spec: [contracts/openapi.yaml](contracts/openapi.yaml)

## 주요 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | /api/v1/settlements | 정산 생성 |
| GET | /api/v1/settlements | 정산 목록 |
| PATCH | /api/v1/settlements/{id}/approve | 정산 승인 |
| POST | /api/v1/invoices | 청구서 생성 |
| POST | /api/v1/invoices/{id}/send | 청구서 발송 |
| GET | /api/v1/ar/overdue | 연체 목록 |
| GET | /api/v1/reports/cashflow | 현금흐름 리포트 |
