#!/usr/bin/env bash
# Smoke test: confirms both seeded DBs are reachable, healthy, and contain
# the expected row counts. Run from the project root or anywhere — paths are
# absolute via container exec.
#
#   bash docs/test-scenario/smoke-test.sh

set -euo pipefail

PG_CONTAINER="openbi-retail-pg"
MY_CONTAINER="openbi-hr-mysql"

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[0;33m%s\033[0m\n' "$*"; }

fail() { red "FAIL: $*"; exit 1; }

require_container() {
    local name=$1
    if ! docker inspect "$name" >/dev/null 2>&1; then
        fail "container '$name' not found — did you bring up the overlay compose file?"
    fi
    local status
    status=$(docker inspect -f '{{.State.Health.Status}}' "$name" 2>/dev/null || echo "unknown")
    if [[ "$status" != "healthy" ]]; then
        yellow "  $name health = $status (waiting up to 30s)"
        for _ in {1..15}; do
            sleep 2
            status=$(docker inspect -f '{{.State.Health.Status}}' "$name" 2>/dev/null || echo "unknown")
            [[ "$status" == "healthy" ]] && break
        done
        [[ "$status" == "healthy" ]] || fail "$name never became healthy (status=$status)"
    fi
    green "  $name healthy"
}

count_pg() {
    local table=$1
    docker exec "$PG_CONTAINER" psql -U retail -d retail -tAc "SELECT COUNT(*) FROM $table"
}

count_my() {
    local table=$1
    docker exec "$MY_CONTAINER" mysql -uhr -phr123 hr -N -B -e "SELECT COUNT(*) FROM $table" 2>/dev/null
}

expect_eq() {
    local label=$1 actual=$2 expected=$3
    if [[ "$actual" == "$expected" ]]; then
        green "  $label = $actual"
    else
        fail "$label expected $expected, got $actual"
    fi
}

echo "── Container health ──"
require_container "$PG_CONTAINER"
require_container "$MY_CONTAINER"

echo "── Postgres (retail) row counts ──"
expect_eq "customers"    "$(count_pg customers)"   "10"
expect_eq "products"     "$(count_pg products)"    "12"
expect_eq "orders"       "$(count_pg orders)"      "18"
expect_eq "order_items"  "$(count_pg order_items)" "28"

echo "── MySQL (hr) row counts ──"
expect_eq "departments"  "$(count_my departments)" "5"
expect_eq "employees"    "$(count_my employees)"   "15"
# 14 active employees × 5 days = 70 attendance rows
expect_eq "attendance"   "$(count_my attendance)"  "70"

echo "── Sample query: monthly orders (Postgres) ──"
docker exec "$PG_CONTAINER" psql -U retail -d retail -c "
  SELECT to_char(order_date,'YYYY-MM') AS month, COUNT(*) AS orders
  FROM orders GROUP BY 1 ORDER BY 1;"

echo "── Sample query: avg salary by dept (MySQL) ──"
docker exec "$MY_CONTAINER" mysql -uhr -phr123 hr -e "
  SELECT d.name, ROUND(AVG(e.salary_usd),0) AS avg_salary
  FROM employees e JOIN departments d ON d.department_id = e.department_id
  WHERE e.is_active = 1 GROUP BY d.name ORDER BY avg_salary DESC;"

green ""
green "ALL CHECKS PASSED"
