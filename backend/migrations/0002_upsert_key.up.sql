-- Business uniqueness: (№ вагона, код станции операции, операция, дата операции)
-- i.e. (wagon_number, operation_station_code, operation, operation_date).
-- On upload, a row whose business key matches an existing row updates it
-- instead of inserting a duplicate.

-- 1) Remove pre-existing duplicates, keeping the most recently inserted row
--    (greatest id) per business key. NULLs are grouped together by PARTITION BY,
--    matching the NULLS NOT DISTINCT semantics of the unique index below.
DELETE FROM dislocation d
USING (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY wagon_number, operation_station_code, operation, operation_date
               ORDER BY id DESC
           ) AS rn
    FROM dislocation
) t
WHERE d.id = t.id
  AND t.rn > 1;

-- 2) Enforce the business key. NULLS NOT DISTINCT (PostgreSQL 15+) treats NULL
--    values as equal, so rows with the same key but NULL components still
--    conflict (and therefore upsert) as expected.
CREATE UNIQUE INDEX IF NOT EXISTS dislocation_business_key
    ON dislocation (wagon_number, operation_station_code, operation, operation_date)
    NULLS NOT DISTINCT;
