import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  const sql = readFileSync(resolve(__dirname, 'migrations/0001_initial.sql'), 'utf8');
  await p.query(sql);
  await p.end();
  console.log('Migration complete');
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
