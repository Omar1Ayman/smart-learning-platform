import os
from django.core.wsgi import get_wsgi_application

# Set the production settings module
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

# Vercel looks for the `app` variable
app = get_wsgi_application()