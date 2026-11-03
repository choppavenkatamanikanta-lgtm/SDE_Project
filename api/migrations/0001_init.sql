PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS homes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CONSTRAINT ck_homes_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS members (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  home_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CONSTRAINT fk_members_home FOREIGN KEY (home_id) REFERENCES homes (id) ON DELETE CASCADE,
  CONSTRAINT ck_members_name_nonempty CHECK (length(trim(name)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_members_home_seq ON members (home_id, seq ASC);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL,
  title TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CONSTRAINT fk_bills_home FOREIGN KEY (home_id) REFERENCES homes (id) ON DELETE CASCADE,
  CONSTRAINT ck_bills_total_positive CHECK (total_cents > 0),
  CONSTRAINT ck_bills_title_nonempty CHECK (length(trim(title)) > 0)
);

CREATE TABLE IF NOT EXISTS bill_shares (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at TEXT DEFAULT NULL,
  idempotency_key TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CONSTRAINT fk_shares_bill FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE CASCADE,
  CONSTRAINT fk_shares_member FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE,
  CONSTRAINT ck_shares_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT uq_shares_idempotency UNIQUE (idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_shares_bill ON bill_shares (bill_id);
CREATE INDEX IF NOT EXISTS idx_shares_member_unpaid ON bill_shares (member_id, paid_at);
