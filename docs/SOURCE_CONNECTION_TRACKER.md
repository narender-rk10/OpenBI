# Source Connection Test Tracker

Method: spin up the source's Docker image one at a time → attach to `openbi_openbi-network`
→ `POST http://mindsdb:47334/api/databases/status` with `{engine, ...params}` (the same call
the app's **Test** button makes) → record result → tear the container down (low-memory: never
more than one test image running at once).

Legend: ✅ pass · ❌ fail · 🐳 self-hostable, pending · 🔌 needs real account/credentials (cannot self-host) · ⚠️ self-hostable but heavy/complex · 📁 file-based (no server)

Last updated: 2026-06-01

## Databases
| Source | engine | Status | Image / Notes |
|---|---|---|---|
| PostgreSQL | postgres | ✅ | finance-pg (handler bundled) |
| MySQL | mysql | ✅ | finance-mysql (handler installed) |
| MongoDB | mongodb | ✅ | `mongo:7` (pymongo ✓) |
| ClickHouse | clickhouse | ✅ | `clickhouse/clickhouse-server` — **use native port 9000, not 8123** (catalog default is wrong) |
| MariaDB | mariadb | ✅ | `mariadb:11` (mysql handler) |
| MS SQL Server | mssql | ⚠️ | `mcr.microsoft.com/mssql/server` (~1.5GB) |
| Oracle | oracle | ⚠️ | `gvenzl/oracle-free` (heavy) |
| SQLite | sqlite | 📁 | file path, no container |
| CockroachDB | cockroachdb | ✅ | `cockroachdb/cockroach` (pg wire, `start-single-node --insecure`) |
| TiDB | tidb | ⚠️ | multi-component |
| Vitess | vitess | ⚠️ | multi-component |
| SingleStore | singlestore | ⚠️ | license required |
| Cassandra | cassandra | ⚠️ | `cassandra:5` (heavy) |
| ScyllaDB | scylladb | 🐳 | `scylladb/scylla` |
| DynamoDB | dynamodb | 🐳 | `amazon/dynamodb-local` |
| Couchbase | couchbase | 🐳 | `couchbase` (sdk ✓) |
| Supabase | supabase | ✅ | `postgres:16` (pg compat) |
| Firestore | firestore | ⚠️ | gcloud emulator |
| DuckDB | duckdb | 📁 | file path, no container |
| Amazon Aurora | aurora | 🔌 | AWS-only |
| Google Cloud SQL | google_cloud_sql | 🔌 | GCP-only |
| Cloud Spanner | spanner | ⚠️ | emulator + service-account |
| Apache Druid | druid | ⚠️ | `apache/druid` (heavy, pydruid ✓) |
| Apache Impala | impala | ⚠️ | heavy (impyla ✓) |
| Vertica | vertica | ⚠️ | `vertica/vertica-ce` (heavy, ✓) |
| Teradata | teradata | 🔌 | no free image |
| IBM Db2 | db2 | ⚠️ | `icr.io/db2_community/db2` (heavy; ibm_db best-effort) |
| SAP HANA | sap_hana | ⚠️ | express edition, huge |
| SurrealDB | surrealdb | 🔧 | `surrealdb/surrealdb` — handler needs `pysurrealdb` (catalog ships wrong `surrealdb` pkg; rebuild) |
| PlanetScale | planet_scale | 🔌 | cloud (mysql compat) |
| YugabyteDB | yugabyte | 🐳 | `yugabytedb/yugabyte` (pg wire) |
| Materialize | materialize | ✅ | `materialize/materialized` (pg wire) |
| CrateDB | crate | 🔧 | `crate` — handler import fails: needs `sqlalchemy-cratedb` (rebuild) |
| Dremio | dremio | ⚠️ | `dremio/dremio-oss` (heavy) |
| FaunaDB | fauna | 🔌 | cloud (fauna ✓) |

## Cloud Data Warehouse
| Source | engine | Status | Notes |
|---|---|---|---|
| Snowflake | snowflake | 🔌 | account required |
| BigQuery | bigquery | 🔌 | GCP service-account |
| Redshift | redshift | 🔌 | AWS account |
| Databricks | databricks | 🔌 | workspace + token |
| Trino | trino | 🐳 | `trinodb/trino` |
| StarRocks | starrocks | ⚠️ | heavy |
| Apache Hive | hive | ⚠️ | heavy multi-component |

## Time-Series
| Source | engine | Status | Image |
|---|---|---|---|
| InfluxDB | influxdb | 🔧 | `influxdb:2` — handler needs `influxdb_client_3` (catalog ships v2 `influxdb-client`; rebuild) |
| TimescaleDB | timescaledb | ✅ | `timescale/timescaledb` (pg) |
| QuestDB | questdb | 🔧 | `questdb/questdb` — handler import fails: needs `questdb` py pkg (rebuild) |
| TDengine | tdengine | 🐳 | `tdengine/tdengine` |

## Search
| Source | engine | Status | Image |
|---|---|---|---|
| Elasticsearch | elasticsearch | 🐳 | `elasticsearch:8` (client ✓) |
| Apache Solr | solr | 🐳 | `solr:9` |

## File Storage
| Source | engine | Status | Notes |
|---|---|---|---|
| S3 | s3 | 🔌 | AWS credentials |
| Google Cloud Storage | gcs | 🔌 | GCP service-account |
| Azure Blob | azure_blob | 🔌 | Azure connection string |
| HDFS | hdfs | ⚠️ | hadoop cluster |
| MinIO | minio | ❌ | **No MindsDB `minio` handler exists** — invalid catalog entry (use `s3` w/ endpoint instead) |
| FTP | ftp | ❌ | **No MindsDB `ftp` handler exists** — invalid catalog entry |
| Dropbox | dropbox | 🔌 | OAuth token |
| OneDrive | one_drive | 🔌 | OAuth |
| SharePoint | sharepoint | 🔌 | OAuth |

## SaaS / APIs  (all need a real account/token unless noted)
🔌 Google Sheets, Stripe, HubSpot, Shopify, Salesforce, Slack, GitHub, Gmail, Twitter/X,
Notion, Airtable, Zendesk, Intercom, Jira, Confluence, PayPal, Binance, Plaid, Twilio,
Strava, WhatsApp, Discord, YouTube, QuickBooks, Google Calendar, Google Analytics, Reddit,
MS Teams, GitLab, Coinbase, NewsAPI, Google Search, Eventbrite, Brevo, Docker Hub, OpenBB,
Rocket.Chat, Strapi.

| Source | engine | Status | Notes |
|---|---|---|---|
| HackerNews | hackernews | ✅ | public API, no auth |
| Wikipedia | mediawiki | ✅ | public API, no auth |
| REST API | web | ✅ | engine `web`, no params needed |

## Knowledge Base — file types  (via `/upload`, no Docker; needs LLM embeddings configured)
| Type | Status | Notes |
|---|---|---|
| txt | 🐳 | |
| md | 🐳 | remapped to .txt on upload |
| csv | 🐳 | |
| tsv | 🐳 | |
| json | 🐳 | |
| pdf | 🐳 | |
| xlsx | 🐳 | |
| xls | 🐳 | |
| parquet | 🐳 | |

## Knowledge Base — vector stores
| Store | Status | Image |
|---|---|---|
| default (ChromaDB) | 🐳 | embedded, no container |
| chromadb | 🐳 | embedded / `chromadb/chroma` |
| qdrant | 🐳 | `qdrant/qdrant` (client ✓) |
| milvus | ⚠️ | `milvusdb/milvus` (needs etcd+minio) |
| pgvector | 🐳 | `pgvector/pgvector` (✓) |
| lancedb | 📁 | embedded |
| weaviate | 🐳 | `semitechnologies/weaviate` (✓) |
| pinecone | 🔌 | cloud account |
| couchbase | 🐳 | `couchbase` (✓) |

## Summary
- ✅ Confirmed pass: **2** (postgres, mysql)
- 🔌 Need real credentials (cannot self-host): **~45** (all SaaS + cloud DW + cloud storage + Pinecone)
- 🐳 Self-hostable, pending: **~25** databases/TS/search + 9 file types + ~6 vector stores
- ⚠️ Self-hostable but heavy (1–2 GB+) or multi-component: **~12**
