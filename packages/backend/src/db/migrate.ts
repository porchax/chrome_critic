import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(pool: Pool): Promise<void> {
  const sql = readFileSync(resolve(__dirname, 'migrations/0001_initial.sql'), 'utf8');
  await pool.query(sql);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await runMigrations(pool);
    console.log(JSON.stringify({ event: 'migration_complete' }));
  } finally {
    await pool.end();
  }
}

const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  main().catch((err) => {
    console.error(JSON.stringify({ event: 'migration_failed', err: String(err) }));
    process.exit(1);
  });
}
