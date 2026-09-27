# One image recipe for all 8 Laravel microservices.
# Build context = project root.  Pick the service with:  --build-arg SERVICE=<folder under backend/>
# SERVICE defaults to "app" (the only service that exists today) so a host that cannot pass build
# args - Render, Koyeb, Railway building straight from this file - still gets a working image.
FROM php:8.4-cli-bookworm

COPY --from=ghcr.io/mlocati/php-extension-installer /usr/bin/install-php-extensions /usr/local/bin/
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

RUN apt-get update \
    && apt-get install -y --no-install-recommends git unzip \
    && rm -rf /var/lib/apt/lists/* \
    && install-php-extensions pdo_pgsql pgsql bcmath pcntl zip opcache

ARG SERVICE=app
WORKDIR /var/www/html

# Dependencies first so this layer stays cached until composer.lock changes.
COPY backend/${SERVICE}/composer.json backend/${SERVICE}/composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

COPY backend/${SERVICE}/ ./
RUN composer dump-autoload --optimize --no-dev --no-interaction \
    && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R u+rwX,g+rwX storage bootstrap/cache

COPY docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint
# The hosted deployment's start script: scheduler in the background, API in the foreground.
COPY docker/backend-start.sh /usr/local/bin/backend-start
RUN sed -i 's/\r$//' /usr/local/bin/backend-entrypoint /usr/local/bin/backend-start \
    && chmod +x /usr/local/bin/backend-entrypoint /usr/local/bin/backend-start

# A single notice or deprecation printed into a response body tells PHP the headers have already
# been sent, and Symfony then fails to send them - a 500 with no useful message. The official php
# image has display_errors on, so turn it off and send errors to stderr, which is what the host
# collects as the service log.
RUN printf 'display_errors=0\ndisplay_startup_errors=0\nlog_errors=1\nerror_log=/proc/self/fd/2\n' \
    > /usr/local/etc/php/conf.d/zz-production.ini

USER www-data
ENTRYPOINT ["backend-entrypoint"]
# Default = the HTTP API. Schedulers override this with "php artisan schedule:work".
# php -S is used directly (not "artisan serve", which strips the container's environment
# variables before starting the server). The router script treats the current folder as the
# public path, so the server must start inside public/. PHP_CLI_SERVER_WORKERS lets it serve several
# requests at once, which the service-to-service calls need.
CMD ["sh", "-c", "cd public && exec env PHP_CLI_SERVER_WORKERS=${PHP_CLI_SERVER_WORKERS:-4} php -S 0.0.0.0:${PORT} ../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php"]
