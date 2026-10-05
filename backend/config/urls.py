from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.tenants.urls")),  # /auth/signup/
    path("api/v1/auth/", include("apps.accounts.urls")),  # /auth/login/, refresh/, logout/, me/
    path("api/v1/", include("apps.accounts.user_urls")),  # /users/
    path("api/v1/", include("apps.academics.urls")),
    path("api/v1/", include("apps.people.urls")),  # /teacher-assignments/, /enrollments/
    path("api/v1/", include("apps.content.urls")),  # /content/, /content/<id>/download/
    path("api/v1/", include("apps.questions.urls")),  # /question-banks/, /questions/
]

# Deliberately NOT serving MEDIA_ROOT via django.conf.urls.static here,
# even in DEBUG. Content files are private by default (spec #78) and are
# only ever readable through apps/content/views.py's authenticated
# `download` action, which re-runs the full tenant+role+eligibility
# permission chain. Adding a direct /media/... route would bypass all of
# that for anyone who obtains a path.
