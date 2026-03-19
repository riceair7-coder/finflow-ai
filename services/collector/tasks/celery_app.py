from celery import Celery
from celery.schedules import crontab

from config import settings

app = Celery("collector", broker=settings.celery_broker_url, backend=settings.celery_result_backend)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Seoul",
    enable_utc=True,
    beat_schedule={
        # 매일 오전 6시 은행 거래내역 수집
        "fetch-bank-transactions": {
            "task": "tasks.collect_tasks.fetch_bank_transactions",
            "schedule": crontab(hour=6, minute=0),
        },
        # 매주 월요일 홈택스 세금계산서 수집
        "fetch-hometax-invoices": {
            "task": "tasks.collect_tasks.fetch_hometax_invoices",
            "schedule": crontab(hour=7, minute=0, day_of_week=1),
        },
    },
)
