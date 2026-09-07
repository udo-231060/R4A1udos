CREATE TABLE IF NOT EXISTS accounts (
 id VARCHAR(36) PRIMARY KEY, login VARCHAR(32) UNIQUE NOT NULL, password VARCHAR(100) NOT NULL,
 registered VARCHAR(40) NOT NULL DEFAULT '', nickname VARCHAR(30) NOT NULL DEFAULT 'キャンパスメンバー',
 anonymity INT NOT NULL DEFAULT 1 CHECK (anonymity BETWEEN 0 AND 3), code VARCHAR(32) UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
 id VARCHAR(36) PRIMARY KEY, a VARCHAR(36) NOT NULL REFERENCES accounts(id),
 b VARCHAR(36) NOT NULL REFERENCES accounts(id), created BIGINT NOT NULL, UNIQUE(a,b)
);
CREATE TABLE IF NOT EXISTS aliases (
 account_id VARCHAR(36) NOT NULL REFERENCES accounts(id), room VARCHAR(36) NOT NULL,
 label VARCHAR(40) NOT NULL, PRIMARY KEY(account_id,room)
);
CREATE TABLE IF NOT EXISTS messages (
 id VARCHAR(36) PRIMARY KEY, room VARCHAR(36) NOT NULL, author VARCHAR(36) NOT NULL REFERENCES accounts(id),
 display_name VARCHAR(40) NOT NULL, anonymity INT NOT NULL, body VARCHAR(2000) NOT NULL,
 mime VARCHAR(40), media BLOB, created BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_room_time ON messages(room,created);
CREATE INDEX IF NOT EXISTS messages_author_time ON messages(author,created);
CREATE TABLE IF NOT EXISTS reports (
 message_id VARCHAR(36) NOT NULL REFERENCES messages(id), reporter VARCHAR(36) NOT NULL REFERENCES accounts(id),
 created BIGINT NOT NULL, PRIMARY KEY(message_id,reporter)
);
CREATE TABLE IF NOT EXISTS github_accounts (
 github_id VARCHAR(32) PRIMARY KEY,
 account_id VARCHAR(36) UNIQUE NOT NULL REFERENCES accounts(id)
);
