export type ProfileBasics = {
  interests: string[];
  levelMap: Record<string, string>;
  placementReady: boolean;
};

function normalizeInterests(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const dedup = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    dedup.add(trimmed);
  }
  return Array.from(dedup);
}

function normalizeLevelMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    const key = typeof k === "string" ? k.trim() : "";
    const val = v.trim();
    if (!key || !val) continue;
    out[key] = val;
  }
  return out;
}

export type ProfileBasicsSource = {
  interests?: unknown;
  level_map?: unknown;
  placement_ready?: unknown;
} | null | undefined;

export function normalizeProfileBasics(source: ProfileBasicsSource): ProfileBasics {
  const interests = normalizeInterests(source?.interests);
  const levelMap = normalizeLevelMap(source?.level_map);
  const placementReady = source?.placement_ready === true;
  return { interests, levelMap, placementReady };
}
