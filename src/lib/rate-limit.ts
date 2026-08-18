type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000,
  now = Date.now(),
): { allowed: boolean; remaining: number; resetAt: number } {
  const existing = buckets.get(key);
  const bucket =
    !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : existing;
  bucket.count += 1;
  buckets.set(key, bucket);
  if (buckets.size > 10_000)
    for (const [id, value] of buckets)
      if (value.resetAt <= now) buckets.delete(id);
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}
