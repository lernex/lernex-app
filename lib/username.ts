const MIN_LENGTH = 3;
const MAX_LENGTH = 20;
const ALLOWED_PATTERN = /^[a-zA-Z0-9_]+$/;

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "support",
  "moderator",
  "staff",
  "owner",
  "root",
  "lernex",
  "help",
  "system",
]);

const PROHIBITED_SUBSTRINGS = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "whore",
  "slut",
  "nigger",
  "faggot",
  "spic",
  "kike",
  "coon",
  "chink",
  "pussy",
  "rape",
  "rapist",
  "hitler",
  "nazi",
  "cock",
  "dick",
  "dyke",
  "asshole",
];

const SUBSTITUTIONS = new Map<string, string>([
  ["0", "o"],
  ["1", "l"],
  ["2", "z"],
  ["3", "e"],
  ["4", "a"],
  ["5", "s"],
  ["6", "g"],
  ["7", "t"],
  ["8", "b"],
  ["9", "g"],
  ["@", "a"],
  ["$", "s"],
  ["!", "i"],
  ["%", "o"],
  ["#", "h"],
]);

export type UsernameValidationCode =
  | "ok"
  | "too-short"
  | "too-long"
  | "invalid-characters"
  | "reserved"
  | "inappropriate";

export type UsernameValidationResult =
  | { ok: true; code: "ok"; normalized: string; comparable: string }
  | { ok: false; code: Exclude<UsernameValidationCode, "ok">; message: string };

const combiningMarksRegex = /[\u0300-\u036f]/g;

function normalizeBase(input: string) {
  return input
    .normalize("NFKD")
    .replace(combiningMarksRegex, "")
    .toLowerCase();
}

function substituteLeetSpeak(input: string) {
  return Array.from(input)
    .map((char) => SUBSTITUTIONS.get(char) ?? char)
    .join("");
}

export function collapseForScreening(username: string) {
  return substituteLeetSpeak(normalizeBase(username)).replace(/[^a-z0-9]/g, "");
}

export function normalizeForComparison(username: string) {
  return normalizeBase(username);
}

export function escapeForILike(value: string) {
  return value.replace(/([%_\\])/g, "\\$1");
}

export function validateUsername(raw: string): UsernameValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, code: "too-short", message: "Username is required." };
  }
  if (trimmed.length < MIN_LENGTH) {
    return { ok: false, code: "too-short", message: `At least ${MIN_LENGTH} characters.` };
  }
  if (trimmed.length > MAX_LENGTH) {
    return { ok: false, code: "too-long", message: `At most ${MAX_LENGTH} characters.` };
  }
  if (!ALLOWED_PATTERN.test(trimmed)) {
    return {
      ok: false,
      code: "invalid-characters",
      message: "Use letters, numbers, or underscores only.",
    };
  }
  const comparable = normalizeForComparison(trimmed);
  if (RESERVED_USERNAMES.has(comparable)) {
    return { ok: false, code: "reserved", message: "That username is reserved." };
  }
  const collapsed = collapseForScreening(trimmed);
  if (collapsed.length) {
    for (const bad of PROHIBITED_SUBSTRINGS) {
      if (collapsed.includes(bad)) {
        return { ok: false, code: "inappropriate", message: "That username isn't allowed." };
      }
    }
  }
  return { ok: true, code: "ok", normalized: trimmed, comparable };
}

export const USERNAME_CONSTANTS = {
  MIN_LENGTH,
  MAX_LENGTH,
  pattern: ALLOWED_PATTERN,
};
