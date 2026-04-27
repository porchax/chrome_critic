import { Redis } from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

// Without a listener ioredis will crash the process on transient errors.
redis.on('error', (err) => {
  console.error(JSON.stringify({ event: 'redis_error', err: String(err) }));
});
