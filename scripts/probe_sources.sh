#!/usr/bin/env bash
# One-at-a-time data-source connectivity prober for OpenBI (low-memory).
# Brings up ONE source container at a time on openbi_openbi-network, then asks
# MindsDB (already running) to test the connection via /api/databases/status —
# the exact call the app's "Test" button makes. Tears the container down before
# moving on, so only one test image is ever resident.
#
# Usage: bash scripts/probe_sources.sh <engine> [<engine> ...]
# Results are appended (TSV) to docs/test-scenario/probe_results.tsv
set -u
NET="openbi_openbi-network"
MDB="openbi-mindsdb-1"
OUT="docs/test-scenario/probe_results.tsv"
POLL_MAX="${POLL_MAX:-40}"     # status-probe attempts
POLL_INT="${POLL_INT:-5}"      # seconds between attempts

mkdir -p "$(dirname "$OUT")"

# Run MindsDB status probe; echo the raw JSON.
probe() { # $1=json-params
  docker exec "$MDB" curl -s -X POST http://localhost:47334/api/databases/status \
    -H "Content-Type: application/json" -d "$1" 2>/dev/null
}

record() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$OUT"; }

# Poll until status=success, or a definitive handler/import error, or timeout.
poll() { # $1=engine $2=params  -> sets RESULT, DETAIL
  local i js st
  for ((i=1; i<=POLL_MAX; i++)); do
    js="$(probe "$2")"
    st="$(printf '%s' "$js" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')"
    if [ "$st" = "success" ]; then RESULT=PASS; DETAIL="$js"; return; fi
    # Handler/dependency missing -> definitive fail, stop polling
    case "$js" in
      *"No module named"*|*"Can't find"*|*"is not supported"*|*"ImportError"*|*"cannot import"*|*"Unknown engine"*|*"not found"*)
        RESULT=FAIL; DETAIL="$js"; return;;
    esac
    sleep "$POLL_INT"
  done
  RESULT=FAIL; DETAIL="${js:-no-response (timeout)}"
}

start() { # $1=name $2=alias ; rest = docker run args (image + cmd at end)
  local name="$1" alias="$2"; shift 2
  docker rm -f "$name" >/dev/null 2>&1
  docker run -d --name "$name" --network "$NET" --network-alias "$alias" "$@" >/dev/null
}
stop() { docker rm -f "$1" >/dev/null 2>&1; }

test_one() {
  local eng="$1"; RESULT=SKIP; DETAIL=""
  echo "============================================================"
  echo ">>> $eng"
  case "$eng" in
    postgres)
      start probe-pg pg-test -e POSTGRES_PASSWORD=password123 -e POSTGRES_DB=testdb postgres:16-alpine
      poll postgres '{"engine":"postgres","host":"pg-test","port":5432,"database":"testdb","user":"postgres","password":"password123"}'
      stop probe-pg ;;
    mysql)
      start probe-mysql mysql-test -e MYSQL_ROOT_PASSWORD=password123 -e MYSQL_DATABASE=testdb mysql:8.4
      poll mysql '{"engine":"mysql","host":"mysql-test","port":3306,"database":"testdb","user":"root","password":"password123"}'
      stop probe-mysql ;;
    mariadb)
      start probe-maria maria-test -e MARIADB_ROOT_PASSWORD=password123 -e MARIADB_DATABASE=testdb mariadb:11
      poll mariadb '{"engine":"mariadb","host":"maria-test","port":3306,"database":"testdb","user":"root","password":"password123"}'
      stop probe-maria ;;
    mongodb)
      start probe-mongo mongo-test -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD=password123 mongo:7
      # seed: the mongo handler errors if the target DB doesn't exist yet
      for ((s=1; s<=12; s++)); do
        docker exec probe-mongo mongosh -u root -p password123 --authenticationDatabase admin \
          --quiet --eval 'db.getSiblingDB("testdb").items.insertOne({x:1})' >/dev/null 2>&1 && break
        sleep 3
      done
      poll mongodb '{"engine":"mongodb","host":"mongodb://root:password123@mongo-test:27017/","database":"testdb"}'
      stop probe-mongo ;;
    clickhouse)
      start probe-ch ch-test -e CLICKHOUSE_USER=clickhouse -e CLICKHOUSE_PASSWORD=clickhouse123 -e CLICKHOUSE_DB=testdb clickhouse/clickhouse-server:latest
      poll clickhouse '{"engine":"clickhouse","host":"ch-test","port":9000,"database":"testdb","user":"clickhouse","password":"clickhouse123"}'
      stop probe-ch ;;
    supabase)
      start probe-supa supa-test -e POSTGRES_PASSWORD=password123 -e POSTGRES_DB=postgres postgres:16-alpine
      poll supabase '{"engine":"supabase","host":"supa-test","port":5432,"database":"postgres","user":"postgres","password":"password123"}'
      stop probe-supa ;;
    cockroachdb)
      start probe-crdb crdb-test cockroachdb/cockroach:latest start-single-node --insecure
      poll cockroachdb '{"engine":"cockroachdb","host":"crdb-test","port":26257,"database":"defaultdb","user":"root","password":""}'
      stop probe-crdb ;;
    materialize)
      start probe-mz mz-test materialize/materialized:latest
      poll materialize '{"engine":"materialize","host":"mz-test","port":6875,"database":"materialize","user":"materialize","password":""}'
      stop probe-mz ;;
    timescaledb)
      start probe-ts ts-test -e POSTGRES_PASSWORD=password123 -e POSTGRES_DB=testdb timescale/timescaledb:latest-pg16
      poll timescaledb '{"engine":"timescaledb","host":"ts-test","port":5432,"database":"testdb","user":"postgres","password":"password123"}'
      stop probe-ts ;;
    yugabyte)
      start probe-yb yb-test yugabytedb/yugabyte:latest bin/yugabyted start --daemon=false
      poll yugabyte '{"engine":"yugabyte","host":"yb-test","port":5433,"database":"yugabyte","user":"yugabyte","password":"yugabyte"}'
      stop probe-yb ;;
    dynamodb)
      start probe-ddb ddb-test amazon/dynamodb-local:latest
      poll dynamodb '{"engine":"dynamodb","aws_access_key_id":"dummy","aws_secret_access_key":"dummy","region_name":"us-east-1"}'
      stop probe-ddb ;;
    questdb)
      start probe-qdb qdb-test questdb/questdb:latest
      poll questdb '{"engine":"questdb","host":"qdb-test","port":8812,"user":"admin","password":"quest"}'
      stop probe-qdb ;;
    surrealdb)
      start probe-surreal surreal-test surrealdb/surrealdb:latest start --user root --pass password123 memory
      poll surrealdb '{"engine":"surrealdb","url":"ws://surreal-test:8000/rpc","user":"root","password":"password123","namespace":"test","database":"test"}'
      stop probe-surreal ;;
    crate)
      start probe-crate crate-test crate:latest
      poll crate '{"engine":"crate","host":"crate-test","port":4200,"user":"crate","password":""}'
      stop probe-crate ;;
    influxdb)
      start probe-influx influx-test -e DOCKER_INFLUXDB_INIT_MODE=setup -e DOCKER_INFLUXDB_INIT_USERNAME=admin -e DOCKER_INFLUXDB_INIT_PASSWORD=password123 -e DOCKER_INFLUXDB_INIT_ORG=myorg -e DOCKER_INFLUXDB_INIT_BUCKET=mybucket -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=mytoken influxdb:2.7-alpine
      poll influxdb '{"engine":"influxdb","host":"influx-test","port":8086,"token":"mytoken","org":"myorg","bucket":"mybucket"}'
      stop probe-influx ;;
    elasticsearch)
      start probe-es es-test -e discovery.type=single-node -e xpack.security.enabled=false -e "ES_JAVA_OPTS=-Xms256m -Xmx256m" docker.elastic.co/elasticsearch/elasticsearch:8.13.0
      poll elasticsearch '{"engine":"elasticsearch","hosts":"es-test:9200"}'
      stop probe-es ;;
    solr)
      start probe-solr solr-test solr:9 solr-precreate testcol
      poll solr '{"engine":"solr","host":"solr-test","port":8983,"collection":"testcol"}'
      stop probe-solr ;;
    trino)
      start probe-trino trino-test trinodb/trino:latest
      poll trino '{"engine":"trino","host":"trino-test","port":8080,"catalog":"tpch","schema":"sf1","user":"admin"}'
      stop probe-trino ;;
    # ── no-container public APIs ──
    web)        poll web '{"engine":"web"}' ;;
    hackernews) poll hackernews '{"engine":"hackernews"}' ;;
    mediawiki)  poll mediawiki '{"engine":"mediawiki"}' ;;
    *) echo "unknown engine: $eng"; return ;;
  esac
  echo "RESULT: $RESULT"
  echo "DETAIL: ${DETAIL:0:300}"
  record "$eng" "$RESULT" "$(date -u +%FT%TZ)" "$(printf '%s' "$DETAIL" | tr '\t\n' '  ' | cut -c1-400)"
}

for e in "$@"; do test_one "$e"; done
echo "=== done: $* ==="
