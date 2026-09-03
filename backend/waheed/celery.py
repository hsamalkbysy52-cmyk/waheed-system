import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "waheed.settings.dev")

app = Celery("waheed")
# Every CELERY_* Django setting becomes a Celery setting (CELERY_BROKER_URL -> broker_url).
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
