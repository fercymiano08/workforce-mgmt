FROM php:8.5-cli

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev libonig-dev libzip-dev unzip git \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql mbstring zip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY . /app_src

WORKDIR /app
RUN if [ -f /app_src/composer.json ]; then cp -a /app_src/. /app/; \
    elif [ -f /app_src/backend/composer.json ]; then cp -a /app_src/backend/. /app/; \
    else echo "ERROR: composer.json not found in build context" && exit 1; fi

RUN composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist

ENV PORT=8000
EXPOSE $PORT

CMD ["sh", "-c", "php artisan serve --host=0.0.0.0 --port=${PORT:-8000}"]
