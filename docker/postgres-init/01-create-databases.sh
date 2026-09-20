#!/bin/sh
# Runs once, the first time the postgres volume is created: one database per microservice.
set -e
for db in workforce_mgnt workforce_intel workforce_attendance workforce_scheduling \
          workforce_timeoff workforce_payroll workforce_communications workforce_configuration; do
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c "CREATE DATABASE $db"
done
