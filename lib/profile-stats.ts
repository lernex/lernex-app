export type ProfileStats = {
  points: number;
  streak: number;
  lastStudyDate: string | null;
  updatedAt: string | null;
};

const MS_PER_DAY = 86_400_000;

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function diffInDays(from: Date, to: Date): number {
  return Math.floor((startOfUtcDay(to) - startOfUtcDay(from)) / MS_PER_DAY);
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function computeStreakAfterActivity(
  previousStreak: number,
  lastStudyDate: string | null | undefined,
  now: Date = new Date()
): number {
  const prev = Number.isFinite(previousStreak) ? previousStreak : 0;
  const last = parseIsoDate(lastStudyDate);
  if (!last) {
    return Math.max(1, prev || 1);
  }
  const diff = diffInDays(last, now);
  if (diff <= 0) {
    return Math.max(prev, 1);
  }
  if (diff === 1) {
    return Math.max(prev, 0) + 1;
  }
  return 1;
}

export function shouldResetStreak(
  lastStudyDate: string | null | undefined,
  now: Date = new Date()
): boolean {
  const last = parseIsoDate(lastStudyDate);
  if (!last) return false;
  return diffInDays(last, now) >= 2;
}

export function ensurePositiveStreakForSameDay(
  currentStreak: number,
  lastStudyDate: string | null | undefined,
  now: Date = new Date()
): number | null {
  const last = parseIsoDate(lastStudyDate);
  if (!last) return null;
  if (diffInDays(last, now) === 0 && currentStreak <= 0) {
    return 1;
  }
  return null;
}

export function normalizeProfileStats(row: Record<string, unknown> | null | undefined): ProfileStats {
  return {
    points: toNumber(row?.points),
    streak: toNumber(row?.streak),
    lastStudyDate: (row?.last_study_date as string | null | undefined) ?? null,
    updatedAt: (row?.updated_at as string | null | undefined) ?? null,
  };
}
