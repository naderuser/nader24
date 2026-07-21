-- NaderVPN Subscription Manager Database Schema

-- Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    remark TEXT,
    config_links TEXT NOT NULL,
    traffic_limit INTEGER DEFAULT 0,
    traffic_used INTEGER DEFAULT 0,
    expire_at INTEGER DEFAULT 0,
    status TEXT DEFAULT 'enabled',
    subscription_token TEXT NOT NULL UNIQUE,
    enable INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_subs_uuid ON subscriptions(uuid);
CREATE INDEX idx_subs_token ON subscriptions(subscription_token);
CREATE INDEX idx_subs_status ON subscriptions(status);
CREATE INDEX idx_subs_enable ON subscriptions(enable);

-- Settings Table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Login Attempts Table
CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    attempts INTEGER DEFAULT 1,
    last_attempt INTEGER NOT NULL DEFAULT (unixepoch()),
    locked_until INTEGER DEFAULT 0
);

CREATE INDEX idx_login_ip ON login_attempts(ip);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES 
    ('admin_password', 'nader0933'),
    ('app_name', 'NaderVPN Subscription'),
    ('language', 'fa'),
    ('theme', 'dark');
