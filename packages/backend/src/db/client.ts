import { Pool, types } from 'pg';

// pg returns BIGINT (OID 20) as string by default to avoid JS int53 truncation;
// our BIGINTs are ms timestamps (well under 2^53), so parse to Number for natural arithmetic.
types.setTypeParser(20, (v) => Number.parseInt(v, 10));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error(JSON.stringify({ event: 'pg_pool_error', err: String(err) }));
});
