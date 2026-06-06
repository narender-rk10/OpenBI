-- OpenBI Finance Demo — PostgreSQL seed
-- 2024 monthly sales + budget across 4 regions x 4 product categories.
-- Deterministic (no random) so the demo is reproducible.

DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS budget;

CREATE TABLE sales (
    id               SERIAL PRIMARY KEY,
    sale_date        DATE        NOT NULL,
    region           TEXT        NOT NULL,
    product_category TEXT        NOT NULL,
    units            INTEGER     NOT NULL,
    revenue          NUMERIC(12,2) NOT NULL
);

CREATE TABLE budget (
    id               SERIAL PRIMARY KEY,
    month            DATE        NOT NULL,
    region           TEXT        NOT NULL,
    product_category TEXT        NOT NULL,
    budget_amount    NUMERIC(12,2) NOT NULL
);

-- Price per unit by category (drives revenue)
-- Electronics 420, Furniture 260, Office Supplies 35, Software 180
INSERT INTO sales (sale_date, region, product_category, units, revenue)
SELECT
    make_date(2024, m, 1)                                        AS sale_date,
    r.region,
    c.category,
    units,
    ROUND(units * c.price, 2)                                    AS revenue
FROM generate_series(1, 12) AS m
CROSS JOIN (VALUES ('North', 1), ('South', 2), ('East', 3), ('West', 4)) AS r(region, idx)
CROSS JOIN (VALUES
    ('Electronics', 1, 420.0),
    ('Furniture',   2, 260.0),
    ('Office Supplies', 3, 35.0),
    ('Software',    4, 180.0)
) AS c(category, idx, price)
CROSS JOIN LATERAL (
    -- seasonal-ish, region- and category-varying unit counts (deterministic)
    SELECT (120
            + (m * 6)
            + (r.idx * 18)
            + (c.idx * 11)
            + CASE WHEN m IN (11, 12) THEN 60 ELSE 0 END)::int AS units
) u;

-- Budget = a target slightly above/below the comparable actual pattern
INSERT INTO budget (month, region, product_category, budget_amount)
SELECT
    make_date(2024, m, 1),
    r.region,
    c.category,
    ROUND(((120 + (m * 6) + (r.idx * 18) + (c.idx * 11)) * c.price) * 1.05, 2)
FROM generate_series(1, 12) AS m
CROSS JOIN (VALUES ('North', 1), ('South', 2), ('East', 3), ('West', 4)) AS r(region, idx)
CROSS JOIN (VALUES
    ('Electronics', 1, 420.0),
    ('Furniture',   2, 260.0),
    ('Office Supplies', 3, 35.0),
    ('Software',    4, 180.0)
) AS c(category, idx, price);

CREATE INDEX idx_sales_region ON sales(region);
CREATE INDEX idx_sales_date   ON sales(sale_date);
CREATE INDEX idx_sales_cat    ON sales(product_category);
