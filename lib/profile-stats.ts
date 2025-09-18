export type ProfileStats = {
  points: number;
  streak: number;
  lastStudyDate: string | null;
  updatedAt: string | null;
};

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeProfileStats(row: Record<string, unknown> | null | undefined): ProfileStats {
  return {
    points: toNumber(row?.points),
    streak: toNumber(row?.streak),
    lastStudyDate: (row?.last_study_date as string | null | undefined) ?? null,
    updatedAt: (row?.updated_at as string | null | undefined) ?? null,
  };
}
