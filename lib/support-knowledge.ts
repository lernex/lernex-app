export type SupportKnowledgeEntry = {
  id: string;
  title: string;
  summary: string;
  details: string;
  tags: string[];
  priority: number;
};

const WORD_RE = /[a-z0-9]+/g;

function tokenize(value: string): string[] {
  const matches = value.toLowerCase().match(WORD_RE);
  if (!matches) return [];
  return matches.filter((token) => token.length >= 2);
}

export const supportKnowledgeBase: SupportKnowledgeEntry[] = [
  {
    id: "platform-pillars",
    title: "Lernex platform pillars",
    summary:
      "Lernex blends personalised lessons, an AI tutor, rich analytics, achievements, playlists, and social learning.",
    details:
      "The For You feed queues daily micro-lessons, Generate converts notes into lessons with Cerebras GPT-OSS-120B, Playlists let you organise or share study tracks, Analytics tracks accuracy, streaks, and token usage, and Achievements plus Friends keep motivation high.",
    tags: [
      "overview",
      "lessons",
      "generate",
      "cerebras",
      "analytics",
      "achievements",
      "playlists",
      "friends",
      "for you",
      "leaderboard",
    ],
    priority: 1,
  },
  {
    id: "for-you-feed",
    title: "Personalising the For You feed",
    summary:
      "Shape recommendations by reacting to lessons, maintaining streak goals, and curating playlists.",
    details:
      "Use likes, skips, and saves to tune subjects, set streak goals to keep the feed focused, and add standout lessons to collaborative playlists so the AI adapts to what resonates.",
    tags: ["for you", "personalisation", "feed", "recommendations", "streak", "playlist"],
    priority: 2,
  },
  {
    id: "ai-lesson-generator",
    title: "AI lesson generator",
    summary: "The Generate page turns study text into micro-lessons and quizzes powered by Cerebras.",
    details:
      "Paste up to two short paragraphs, choose subject and difficulty, and Lernex returns an 80-105 word lesson plus three MCQs with explanations. Use next-topic hints to align the AI tutor with ongoing coursework.",
    tags: ["generate", "lesson", "ai", "cerebras", "quiz", "difficulty"],
    priority: 3,
  },
  {
    id: "analytics-dashboard",
    title: "Analytics dashboard",
    summary:
      "Analytics tracks accuracy, streak momentum, token usage, costs, and subject insights in real time.",
    details:
      "Review lesson attempts, streak health, accuracy trends, and AI token spend. Subject insights highlight mastery, next topics, and recent activity so you know where to focus next.",
    tags: ["analytics", "accuracy", "streak", "token", "usage", "subject", "insights"],
    priority: 4,
  },
  {
    id: "achievements-badges",
    title: "Achievements and badges",
    summary:
      "Achievements showcase badge tiers for progress, momentum, precision, explorer goals, and legendary streaks.",
    details:
      "Track progress toward Bronze through Mythic badges, view roadmap cards that surface the next unlocks, and celebrate streak milestones or perfect runs without leaving the dashboard.",
    tags: ["achievements", "badges", "streak", "roadmap", "motivation"],
    priority: 5,
  },
  {
    id: "friends-leaderboard",
    title: "Friends and leaderboard",
    summary:
      "Connect with classmates, send or accept requests, and compare streaks and points on the leaderboard.",
    details:
      "The Friends area highlights recent activity, shared interests, and mutual friends. Leaderboard standings and friend prompts keep collaboration lively.",
    tags: ["friends", "leaderboard", "social", "collaboration", "streak", "points"],
    priority: 6,
  },
  {
    id: "playlists-collaboration",
    title: "Collaborative playlists",
    summary:
      "Playlists let you organise lessons, keep them private or public, and co-curate sets with teammates.",
    details:
      "Create playlists, invite collaborators, copy or share links, and lock sensitive tracks when needed. Great for building weekly study plans or cohort curricula.",
    tags: ["playlists", "collaboration", "share", "lessons", "planning"],
    priority: 7,
  },
  {
    id: "support-channels",
    title: "Support channels",
    summary:
      "Support offers live chat, email, walkthrough sessions, and a voice line tailored to urgency.",
    details:
      "Live chat replies in 1-2 minutes weekdays, the email desk answers within four hours daily, book a 25 minute walkthrough for teams, and call +1 (866) 555-LEARN for urgent access issues.",
    tags: ["support", "live chat", "email", "walkthrough", "voice", "contact"],
    priority: 0,
  },
  {
    id: "feedback-security",
    title: "Feedback and security contacts",
    summary:
      "Email support@lernex.net for help, feedback@lernex.app for ideas, or security@lernex.app for urgent security reports.",
    details:
      "The support desk adds guides within two days when gaps appear. Security escalations jump straight to the engineering on-call.",
    tags: ["support", "feedback", "security", "email", "contact"],
    priority: 8,
  },
  {
    id: "onboarding-clinic",
    title: "Onboarding clinics",
    summary:
      "Weekly onboarding clinics help new users co-create lesson plans and playlists.",
    details:
      "Join the Thursday 25 minute group session to import notes, clarify analytics, and align playlists with your cohort.",
    tags: ["onboarding", "clinic", "playlists", "lessons", "teams"],
    priority: 9,
  },
  {
    id: "subject-mastery",
    title: "Subject mastery tracking",
    summary:
      "Lernex tracks mastery, difficulty, and next topics per subject so recommendations stay targeted.",
    details:
      "Subject state cards note current course alignment, mastery percentage, difficulty bands, and next topics, which power both For You recommendations and analytics nudges.",
    tags: ["subject", "mastery", "difficulty", "next topic", "analytics", "recommendations"],
    priority: 10,
  },
  {
    id: "billing-plans",
    title: "Billing and plans",
    summary:
      "Manage subscriptions, payment methods, and invoices from the Pricing area.",
    details:
      "Switch tiers, update billing details, download invoices, or chat with support for team-level quote adjustments.",
    tags: ["billing", "pricing", "subscription", "invoice", "plans"],
    priority: 11,
  },
  {
    id: "help-centre",
    title: "Help centre",
    summary:
      "The help centre at /docs houses setup guides, walkthroughs, and tutorial videos.",
    details:
      "Articles refresh weekly and pair with live sessions so you can reference written steps alongside chat summaries.",
    tags: ["docs", "help centre", "guides", "tutorials"],
    priority: 12,
  },
];

function computeScore(entry: SupportKnowledgeEntry, queryTokens: string[]): number {
  if (queryTokens.length === 0) {
    return 0;
  }
  const tagTokens = entry.tags.flatMap((tag) => tokenize(tag));
  const textTokens = tokenize(`${entry.title} ${entry.summary} ${entry.details}`);
  let score = 0;
  for (const token of queryTokens) {
    if (tagTokens.includes(token)) {
      score += 4;
    }
    if (textTokens.includes(token)) {
      score += 1;
    }
  }
  return score;
}

export function rankSupportKnowledge(query: string | null | undefined, limit = 4): SupportKnowledgeEntry[] {
  const normalized = typeof query === "string" ? query.trim().toLowerCase() : "";
  const queryTokens = tokenize(normalized);

  if (queryTokens.length === 0) {
    return supportKnowledgeBase
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .slice(0, limit);
  }

  const scored = supportKnowledgeBase
    .map((entry) => ({
      entry,
      score: computeScore(entry, queryTokens),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.entry.priority - b.entry.priority;
    })
    .slice(0, limit);

  if (scored.length > 0) {
    return scored.map((item) => item.entry);
  }

  return supportKnowledgeBase
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .slice(0, limit);
}
