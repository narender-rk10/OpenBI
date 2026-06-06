import json

mindsdb_handlers = ["starrocks", "tidb", "strava", "dremio", "maxdb", "oracle", "solace", "salesforce", "databricks", "mediawiki", "google_search", "teradata", "google_calendar", "matrixone", "luma", "vertica", "altibase", "singlestore", "cassandra", "nuo_jdbc", "d0lt", "couchbasevector", "hive", "twitter", "gcs", "bigquery", "firebird", "faunadb", "databend", "frappe", "github", "couchbase", "milvus", "derby", "greptimedb", "libsql", "solr", "google_analytics", "crate", "oceanbase", "aerospike", "elasticsearch", "coinbase", "ignite", "symbl", "cloud_sql", "sqlany", "cloud_spanner", "vitess", "aurora", "pgvector", "email", "trino", "mariadb", "reddit", "google_fit", "mongodb", "google_content_shopping", "plaid", "twilio", "webz", "zotero", "lindorm", "teams", "hubspot", "astra", "empress", "netsuite", "files", "chromadb", "druid", "duckdb_faiss", "dropbox", "pinecone", "notion", "informix", "one_drive", "mssql", "influxdb", "lancedb", "sqreamdb", "web", "eventbrite", "sendinblue", "weaviate", "mendeley", "qdrant", "apache_doris", "questdb", "access", "ingres", "zendesk", "snowflake", "mysql", "openstreetmap", "azureblob", "hana", "binance", "surrealdb", "google_books", "whatsapp", "stripe", "discord", "monetdb", "impala", "pinot", "scylladb", "ckan", "hsqldb", "youtube", "db2", "slack", "newsapi", "paypal", "quickbooks", "jira", "ibm_cos", "rockset", "planet_scale", "gong", "rocket_chat", "edgelessdb", "gitlab", "openbb", "clickhouse", "documentdb", "shopify", "phoenix", "gmail", "tdengine", "xata", "pirateweather", "sheets", "supabase", "redshift", "sap_erp", "yugabyte", "duckdb", "tripadvisor", "cockroachdb", "dynamodb", "dockerhub", "sqlite", "hackernews", "airtable", "zipcodebase", "eventstoredb", "opengauss", "confluence", "aqicn", "lightdash", "timescaledb", "bigcommerce", "postgres", "strapi", "orioledb", "financial_modeling_prep", "serpstack", "kinetica", "npm", "instatus", "materialize", "s3", "pypi", "athena", "dummy_data", "intercom", "sharepoint", "oilpriceapi"]

# From frontend/src/lib/sources.ts
frontend_engines = [
    "postgres", "mysql", "mongodb", "clickhouse", "mariadb", "mssql", "oracle", "sqlite", "cockroachdb", 
    "tidb", "vitess", "singlestore", "cassandra", "scylladb", "dynamodb", "couchbase", "supabase", "firestore",
    "snowflake", "bigquery", "redshift", "databricks", "trino", "starrocks", "hive",
    "sheets", "stripe", "hubspot", "shopify", "salesforce", "slack", "github", "gmail", "twitter", "notion", 
    "airtable", "zendesk", "intercom", "jira", "confluence", "paypal", "binance", "plaid", "twilio",
    "s3", "gcs", "azure_blob", "hdfs", "minio", "ftp",
    "influxdb", "timescaledb", "questdb", "tdengine",
    "pinecone", "weaviate", "elasticsearch", "solr", "web"
]

missing_in_frontend = [h for h in mindsdb_handlers if h not in frontend_engines]

print(json.dumps(missing_in_frontend, indent=2))
