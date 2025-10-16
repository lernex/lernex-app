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

const PROHIBITED_SUBSTRING_CATEGORIES = {
  profanity: [
    "fuck",
    "fuk",
    "fck",
    "shit",
    "bullshit",
    "bastard",
    "bitch",
    "cunt",
    "twat",
    "whore",
    "slut",
    "pussy",
    "dick",
    "cock",
    "prick",
    "asshole",
    "a55hole",
    "motherfucker",
    "douche",
    "shithead",
  ],
  sexual: [
    "porn",
    "porno",
    "pornhub",
    "orgasm",
    "clit",
    "clitoris",
    "vagina",
    "penis",
    "cumshot",
    "cumslut",
    "ejaculate",
    "bukake",
    "bukkake",
    "hentai",
    "stripper",
    "camgirl",
    "camwhore",
    "escort",
    "handjob",
    "footjob",
    "blowjob",
    "rimjob",
  ],
  hate: [
    "nigger",
    "n1gger",
    "nigg3r",
    "faggot",
    "f4ggot",
    "fagg0t",
    "spic",
    "wetback",
    "kike",
    "coon",
    "chink",
    "dyke",
    "tranny",
    "retard",
    "retarded",
    "gook",
    "cracker",
  ],
  extremist: [
    "hitler",
    "nazi",
    "skinhead",
    "whitepower",
    "whitepride",
    "heilhitler",
    "siegheil",
    "kkk",
    "klansman",
    "swastika",
    "whitegenocide",
    "gasjews",
    "14words",
    "1488",
    "holohoax",
    "qanon",
  ],
  violence: [
    "schoolshooter",
    "serialkiller",
    "bloodlust",
    "massacre",
    "murder",
    "killshot",
  ],
  selfHarm: [
    "killyourself",
    "killurself",
    "killyoself",
    "suicide",
    "selfharm",
    "selfhate",
    "diealone",
  ],
  exploitation: [
    "rape",
    "rapist",
    "molest",
    "molester",
    "pedophile",
    "pedo",
    "childporn",
    "childabuse",
    "childabuser",
    "childsex",
    "kidsex",
    "underage",
    "underaged",
    "incest",
    "groomer",
    "bestiality",
    "zoophile",
  ],
  drugs: [
    "methlab",
    "methhead",
    "cocaine",
    "crackhead",
    "lsd",
    "mdma",
    "ecstasy",
    "fentanyl",
    "weedlord",
  ],
} as const;

const PROHIBITED_SUBSTRINGS = Object.values(PROHIBITED_SUBSTRING_CATEGORIES).flat();

const PROHIBITED_PATTERNS: RegExp[] = [
  /k(?:i|1)ll(?:ur|yo|ya|yr|y0)?self/,
  /s(?:u|0)icide/,
  /die(?:alone|bitch|now)/,
  /(?:m|rn)otherf(?:u|v)cker/,
  /(?:co|ku|gu)m(?:slut|dump|whore|shot)/,
  /(?:child|kid|baby)(?:porn|sex|molest|abuse)/,
  /(?:white|aryan)(?:power|pride|supremacy)/,
  /(?:gas|kill)(?:the)?jews/,
  /(?:heil|sieg)hitler/,
  /(?:terror|bomb|shoot)(?:theschool|school|class)/,
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
  ["*", "x"],
  ["+", "t"],
  ["|", "i"],
  ["(", "c"],
  [")", "c"],
  ["[", "c"],
  ["]", "c"],
  ["{", "c"],
  ["}", "c"],
  ["<", "c"],
  [">", "c"],
  ["&", "and"],
  ["\\u20ac", "e"],
  ["\\u00a3", "l"],
  ["\\u00a5", "y"],
  ["\\u00bf", "i"],
  ["\\u00a2", "c"],
  ["\\u00a4", "o"],
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

const CONFUSABLE_SUBSTITUTIONS = new Map<string, string>([
  ["\u0430", "a"], // Cyrillic a
  ["\u03b1", "a"], // Greek alpha
  ["\u00e5", "a"],
  ["\u00f8", "o"],
  ["\u03bf", "o"], // Greek omicron
  ["\u043e", "o"], // Cyrillic o
  ["\u00df", "ss"],
  ["\u0111", "d"],
  ["\u00f0", "d"],
  ["\u03b5", "e"], // Greek epsilon
  ["\u0435", "e"], // Cyrillic e
  ["\u03b9", "i"], // Greek iota
  ["\u0456", "i"],
  ["\u0131", "i"],
  ["\u03ba", "k"],
  ["\u043a", "k"],
  ["\u0441", "c"], // Cyrillic c
  ["\u03c3", "s"],
  ["\u0153", "oe"],
  ["\u03c1", "p"],
  ["\u0440", "p"],
  ["\u03c7", "x"],
  ["\u0445", "x"],
  ["\u03c5", "y"],
  ["\u0443", "y"],
  ["\u0142", "l"],
  ["\u03bb", "l"],
]);

function normalizeBase(input: string) {
  const normalized = input
    .normalize("NFKD")
    .replace(combiningMarksRegex, "")
    .toLowerCase();
  return Array.from(normalized)
    .map((char) => CONFUSABLE_SUBSTITUTIONS.get(char) ?? char)
    .join("");
}

function substituteLeetSpeak(input: string) {
  return Array.from(input)
    .map((char) => SUBSTITUTIONS.get(char) ?? char)
    .join("");
}

function collapseRuns(input: string) {
  return input.replace(/(.)\1+/g, "$1");
}

function containsKillYourselfAbbreviation(value: string) {
  if (!value) return false;
  if (value === "kys") return true;
  if (/^kys[0-9]+$/.test(value)) return true;
  if (/^[0-9]+kys$/.test(value)) return true;
  if (/(?:^|[0-9])kys(?:$|[0-9])/.test(value)) return true;
  return false;
}

function isProhibitedVariant(value: string) {
  if (!value) return false;
  if (containsKillYourselfAbbreviation(value)) {
    return true;
  }
  for (const bad of PROHIBITED_SUBSTRINGS) {
    if (value.includes(bad)) {
      return true;
    }
  }
  for (const pattern of PROHIBITED_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) {
      return true;
    }
  }
  return false;
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
    const variants = new Set<string>([collapsed]);
    const squashed = collapseRuns(collapsed);
    if (squashed && squashed !== collapsed) {
      variants.add(squashed);
    }
    for (const variant of variants) {
      if (isProhibitedVariant(variant)) {
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



