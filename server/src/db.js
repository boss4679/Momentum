// Database bootstrap — opens the local SQLite file (built-in node:sqlite, no
// native deps) and applies the schema. Exports a single shared connection.
//
// Momentum is a single-user local app: there is no auth or user table. All
// data belongs to whoever runs the app on their machine.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'momentum.db');

export const db = new DatabaseSync(DB_PATH);

// Enforce foreign keys for every connection (off by default in SQLite).
db.exec('PRAGMA foreign_keys = ON;');

// Apply schema (idempotent — every statement uses IF NOT EXISTS).
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);
