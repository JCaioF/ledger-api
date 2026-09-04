import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';

export async function checkHealth() {
  const [db, cache] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);
  return {
    db: db.status === 'fulfilled' ? ('up' as const) : ('down' as const),
    redis: cache.status === 'fulfilled' ? ('up' as const) : ('down' as const),
  };
}
