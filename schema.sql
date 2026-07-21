-- NaderVPN Database Schema for Cloudflare D1

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    remark TEXT,
    protocol TEXT NOT NULL DEFAULT 'vless',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    expire_at INTEGER NOT NULL DEFAULT 0,
    traffic_limit INTEGER NOT NULL DEFAULT 0,
    upload INTEGER NOT NULL DEFAULT 0,
    download INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    subscription_token TEXT NOT NULL UNIQUE,
    enable INTEGER NOT NULL DEFAULT 1,
    bind_ip TEXT,
    flow TEXT,
    network TEXT DEFAULT 'tcp',
    security TEXT DEFAULT 'tls',
    transport TEXT DEFAULT 'none',
    sni TEXT,
    host TEXT,
    alpn TEXT,
    allowinsecure INTEGER DEFAULT 0,
    fingerprint TEXT,
    header_type TEXT DEFAULT 'none',
    seeding INTEGER DEFAULT 0,
    peer TEXT,
    mtu INTEGER DEFAULT 1280,
    reserved TEXT,
    protocol_param TEXT,
    stream_param TEXT,
    created_by TEXT,
    notes TEXT
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_expire ON users(expire_at);
CREATE INDEX idx_users_uuid ON users(uuid);

-- Nodes Table
CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    port INTEGER NOT NULL,
    tls INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'vless',
    enable INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    parent_id INTEGER,
    remark TEXT,
    cpu INTEGER DEFAULT 0,
    memory INTEGER DEFAULT 0,
    disk INTEGER DEFAULT 0,
    upload_speed INTEGER DEFAULT 0,
    download_speed INTEGER DEFAULT 0,
    online_user INTEGER DEFAULT 0,
    last_check INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_nodes_type ON nodes(type);
CREATE INDEX idx_nodes_enable ON nodes(enable);

-- Settings Table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Logs Table
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    target TEXT,
    ip TEXT,
    user_agent TEXT,
    details TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_logs_action ON logs(action);
CREATE INDEX idx_logs_created ON logs(created_at);

-- Login Attempts Table (for rate limiting)
CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    username TEXT,
    attempts INTEGER NOT NULL DEFAULT 1,
    last_attempt INTEGER NOT NULL DEFAULT (unixepoch()),
    locked_until INTEGER DEFAULT 0
);

CREATE INDEX idx_login_attempts_ip ON login_attempts(ip);

-- Backup Table
CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    status TEXT DEFAULT 'completed'
);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES 
    ('app_name', 'NaderVPN'),
    ('app_logo', ''),
    ('app_url', ''),
    ('language', 'fa'),
    ('theme', 'dark'),
    ('max_users', '0'),
    ('default_traffic', '107374182400'),
    ('default_days', '30'),
    ('registration_enabled', 'false'),
    ('maintenance_mode', 'false'),
    ('csrf_secret', ''),
    ('backup_enabled', 'true'),
    ('backup_interval', 'daily');
