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
      "Lernex pairs adaptive lessons, analytics, achievements, playlists, and social learning in one workspace.",
    details:
      "Primary navigation: /fyp (For You feed) surfaces daily micro-lessons; /generate turns notes into AI-crafted lessons; /analytics tracks streaks, accuracy, and token usage; /achievements highlights badge roadmaps; /playlists organises lessons and collaboration; /friends hosts the social feed and leaderboard. Use /pricing to manage plans and /support to contact the team.",
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
      "Open /fyp, react to lessons with Like, Skip, and Save to re-rank subjects, and pin favourites into playlists so the tutor sees what works. Keep streak targets active to keep the feed from cooling down and watch the next-topic hint tile for upcoming concepts.",
    tags: ["for you", "personalisation", "feed", "recommendations", "streak", "playlist"],
    priority: 2,
  },
  {
    id: "ai-lesson-generator",
    title: "AI lesson generator",
    summary: "The Generate page turns study text into micro-lessons and quizzes powered by Cerebras.",
    details:
      "Visit /generate, paste up to two short paragraphs, and choose subject plus difficulty. Lernex uses Cerebras GPT-OSS-120B to return one 80-105 word lesson, three MCQs, and explanations. Add a next-topic hint when you want the tutor to bridge to the next module.",
    tags: ["generate", "lesson", "ai", "cerebras", "quiz", "difficulty"],
    priority: 3,
  },
  {
    id: "analytics-dashboard",
    title: "Analytics dashboard",
    summary:
      "Analytics tracks accuracy, streak momentum, token usage, and subject insights in real time.",
    details:
      "Open /analytics to review lesson attempts, streak health, accuracy trends, active days, and AI token spend. Subject insights list mastery, difficulty, and next topic data so you can plan the next playlist or focus area without guessing.",
    tags: ["analytics", "accuracy", "streak", "token", "usage", "subject", "insights"],
    priority: 4,
  },
  {
    id: "achievements-badges",
    title: "Achievements and badges",
    summary:
      "Achievements showcase badge tiers for progress, momentum, precision, explorer goals, and legendary streaks.",
    details:
      "The /achievements page groups badges into Progress, Momentum, Precision, Explorer, Weekly, Lifetime, and Legendary sets. Each badge tracks Bronze through Mythic tiers with progress meters so you always know the next unlock and how close you are to streak or accuracy milestones.",
    tags: ["achievements", "badges", "streak", "roadmap", "motivation"],
    priority: 5,
  },
  {
    id: "friends-leaderboard",
    title: "Friends and leaderboard",
    summary:
      "Connect with classmates, send or accept requests, and compare streaks and points on the leaderboard.",
    details:
      "Use /friends to discover classmates, review shared interests, and accept invites. The leaderboard tile (also reachable from /leaderboard) ranks streaks and points, and the activity rail spotlights recent lessons so collaboration stays real-time.",
    tags: ["friends", "leaderboard", "social", "collaboration", "streak", "points"],
    priority: 6,
  },
  {
    id: "playlists-collaboration",
    title: "Collaborative playlists",
    summary:
      "Playlists let you organise lessons, keep them private or public, and co-curate sets with teammates.",
    details:
      "From /playlists you can create private or public sets, reorder lessons, invite collaborators as viewers or moderators, and copy share links. Perfect for weekly study plans, cohort drops, or keeping saved lessons tidy.",
    tags: ["playlists", "collaboration", "share", "lessons", "planning"],
    priority: 7,
  },
  {
    id: "support-channels",
    title: "Support channels",
    summary:
      "Support offers live chat, email, walkthrough sessions, and a voice line tailored to urgency.",
    details:
      "Live chat on /support replies in 1-2 minutes Monday-Friday 8a-6p MT. Email support@lernex.net replies within four hours daily. Book a 25 minute walkthrough for cohorts with rolling availability, or call +1 (866) 555-LEARN (tel:+18665555327) for urgent access issues.",
    tags: ["support", "live chat", "email", "walkthrough", "voice", "contact"],
    priority: 0,
  },
  {
    id: "feedback-security",
    title: "Feedback and security contacts",
    summary:
      "Email support@lernex.net for help, feedback@lernex.app for ideas, or security@lernex.app for urgent security reports.",
    details:
      "Support handles troubleshooting, billing, and onboarding help. Send product ideas to feedback@lernex.app and urgent findings to security@lernex.app - security pings the engineering on-call immediately.",
    tags: ["support", "feedback", "security", "email", "contact"],
    priority: 8,
  },
  {
    id: "onboarding-clinic",
    title: "Onboarding clinics",
    summary:
      "Weekly onboarding clinics help new users co-create lesson plans and playlists.",
    details:
      "Reserve the Thursday 25 minute group session from /support to import notes, set up analytics dashboards, and align collaborative playlists for your cohort.",
    tags: ["onboarding", "clinic", "playlists", "lessons", "teams"],
    priority: 9,
  },
  {
    id: "subject-mastery",
    title: "Subject mastery tracking",
    summary:
      "Lernex tracks mastery, difficulty, and next topics per subject so recommendations stay targeted.",
    details:
      "Subject state cards capture course alignment, mastery %, difficulty band, and next topic. The same data feeds the For You feed, playlists, and the subject insight rows in /analytics, so revisiting a topic updates recommendations immediately.",
    tags: ["subject", "mastery", "difficulty", "next topic", "analytics", "recommendations"],
    priority: 10,
  },
  {
    id: "billing-plans",
    title: "Billing and plans",
    summary:
      "Manage subscriptions, payment methods, and invoices from the Pricing area.",
    details:
      "Open /pricing to switch tiers, update billing details, and download invoices. Teams can start a chat from the same page when they need a tailored quote or PO processing.",
    tags: ["billing", "pricing", "subscription", "invoice", "plans"],
    priority: 11,
  },
  {
    id: "help-centre",
    title: "Help centre",
    summary:
      "The help centre at /docs houses setup guides, walkthroughs, and tutorial videos.",
    details:
      "Browse /docs for setup guides, walkthroughs, and short tutorial videos. Articles refresh weekly and are cross-linked from Support quick actions, so you can pair written steps with chat answers.",
    tags: ["docs", "help centre", "guides", "tutorials"],
    priority: 12,
  },
  {
    id: "support-quick-actions",
    title: "Support quick actions and resources",
    summary:
      "Support quick actions jump straight to the help centre, analytics dashboard, or onboarding clinic.",
    details:
      "From /support use Quick Actions to 1) search the help centre at /docs (fresh articles weekly), 2) open /analytics to review streaks and accuracy, and 3) join the Thursday onboarding clinic via /welcome - a 25 minute guided setup call.",
    tags: ["support", "quick actions", "help centre", "analytics", "onboarding", "clinic"],
    priority: 13,
  },
  {
    id: "support-faqs",
    title: "Top support FAQs",
    summary:
      "Common answers cover migrating notes, analytics, collaboration, AI models, and educator setup.",
    details:
      "FAQs on /support remind learners to migrate notes through /generate, check quiz analytics via /analytics and Achievements, collaborate through /friends plus shared playlists, rely on Cerebras GPT-OSS-120B for AI workloads, and email support for educator exports or advanced permissions.",
    tags: ["support", "faq", "generate", "analytics", "friends", "achievements", "educators"],
    priority: 14,
  },
  {
    id: "support-additional-resources",
    title: "Support page additional resources",
    summary:
      "Helpful links surface achievements, friends, and release notes to keep teams aligned.",
    details:
      "Additional resources on /support link to the Achievement roadmap (/achievements), Friends and leaderboard hub (/friends), and release notes (currently surfaced through /analytics) so you can recap what changed before coaching a team.",
    tags: ["support", "resources", "achievements", "friends", "release notes"],
    priority: 15,
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
