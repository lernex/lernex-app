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
      "Lernex is an AI-powered micro-learning platform that combines adaptive lessons, analytics, achievements, playlists, and social learning.",
    details:
      "Lernex transforms dense manuals, curricula, and notes into cinematic micro-lessons (30-120 words) with adaptive quizzes and analytics. Primary navigation includes: /fyp (For You feed with swipeable lesson cards), /generate (convert text into AI lessons using Cerebras GPT-OSS-120B), /analytics (track streaks, accuracy, token usage, subject mastery), /achievements (badge roadmaps from Bronze to Mythic tiers), /playlists (organize and share lesson collections), /friends (social feed and leaderboards), /pricing (plan management), and /support (help center). Built for professionals and students to ramp up skills without burnout.",
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
      "platform",
      "features",
    ],
    priority: 1,
  },
  {
    id: "for-you-feed",
    title: "For You feed (FYP) - Personalized learning experience",
    summary:
      "The FYP at /fyp is a TikTok-style swipeable feed of AI-generated micro-lessons tailored to your interests, skill level, and performance.",
    details:
      "Navigate to /fyp to access your personalized For You feed. Each card contains a micro-lesson (30-120 words) with adaptive quizzes (3 multiple-choice questions). Use Like, Skip, and Save reactions to shape future recommendations—the AI learns your preferences and adjusts subject ranking. Swipe with mouse/touch, use arrow keys, or scroll wheel to navigate. The feed shows streak target tiles and next-topic hints. Lessons are prefetched 1-3 ahead for smooth UX. Your accuracy and engagement patterns automatically adjust difficulty (intro/easy/medium/hard) without manual selection. Save favorites to playlists for later review. Daily engagement maintains your streak and keeps the recommendation engine active.",
    tags: ["fyp", "for you", "feed", "personalisation", "recommendations", "streak", "playlist", "swipe", "lessons", "adaptive", "ai"],
    priority: 2,
  },
  {
    id: "ai-lesson-generator",
    title: "AI lesson generator - Create custom lessons from any text",
    summary: "The /generate page converts your notes, PDFs, or study materials into structured micro-lessons with quizzes using Cerebras AI.",
    details:
      "Navigate to /generate to create custom lessons. Paste up to two short paragraphs of text (study notes, PDF excerpts, manuals, etc.). Select a subject from 6 domains (Math, Science, Computer Science, History, English, Languages) and choose difficulty level (intro/easy/medium/hard). Powered by Cerebras GPT-OSS-120B (fastest AI inference), the system generates one 80-105 word micro-lesson with structure: definition + example + pitfall + next step. Each lesson includes 3 multiple-choice questions with 10-35 word explanations per answer. Optionally add a 'next-topic hint' to guide the AI toward specific follow-up concepts. Generation typically completes in seconds. Free tier has standard limits; Plus gets 3x higher limits; Premium has unlimited generation. LaTeX math is fully supported using \\(...\\) for inline and \\[...\\] for display formulas.",
    tags: ["generate", "lesson", "ai", "cerebras", "quiz", "difficulty", "custom", "create", "pdf", "notes", "text", "latex", "math"],
    priority: 3,
  },
  {
    id: "analytics-dashboard",
    title: "Analytics dashboard - Track your learning metrics in real-time",
    summary:
      "The /analytics page provides comprehensive dashboards showing total attempts, weekly activity, streak momentum, accuracy trends, AI token usage, and per-subject insights.",
    details:
      "Navigate to /analytics to access your learning dashboard. View key metrics: total lesson attempts, weekly attempts, active days (last 7 days), accuracy trends by subject, current streak count, total points earned (10 points per correct answer), and AI token consumption (for billing/quota tracking). The heatmap visualization shows your study activity over time. Subject insights display: mastery percentage (accuracy rate), current difficulty level (intro/easy/medium/hard), next recommended topic, and recent performance. Use analytics to identify weak subjects, track streak health, plan playlists, and monitor your learning patterns. Analytics update in real-time as you complete lessons. Available on all plans; Premium tier includes advanced analytics with exportable reports and deeper personalization insights.",
    tags: ["analytics", "accuracy", "streak", "token", "usage", "subject", "insights", "dashboard", "metrics", "heatmap", "mastery", "performance"],
    priority: 4,
  },
  {
    id: "achievements-badges",
    title: "Achievements and badges - Gamified learning milestones",
    summary:
      "The /achievements page showcases badge tiers across 7 categories (Progress, Momentum, Precision, Explorer, Weekly, Lifetime, Legendary) with Bronze to Mythic progression.",
    details:
      "Visit /achievements to view your badge collection and roadmap. Badges are organized into 7 groups: Progress (lesson completion milestones), Momentum (streak-based achievements), Precision (accuracy targets), Explorer (trying new subjects), Weekly (short-term goals), Lifetime (cumulative achievements), and Legendary (rare, difficult accomplishments). Each badge has tiered progression: Bronze → Silver → Gold → Platinum → Diamond → Mythic. Progress meters show exactly how close you are to the next tier (e.g., '47/50 lessons for Silver Explorer'). Achievements motivate consistent study habits, reward accuracy improvements, and celebrate exploration of new topics. Roadmap cards preview upcoming unlocks. Badges are earned automatically based on your activity—no manual claiming required.",
    tags: ["achievements", "badges", "streak", "roadmap", "motivation", "gamification", "tiers", "progress", "milestones"],
    priority: 5,
  },
  {
    id: "friends-leaderboard",
    title: "Friends and leaderboard - Social learning and competition",
    summary:
      "The /friends page lets you connect with classmates, send friend requests, view shared activity, and compete on leaderboards by streaks and points.",
    details:
      "Navigate to /friends to manage your social connections. Search for users by name or username, send friend requests, accept/decline incoming requests, and view your friends list. The shared activity feed shows recent lessons your friends completed, fostering accountability. Access /leaderboard (also available from /friends) to view global and friends-only rankings. Leaderboards rank by streaks (consecutive study days) and points (10 points per correct quiz answer). Filter by time period: daily, weekly, monthly, or all-time. See how you compare with your cohort and stay motivated through friendly competition. Friend requests remain pending until accepted. You can remove friends anytime. Use social features to create study groups, share playlists, and keep each other accountable during exam prep or skill-building sprints.",
    tags: ["friends", "leaderboard", "social", "collaboration", "streak", "points", "competition", "rankings", "activity", "requests"],
    priority: 6,
  },
  {
    id: "playlists-collaboration",
    title: "Playlists - Organize and share lesson collections",
    summary:
      "Playlists at /playlists let you organize lessons into curated sets, make them private or public, and invite collaborators as viewers or moderators.",
    details:
      "Visit /playlists to create and manage lesson collections. Create new playlists, add lessons from your FYP (using Save button) or from specific lesson pages, and reorder lessons via drag-and-drop. Set visibility: private (only you), public (anyone with link), or shared (specific collaborators). Invite collaborators with two permission levels: Viewer (can see lessons, can't edit) or Moderator (can add/remove/reorder lessons). Copy shareable links to distribute to your team or study group. Perfect use cases: weekly study plans, exam prep collections, onboarding materials for teams, cohort-specific content drops, or organizing saved lessons by topic. Each playlist shows lesson count, last updated timestamp, and collaborator list. Playlists sync across devices in real-time. Available on all plans; Plus and Premium users get priority support for team playlist management.",
    tags: ["playlists", "collaboration", "share", "lessons", "planning", "organize", "teams", "curate", "collections"],
    priority: 7,
  },
  {
    id: "support-channels",
    title: "Support channels - Multiple ways to get help",
    summary:
      "Lernex offers live chat (1-2 min response), email (4-hour response), onboarding walkthroughs (25-min sessions), and a phone line for urgent issues.",
    details:
      "Access support at /support. Live chat available Monday-Friday 8am-6pm Mountain Time (MT) with 1-2 minute response times—fastest for immediate questions. Email support@lernex.net for non-urgent help; responses within ~4 hours daily (7 days/week). Book a 25-minute onboarding walkthrough session (available Thursdays, rolling availability) to import notes, set up analytics, and configure playlists for your team/cohort. Call +1 (866) 555-LEARN for urgent access issues (account lockouts, payment problems). Support handles: troubleshooting, billing questions, plan changes, technical issues, onboarding guidance, feature requests, and general platform questions. Paid plans (Plus/Premium) receive priority concierge support with faster response times.",
    tags: ["support", "live chat", "email", "walkthrough", "voice", "contact", "help", "phone", "response time"],
    priority: 0,
  },
  {
    id: "feedback-security",
    title: "Contact emails - Support, feedback, and security",
    summary:
      "Use support@lernex.net for help/billing, feedback@lernex.app for product ideas, and security@lernex.app for urgent security reports.",
    details:
      "Three specialized email channels: (1) support@lernex.net - troubleshooting, billing, account issues, onboarding help, plan changes (responds within ~4 hours daily); (2) feedback@lernex.app - product ideas, feature requests, usability suggestions, general feedback (reviewed by product team weekly); (3) security@lernex.app - urgent security vulnerabilities, suspicious activity, data concerns (pings engineering on-call immediately for urgent issues). For fastest support, use live chat during business hours (Mon-Fri 8am-6pm MT) via /support. Always include your account email and detailed description when emailing support.",
    tags: ["support", "feedback", "security", "email", "contact", "billing", "help", "vulnerability"],
    priority: 8,
  },
  {
    id: "onboarding-clinic",
    title: "Onboarding clinics - Thursday group sessions for new users",
    summary:
      "Weekly 25-minute Thursday onboarding clinics help new users, teams, and cohorts set up playlists, import notes, and optimize analytics.",
    details:
      "Book onboarding clinics at /welcome or /support. Sessions run every Thursday with rolling availability slots. Each 25-minute group call covers: importing study notes/PDFs via /generate, setting up collaborative playlists for teams, configuring analytics dashboards to track team progress, aligning difficulty levels and subject preferences, and best practices for streak maintenance. Ideal for: cohorts starting together, teams onboarding new hires, educators setting up classroom playlists, study groups coordinating shared content. Clinics are guided by Lernex success team members. Available to all users; Plus/Premium users can request private 1-on-1 sessions. To book, visit /welcome and select an available Thursday slot.",
    tags: ["onboarding", "clinic", "playlists", "lessons", "teams", "walkthrough", "thursday", "group", "setup"],
    priority: 9,
  },
  {
    id: "subject-mastery",
    title: "Subject mastery tracking - Adaptive learning per topic",
    summary:
      "Lernex automatically tracks mastery percentage, difficulty level, and next recommended topic for each subject you study.",
    details:
      "The platform maintains a 'user_subject_state' for every subject you engage with. This state includes: (1) Mastery - accuracy percentage for that subject (calculated from quiz performance); (2) Current difficulty - intro, easy, medium, or hard (adapts based on your accuracy without manual adjustment); (3) Next topic - AI recommendation for what concept to study next; (4) Last updated timestamp. Subject state appears in: /analytics subject insights section, For You feed personalization algorithm, and playlist recommendations. When you revisit a subject, the system updates its state immediately based on your latest performance. This adaptive tracking ensures lessons remain appropriately challenging and build on your existing knowledge. View all subject states at /analytics to identify strengths, weaknesses, and progression paths.",
    tags: ["subject", "mastery", "difficulty", "next topic", "analytics", "recommendations", "adaptive", "tracking", "progression"],
    priority: 10,
  },
  {
    id: "billing-plans",
    title: "Pricing plans - Free, Plus, and Premium tiers",
    summary:
      "Lernex offers three plans: Free Explorer ($0), Plus Momentum ($5.99/mo, was $12.99), and Premium Creator ($14.99/mo, was $29.99).",
    details:
      "Visit /pricing to view and manage plans. FREE EXPLORER ($0 forever): Daily AI warmups, foundational quizzes, standard generation limits, community challenges, streaks, basic analytics. PLUS MOMENTUM ($5.99/month, originally $12.99): 3x higher AI generation limits with instant retries, adaptive study paths tuned to skipped topics, exam playlists, interview drills, printable study guides, priority concierge support. PREMIUM CREATOR ($14.99/month, originally $29.99): Unlimited AI generation across collaborative workspaces, immediate access to beta features, deep personalization with spaced repetition, automated coaching, advanced analytics, exportable reports, API integrations. All plans include: 14-day love-it-or-refund guarantee, cancel anytime (2-click process, no emails/calls), secure Stripe payments (cards + digital wallets), no hidden fees. Teams can request custom quotes via /pricing chat. Upgrade instantly unlocks new features without waiting. Prices in USD; taxes may apply by region.",
    tags: ["billing", "pricing", "subscription", "invoice", "plans", "free", "plus", "premium", "upgrade", "cost", "payment"],
    priority: 11,
  },
  {
    id: "help-centre",
    title: "Help center and documentation at /docs",
    summary:
      "The /docs help center provides setup guides, walkthroughs, tutorial videos, and troubleshooting articles—refreshed weekly.",
    details:
      "Navigate to /docs to access the comprehensive help center. Find: setup guides for new users, feature walkthroughs (FYP, Generate, Analytics, Playlists), video tutorials (short, focused screencasts), troubleshooting articles (common issues and solutions), best practices for teams and educators, and integration guides. Articles are refreshed weekly to stay current with new features. Cross-linked from /support quick actions for easy access during live chat. Use search bar to find specific topics. Help center is available to all users regardless of plan tier. For personalized help beyond documentation, use live chat (Mon-Fri 8am-6pm MT) or email support@lernex.net.",
    tags: ["docs", "help centre", "help center", "guides", "tutorials", "documentation", "videos", "troubleshooting"],
    priority: 12,
  },
  {
    id: "pricing-details",
    title: "Pricing plan comparison and features",
    summary:
      "Detailed breakdown: Free has standard limits and core features; Plus adds 3x limits, adaptive paths, priority support; Premium offers unlimited generation and team features.",
    details:
      "PLAN COMPARISON DETAILS: Free Explorer - good for trying the platform, exploring core features, casual learning. Limitations: standard AI generation limits (sufficient for daily practice but not intensive use), basic analytics only, community support. Plus Momentum ($5.99/mo) - best for serious learners, students in bootcamps/courses, professionals upskilling. Benefits: 3x more lesson generation capacity, adaptive study paths that adjust when you skip topics, exam-focused playlists, interview practice drills, downloadable study guides, priority support (faster response times). Premium Creator ($14.99/mo) - designed for teams, tutors, educators, power users. Benefits: NO generation limits (unlimited lessons), collaborative workspaces for teams, instant beta feature access, advanced spaced repetition algorithms, automated AI coaching, deep analytics with exportable CSV/PDF reports, API access for LMS integration. Both paid plans include: priority email/chat support, advanced playlist collaboration, team analytics dashboards. Billed monthly via Stripe. Annual billing available (contact support for discount). Switch plans anytime—upgrades are instant, downgrades take effect next billing cycle.",
    tags: ["pricing", "plans", "comparison", "features", "limits", "free", "plus", "premium", "upgrade", "billing"],
    priority: 11,
  },
  {
    id: "onboarding-flow",
    title: "New user onboarding - Getting started with Lernex",
    summary:
      "New users go through: Login → Select interests (6 domains) → Choose proficiency levels → Placement test (7 questions) → Auto-generated level map → Start learning on FYP.",
    details:
      "ONBOARDING STEPS: (1) Create account at /login via email or OAuth; (2) Navigate to /onboarding to select learning interests from 6 domains: Math, Science, Computer Science, History, English, Languages—choose as many subjects as you want; (3) At /onboarding/levels, select proficiency for each chosen subject (beginner, intermediate, advanced); (4) Take placement test at /placement - 7 adaptive multiple-choice questions that assess your actual knowledge level across chosen courses; (5) System generates personalized level map (hierarchical structure: Topics → Subtopics → Mini-lessons with prerequisites and applications); (6) Redirected to /post-auth which routes you to /fyp to start learning; (7) Your FYP feed is immediately populated with micro-lessons tailored to your interests, placement results, and proficiency selections. Onboarding takes ~2 minutes total. You can modify interests and levels later in /settings or /profile. Optional: Book Thursday onboarding clinic at /welcome for guided setup with Lernex team.",
    tags: ["onboarding", "getting started", "new user", "setup", "interests", "placement", "test", "level map", "flow"],
    priority: 2,
  },
  {
    id: "streaks-points-system",
    title: "Streaks and points - Gamification and motivation system",
    summary:
      "Earn 10 points per correct quiz answer. Streaks track consecutive days studied. Both visible on /analytics, /profile, and /leaderboard.",
    details:
      "POINTS SYSTEM: Earn 10 points for each correct quiz answer (incorrect answers give 0 points). Points are cumulative and never decrease. View total points on: /analytics dashboard, /profile page, /leaderboard rankings. Points motivate consistent learning and enable competition with friends. STREAKS SYSTEM: Streak = consecutive days with at least one completed lesson. Streak increments when you study on consecutive calendar days (timezone: your local time). Missing a day resets streak to 0. View current streak on: /analytics (with streak health indicator), /profile, FYP streak target tiles. Streaks drive daily engagement and healthy study habits. Both metrics feed into: Achievements/badges (e.g., '30-day streak' badge), Leaderboard rankings (can rank by points or streaks), Social features (friends see your streak in shared activity). Maintaining streaks keeps the For You feed recommendation engine active and engaged. Premium users get streak recovery features (1 freeze per month) to prevent loss from travel/emergencies—contact support to enable.",
    tags: ["streaks", "points", "gamification", "motivation", "rewards", "daily", "consecutive", "quiz", "score"],
    priority: 3,
  },
  {
    id: "subjects-available",
    title: "Available subjects and course catalog",
    summary:
      "Lernex covers 6 main domains with 100+ sub-courses: Math, Science, Computer Science, History, English, and 20+ Languages.",
    details:
      "COMPREHENSIVE SUBJECT CATALOG: MATH - K-12 fundamentals through Calculus, Linear Algebra, Differential Equations, Statistics, Probability, Discrete Math, Topology, Abstract Algebra. SCIENCE - Biology (cellular, molecular, ecology, genetics), Neuroscience, Chemistry (general, organic, physical, biochemistry), Physics (classical, quantum, thermodynamics), Astronomy, Environmental Science. COMPUTER SCIENCE - Programming (Python, JavaScript, Java, C++, Go, Rust), Machine Learning, AI, Data Structures & Algorithms, Databases (SQL, NoSQL), Cybersecurity, Cloud Computing (AWS, Azure, GCP), Web Development, Mobile Development, DevOps, System Design. HISTORY - World History, US History, European History, Ancient Civilizations, Medieval, Modern, Military History, Art History. ENGLISH - Grammar, Composition, Literary Analysis, Creative Writing, Shakespeare, American Literature, British Literature, Poetry, Rhetoric. LANGUAGES - Spanish, French, German, Italian, Portuguese, Mandarin, Japanese, Korean, Arabic, Russian, Hindi, Dutch, Swedish, Polish, Greek, Turkish, Hebrew, Swahili, Thai, Vietnamese, and more. Select interests during onboarding at /onboarding or modify anytime in profile settings. Each subject has adaptive difficulty levels and personalized progression paths.",
    tags: ["subjects", "courses", "catalog", "math", "science", "computer science", "history", "english", "languages", "topics", "available"],
    priority: 4,
  },
  {
    id: "ai-technology",
    title: "AI technology - Cerebras GPT-OSS-120B and OpenAI",
    summary:
      "Lernex uses Cerebras GPT-OSS-120B (fastest inference) as primary AI, with OpenAI as fallback. Streaming generation for real-time lesson creation.",
    details:
      "AI INFRASTRUCTURE: Primary model: Cerebras GPT-OSS-120B - ultra-fast inference engine providing sub-second lesson generation. Cerebras specializes in high-speed AI workloads, enabling instant lesson creation from text input. Fallback model: OpenAI GPT models - used when Cerebras is unavailable or for specific advanced features. GENERATION PROCESS: Input text → AI chunks content into digestible segments → Generates 80-105 word micro-lesson with structure (definition + example + pitfall + next step) → Creates 3 multiple-choice questions with 4 options each → Writes 10-35 word explanations for each answer → Returns formatted lesson with LaTeX math support. STREAMING: Uses streaming responses so users see lesson generation in real-time (progressive loading). USAGE TRACKING: All AI calls are metered (input/output tokens) for rate limiting and billing. Free tier has daily limits, Plus gets 3x capacity, Premium is unlimited. Token usage visible at /analytics. PRIVACY: User data is never used to train models. All AI calls are ephemeral and processed in real-time. See privacy policy at /privacy for full details.",
    tags: ["ai", "cerebras", "openai", "gpt", "model", "technology", "generation", "inference", "machine learning"],
    priority: 13,
  },
  {
    id: "mobile-desktop-sync",
    title: "Cross-device sync and platform availability",
    summary:
      "Lernex runs in any modern browser (desktop, tablet, mobile). Real-time sync across devices. Native mobile apps coming soon.",
    details:
      "PLATFORM AVAILABILITY: Web app works on: Desktop (Windows, Mac, Linux) via Chrome, Firefox, Safari, Edge; Tablets (iPad, Android tablets) via mobile browsers; Smartphones (iOS, Android) via mobile browsers. No installation required—just visit lernex.net. REAL-TIME SYNC: All data syncs instantly across devices: lessons completed, streaks, points, playlists, preferences, analytics. Study on phone during commute, continue on laptop at home—progress is always current. Uses Supabase real-time database for sub-second synchronization. OFFLINE MODE: Limited offline support currently (can view previously loaded lessons). Full offline mode rolling out soon. NATIVE APPS: Native iOS and Android apps in development—coming Q1 2025 (estimated). Premium users get early beta access. Apps will include: push notifications for streak reminders, offline lesson downloads, native sharing, widgets for quick access. Current web app is fully responsive and works well on mobile screens as a Progressive Web App (PWA)—can 'Add to Home Screen' on iOS/Android for app-like experience. Use any device interchangeably without data loss.",
    tags: ["mobile", "desktop", "sync", "cross-device", "platform", "browser", "web", "app", "ios", "android", "offline"],
    priority: 6,
  },
  {
    id: "latex-math-support",
    title: "LaTeX and math rendering support",
    summary:
      "Full LaTeX math support using MathJax. Inline formulas with \\(...\\), display equations with \\[...\\]. Perfect for STEM subjects.",
    details:
      "MATH RENDERING: Lernex fully supports LaTeX mathematical notation via MathJax renderer. SYNTAX: Inline math (within text): \\( formula \\) - example: The formula \\(E = mc^2\\) shows mass-energy equivalence. Display math (centered, larger): \\[ formula \\] - example: \\[ \\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2} \\]. COVERAGE: All standard LaTeX math commands work: fractions, integrals, summations, matrices, Greek letters, subscripts/superscripts, brackets, etc. Example: \\(\\frac{d}{dx}(x^n) = nx^{n-1}\\) renders beautifully. USE IN GENERATION: When creating lessons at /generate with mathematical content, the AI automatically formats equations in LaTeX. You can also manually write LaTeX in text input. BEST PRACTICES: For complex formulas, use display mode \\[...\\]. For simple inline notation, use \\(...\\). Rendering works on all devices (desktop, tablet, mobile). Essential for: Math (Calculus, Linear Algebra, Statistics), Physics, Chemistry, Economics, Engineering. Math renders crisply at all zoom levels and is accessible to screen readers.",
    tags: ["latex", "math", "mathjax", "equations", "formulas", "rendering", "stem", "calculus", "notation"],
    priority: 9,
  },
  {
    id: "account-management",
    title: "Account settings and profile management",
    summary:
      "Manage your account at /profile and /settings: update name, username, email, avatar, interests, password, and delete account.",
    details:
      "PROFILE MANAGEMENT at /profile: Update full name, username (must be unique, 3-20 characters), date of birth, bio/interests list. Upload custom avatar image (JPG/PNG, max 5MB, auto-cropped to square). Change email address (requires verification). View account creation date, current plan tier, streak, and points. SETTINGS at /settings: Change password, enable/disable notifications, adjust privacy settings, manage connected OAuth accounts (Google, etc.), view API keys (Premium only), export data (GDPR compliance), delete account. USERNAME VALIDATION: Check username availability at /profile before saving. Usernames are public and used in /friends search and /leaderboard. INTERESTS: Modify learning interests (Math, Science, CS, History, English, Languages) which affect FYP recommendations and placement test scope. ACCOUNT DELETION: Permanent and irreversible. Deletes all lessons, playlists, attempts, analytics. Cancels active subscriptions. Request via /profile → Account section → Delete Account (requires password confirmation). Data removed within 30 days per GDPR. PRIVACY: All personal data is encrypted at rest and in transit. See /privacy for full privacy policy. Change visibility settings to control what friends can see (activity feed, playlists, etc.).",
    tags: ["account", "profile", "settings", "username", "avatar", "email", "password", "delete", "privacy", "manage"],
    priority: 10,
  },
  {
    id: "educator-teams-use",
    title: "Using Lernex for teams, educators, and classroom settings",
    summary:
      "Educators and teams can create shared playlists, track cohort analytics, assign lessons, and manage collaborative workspaces. Contact support for educator features.",
    details:
      "TEAM/EDUCATOR FEATURES: Create collaborative playlists at /playlists with Viewer or Moderator permissions for students/team members. Share playlist links directly or invite via email. COHORT ANALYTICS: Premium plans include team analytics—view aggregated metrics for all collaborators (completion rates, accuracy by subject, engagement trends). Track which lessons are working and where students struggle. CONTENT CREATION: Use /generate to convert lecture notes, textbooks, syllabi into micro-lessons. Organize into playlists by week/topic. Students access via shared links. CLASSROOM WORKFLOW: (1) Educator creates playlists for each course module; (2) Imports content via /generate; (3) Shares playlist links with class; (4) Students study lessons and complete quizzes; (5) Educator reviews team analytics to identify struggling students; (6) Adjusts difficulty/content based on data. ONBOARDING SUPPORT: Book Thursday onboarding clinic at /welcome for guided setup. Lernex success team helps configure playlists, import content, set up analytics. CUSTOM PLANS: Schools, universities, bootcamps, corporate training teams can request custom pricing with: unlimited seats, SSO integration, LMS connectors (Canvas, Blackboard, Moodle), white-label options, dedicated account manager. Contact support@lernex.net with 'Educator' or 'Teams' in subject line. EXPORT CAPABILITIES: Premium users can export student data, generate progress reports (PDF/CSV), and access API for custom integrations.",
    tags: ["educators", "teams", "classroom", "schools", "cohort", "teaching", "corporate", "training", "workplace", "collaboration"],
    priority: 7,
  },
  {
    id: "placement-test-details",
    title: "Placement test - Adaptive assessment to determine your starting level",
    summary:
      "The placement test at /placement uses 7 adaptive questions to accurately assess your knowledge level across chosen subjects and generate a personalized learning path.",
    details:
      "PLACEMENT TEST PROCESS: Taken after selecting interests and proficiency levels during onboarding. Access at /placement. FORMAT: 7 multiple-choice questions that adapt based on your answers—if you answer correctly, next question is harder; if incorrect, next is easier. Covers subjects you selected in /onboarding. ADAPTIVE ALGORITHM: Starts at your self-reported proficiency level, then adjusts. Uses Item Response Theory (IRT) to efficiently determine true knowledge level with minimal questions. TIMING: ~3-5 minutes total. No time limit per question—take your time. SCORING: Results are private and used only to generate your level map. NOT a pass/fail test—purely diagnostic to personalize content. LEVEL MAP GENERATION: Based on placement results, Lernex auto-generates a hierarchical level map (Topics → Subtopics → Mini-lessons) with appropriate difficulty, prerequisites, and learning sequences. RETAKING: Can retake anytime from /placement if you want to reassess. Useful after studying a subject extensively to unlock harder content. SKIPPING: Can skip placement test during onboarding, but recommendation accuracy will be lower until system learns from your quiz performance. PRIVACY: Placement scores are never shared publicly. Used only for personalization.",
    tags: ["placement", "test", "assessment", "adaptive", "level", "quiz", "onboarding", "evaluation", "knowledge"],
    priority: 5,
  },
  {
    id: "troubleshooting-common-issues",
    title: "Common troubleshooting - Login, generation, sync, payment issues",
    summary:
      "Quick fixes for frequent issues: login problems (clear cookies, try OAuth), generation failures (check limits, refresh), sync delays (check internet), payment errors (verify card, contact support).",
    details:
      "COMMON ISSUES & SOLUTIONS: LOGIN/AUTH: Can't log in → Clear browser cookies/cache, try incognito mode, use OAuth (Google) if email/password fails. Forgot password → Use 'Forgot Password' link at /login. Account locked → Email support@lernex.net or call +1 (866) 555-LEARN. LESSON GENERATION: Generation fails or times out → Check if you've hit daily limits (Free tier), refresh page and retry, try shorter text input (max 2 paragraphs), ensure text is in supported language. Slow generation → Cerebras may be busy, wait 10-15 seconds, fallback to OpenAI may activate automatically. SYNC ISSUES: Changes not appearing on other devices → Check internet connection, hard refresh browser (Ctrl+F5 / Cmd+Shift+R), log out and back in. Streak not updating → Must complete at least 1 full lesson (lesson + quiz) for streak to count, check timezone (streak resets at midnight local time). PAYMENT/BILLING: Card declined → Verify card details, try different card, ensure billing address matches card, contact bank to allow international charges (Stripe processes payments). Charged incorrectly → Email support@lernex.net with invoice number for immediate review. Subscription not activating after payment → Can take 1-2 minutes, refresh page, log out/in, contact support if >10 minutes. GENERAL: Page not loading → Clear cache, disable browser extensions, try different browser. Contact support@lernex.net or use live chat at /support (Mon-Fri 8am-6pm MT) for any unresolved issues. Include: account email, description of problem, error messages, screenshots if possible.",
    tags: ["troubleshooting", "issues", "problems", "login", "generation", "sync", "payment", "errors", "fixes", "help"],
    priority: 1,
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
