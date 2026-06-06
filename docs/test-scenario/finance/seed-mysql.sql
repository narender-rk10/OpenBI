-- OpenBI Finance Demo — MySQL seed (ops/marketing side, complements the Postgres sales/budget)
-- Same 4 regions as Postgres so cross-source joins (revenue vs spend → ROI) work.
DROP TABLE IF EXISTS marketing_spend;
DROP TABLE IF EXISTS region_info;

CREATE TABLE region_info (
    region    VARCHAR(20) PRIMARY KEY,
    manager   VARCHAR(50)  NOT NULL,
    hq_city   VARCHAR(50)  NOT NULL,
    headcount INT          NOT NULL
);

INSERT INTO region_info (region, manager, hq_city, headcount) VALUES
    ('North', 'Asha Verma',     'Chicago',     42),
    ('South', 'Diego Martinez', 'Austin',      38),
    ('East',  'Liang Chen',     'New York',    55),
    ('West',  'Sofia Rossi',    'San Francisco', 61);

CREATE TABLE marketing_spend (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    region  VARCHAR(20)   NOT NULL,
    month   DATE          NOT NULL,
    channel VARCHAR(30)   NOT NULL,
    spend   DECIMAL(12,2) NOT NULL
);

-- 4 regions x 12 months x 3 channels, deterministic spend (kept below revenue so ROI > 1)
INSERT INTO marketing_spend (region, month, channel, spend)
SELECT r.region,
       DATE(CONCAT('2024-', LPAD(m.m, 2, '0'), '-01')) AS month,
       c.channel,
       ROUND((8000 + r.idx*1500 + m.m*350 + c.base) , 2) AS spend
FROM (SELECT 'North' region, 1 idx UNION ALL SELECT 'South',2 UNION ALL SELECT 'East',3 UNION ALL SELECT 'West',4) r
CROSS JOIN (SELECT 1 m UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
            UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12) m
CROSS JOIN (SELECT 'Online' channel, 2000 base UNION ALL SELECT 'Retail', 3500 UNION ALL SELECT 'Events', 1200) c;
