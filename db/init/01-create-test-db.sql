-- The official postgres image runs scripts in /docker-entrypoint-initdb.d once, the first
-- time the data volume is created. The main database (momentum) comes from POSTGRES_DB;
-- this adds a second, separate database for tests so a test run can never wipe dev data.
-- (If the volume already exists this doesn't re-run: `docker compose down -v` resets it.)
CREATE DATABASE momentum_test;
