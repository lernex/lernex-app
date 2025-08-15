const BUCKET: Record<string, { tokens: number; ts: number }> = {};
const CAP = 10;           // 10 requests
const REFILL_MS = 60_000; // per minute

export function take(ip: string) {
  const now = Date.now();
  const b = BUCKET[ip] ?? { tokens: CAP, ts: now };
  if (now - b.ts > REFILL_MS) { b.tokens = CAP; b.ts = now; }
  if (b.tokens <= 0) { BUCKET[ip] = b; return false; }
  b.tokens -= 1; BUCKET[ip] = b; return true;
}
