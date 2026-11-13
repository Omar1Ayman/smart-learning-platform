#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
    echo "Applying database migrations..."
    python manage.py migrate --noinput

    echo "Seeding billing plans..."
    python manage.py seed_plans
fi

exec "$@"
