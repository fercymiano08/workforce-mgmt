#!/bin/sh
# Starts the hosted API: migrate, seed, background scheduler, then the HTTP server in the
# foreground.
#
# This is the "dockerCommand" for the public Render deployment (see render.yaml), because a
# host that does not parse shell quotes cannot be given an inline "sh -c '... && ...'" string.
# Locally, docker-compose.yml runs the scheduler as its own service and starts the API with the
# image's own CMD, so this script is only used by the hosted deployment.
#
# The migrations live here and not only in backend-entrypoint.sh on purpose: Render dropped most
# of the envVars in the Blueprint, including RUN_MIGRATIONS, so a container started that way came
# up against an empty database. It answered /up with 200 the whole time - looking perfectly healthy
# - while every request that touched a table failed with 'relation "sessions" does not exist'.
# Defaulting to "run" means a missing variable now degrades to the working behaviour, and only an
# explicit false/0/no/off turns it off.
#
# If a migration does fail, set -e ends the container and Render marks the deploy failed with the
# real reason in the log. That is the outcome we want: a red build beats a live app that 500s.
#
# PHP_CLI_SERVER_WORKERS lets the built-in server answer several requests at once, which the
# service-to-service calls need. PORT is set by the host.
set -e

is_off() {
    case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
        false|0|no|off) return 0 ;;
        *) return 1 ;;
    esac
}

cd /var/www/html

if ! is_off "${RUN_MIGRATIONS:-true}"; then
    echo "==> Running database migrations"
    php artisan migrate --force --no-interaction
    if ! is_off "${RUN_SEED:-true}"; then
        echo "==> Seeding the admin account and demo data"
        php artisan db:seed --force --no-interaction
    fi
fi

# The scheduler talks to stdout, which is the same stream as the API's. Keep it quiet so its
# output can never end up in the middle of a response.
php artisan schedule:work >/dev/null 2>&1 &

cd public
exec env PHP_CLI_SERVER_WORKERS="${PHP_CLI_SERVER_WORKERS:-4}" \
    php -S "0.0.0.0:${PORT:-8000}" \
    ../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php
