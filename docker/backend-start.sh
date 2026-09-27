#!/bin/sh
# Starts the background scheduler, then runs the HTTP API in the foreground.
#
# This is the "dockerCommand" for the public Render deployment (see render.yaml), because a
# host that does not parse shell quotes cannot be given an inline "sh -c '... && ...'" string.
# Locally, docker-compose.yml runs the scheduler as its own service and starts the API with the
# image's own CMD, so this script is only used by the hosted deployment.
#
# PHP_CLI_SERVER_WORKERS lets the built-in server answer several requests at once, which the
# service-to-service calls need. PORT is set by the host.
set -e

php artisan schedule:work &

cd public
exec env PHP_CLI_SERVER_WORKERS="${PHP_CLI_SERVER_WORKERS:-4}" \
    php -S "0.0.0.0:${PORT:-8000}" \
    ../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php
