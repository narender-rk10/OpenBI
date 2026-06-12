import type { SourceDefinition } from './types'

export const SOURCE_CATALOG: SourceDefinition[] = [
  // ── Databases ──────────────────────────────────────────────────────
  {
    name: 'PostgreSQL', engine: 'postgres', category: 'Database', icon: '🐘',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '5432' },
      { name: 'database', label: 'Database', type: 'text', required: true, placeholder: 'mydb' },
      { name: 'user', label: 'User', type: 'text', required: true, placeholder: 'postgres' },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'MySQL', engine: 'mysql', category: 'Database', icon: '🐬',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '3306' },
      { name: 'database', label: 'Database', type: 'text', required: true, placeholder: 'mydb' },
      { name: 'user', label: 'User', type: 'text', required: true, placeholder: 'root' },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'MongoDB', engine: 'mongodb', category: 'Database', icon: '🍃',
    fields: [
      { name: 'host', label: 'Connection String', type: 'text', required: true, placeholder: 'mongodb+srv://user:pass@cluster.mongodb.net/' },
      { name: 'database', label: 'Database', type: 'text', required: true },
    ],
  },
  {
    name: 'ClickHouse', engine: 'clickhouse', category: 'Database', icon: '⚡',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '8123' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: false },
    ],
  },
  {
    name: 'MariaDB', engine: 'mariadb', category: 'Database', icon: '🦭',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '3306' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'Microsoft SQL Server', engine: 'mssql', category: 'Database', icon: '🪟',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '1433' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'Oracle', engine: 'oracle', category: 'Database', icon: '🔶',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '1521' },
      { name: 'service_name', label: 'Service Name', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'SQLite', engine: 'sqlite', category: 'Database', icon: '📁',
    fields: [
      { name: 'db_file', label: 'Database Path', type: 'text', required: true, placeholder: '/path/to/database.db' },
    ],
  },
  {
    name: 'CockroachDB', engine: 'cockroachdb', category: 'Database', icon: '🪳',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '26257' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'TiDB', engine: 'tidb', category: 'Database', icon: '🔷',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '4000' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'Vitess', engine: 'vitess', category: 'Database', icon: '🟢',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '3306' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'SingleStore', engine: 'singlestore', category: 'Database', icon: '⚙️',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '3306' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'Cassandra', engine: 'cassandra', category: 'Database', icon: '👁️',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '9042' },
      { name: 'keyspace', label: 'Keyspace', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: false },
      { name: 'password', label: 'Password', type: 'password', required: false },
    ],
  },
  {
    name: 'ScyllaDB', engine: 'scylladb', category: 'Database', icon: '🦈',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '9042' },
      { name: 'keyspace', label: 'Keyspace', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: false },
      { name: 'password', label: 'Password', type: 'password', required: false },
    ],
  },
  {
    name: 'DynamoDB', engine: 'dynamodb', category: 'Database', icon: '🟠',
    fields: [
      { name: 'aws_access_key_id', label: 'Access Key ID', type: 'text', required: true },
      { name: 'aws_secret_access_key', label: 'Secret Key', type: 'password', required: true },
      { name: 'region', label: 'Region', type: 'text', required: true, placeholder: 'us-east-1' },
    ],
  },
  {
    name: 'Couchbase', engine: 'couchbase', category: 'Database', icon: '🛋️',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'bucket', label: 'Bucket', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'Supabase', engine: 'supabase', category: 'Database', icon: '⚡',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '5432' },
      { name: 'database', label: 'Database', type: 'text', required: true, placeholder: 'postgres' },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'Firestore', engine: 'firestore', category: 'Database', icon: '🔥',
    fields: [
      { name: 'project_id', label: 'Project ID', type: 'text', required: true },
      { name: 'service_account_json', label: 'Service Account JSON', type: 'textarea', required: true },
    ],
  },
  {
    name: 'DuckDB', engine: 'duckdb', category: 'Database', icon: '🦆',
    fields: [
      { name: 'database', label: 'Database Path', type: 'text', required: true, placeholder: '/path/to/database.duckdb' },
    ],
  },

  {
    name: 'Amazon Aurora', engine: 'aurora', category: 'Database', icon: '🌅',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '3306' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'Google Cloud SQL', engine: 'google_cloud_sql', category: 'Database', icon: '☁️',
    fields: [
      { name: 'host', label: 'Host / Connection Name', type: 'text', required: true, placeholder: 'project:region:instance' },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '5432' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'Google Cloud Spanner', engine: 'spanner', category: 'Database', icon: '🌐',
    fields: [
      { name: 'project_id', label: 'Project ID', type: 'text', required: true },
      { name: 'instance_id', label: 'Instance ID', type: 'text', required: true },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'service_account_json', label: 'Service Account JSON', type: 'textarea', required: true },
    ],
  },
  {
    name: 'Apache Druid', engine: 'druid', category: 'Database', icon: '🐉',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '8082' },
      { name: 'user', label: 'User', type: 'text', required: false },
      { name: 'password', label: 'Password', type: 'password', required: false },
    ],
  },
  {
    name: 'Apache Impala', engine: 'impala', category: 'Database', icon: '🦌',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '21050' },
      { name: 'database', label: 'Database', type: 'text', required: false, placeholder: 'default' },
      { name: 'user', label: 'User', type: 'text', required: false },
      { name: 'password', label: 'Password', type: 'password', required: false },
    ],
  },
  {
    name: 'Vertica', engine: 'vertica', category: 'Database', icon: '🔷',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '5433' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'Teradata', engine: 'teradata', category: 'Database', icon: '🔵',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      { name: 'database', label: 'Database', type: 'text', required: false },
    ],
  },
  {
    name: 'IBM Db2', engine: 'db2', category: 'Database', icon: '🔵',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '50000' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'SAP HANA', engine: 'sap_hana', category: 'Database', icon: '🌸',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '30015' },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'SurrealDB', engine: 'surrealdb', category: 'Database', icon: '🌀',
    fields: [
      { name: 'url', label: 'URL', type: 'text', required: true, placeholder: 'ws://localhost:8000/rpc' },
      { name: 'user', label: 'User', type: 'text', required: true, placeholder: 'root' },
      { name: 'password', label: 'Password', type: 'password', required: true },
      { name: 'namespace', label: 'Namespace', type: 'text', required: true },
      { name: 'database', label: 'Database', type: 'text', required: true },
    ],
  },
  {
    name: 'PlanetScale', engine: 'planet_scale', category: 'Database', icon: '🪐',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'aws.connect.psdb.cloud' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'YugabyteDB', engine: 'yugabyte', category: 'Database', icon: '⚡',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '5433' },
      { name: 'database', label: 'Database', type: 'text', required: true, placeholder: 'yugabyte' },
      { name: 'user', label: 'User', type: 'text', required: true, placeholder: 'yugabyte' },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'Materialize', engine: 'materialize', category: 'Database', icon: '🧲',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '6875' },
      { name: 'database', label: 'Database', type: 'text', required: true, placeholder: 'materialize' },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: false },
    ],
  },
  {
    name: 'CrateDB', engine: 'crate', category: 'Database', icon: '📦',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '4200' },
      { name: 'user', label: 'User', type: 'text', required: false, placeholder: 'crate' },
      { name: 'password', label: 'Password', type: 'password', required: false },
    ],
  },
  {
    name: 'Dremio', engine: 'dremio', category: 'Database', icon: '🚀',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '9047' },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'FaunaDB', engine: 'fauna', category: 'Database', icon: '🦋',
    fields: [
      { name: 'api_key', label: 'Secret Key', type: 'password', required: true },
      { name: 'region', label: 'Region', type: 'text', required: false, placeholder: 'us (or eu, classic)' },
    ],
  },

  // ── Cloud Data Warehouse ──────────────────────────────────────────
  {
    name: 'Snowflake', engine: 'snowflake', category: 'Cloud Data Warehouse', icon: '❄️',
    fields: [
      { name: 'account', label: 'Account', type: 'text', required: true, placeholder: 'xy12345.us-east-1' },
      { name: 'warehouse', label: 'Warehouse', type: 'text', required: true },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'schema', label: 'Schema', type: 'text', required: false, placeholder: 'PUBLIC' },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'BigQuery', engine: 'bigquery', category: 'Cloud Data Warehouse', icon: '📊',
    fields: [
      { name: 'project_id', label: 'Project ID', type: 'text', required: true },
      { name: 'dataset', label: 'Dataset', type: 'text', required: true },
      { name: 'service_account_json', label: 'Service Account JSON', type: 'textarea', required: true },
    ],
  },
  {
    name: 'Redshift', engine: 'redshift', category: 'Cloud Data Warehouse', icon: '🔴',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '5439' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'Databricks', engine: 'databricks', category: 'Cloud Data Warehouse', icon: '🧱',
    fields: [
      { name: 'server_hostname', label: 'Server Hostname', type: 'text', required: true },
      { name: 'http_path', label: 'HTTP Path', type: 'text', required: true },
      { name: 'access_token', label: 'Access Token', type: 'password', required: true },
    ],
  },
  {
    name: 'Trino', engine: 'trino', category: 'Cloud Data Warehouse', icon: '🔺',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '8080' },
      { name: 'catalog', label: 'Catalog', type: 'text', required: true },
      { name: 'schema', label: 'Schema', type: 'text', required: false },
      { name: 'user', label: 'User', type: 'text', required: true },
    ],
  },
  {
    name: 'StarRocks', engine: 'starrocks', category: 'Cloud Data Warehouse', icon: '⭐',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '9030' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'Apache Hive', engine: 'hive', category: 'Cloud Data Warehouse', icon: '🐝',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '10000' },
      { name: 'database', label: 'Database', type: 'text', required: true, placeholder: 'default' },
      { name: 'user', label: 'User', type: 'text', required: false },
      { name: 'password', label: 'Password', type: 'password', required: false },
    ],
  },

  // ── SaaS / APIs ───────────────────────────────────────────────────
  {
    name: 'Google Sheets', engine: 'sheets', category: 'SaaS', icon: '📑',
    fields: [
      { name: 'spreadsheet_id', label: 'Spreadsheet ID', type: 'text', required: true },
      { name: 'service_account_json', label: 'Service Account JSON', type: 'textarea', required: true },
    ],
  },
  {
    name: 'Stripe', engine: 'stripe', category: 'SaaS', icon: '💳',
    fields: [
      { name: 'api_key', label: 'API Key', type: 'password', required: true },
    ],
  },
  {
    name: 'HubSpot', engine: 'hubspot', category: 'SaaS', icon: '🧡',
    fields: [
      { name: 'api_key', label: 'API Key', type: 'password', required: true },
    ],
  },
  {
    name: 'Shopify', engine: 'shopify', category: 'SaaS', icon: '🛒',
    fields: [
      { name: 'shop_url', label: 'Shop URL', type: 'text', required: true, placeholder: 'myshop.myshopify.com' },
      { name: 'access_token', label: 'Access Token', type: 'password', required: true },
    ],
  },
  {
    name: 'Salesforce', engine: 'salesforce', category: 'SaaS', icon: '☁️',
    fields: [
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      { name: 'security_token', label: 'Security Token', type: 'password', required: true },
    ],
  },
  {
    name: 'Slack', engine: 'slack', category: 'SaaS', icon: '💬',
    fields: [
      { name: 'token', label: 'Bot Token', type: 'password', required: true, placeholder: 'xoxb-...' },
    ],
  },
  {
    name: 'GitHub', engine: 'github', category: 'SaaS', icon: '🐙',
    fields: [
      { name: 'api_key', label: 'Personal Access Token', type: 'password', required: true },
      { name: 'repository', label: 'Repository', type: 'text', required: true, placeholder: 'owner/repo' },
    ],
  },
  {
    name: 'Gmail', engine: 'gmail', category: 'SaaS', icon: '📧',
    fields: [
      { name: 'credentials_json', label: 'Credentials JSON', type: 'textarea', required: true },
    ],
  },
  {
    name: 'Twitter/X', engine: 'twitter', category: 'SaaS', icon: '🐦',
    fields: [
      { name: 'bearer_token', label: 'Bearer Token', type: 'password', required: true },
    ],
  },
  {
    name: 'Notion', engine: 'notion', category: 'SaaS', icon: '📝',
    fields: [
      { name: 'api_key', label: 'Integration Token', type: 'password', required: true },
    ],
  },
  {
    name: 'Airtable', engine: 'airtable', category: 'SaaS', icon: '📋',
    fields: [
      { name: 'api_key', label: 'API Key', type: 'password', required: true },
      { name: 'base_id', label: 'Base ID', type: 'text', required: true, placeholder: 'appXXXXXXXXXX' },
    ],
  },
  {
    name: 'Zendesk', engine: 'zendesk', category: 'SaaS', icon: '🎫',
    fields: [
      { name: 'subdomain', label: 'Subdomain', type: 'text', required: true, placeholder: 'mycompany' },
      { name: 'email', label: 'Email', type: 'text', required: true },
      { name: 'api_token', label: 'API Token', type: 'password', required: true },
    ],
  },
  {
    name: 'Intercom', engine: 'intercom', category: 'SaaS', icon: '💙',
    fields: [
      { name: 'access_token', label: 'Access Token', type: 'password', required: true },
    ],
  },
  {
    name: 'Jira', engine: 'jira', category: 'SaaS', icon: '🔵',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'mycompany.atlassian.net' },
      { name: 'user', label: 'Email', type: 'text', required: true },
      { name: 'api_token', label: 'API Token', type: 'password', required: true },
    ],
  },
  {
    name: 'Confluence', engine: 'confluence', category: 'SaaS', icon: '📖',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'mycompany.atlassian.net' },
      { name: 'user', label: 'Email', type: 'text', required: true },
      { name: 'api_token', label: 'API Token', type: 'password', required: true },
    ],
  },
  {
    name: 'PayPal', engine: 'paypal', category: 'SaaS', icon: '💰',
    fields: [
      { name: 'client_id', label: 'Client ID', type: 'text', required: true },
      { name: 'client_secret', label: 'Client Secret', type: 'password', required: true },
      { name: 'mode', label: 'Mode', type: 'text', required: true, placeholder: 'sandbox or live' },
    ],
  },
  {
    name: 'Binance', engine: 'binance', category: 'SaaS', icon: '🪙',
    fields: [
      { name: 'api_key', label: 'API Key', type: 'password', required: true },
      { name: 'api_secret', label: 'API Secret', type: 'password', required: true },
    ],
  },
  {
    name: 'Plaid', engine: 'plaid', category: 'SaaS', icon: '🏦',
    fields: [
      { name: 'client_id', label: 'Client ID', type: 'text', required: true },
      { name: 'secret', label: 'Secret', type: 'password', required: true },
      { name: 'access_token', label: 'Access Token', type: 'password', required: true },
    ],
  },
  {
    name: 'Twilio', engine: 'twilio', category: 'SaaS', icon: '📱',
    fields: [
      { name: 'account_sid', label: 'Account SID', type: 'text', required: true },
      { name: 'auth_token', label: 'Auth Token', type: 'password', required: true },
    ],
  },
  {
    name: 'Strava', engine: 'strava', category: 'SaaS', icon: '🚴',
    fields: [
      { name: 'client_id', label: 'Client ID', type: 'text', required: true },
      { name: 'client_secret', label: 'Client Secret', type: 'password', required: true },
      { name: 'refresh_token', label: 'Refresh Token', type: 'password', required: true },
    ],
  },
  {
    name: 'WhatsApp', engine: 'whatsapp', category: 'SaaS', icon: '💬',
    fields: [
      { name: 'phone_number_id', label: 'Phone Number ID', type: 'text', required: true },
      { name: 'access_token', label: 'Access Token', type: 'password', required: true },
    ],
  },
  {
    name: 'Discord', engine: 'discord', category: 'SaaS', icon: '👾',
    fields: [
      { name: 'token', label: 'Bot Token', type: 'password', required: true },
    ],
  },
  {
    name: 'YouTube', engine: 'youtube', category: 'SaaS', icon: '📺',
    fields: [
      { name: 'api_key', label: 'API Key', type: 'password', required: true },
    ],
  },
  {
    name: 'QuickBooks', engine: 'quickbooks', category: 'SaaS', icon: '🏦',
    fields: [
      { name: 'client_id', label: 'Client ID', type: 'text', required: true },
      { name: 'client_secret', label: 'Client Secret', type: 'password', required: true },
      { name: 'realm_id', label: 'Realm ID', type: 'text', required: true },
      { name: 'refresh_token', label: 'Refresh Token', type: 'password', required: true },
    ],
  },
  {
    name: 'Google Calendar', engine: 'google_calendar', category: 'SaaS', icon: '📅',
    fields: [
      { name: 'credentials_json', label: 'Credentials JSON', type: 'textarea', required: true },
    ],
  },
  {
    name: 'Google Analytics', engine: 'google_analytics', category: 'SaaS', icon: '📈',
    fields: [
      { name: 'credentials_json', label: 'Credentials JSON', type: 'textarea', required: true },
      { name: 'property_id', label: 'Property ID', type: 'text', required: true },
    ],
  },
  {
    name: 'Reddit', engine: 'reddit', category: 'SaaS', icon: '🤖',
    fields: [
      { name: 'client_id', label: 'Client ID', type: 'text', required: true },
      { name: 'client_secret', label: 'Client Secret', type: 'password', required: true },
      { name: 'user_agent', label: 'User Agent', type: 'text', required: true },
    ],
  },
  {
    name: 'Microsoft Teams', engine: 'teams', category: 'SaaS', icon: '💼',
    fields: [
      { name: 'client_id', label: 'Client ID', type: 'text', required: true },
      { name: 'client_secret', label: 'Client Secret', type: 'password', required: true },
      { name: 'tenant_id', label: 'Tenant ID', type: 'text', required: true },
    ],
  },
  {
    name: 'GitLab', engine: 'gitlab', category: 'SaaS', icon: '🦊',
    fields: [
      { name: 'api_key', label: 'Personal Access Token', type: 'password', required: true },
      { name: 'repository', label: 'Repository', type: 'text', required: true, placeholder: 'owner/repo' },
      { name: 'gitlab_url', label: 'GitLab URL', type: 'text', required: false, placeholder: 'https://gitlab.com' },
    ],
  },
  {
    name: 'Coinbase', engine: 'coinbase', category: 'SaaS', icon: '🔵',
    fields: [
      { name: 'api_key', label: 'API Key', type: 'password', required: true },
      { name: 'api_secret', label: 'API Secret', type: 'password', required: true },
    ],
  },
  {
    name: 'NewsAPI', engine: 'newsapi', category: 'SaaS', icon: '📰',
    fields: [
      { name: 'api_key', label: 'API Key', type: 'password', required: true },
    ],
  },
  {
    name: 'Google Search', engine: 'google_search', category: 'SaaS', icon: '🔍',
    fields: [
      { name: 'api_key', label: 'API Key', type: 'password', required: true },
      { name: 'search_engine_id', label: 'Search Engine ID', type: 'text', required: true },
    ],
  },
  {
    name: 'Eventbrite', engine: 'eventbrite', category: 'SaaS', icon: '🎟️',
    fields: [
      { name: 'api_key', label: 'API Key', type: 'password', required: true },
    ],
  },
  {
    name: 'Sendinblue / Brevo', engine: 'sendinblue', category: 'SaaS', icon: '📨',
    fields: [
      { name: 'api_key', label: 'API Key', type: 'password', required: true },
    ],
  },
  {
    name: 'Docker Hub', engine: 'dockerhub', category: 'SaaS', icon: '🐳',
    fields: [
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password / Token', type: 'password', required: true },
    ],
  },
  {
    name: 'OpenBB', engine: 'openbb', category: 'SaaS', icon: '📊',
    fields: [
      { name: 'pat', label: 'Personal Access Token', type: 'password', required: true },
    ],
  },
  {
    name: 'Wikipedia', engine: 'mediawiki', category: 'SaaS', icon: '📖',
    fields: [
      { name: 'url', label: 'Wiki URL', type: 'text', required: false, placeholder: 'https://en.wikipedia.org' },
    ],
  },
  {
    name: 'Rocket.Chat', engine: 'rocket_chat', category: 'SaaS', icon: '🚀',
    fields: [
      { name: 'url', label: 'Server URL', type: 'text', required: true, placeholder: 'https://chat.mycompany.com' },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'Strapi', engine: 'strapi', category: 'SaaS', icon: '🏗️',
    fields: [
      { name: 'url', label: 'Strapi URL', type: 'text', required: true, placeholder: 'http://localhost:1337' },
      { name: 'api_token', label: 'API Token', type: 'password', required: true },
    ],
  },
  {
    name: 'HackerNews', engine: 'hackernews', category: 'SaaS', icon: '🔶',
    fields: [],
  },

  // ── File / Storage ────────────────────────────────────────────────
  {
    name: 'S3', engine: 's3', category: 'File Storage', icon: '🪣',
    fields: [
      { name: 'aws_access_key_id', label: 'Access Key ID', type: 'text', required: true },
      { name: 'aws_secret_access_key', label: 'Secret Key', type: 'password', required: true },
      { name: 'bucket', label: 'Bucket', type: 'text', required: true },
      { name: 'region', label: 'Region', type: 'text', required: false, placeholder: 'us-east-1' },
    ],
  },
  {
    name: 'Google Cloud Storage', engine: 'gcs', category: 'File Storage', icon: '🗄️',
    fields: [
      { name: 'service_account_json', label: 'Service Account JSON', type: 'textarea', required: true },
      { name: 'bucket', label: 'Bucket', type: 'text', required: true },
    ],
  },
  {
    name: 'Azure Blob Storage', engine: 'azure_blob', category: 'File Storage', icon: '🔷',
    fields: [
      { name: 'connection_string', label: 'Connection String', type: 'password', required: true },
      { name: 'container', label: 'Container', type: 'text', required: true },
    ],
  },
  {
    name: 'HDFS', engine: 'hdfs', category: 'File Storage', icon: '🐘',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '9000' },
    ],
  },
  {
    name: 'MinIO', engine: 'minio', category: 'File Storage', icon: '🟡',
    fields: [
      { name: 'endpoint', label: 'Endpoint', type: 'text', required: true, placeholder: 'play.min.io:9000' },
      { name: 'access_key', label: 'Access Key', type: 'text', required: true },
      { name: 'secret_key', label: 'Secret Key', type: 'password', required: true },
      { name: 'bucket', label: 'Bucket', type: 'text', required: true },
    ],
  },
  {
    name: 'FTP', engine: 'ftp', category: 'File Storage', icon: '📂',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: false, placeholder: '21' },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'Dropbox', engine: 'dropbox', category: 'File Storage', icon: '📦',
    fields: [
      { name: 'access_token', label: 'Access Token', type: 'password', required: true },
    ],
  },
  {
    name: 'OneDrive', engine: 'one_drive', category: 'File Storage', icon: '☁️',
    fields: [
      { name: 'client_id', label: 'Client ID', type: 'text', required: true },
      { name: 'client_secret', label: 'Client Secret', type: 'password', required: true },
      { name: 'refresh_token', label: 'Refresh Token', type: 'password', required: true },
    ],
  },
  {
    name: 'SharePoint', engine: 'sharepoint', category: 'File Storage', icon: '🏢',
    fields: [
      { name: 'client_id', label: 'Client ID', type: 'text', required: true },
      { name: 'client_secret', label: 'Client Secret', type: 'password', required: true },
      { name: 'refresh_token', label: 'Refresh Token', type: 'password', required: true },
      { name: 'site_url', label: 'Site URL', type: 'text', required: true },
    ],
  },

  // ── Time-Series ───────────────────────────────────────────────────
  {
    name: 'InfluxDB', engine: 'influxdb', category: 'Time-Series', icon: '📈',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '8086' },
      { name: 'token', label: 'Token', type: 'password', required: true },
      { name: 'org', label: 'Organization', type: 'text', required: true },
      { name: 'bucket', label: 'Bucket', type: 'text', required: true },
    ],
  },
  {
    name: 'TimescaleDB', engine: 'timescaledb', category: 'Time-Series', icon: '⏱️',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '5432' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    name: 'QuestDB', engine: 'questdb', category: 'Time-Series', icon: '🏛️',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '8812' },
    ],
  },
  {
    name: 'TDengine', engine: 'tdengine', category: 'Time-Series', icon: '🕐',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '6030' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'user', label: 'User', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  },


  // ── Search ────────────────────────────────────────────────────────
  {
    name: 'Elasticsearch', engine: 'elasticsearch', category: 'Search', icon: '🔍',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '9200' },
      { name: 'user', label: 'User', type: 'text', required: false },
      { name: 'password', label: 'Password', type: 'password', required: false },
    ],
  },
  {
    name: 'Apache Solr', engine: 'solr', category: 'Search', icon: '☀️',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '8983' },
      { name: 'collection', label: 'Collection', type: 'text', required: true },
    ],
  },

  // ── API ───────────────────────────────────────────────────────────
  {
    name: 'REST API', engine: 'web', category: 'API', icon: '🌐',
    fields: [
      { name: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://api.example.com/data' },
    ],
  },
]
