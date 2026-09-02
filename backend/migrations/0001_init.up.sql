-- dislocator initial schema

CREATE TABLE IF NOT EXISTS users (
  login         TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','viewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signup_links (
  token       UUID PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('admin','viewer')),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_by  TEXT NOT NULL REFERENCES users(login),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS imports (
  id           BIGSERIAL PRIMARY KEY,
  filename     TEXT NOT NULL,
  uploaded_by  TEXT NOT NULL REFERENCES users(login),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dislocation (
  id         BIGSERIAL PRIMARY KEY,
  import_id  BIGINT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  -- 34 stored columns (from columns.json, in order)
  wagon_number                 BIGINT,
  rps                          TEXT,
  operation_road               BIGINT,
  operation_station_code       TEXT,
  operation_station            TEXT,
  train_index                  TEXT,
  train_number                 BIGINT,
  operation                    TEXT,
  operation_date               TIMESTAMP,
  cargo_weight                 BIGINT,
  shipper_code                 BIGINT,
  consignee_code               BIGINT,
  cargo_code                   TEXT,
  cargo                        TEXT,
  dest_station_code            TEXT,
  dest_station                 TEXT,
  distance_left                BIGINT,
  cargo_accept_date            TIMESTAMP,
  cargo_accept_station_code    BIGINT,
  cargo_accept_station         TEXT,
  planned_repair_date          DATE,
  owner                        TEXT,
  operator                     TEXT,
  lessee                       TEXT,
  vu23_code                    BIGINT,
  vu23_vrp                     TEXT,
  vu23_repair_type             TEXT,
  vu23_nrp_date                TIMESTAMP,
  vu23_defect                  TEXT,
  vu36_exit_station            TEXT,
  vu36_code                    BIGINT,
  vu36_vrp_name                TEXT,
  vu36_exit_date               TIMESTAMP,
  vu36_defect                  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dislocation_import_id     ON dislocation (import_id);
CREATE INDEX IF NOT EXISTS idx_dislocation_wagon_number  ON dislocation (wagon_number);
CREATE INDEX IF NOT EXISTS idx_dislocation_operation_date ON dislocation (operation_date);
