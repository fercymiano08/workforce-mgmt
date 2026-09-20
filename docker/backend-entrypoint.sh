#!/bin/sh
# Runs before every backend container's main process.
#   RUN_MIGRATIONS=true  -> create/upgrade this service's tables (only the API container does this)
#   RUN_SEED=true        -> add the fixed admin + departments/roles (idempotent; core only)
set -e
cd /var/www/html

if [ "$RUN_MIGRATIONS" = "true" ]; then
    php artisan migrate --force
    if [ "$RUN_SEED" = "true" ]; then
        php artisan db:seed --force
    fi
fi

exec "$@"
