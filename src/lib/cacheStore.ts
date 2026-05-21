import { prisma } from "@/lib/prisma";

// ── In-memory fallback ────────────────────────────────────────────────────────
// Used when Prisma/Supabase is unavailable. Resets on cold start but prevents
// cascading errors in all cases.

interface MemEntry {
  value: unknown;
  expiresAt: number;
}

const _mem = new Map<string, MemEntry>();

function memGet<T>(key: string): T | null {
  const entry = _mem.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _mem.delete(key);
    return null;
  }
  return entry.value as T;
}

function memSet<T>(key: string, value: T, ttlSeconds: number): void {
  _mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reads a cached value from Supabase (CacheEntry table).
 * Falls back to in-memory store on any DB error.
 * Returns null on cache miss or expiry.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const row = await prisma.cacheEntry.findUnique({ where: { key } });
    if (!row) return null;
    if (new Date() > row.expiresAt) {
      // Lazy eviction — don't await delete to keep response fast
      prisma.cacheEntry.delete({ where: { key } }).catch(() => undefined);
      return null;
    }
    return JSON.parse(row.value) as T;
  } catch (err) {
    console.warn(`[CacheStore] DB read failed for "${key}", using in-memory fallback:`, err);
    return memGet<T>(key);
  }
}

/**
 * Writes a value to Supabase (CacheEntry table) with the given TTL in seconds.
 * Falls back to in-memory store on any DB error so the caller always has a cache.
 */
export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const serialized = JSON.stringify(value);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  try {
    await prisma.cacheEntry.upsert({
      where: { key },
      update: { value: serialized, expiresAt },
      create: { key, value: serialized, expiresAt },
    });
    // Mirror in memory so same-process reads skip the DB round-trip
    memSet(key, value, ttlSeconds);
  } catch (err) {
    console.warn(`[CacheStore] DB write failed for "${key}", storing in-memory only:`, err);
    memSet(key, value, ttlSeconds);
  }
}
