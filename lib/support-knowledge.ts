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
    id: "how-generation-limits-work",
    title: "Generation limits explained - Daily quotas per plan",
    summary:
      "Free tier gets standard daily generation limits (refreshes at midnight local time). Plus gets 3x capacity. Premium has unlimited generation.",
    details:
      "GENERATION LIMITS BY PLAN: Free Explorer - Standard daily limits for lesson generation at /generate (approximately 3-5 lessons per day, exact limits tracked via token usage). Limits reset at midnight in your local timezone. If you hit the limit, you'll see a friendly message with options to: wait for reset, upgrade to Plus/Premium, or continue using pre-generated FYP lessons (which don't count toward limits). Plus Momentum ($5.99/mo) - 3x higher daily limits than Free (approximately 15-20 lessons per day). Includes instant retries if generation fails. Premium Creator ($14.99/mo) - UNLIMITED generation—no daily caps or token restrictions. Generate as many lessons as you need. TRACKING USAGE: View your current usage at /analytics in the 'AI Token Usage' section. Shows input tokens, output tokens, and estimated cost. WHY LIMITS EXIST: AI generation is computationally expensive (Cerebras and OpenAI API calls cost money). Limits ensure platform sustainability while keeping Free tier accessible. WORKAROUND: FYP lessons at /fyp are pre-generated and don't count toward your daily limits—unlimited on all plans. Only custom /generate requests count toward limits.",
    tags: ["generation", "limits", "quota", "daily", "free", "plus", "premium", "tokens", "usage", "reset", "upgrade"],
    priority: 1,
  },
  {
    id: "streak-mechanics-detailed",
    title: "Streak system mechanics - How to build and maintain streaks",
    summary:
      "Streaks require completing at least 1 full lesson (lesson + quiz) per calendar day. Resets at midnight local time. Premium users get 1 streak freeze per month.",
    details:
      "STREAK REQUIREMENTS: To maintain your streak, complete at least ONE full lesson (read the lesson content AND submit quiz answers) before midnight in your local timezone. Partially completing a lesson does NOT count—must finish the quiz. TIMEZONE: Streak countdown uses your device's local timezone. If you travel across timezones, streak timing adjusts automatically. VIEWING STREAKS: Check current streak at: /analytics (main dashboard with streak health indicator showing 'Safe' or 'At Risk'), /profile (streak badge), /fyp (streak target tiles showing progress toward today's lesson), /leaderboard (streak rankings). STREAK RESETS: Missing a single day resets your streak to 0. No grace period on Free/Plus plans. PREMIUM STREAK FREEZE: Premium users get 1 streak freeze per month—if you miss a day, streak doesn't reset (automatically applied). Contact support@lernex.net to check freeze status or request manual freeze. BEST PRACTICES: Set daily reminders (enable notifications in /settings), study at consistent time each day, use mobile browser for quick lessons on-the-go, aim for 2-3 lessons to build buffer. RECOVERING STREAKS: If streak resets, start rebuilding immediately—achievements track longest streak and total study days separately. ANALYTICS INSIGHT: /analytics shows 'Active Days (Last 7)' which counts unique study days regardless of streak status—useful for tracking consistency beyond streaks.",
    tags: ["streak", "daily", "consecutive", "maintain", "reset", "timezone", "freeze", "premium", "recovery", "requirements"],
    priority: 2,
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
  {
    id: "quiz-mechanics",
    title: "Quiz system - How quizzes work and affect your progress",
    summary:
      "Each lesson has 3 multiple-choice questions. Earn 10 points per correct answer. Quiz results update mastery scores and adjust difficulty automatically.",
    details:
      "QUIZ FORMAT: Every lesson includes exactly 3 multiple-choice questions with 4 answer options each. Questions test comprehension of the lesson content. After selecting answers, you receive instant feedback with explanations (10-35 words per answer explaining why it's correct or incorrect). SCORING: Earn 10 points for each correct answer (30 points max per lesson). Incorrect answers give 0 points. Points are cumulative and never decrease—view total at /analytics, /profile, or /leaderboard. IMPACT ON LEARNING: Quiz performance directly affects: (1) Mastery Score - accuracy percentage for that subject, visible at /analytics; (2) Difficulty Adjustment - consistently high accuracy (>80%) increases difficulty level (intro → easy → medium → hard), low accuracy (<50%) decreases difficulty; (3) Next Topic Recommendations - AI suggests related topics based on which questions you answered correctly; (4) FYP Personalization - feed prioritizes subjects where you're performing well or struggling (based on settings). NO RETAKES: Once you submit quiz answers for a lesson, you cannot retake that specific lesson's quiz. However, you can study the lesson content and explanations as many times as you want. STRATEGY: Read lesson carefully before answering, use explanations to learn from mistakes, review subject at /analytics to identify weak areas, create playlists of challenging topics to revisit.",
    tags: ["quiz", "questions", "answers", "scoring", "points", "mastery", "difficulty", "feedback", "explanations", "mcq"],
    priority: 3,
  },
  {
    id: "how-fyp-recommendations-work",
    title: "FYP algorithm - How personalized recommendations are generated",
    summary:
      "FYP uses your interests, placement results, quiz performance, likes/dislikes, and mastery scores to select and rank lessons. Adapts in real-time.",
    details:
      "RECOMMENDATION FACTORS: The For You Page algorithm at /fyp considers: (1) Selected Interests - subjects you chose during onboarding (modifiable at /settings); (2) Placement Results - starting difficulty levels from /placement test; (3) Subject Mastery - current accuracy percentage per subject from quiz performance; (4) Difficulty Level - adapts automatically based on recent quiz scores; (5) Feedback Signals - lessons you Liked, Skipped, or Saved (Like = see more similar content, Skip = see less, Save = add to personal collection); (6) Topic Progress - tracks which subtopics you've covered to avoid repetition; (7) Recency - balances between advancing to new topics and reviewing past material. PERSONALIZATION: Each user's FYP feed is unique. Two users with same interests will see different lessons based on individual performance and preferences. ADAPTATION SPEED: Algorithm updates immediately after each quiz—if you score 3/3 on Medium difficulty, next lesson may be Hard. If you score 0/3, next lesson may be easier. DIVERSITY: Algorithm intentionally mixes subjects to prevent burnout—won't show 10 Calculus lessons in a row even if you're doing well. CONTROL: Use Like/Skip/Save buttons frequently to train the algorithm faster. Check /analytics subject insights to see current difficulty and mastery for each subject. CACHE: FYP pre-generates 1-3 lessons ahead for smooth swiping—cache refreshes as you progress. NO MANUAL CONTROLS: Cannot manually set difficulty or filter subjects within FYP (use /generate for full control or create custom playlists).",
    tags: ["fyp", "algorithm", "recommendations", "personalization", "adaptive", "difficulty", "mastery", "how it works", "ai"],
    priority: 4,
  },
  {
    id: "canceling-subscription",
    title: "Canceling subscription - How to downgrade or cancel paid plans",
    summary:
      "Cancel anytime via /pricing page with 2-click process. Takes effect at end of current billing period. 14-day refund guarantee if unsatisfied.",
    details:
      "CANCELLATION PROCESS: (1) Visit /pricing page while logged in; (2) Click 'Manage Subscription' button; (3) Click 'Cancel Subscription' and confirm; (4) Cancellation confirmed immediately—you'll receive email confirmation. TIMING: Cancellation takes effect at the END of your current billing period. You retain full plan benefits (Plus or Premium features) until that date, then automatically downgrade to Free Explorer. NO PRORATING: Canceling mid-cycle does NOT refund unused days—you keep access until period ends. REACTIVATION: Can reactivate canceled subscription anytime before period ends by visiting /pricing and clicking 'Resume Subscription'. After period ends, must sign up again (starts new billing cycle). 14-DAY GUARANTEE: If you cancel within 14 days of initial signup, email support@lernex.net with subject 'Refund Request' for full refund—typically processed within 3-5 business days to original payment method. DOWNGRADE BEHAVIOR: After downgrade to Free, you keep all generated lessons, playlists, analytics history, and points/streaks. You'll hit Free tier generation limits going forward. Collaborative playlist permissions may change (Moderator → Viewer if playlist owner is Premium-only). DATA RETENTION: Canceling does NOT delete your account or data. To delete account entirely, visit /settings → Account Deletion (separate from subscription cancellation). SUPPORT: For cancellation issues, email support@lernex.net or use live chat at /support (Mon-Fri 8am-6pm MT).",
    tags: ["cancel", "subscription", "downgrade", "refund", "billing", "stop", "unsubscribe", "pause", "end"],
    priority: 2,
  },
  {
    id: "upload-pdf-documents",
    title: "Uploading PDFs - Convert documents into lessons",
    summary:
      "Upload PDFs at /generate or /upload to extract text and generate lessons. Max 10MB per file. Works with textbooks, notes, manuals, and study guides.",
    details:
      "PDF UPLOAD PROCESS: (1) Navigate to /generate or /upload; (2) Click 'Upload PDF' or drag-and-drop PDF file; (3) System extracts text from PDF (uses pdf.js library); (4) Review extracted text preview—edit if needed; (5) Select subject and difficulty level; (6) Click 'Generate Lesson' to create AI lesson from PDF content. FILE REQUIREMENTS: Max file size 10MB, PDF format only (not Word docs or images), must contain selectable text (not scanned images—OCR not currently supported). EXTRACTION QUALITY: Works best with: digital textbooks, lecture notes exported as PDF, technical documentation, study guides. May struggle with: scanned handwritten notes, complex layouts with multiple columns, PDFs with mostly images/diagrams. TEXT PREVIEW: After upload, you'll see extracted text preview—if it looks garbled or incomplete, try: re-exporting PDF from original source, copying text manually instead of uploading. GENERATION: After extraction, PDF upload works exactly like pasting text at /generate—same limits apply (Free: standard quota, Plus: 3x, Premium: unlimited). Can generate multiple lessons from single PDF by uploading multiple times and selecting different excerpts. PLAYLISTS: Upload multiple PDFs and generate lessons from each, then organize into playlist at /playlists—perfect for converting course materials into study collections. SUPPORTED FORMATS: Only PDF. For Word docs (.docx), PowerPoint (.pptx), or other formats: export to PDF first, then upload. TROUBLESHOOTING: Upload fails → Check file size (<10MB), ensure PDF isn't password-protected. Text extraction poor → Manually copy-paste text from PDF into /generate text box instead.",
    tags: ["pdf", "upload", "documents", "files", "textbooks", "notes", "convert", "extract", "import", "materials"],
    priority: 5,
  },
  {
    id: "changing-username-email",
    title: "Changing username and email - Update account identifiers",
    summary:
      "Change username at /profile (must be unique, 3-20 characters). Change email at /settings (requires verification). Username visible to friends and leaderboard.",
    details:
      "CHANGING USERNAME: (1) Go to /profile; (2) Click 'Edit Profile'; (3) Enter new username in username field; (4) System checks availability in real-time (shows green checkmark if available, red X if taken); (5) Click 'Save Changes'; (6) Username updated immediately. USERNAME RULES: Must be 3-20 characters, alphanumeric + underscores only (no spaces or special characters), case-insensitive (Username and username are same), cannot use reserved words (admin, support, lernex, etc.), must be unique across all users. USERNAME VISIBILITY: Your username appears on: /friends search results, /leaderboard rankings, shared playlists (as collaborator), friend activity feed. Choose appropriately for public visibility. CHANGING EMAIL: (1) Go to /settings; (2) Click 'Account' section; (3) Enter new email; (4) Click 'Update Email'; (5) Verification email sent to NEW email address; (6) Click verification link in email; (7) Email updated after verification confirmed. EMAIL RULES: Must be valid email format, cannot be already registered to another Lernex account, verification expires after 24 hours (request again if expired). EMAIL USED FOR: Login (if using email auth), password resets, billing notifications, subscription confirmations, support replies. PRIVACY: Email is NEVER shown publicly or to other users (unlike username). IMPORTANT: After changing email, use new email for future logins. Old email will no longer work. USERNAME CHANGE LIMITS: Can change username unlimited times, but changes are immediate and permanent—choose carefully. SUPPORT: Username taken but you believe it's yours → Email support@lernex.net. Email verification not arriving → Check spam folder, try different email provider, contact support.",
    tags: ["username", "email", "change", "update", "edit", "profile", "account", "identifier", "rename"],
    priority: 6,
  },
  {
    id: "deleting-account-data",
    title: "Deleting account - Permanent account and data removal",
    summary:
      "Delete account at /settings → Account Deletion. Requires password confirmation. Deletes all data within 30 days (GDPR compliant). Irreversible.",
    details:
      "ACCOUNT DELETION PROCESS: (1) Go to /settings; (2) Scroll to 'Account Deletion' section; (3) Click 'Delete My Account'; (4) Read deletion warning carefully; (5) Enter your password to confirm; (6) Click 'Confirm Deletion'; (7) Account marked for deletion immediately. WHAT GETS DELETED: ALL user data including: profile information (name, username, email, avatar), lessons and attempts history, analytics data, points and streaks, playlists (owned by you), friend connections, subscription information (billing handled by Stripe), preferences and settings. TIMELINE: Data deletion completes within 30 days per GDPR requirements. Deletion is permanent and irreversible—cannot be undone. SUBSCRIPTIONS: Active subscriptions are automatically canceled upon account deletion. No partial refunds (follow standard cancellation process first if you want to keep data until period ends). SHARED CONTENT: If you created public playlists shared with others, those playlists will be deleted (collaborators lose access). If you're a collaborator on someone else's playlist, you'll be removed but playlist remains. FRIEND CONNECTIONS: Deleted from all friends' friend lists. Your username will no longer appear in searches or leaderboards. ALTERNATIVE TO DELETION: If you just want to stop using Lernex temporarily: cancel subscription (keeps account active on Free plan), disable notifications in /settings, or simply stop logging in (account remains but inactive—data preserved if you return). RE-REGISTRATION: After deletion completes (30 days), you MAY register again with same email—treated as new account with no history. SUPPORT: Accidental deletion or deletion issues → Email support@lernex.net immediately (within 48 hours for best recovery chance). Cannot guarantee data recovery after deletion initiated.",
    tags: ["delete", "account", "removal", "close", "gdpr", "data", "erase", "permanent", "cancel account"],
    priority: 7,
  },
  {
    id: "password-reset-login-issues",
    title: "Password resets and login troubleshooting",
    summary:
      "Reset password at /login → 'Forgot Password' (email reset link). For account lockouts or persistent login issues, use OAuth or contact support.",
    details:
      "PASSWORD RESET PROCESS: (1) Go to /login; (2) Click 'Forgot Password?' link; (3) Enter your account email; (4) Click 'Send Reset Link'; (5) Check email inbox (including spam) for reset email from Lernex; (6) Click reset link in email (expires after 1 hour); (7) Enter new password (min 8 characters); (8) Click 'Reset Password'; (9) Redirected to login—use new password. RESET LINK NOT ARRIVING: Check spam/junk folders, wait 5-10 minutes (email may be delayed), verify you entered correct email address, try different browser or incognito mode, contact support@lernex.net if link doesn't arrive after 30 minutes. LOGIN ISSUES: Can't log in with correct password → Clear browser cookies/cache (Ctrl+Shift+Del), try incognito/private browsing mode, disable browser extensions, try different browser. OAuth (Google) login failing → Ensure popup blockers disabled, verify Google account email matches Lernex registration, check if Google is experiencing outages (check status.google.com). ACCOUNT LOCKOUT: Too many failed login attempts may temporarily lock account (security measure)—wait 15 minutes and try again, or email support@lernex.net or call +1 (866) 555-LEARN for immediate unlock. TWO-FACTOR AUTH (2FA): Lernex currently does NOT support 2FA—feature planned for future release (Premium users get early access when available). PASSWORD REQUIREMENTS: Minimum 8 characters, no maximum, supports letters, numbers, and special characters, case-sensitive. SECURITY BEST PRACTICES: Use unique password (not reused from other sites), consider password manager, enable Google OAuth for easier and more secure login. CHANGING PASSWORD (when logged in): Go to /settings → Security → Change Password → Enter current password and new password → Save. SUPPORT: Persistent login issues after trying all above → Email support@lernex.net with: account email, browser type/version, error messages/screenshots, steps you've tried.",
    tags: ["password", "reset", "login", "forgot", "authentication", "auth", "access", "lockout", "cant login", "sign in"],
    priority: 1,
  },
  {
    id: "notification-settings",
    title: "Notification preferences - Email and push notifications",
    summary:
      "Manage notifications at /settings → Notifications. Control streak reminders, lesson suggestions, friend activity, billing alerts, and product updates.",
    details:
      "NOTIFICATION TYPES: (1) Streak Reminders - daily reminder if you haven't completed a lesson (sent 2 hours before midnight your local time); (2) Lesson Suggestions - weekly digest of recommended topics based on your interests; (3) Friend Activity - alerts when friends achieve milestones, send friend requests, or beat your leaderboard rank; (4) Billing Alerts - payment confirmations, subscription renewals, failed charges, plan changes; (5) Product Updates - new features, platform announcements, maintenance schedules; (6) Support Replies - responses to your support inquiries. MANAGING NOTIFICATIONS: Go to /settings → Notifications → Toggle each notification type ON or OFF individually → Click 'Save Preferences'. EMAIL NOTIFICATIONS: Sent to your account email (change at /settings → Account). Cannot be completely disabled for critical alerts (billing, security, support replies), but can disable all marketing/promotional emails. PUSH NOTIFICATIONS: Currently limited (web app doesn't support push). Native iOS/Android apps (coming Q1 2025) will include full push notification support with granular controls. UNSUBSCRIBE: Can unsubscribe from marketing emails via 'Unsubscribe' link at bottom of any email—does NOT affect account or critical notifications. FREQUENCY CONTROLS: Streak reminders: daily (if needed), Lesson suggestions: weekly, Friend activity: real-time or digest (choose in settings), Billing: immediate (can't disable), Product updates: monthly or major releases only. TIMEZONE: Notifications respect your local timezone (based on device settings). Streak reminders sent 2 hours before YOUR midnight, not server time. RE-ENABLING: Disabled notifications by mistake → Go to /settings → Notifications → Toggle back ON → Save. BEST PRACTICE: Keep streak reminders enabled if maintaining streak is important. Disable friend activity if it's distracting. Keep billing alerts enabled to avoid missed payments. SUPPORT: Not receiving notifications you enabled → Check email spam folder, verify email address correct at /settings, check email provider isn't blocking Lernex emails, contact support@lernex.net.",
    tags: ["notifications", "email", "alerts", "reminders", "settings", "preferences", "push", "digest", "unsubscribe"],
    priority: 8,
  },
  {
    id: "collaborative-playlists-permissions",
    title: "Collaborative playlists - Sharing and permission management",
    summary:
      "Share playlists with collaborators at /playlists. Two roles: Viewer (read-only) and Moderator (can edit). Copy shareable links or invite by email.",
    details:
      "SHARING PLAYLISTS: (1) Create playlist at /playlists → 'New Playlist'; (2) Click playlist to open; (3) Click 'Share' button; (4) Choose sharing method: Copy Link (anyone with link can access based on permissions) OR Invite by Email (search for Lernex users by username/email). PERMISSION ROLES: Viewer - Can view all lessons in playlist, can complete lessons/quizzes, can save lessons to their own playlists, CANNOT add/remove/reorder lessons, CANNOT invite other collaborators. Moderator - All Viewer permissions PLUS can add new lessons, can remove lessons, can reorder via drag-and-drop, can invite other Viewers (but not Moderators—only Owner can add Moderators), can edit playlist name/description. Owner - Full control: all Moderator permissions PLUS can add/remove/change Moderators, can delete entire playlist, can change visibility settings (private/public/shared). VISIBILITY SETTINGS: Private - Only you can see (default for new playlists), no one else can access even with link. Public - Anyone with link can view as Viewer (useful for sharing with large groups, posting on forums, etc.). Shared - Only specific invited collaborators can access based on assigned roles (most secure for team/class playlists). MANAGING COLLABORATORS: View collaborator list in playlist settings → See all Viewers and Moderators → Click 'Remove' to revoke access → Click 'Change Role' to switch between Viewer and Moderator. COLLABORATIVE WORKFLOW: Owner creates playlist and adds initial lessons → Invites team members as Moderators (co-instructors, team leads) → Moderators add relevant lessons from their studies → Owner invites students/learners as Viewers → Viewers study lessons and complete quizzes. USE CASES: Study groups (all Moderators), Classroom settings (teacher Owner, students Viewers), Corporate training (manager Owner, trainers Moderators, employees Viewers), Exam prep cohorts (shared Moderator access). REAL-TIME SYNC: Changes made by any collaborator appear immediately for all others—no refresh needed. PREMIUM FEATURES: Premium plans include team analytics for shared playlists (completion rates, accuracy by collaborator, engagement metrics). LINK EXPIRATION: Shareable links never expire—revoke access by removing collaborators or changing visibility to Private. SUPPORT: Playlist sharing not working → Verify internet connection, check collaborator email is registered Lernex account, ensure playlist visibility not set to Private, contact support@lernex.net if issues persist.",
    tags: ["playlists", "collaboration", "sharing", "permissions", "viewer", "moderator", "owner", "team", "access", "invite"],
    priority: 5,
  },
  {
    id: "achievement-categories-tiers",
    title: "Achievement categories and tier progression",
    summary:
      "7 achievement categories: Progress, Momentum, Precision, Explorer, Weekly, Lifetime, Legendary. 6 tiers: Bronze → Silver → Gold → Platinum → Diamond → Mythic.",
    details:
      "ACHIEVEMENT CATEGORIES EXPLAINED: (1) Progress - Lesson completion milestones (10 lessons, 50 lessons, 100 lessons, 500, 1000, etc.). Rewards consistent learning. (2) Momentum - Streak-based achievements (7-day streak, 30-day streak, 100-day streak, etc.). Rewards daily consistency. (3) Precision - Accuracy targets (75% average accuracy, 90% accuracy, 95% accuracy, perfect lesson streaks). Rewards quality over quantity. (4) Explorer - Trying new subjects and topics (study 3 subjects, study 5 subjects, study 10 subjects, complete lessons in all 6 domains). Rewards breadth of learning. (5) Weekly - Short-term goals (200 points in a week, 500 points in a week, 7 lessons in a week). Resets weekly, can earn multiple times. (6) Lifetime - Cumulative achievements (10,000 total points, 50,000 points, 1,000 total lessons). Tracks all-time progress. (7) Legendary - Rare, difficult accomplishments (top 10 on global leaderboard, 365-day streak, 99% accuracy in subject, etc.). Status symbols. TIER PROGRESSION: Each achievement has 6 tiers representing increasing difficulty: Bronze (easiest, most users unlock), Silver (moderate effort), Gold (dedicated learners), Platinum (serious commitment), Diamond (elite performers), Mythic (top 1% of users, extremely rare). Example: Momentum category → 7-day streak (Bronze), 14-day (Silver), 30-day (Gold), 60-day (Platinum), 180-day (Diamond), 365-day (Mythic). VIEWING ACHIEVEMENTS: Visit /achievements to see all achievements with progress bars showing how close you are to next tier (e.g., '47/50 lessons for Silver Progress'). Green checkmark for unlocked tiers, locked icon for future tiers. EARNING ACHIEVEMENTS: Automatic—no manual claiming required. When you meet requirements, achievement unlocks immediately and badge appears on /achievements. NOTIFICATIONS: Optional achievement unlock notifications (enable at /settings → Notifications). VISIBILITY: Achievements are private by default. Premium users can opt to display select badges on profile visible to friends. MOTIVATION: Achievements designed to encourage: daily consistency (Momentum), deep mastery (Precision), broad exploration (Explorer), long-term commitment (Lifetime/Legendary). ROADMAP VIEW: Each category shows roadmap of upcoming achievements—see what you're working toward next. PARTIAL PROGRESS: Progress tracked in real-time—view at /achievements to see % completion toward next tier. NO TAKEBACKS: Once earned, achievements cannot be lost (even if streak resets or accuracy drops later—badge remains).",
    tags: ["achievements", "badges", "categories", "tiers", "bronze", "silver", "gold", "platinum", "diamond", "mythic", "progression", "roadmap"],
    priority: 6,
  },
  {
    id: "friend-system-detailed",
    title: "Friend system - Requests, connections, and activity feed",
    summary:
      "Add friends at /friends via search. Send requests, accept/decline. View shared activity feed. Compete on friends-only leaderboard.",
    details:
      "FINDING FRIENDS: (1) Go to /friends; (2) Use search bar to find users by name or username; (3) Click user to view profile preview; (4) Click 'Add Friend' to send request. FRIEND REQUESTS: Requests remain 'Pending' until recipient accepts or declines. View pending sent requests at /friends → 'Sent Requests'. View pending received requests at /friends → 'Requests' (red notification badge if unread). Requests never expire—recipient can accept/decline anytime. ACCEPTING/DECLINING: Go to /friends → 'Requests' → Click 'Accept' or 'Decline'. Accepting adds user to your friends list and you to theirs (mutual connection). Declining removes request with no notification to sender. Can block user to prevent future requests (feature in progress). CANCELING REQUESTS: Sent a request by mistake → /friends → 'Sent Requests' → Click 'Cancel' next to user. REMOVING FRIENDS: /friends → Friends list → Click friend → 'Remove Friend' → Confirm. Removes mutual connection—both users removed from each other's lists. No notification sent. Can re-add later by sending new request. ACTIVITY FEED: /friends → 'Activity' tab shows recent friend activity: lessons completed, achievement unlocks, streak milestones, leaderboard position changes. Updates in real-time. Use feed for accountability and motivation. FRIENDS-ONLY LEADERBOARD: /leaderboard → Toggle 'Friends Only' filter to see rankings of just your friends (instead of global rankings). Compare streaks and points with your cohort. PRIVACY: Friends can see: your username, avatar, activity feed (if enabled in /settings), leaderboard rankings, shared playlists. Friends CANNOT see: your email, detailed analytics, private playlists (unless explicitly shared), quiz answers. MUTUAL FRIENDS: When viewing user profile in search, see 'Mutual Friends' count—hover to see names of shared connections. FRIEND SUGGESTIONS: /friends → 'Suggestions' tab shows recommended users based on: shared interests (selected same subjects), similar mastery levels, mutual friends. LIMITS: No maximum number of friends. Can add as many as you want. USE CASES: Study buddies (keep each other accountable), classroom cohorts (all students add each other), professional networks (colleagues upskilling together), competitive motivation (race on leaderboard). SUPPORT: Can't find a user → Verify exact username (case-insensitive), ensure they have public profile, check for typos. Friend request not arriving → Check internet connection, ensure recipient hasn't blocked you, wait a few minutes for sync, contact support@lernex.net if persistent.",
    tags: ["friends", "requests", "social", "connections", "activity", "feed", "add", "remove", "search", "accept", "decline"],
    priority: 7,
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
