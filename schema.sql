-- NaderVPN Subscription Manager - D1 Database Schema

-- Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    remark TEXT DEFAULT '',
    config_links TEXT NOT NULL,
    traffic_limit INTEGER DEFAULT 0,
    traffic_used INTEGER DEFAULT 0,
    expire_at INTEGER DEFAULT 0,
    subscription_token TEXT NOT NULL UNIQUE,
    enable INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_subs_token ON subscriptions(subscription_token);
CREATE INDEX IF NOT EXISTS idx_subs_enable ON subscriptions(enable);
CREATE INDEX IF NOT EXISTS idx_subs_expire ON subscriptions(expire_at);
