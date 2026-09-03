import os

from celery import Celery

# Worker entrypoint: defaults to prod like wsgi.py. Locally, export
# DJANGO_SETTINGS_MODULE=waheed.settings.dev before `celery -A waheed worker`.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "waheed.settings.prod")

app = Celery("waheed")
# Every CELERY_* Django setting becomes a Celery setting (CELERY_BROKER_URL -> broker_url).
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
