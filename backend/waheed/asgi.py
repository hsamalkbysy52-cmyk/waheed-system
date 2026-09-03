import os

from django.core.asgi import get_asgi_application

# Deployment entrypoint: defaults to prod so a service missing the variable fails at start-up
# instead of running with the dev secret key and open CORS. manage.py defaults to dev.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "waheed.settings.prod")

application = get_asgi_application()
