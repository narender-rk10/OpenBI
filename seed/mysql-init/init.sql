-- ── MySQL Init: marketingdb (default DB, auto-created by MYSQL_DATABASE) ──

-- Marketing tables and data (runs in marketingdb context)
CREATE TABLE marketing_campaigns (campaign_id INT AUTO_INCREMENT PRIMARY KEY, campaign_name VARCHAR(100) NOT NULL, channel VARCHAR(50) NOT NULL, target_client_type VARCHAR(50) NOT NULL);
