-- MySQL seed: small HR schema. Different domain + different SQL dialect on
-- purpose so the agent has to adapt (Postgres `NUMERIC` vs MySQL `DECIMAL`,
-- date functions, etc.) — exercises MindsDB's SQL translation per handler.

CREATE TABLE departments (
    department_id   INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(80)  NOT NULL UNIQUE,
    location        VARCHAR(80)  NOT NULL
);

CREATE TABLE employees (
    employee_id     INT AUTO_INCREMENT PRIMARY KEY,
    full_name       VARCHAR(120) NOT NULL,
    email           VARCHAR(120) NOT NULL UNIQUE,
    department_id   INT          NOT NULL,
    title           VARCHAR(80)  NOT NULL,
    hire_date       DATE         NOT NULL,
    salary_usd      DECIMAL(10,2) NOT NULL,
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    FOREIGN KEY (department_id) REFERENCES departments(department_id)
);

CREATE TABLE attendance (
    attendance_id   INT AUTO_INCREMENT PRIMARY KEY,
    employee_id     INT  NOT NULL,
    work_date       DATE NOT NULL,
    hours_worked    DECIMAL(4,2) NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
);

-- ── Departments ──────────────────────────────────────────────────────────
INSERT INTO departments (name, location) VALUES
('Engineering', 'Bengaluru'),
('Data',        'Bengaluru'),
('Sales',       'Mumbai'),
('Marketing',   'Mumbai'),
('Operations',  'Pune');

-- ── Employees (15 across the 5 depts) ────────────────────────────────────
INSERT INTO employees (full_name, email, department_id, title, hire_date, salary_usd, is_active) VALUES
('Anita Rao',       'anita@corp.io',   1, 'Senior Engineer',     '2022-03-14',  92000.00, 1),
('Rahul Verma',     'rahul@corp.io',   1, 'Engineer',            '2023-07-01',  68000.00, 1),
('Mei Lin',         'mei@corp.io',     1, 'Engineering Manager', '2021-11-20', 125000.00, 1),
('Sanjay Gupta',    'sanjay@corp.io',  1, 'Engineer',            '2024-01-12',  62000.00, 1),
('Diya Nair',       'diya@corp.io',    2, 'Data Scientist',      '2022-09-09',  88000.00, 1),
('Arjun Kapoor',    'arjun@corp.io',   2, 'Data Engineer',       '2023-02-18',  76000.00, 1),
('Karan Mehta',     'karan@corp.io',   2, 'Analytics Lead',      '2021-06-05', 110000.00, 1),
('Sara Khan',       'sara@corp.io',    3, 'Account Executive',   '2023-05-30',  64000.00, 1),
('Vikram Bose',     'vikram@corp.io',  3, 'Sales Director',      '2020-08-11', 140000.00, 1),
('Pooja Shah',      'pooja@corp.io',   3, 'SDR',                 '2024-04-22',  48000.00, 1),
('Liam OConnor',    'liam@corp.io',    4, 'Marketing Manager',   '2022-12-01',  82000.00, 1),
('Aarti Joshi',     'aarti@corp.io',   4, 'Content Strategist',  '2023-10-17',  58000.00, 1),
('Dev Patel',       'dev@corp.io',     5, 'Ops Manager',         '2021-03-08',  96000.00, 1),
('Neha Singh',      'neha@corp.io',    5, 'Ops Analyst',         '2024-02-26',  54000.00, 1),
('Rohit Bansal',    'rohit@corp.io',   5, 'Logistics Lead',      '2022-07-19',  72000.00, 0);  -- inactive

-- ── Attendance — 5 working days for everyone for a single week ──────────
INSERT INTO attendance (employee_id, work_date, hours_worked)
SELECT e.employee_id, d.work_date, ROUND(7 + (RAND() * 2), 2)
FROM employees e
CROSS JOIN (
    SELECT DATE '2025-04-07' AS work_date UNION ALL
    SELECT DATE '2025-04-08' UNION ALL
    SELECT DATE '2025-04-09' UNION ALL
    SELECT DATE '2025-04-10' UNION ALL
    SELECT DATE '2025-04-11'
) d
WHERE e.is_active = 1;

CREATE INDEX idx_emp_dept ON employees(department_id);
CREATE INDEX idx_att_emp  ON attendance(employee_id, work_date);
