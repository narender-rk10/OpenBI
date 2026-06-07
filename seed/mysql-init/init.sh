#!/bin/bash
# MySQL init: marketingdb (auto-created by MYSQL_DATABASE) + hrdb
set -e

echo "=== MySQL: Loading marketing data into marketingdb ==="
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" marketingdb \
    < /sql-seed/demo_marketing_mysql.sql

echo "=== MySQL: Creating hrdb and granting access ==="
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" \
    -e "CREATE DATABASE IF NOT EXISTS hrdb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; \
        GRANT ALL PRIVILEGES ON hrdb.* TO '${MYSQL_USER}'@'%'; \
        FLUSH PRIVILEGES;"

echo "=== MySQL: Loading HR data into hrdb ==="
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" hrdb \
    < /sql-seed/mysql-hr.sql

echo "=== MySQL: Init complete ==="
