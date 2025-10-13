CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    api_token VARCHAR(255)
);

CREATE TABLE tunnels (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    cloudflare_id VARCHAR(64) NOT NULL,
    name VARCHAR(100) NOT NULL,
    domain VARCHAR(255) NOT NULL UNIQUE,
    service VARCHAR(255) NOT NULL,
    status ENUM('running', 'stopped', 'error') DEFAULT 'stopped',
    account_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uptime_started_at TIMESTAMP NULL DEFAULT NULL,
    last_activity_at TIMESTAMP NULL DEFAULT NULL,
    dns_warning VARCHAR(255) DEFAULT NULL,
    no_tls_verify BOOLEAN DEFAULT FALSE,
    is_temporary BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    INDEX idx_tunnels_uptime_started (uptime_started_at),
    INDEX idx_tunnels_last_activity (last_activity_at)
);

CREATE TABLE domains (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT UNSIGNED NOT NULL,
    domain VARCHAR(255) NOT NULL UNIQUE,
    zone_id VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
); 