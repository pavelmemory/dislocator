-- Change the business uniqueness key from
--   (wagon_number, operation_station_code, operation, operation_date)
-- to
--   (wagon_number, operation_date, operation).

-- Drop rows that would collide under the new (narrower) key, keeping the most
-- recently inserted row per key (NULLs grouped together, matching the
-- NULLS NOT DISTINCT index below). Without this the CREATE UNIQUE INDEX could
-- fail on pre-existing duplicates.
DELETE FROM dislocation d
USING (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY wagon_number, operation_date, operation
               ORDER BY id DESC
           ) AS rn
    FROM dislocation
) t
WHERE d.id = t.id
  AND t.rn > 1;

DROP INDEX IF EXISTS dislocation_business_key;

CREATE UNIQUE INDEX IF NOT EXISTS dislocation_business_key
    ON dislocation (wagon_number, operation_date, operation)
    NULLS NOT DISTINCT;
