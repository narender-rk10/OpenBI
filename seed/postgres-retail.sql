-- Postgres seed: a small e-commerce schema with enough rows for an agent to
-- find real trends ("top customers", "monthly revenue", "best-selling category").

CREATE TABLE customers (
    customer_id   SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    country       TEXT NOT NULL,
    signup_date   DATE NOT NULL
);

CREATE TABLE products (
    product_id    SERIAL PRIMARY KEY,
    sku           TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,
    price_usd     NUMERIC(10, 2) NOT NULL
);

CREATE TABLE orders (
    order_id      SERIAL PRIMARY KEY,
    customer_id   INT NOT NULL REFERENCES customers(customer_id),
    order_date    DATE NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('pending', 'shipped', 'delivered', 'cancelled'))
);

CREATE TABLE order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id      INT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id    INT NOT NULL REFERENCES products(product_id),
    quantity      INT NOT NULL,
    unit_price    NUMERIC(10, 2) NOT NULL
);

-- ── Customers (10 across 4 countries) ────────────────────────────────────
INSERT INTO customers (name, email, country, signup_date) VALUES
('Aarav Sharma',   'aarav@example.com',   'IN', '2024-08-12'),
('Priya Patel',    'priya@example.com',   'IN', '2024-09-03'),
('Liam Smith',     'liam@example.com',    'US', '2024-07-28'),
('Olivia Brown',   'olivia@example.com',  'US', '2024-10-14'),
('Noah Wilson',    'noah@example.com',    'US', '2025-01-05'),
('Emma Johnson',   'emma@example.com',    'GB', '2024-11-22'),
('Hiroshi Tanaka', 'hiroshi@example.com', 'JP', '2025-02-18'),
('Yuki Sato',      'yuki@example.com',    'JP', '2025-03-10'),
('Ravi Iyer',      'ravi@example.com',    'IN', '2025-03-25'),
('Sophie Müller',  'sophie@example.com',  'DE', '2025-04-01');

-- ── Products (12 across 4 categories) ────────────────────────────────────
INSERT INTO products (sku, name, category, price_usd) VALUES
('ELC-001', 'Wireless Earbuds Pro',   'Electronics', 79.99),
('ELC-002', 'Smart Watch X',          'Electronics', 199.00),
('ELC-003', 'USB-C Hub 8-in-1',       'Electronics', 39.50),
('HOM-001', 'Aroma Diffuser',         'Home',         24.99),
('HOM-002', 'Bamboo Cutting Board',   'Home',         18.50),
('HOM-003', 'LED Desk Lamp',          'Home',         32.00),
('APP-001', 'Cotton T-Shirt',         'Apparel',      14.99),
('APP-002', 'Denim Jacket',           'Apparel',      59.00),
('APP-003', 'Running Shoes',          'Apparel',      89.00),
('BKS-001', 'Data Engineering 101',   'Books',        34.00),
('BKS-002', 'The Art of SQL',         'Books',        28.00),
('BKS-003', 'Dashboards That Work',   'Books',        22.50);

-- ── Orders (spread across Aug 2024 → Apr 2025 so trend questions work) ────
INSERT INTO orders (customer_id, order_date, status) VALUES
(1, '2024-08-20', 'delivered'),
(3, '2024-09-02', 'delivered'),
(2, '2024-09-15', 'delivered'),
(1, '2024-10-01', 'delivered'),
(4, '2024-10-22', 'delivered'),
(3, '2024-11-05', 'delivered'),
(6, '2024-11-28', 'delivered'),
(5, '2024-12-09', 'delivered'),
(2, '2024-12-21', 'delivered'),
(4, '2025-01-08', 'delivered'),
(7, '2025-02-19', 'delivered'),
(8, '2025-03-12', 'shipped'),
(6, '2025-03-18', 'shipped'),
(9, '2025-03-26', 'shipped'),
(10, '2025-04-02', 'pending'),
(5, '2025-04-04', 'cancelled'),
(1, '2025-04-08', 'pending'),
(3, '2025-04-10', 'shipped');

-- ── Order items (line-level so agents can compute revenue) ───────────────
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
(1,  1, 2, 79.99),
(1,  4, 1, 24.99),
(2,  2, 1, 199.00),
(3,  7, 3, 14.99),
(3,  8, 1, 59.00),
(4,  3, 2, 39.50),
(4, 10, 1, 34.00),
(5,  6, 2, 32.00),
(5, 12, 2, 22.50),
(6,  9, 1, 89.00),
(6, 11, 1, 28.00),
(7,  2, 1, 199.00),
(7,  3, 1, 39.50),
(8,  5, 4, 18.50),
(9,  1, 1, 79.99),
(9,  7, 2, 14.99),
(10, 8, 1, 59.00),
(10, 9, 1, 89.00),
(11, 2, 1, 199.00),
(11, 6, 1, 32.00),
(12, 1, 3, 79.99),
(13, 4, 2, 24.99),
(14, 10, 2, 34.00),
(14, 11, 1, 28.00),
(15, 9, 1, 89.00),
(16, 3, 1, 39.50),
(17, 7, 5, 14.99),
(18, 12, 3, 22.50);

CREATE INDEX idx_orders_date     ON orders(order_date);
CREATE INDEX idx_order_items_oid ON order_items(order_id);
