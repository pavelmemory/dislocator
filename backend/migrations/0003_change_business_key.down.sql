-- Revert to the previous business key.
DROP INDEX IF EXISTS dislocation_business_key;

CREATE UNIQUE INDEX IF NOT EXISTS dislocation_business_key
    ON dislocation (wagon_number, operation_station_code, operation, operation_date)
    NULLS NOT DISTINCT;
