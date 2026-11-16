// Usage: npm run migrate -- up | down [count] | redo
// Wraps node-pg-migrate's runner so it uses the same config (and .env loading) as the app.
// Set NODE_ENV=test to migrate the test database instead.
const path = require('node:path');
const config = require('../src/config');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function migrate(direction, count) {
  // node-pg-migrate v9 ships only as an ES module; a dynamic import loads it from CommonJS.
  const { runner } = await import('node-pg-migrate');
  return runner({
    databaseUrl: config.databaseUrl,
    dir: MIGRATIONS_DIR,
    migrationsTable: 'pgmigrations',
    direction,
    count,
    // Each migration runs in its own transaction, so a failed migration leaves no half-built tables.
    singleTransaction: false,
    log: () => {},
  });
}

async function main() {
  const [command = 'up', countArg] = process.argv.slice(2);
  const count = countArg === undefined ? undefined : Number(countArg);

  let ran;
  if (command === 'up') {
    ran = await migrate('up', count ?? Infinity);
  } else if (command === 'down') {
    ran = await migrate('down', count ?? 1);
  } else if (command === 'redo') {
    await migrate('down', count ?? 1);
    ran = await migrate('up', count ?? 1);
  } else {
    throw new Error(`Unknown command "${command}". Use up, down or redo.`);
  }

  const names = ran.map((m) => m.name);
  console.log(
    names.length
      ? `${command}: ${names.join(', ')}`
      : `${command}: nothing to do (${config.nodeEnv} database)`,
  );
}

// Run only when called from the command line, so tests can require migrate() directly.
if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { migrate };
