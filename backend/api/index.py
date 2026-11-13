import os
import sys

# 1. Ensure the backend directory is in the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from django.core.wsgi import get_wsgi_application

# 2. FORCE the settings module, overriding any typos in Vercel's env vars
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.prod"

# 3. Vercel looks for the `app` variable
app = get_wsgi_application()