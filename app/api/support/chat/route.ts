import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { cookies } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { take } from '@/lib/rate';
import { checkUsageLimit, logUsage } from '@/lib/usage';
import type { Database } from '@/lib/types_db';
import { rankSupportKnowledge, type SupportKnowledgeEntry } from '@/lib/support-knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORT_MODEL = process.env.CEREBRAS_SUPPORT_MODEL ?? 'gpt-oss-120b';
const SUPPORT_TEMPERATURE = Number(process.env.CEREBRAS_SUPPORT_TEMPERATURE ?? '0.35');
const SUPPORT_MAX_TOKENS = Number(process.env.CEREBRAS_SUPPORT_MAX_TOKENS ?? '768');
const CEREBRAS_BASE_URL = process.env.CEREBRAS_BASE_URL ?? 'https://api.cerebras.ai/v1';
const SUPPORT_EMAIL = 'support@lernex.net';
const WEBSITE_CONTEXT = [
  '╔═══════════════════════════════════════════════════════════════════════════╗',
  '║                       LERNEX PLATFORM REFERENCE                           ║',
  '║              AI-Powered Micro-Learning Platform (lernex.net)              ║',
  '╚═══════════════════════════════════════════════════════════════════════════╝',
  '',
  '📖 PLATFORM OVERVIEW:',
  '   Lernex transforms dense materials (PDFs, textbooks, notes) into cinematic micro-lessons',
  '   (30-120 words) with adaptive quizzes, real-time analytics, and gamification. Built for',
  '   professionals, students, teams, and educators to master skills without burnout.',
  '',
  '🤖 AI TECHNOLOGY:',
  '   • Primary: Cerebras GPT-OSS-120B (ultra-fast inference, sub-second generation)',
  '   • Fallback: OpenAI GPT models (when Cerebras unavailable or for advanced features)',
  '   • Streaming: Real-time progressive generation for better UX',
  '   • Privacy: User data never used to train models, ephemeral processing',
  '',
  '═══════════════════════════════════════════════════════════════════════════',
  'CORE PAGES & FEATURES:',
  '═══════════════════════════════════════════════════════════════════════════',
  '',
  '🎯 /fyp (For You Page) — Primary Learning Interface',
  '   • TikTok-style swipeable feed of personalized micro-lessons',
  '   • Each card: 30-120 word lesson + 3 multiple-choice quiz questions',
  '   • Adaptive algorithm based on: interests, placement test, quiz performance, likes/dislikes, mastery',
  '   • Controls: Swipe, arrow keys, scroll wheel navigation',
  '   • Actions: Like (see more similar), Skip (see less), Save (add to collection)',
  '   • Prefetching: 1-3 lessons ahead for smooth experience',
  '   • Unlimited on all plans (does NOT count toward generation limits)',
  '',
  '✍️ /generate — Custom Lesson Creation',
  '   • Input: Paste text (up to 2 short paragraphs) or upload PDF (max 10MB)',
  '   • Select: Subject (6 domains) + Difficulty (intro/easy/medium/hard)',
  '   • Output: 80-105 word structured lesson (definition + example + pitfall + next step)',
  '   • Includes: 3 MCQs with 10-35 word explanations per answer',
  '   • LaTeX: Full math support (inline \\(...\\), display \\[...\\])',
  '   • Limits: Free (standard daily quota), Plus (3x capacity), Premium (unlimited)',
  '   • Reset: Daily limits reset at midnight local timezone',
  '',
  '📊 /analytics — Progress Dashboard',
  '   • Metrics: Total attempts, weekly attempts, active days (last 7), accuracy by subject',
  '   • Gamification: Streak count, points earned (10 per correct answer), weekly goals (200 pts)',
  '   • Visualizations: Heatmap calendar, accuracy trends, token usage',
  '   • Subject Insights: Mastery %, difficulty level, next topic recommendations',
  '   • Updates: Real-time across all devices',
  '   • Export: Premium users can export reports (PDF/CSV)',
  '',
  '🏆 /achievements — Badge System',
  '   • Categories: Progress, Momentum, Precision, Explorer, Weekly, Lifetime, Legendary',
  '   • Tiers: Bronze → Silver → Gold → Platinum → Diamond → Mythic',
  '   • Progress: Real-time meters showing path to next unlock (e.g., "47/50 lessons")',
  '   • Earning: Automatic based on activity (no manual claiming)',
  '   • Visibility: Private by default; Premium users can display on profile',
  '',
  '📚 /playlists — Lesson Collections',
  '   • Create curated lesson sets for studying, team onboarding, exam prep',
  '   • Visibility: Private (you only), Public (anyone with link), Shared (specific collaborators)',
  '   • Permissions: Viewer (read-only), Moderator (can edit), Owner (full control)',
  '   • Features: Drag-and-drop reordering, shareable links, real-time sync',
  '   • Team Analytics: Premium includes completion rates, accuracy by collaborator',
  '',
  '👥 /friends — Social Learning',
  '   • Search users by name/username, send/accept/decline friend requests',
  '   • Activity Feed: See friends\' lessons, achievements, streak milestones',
  '   • Mutual Friends: View shared connections when searching',
  '   • Suggestions: Recommended users based on shared interests, similar mastery',
  '   • Privacy: Friends see username, avatar, activity (if enabled), leaderboard; NOT email or detailed analytics',
  '',
  '🥇 /leaderboard — Rankings',
  '   • Global rankings: All users on platform',
  '   • Friends-only: Filter to just your connections',
  '   • Metrics: Streaks (consecutive days) or Points (quiz score)',
  '   • Time periods: Daily, weekly, monthly, all-time',
  '',
  '📝 /placement — Adaptive Assessment',
  '   • When: After onboarding (selecting interests and proficiency)',
  '   • Format: 7 adaptive multiple-choice questions',
  '   • Adaptive: Adjusts difficulty based on answers (IRT algorithm)',
  '   • Duration: ~3-5 minutes, no time limit per question',
  '   • Output: Personalized level map (Topics → Subtopics → Mini-lessons)',
  '   • Retaking: Can retake anytime to reassess and unlock harder content',
  '',
  '⚙️ /settings — Account Configuration',
  '   • Account: Change email (requires verification), password, delete account',
  '   • Notifications: Streak reminders, lesson suggestions, friend activity, billing, updates',
  '   • Privacy: Activity feed visibility, profile display settings',
  '   • OAuth: Manage connected accounts (Google)',
  '   • API Keys: Premium users get API access',
  '   • Export: Download all data (GDPR compliant)',
  '',
  '👤 /profile — User Profile',
  '   • Edit: Full name, username (3-20 chars, alphanumeric + underscores, unique)',
  '   • Avatar: Upload image (JPG/PNG, max 5MB) or use URL',
  '   • Interests: Modify learning domains (affects FYP recommendations)',
  '   • Stats: View account creation date, plan tier, streak, points',
  '   • Username Check: Real-time availability checking',
  '',
  '🎓 /onboarding — New User Setup',
  '   • Step 1: /login (email or Google OAuth)',
  '   • Step 2: /onboarding (select interests from 6 domains)',
  '   • Step 3: /onboarding/levels (choose proficiency per subject)',
  '   • Step 4: /placement (7-question adaptive test)',
  '   • Step 5: Auto-generated level map',
  '   • Step 6: Redirect to /fyp to start learning',
  '   • Duration: ~2 minutes total',
  '',
  '💬 /support — Help Center',
  `   • Live chat: Mon-Fri 8am-6pm MT (1-2 minute response time) — FASTEST`,
  `   • Email: ${SUPPORT_EMAIL} (~4 hour response, 7 days/week) — DETAILED HELP`,
  '   • Phone: +1 (866) 555-LEARN (urgent access issues only)',
  '   • Onboarding Clinic: Book 25-minute Thursday sessions at /welcome (team setup)',
  '   • Docs: /docs for guides, tutorials, troubleshooting',
  '',
  '📄 /docs — Documentation',
  '   • Setup guides for new users',
  '   • Feature walkthroughs (FYP, Generate, Analytics, Playlists)',
  '   • Video tutorials (short screencasts)',
  '   • Troubleshooting articles',
  '   • Best practices for teams/educators',
  '   • Refreshed weekly with new content',
  '',
  '═══════════════════════════════════════════════════════════════════════════',
  'PRICING PLANS:',
  '═══════════════════════════════════════════════════════════════════════════',
  '',
  '🆓 FREE EXPLORER ($0 forever):',
  '   • Daily AI-generated micro-lessons',
  '   • Standard generation limits (approximately 3-5 lessons/day at /generate)',
  '   • Interactive quizzes with instant feedback',
  '   • Streak tracking and basic analytics',
  '   • Community challenges',
  '   • Unlimited FYP lessons (pre-generated, don\'t count toward limits)',
  '',
  '⚡ PLUS MOMENTUM ($5.99/month, originally $12.99):',
  '   • 3x higher generation limits (approximately 15-20 lessons/day)',
  '   • Instant retries if generation fails',
  '   • Adaptive study paths (adjusts when you skip topics)',
  '   • Exam-focused playlists',
  '   • Interview practice drills',
  '   • Downloadable study guides (PDF flashcards)',
  '   • Priority concierge support (faster response times)',
  '   • Advanced analytics with weekly insights',
  '   • Early beta feature access',
  '',
  '🌟 PREMIUM CREATOR ($14.99/month, originally $29.99):',
  '   • UNLIMITED AI generation (no daily caps or token restrictions)',
  '   • Collaborative workspaces for teams',
  '   • Team analytics (cohort metrics, completion rates, accuracy by subject)',
  '   • Immediate beta feature access',
  '   • Advanced spaced repetition algorithms',
  '   • Real-time AI coaching',
  '   • Exportable analytics reports (PDF/CSV)',
  '   • API access and LMS integrations',
  '   • 1 streak freeze per month (auto-applied if you miss a day)',
  '   • White-label options',
  '   • Dedicated account manager (enterprise)',
  '',
  '💳 PAYMENT DETAILS:',
  '   • Processor: Stripe (secure card + digital wallet payments)',
  '   • Billing: Monthly recurring subscription',
  '   • Guarantee: 14-day love-it-or-refund (email support@lernex.net with "Refund Request")',
  '   • Cancellation: /pricing → "Manage Subscription" → "Cancel" (2-click process)',
  '   • Timing: Cancellation takes effect at end of current billing period (no prorating)',
  '   • Reactivation: Can resume anytime before period ends at /pricing',
  '   • No hidden fees',
  '',
  '═══════════════════════════════════════════════════════════════════════════',
  'GAMIFICATION SYSTEMS:',
  '═══════════════════════════════════════════════════════════════════════════',
  '',
  '🔥 STREAKS:',
  '   • Requirement: Complete ≥1 full lesson (lesson + quiz) per calendar day',
  '   • Timing: Resets at midnight local timezone (device-based)',
  '   • Viewing: /analytics, /profile, /fyp streak tiles, /leaderboard',
  '   • Reset: Missing a day resets to 0 (no grace period on Free/Plus)',
  '   • Premium Freeze: 1 auto-applied freeze per month (contact support to check status)',
  '   • Best Practice: Complete 2-3 lessons daily for buffer, enable notifications 2hrs before midnight',
  '',
  '⭐ POINTS:',
  '   • Earning: 10 points per correct quiz answer (max 30 per lesson)',
  '   • Cumulative: Points never decrease',
  '   • Viewing: /analytics, /profile, /leaderboard',
  '   • Weekly Goal: 200 points/week (appears on /analytics dashboard)',
  '   • Use: Drives achievements, leaderboard rankings, social competition',
  '',
  '🎮 QUIZZES:',
  '   • Format: Exactly 3 multiple-choice questions per lesson, 4 options each',
  '   • Feedback: Instant explanations (10-35 words per answer)',
  '   • Scoring: 10 points per correct, 0 for incorrect',
  '   • Impact: Updates mastery score, adjusts difficulty, influences FYP recommendations',
  '   • No Retakes: Cannot retake same lesson quiz (but can review content unlimited)',
  '   • Accuracy Thresholds: >80% increases difficulty, <50% decreases difficulty',
  '',
  '═══════════════════════════════════════════════════════════════════════════',
  'AVAILABLE SUBJECTS (100+ courses):',
  '═══════════════════════════════════════════════════════════════════════════',
  '',
  '📐 MATH (38 levels):',
  '   K-12, Pre-Algebra, Algebra 1/2, Geometry, Trigonometry, Pre-Calculus, Calculus 1/2/3,',
  '   Linear Algebra, Differential Equations, Statistics, Probability, Discrete Math,',
  '   Abstract Algebra, Topology, Number Theory, Real Analysis, Complex Analysis',
  '',
  '🔬 SCIENCE (37 levels):',
  '   Biology (cellular, molecular, ecology, genetics), Neuroscience, Anatomy, Microbiology,',
  '   Chemistry (general, organic, physical, biochemistry), Physics (classical, quantum,',
  '   thermodynamics, electromagnetism), Astronomy, Environmental Science, Earth Science',
  '',
  '💻 COMPUTER SCIENCE (33 levels):',
  '   Python, JavaScript, Java, C++, Go, Rust, Swift, Kotlin, Machine Learning, AI,',
  '   Data Structures, Algorithms, Databases (SQL/NoSQL), Cybersecurity, Cryptography,',
  '   Cloud Computing (AWS, Azure, GCP), Web Development, Mobile Development, DevOps,',
  '   System Design, Blockchain, Quantum Computing',
  '',
  '📜 HISTORY (30 levels):',
  '   World History, US History, European History, Ancient Civilizations (Egypt, Greece,',
  '   Rome, Mesopotamia), Medieval, Renaissance, Modern, Military History, Art History,',
  '   Cultural History, Economic History',
  '',
  '✍️ ENGLISH (29 levels):',
  '   Grammar, Composition, Essay Writing, Literary Analysis, Creative Writing,',
  '   Shakespeare, American Literature, British Literature, Poetry, Rhetoric,',
  '   Professional Communication, Academic Writing',
  '',
  '🌍 LANGUAGES (45+ levels):',
  '   Spanish, French, German, Italian, Portuguese, Mandarin, Japanese, Korean, Arabic,',
  '   Russian, Hindi, Dutch, Swedish, Polish, Greek, Turkish, Hebrew, Swahili, Thai,',
  '   Vietnamese, Indonesian, Norwegian, Danish, Finnish, Czech, Romanian, Persian,',
  '   Bengali, Tamil, Ukrainian, etc.',
  '',
  '═══════════════════════════════════════════════════════════════════════════',
  'TECHNICAL FEATURES:',
  '═══════════════════════════════════════════════════════════════════════════',
  '',
  '🧮 LaTeX Math Support:',
  '   • Inline: \\( formula \\) — Example: \\(E = mc^2\\)',
  '   • Display: \\[ formula \\] — Example: \\[ \\int_0^\\infty e^{-x^2} dx \\]',
  '   • Renderer: MathJax (works on all devices)',
  '   • Coverage: All standard LaTeX commands (fractions, integrals, matrices, Greek, etc.)',
  '   • Accessibility: Screen reader compatible, crisp at all zoom levels',
  '',
  '🔄 Cross-Device Sync:',
  '   • Backend: Supabase real-time database',
  '   • Speed: Sub-second synchronization',
  '   • Scope: Lessons, attempts, streaks, points, playlists, preferences, analytics',
  '   • Devices: Study on phone, continue on laptop seamlessly',
  '',
  '📱 Platform Compatibility:',
  '   • Desktop: Windows, Mac, Linux (Chrome, Firefox, Safari, Edge)',
  '   • Tablets: iPad, Android tablets (mobile browsers)',
  '   • Smartphones: iOS, Android (mobile browsers, responsive design)',
  '   • No Installation: Web app at lernex.net',
  '   • PWA: Add to home screen for app-like experience',
  '   • Native Apps: iOS/Android coming Q1 2025 (Premium early beta access)',
  '',
  '🎯 Adaptive Difficulty:',
  '   • Automatic adjustment based on quiz accuracy (no manual tuning)',
  '   • Levels: Intro → Easy → Medium → Hard',
  '   • Triggers: >80% accuracy increases, <50% decreases',
  '   • Per-Subject: Each subject has independent difficulty tracking',
  '',
  '═══════════════════════════════════════════════════════════════════════════',
  'TEAM & EDUCATOR FEATURES:',
  '═══════════════════════════════════════════════════════════════════════════',
  '',
  '👨‍🏫 Collaborative Playlists:',
  '   • Create at /playlists, invite Viewers (read-only) or Moderators (can edit)',
  '   • Share links or invite by email (search for Lernex users)',
  '   • Real-time sync across all collaborators',
  '   • Use cases: Classroom content, team onboarding, study groups, exam prep cohorts',
  '',
  '📈 Team Analytics (Premium):',
  '   • Cohort metrics: Completion rates, accuracy by subject, engagement trends',
  '   • Identify struggling students or weak topics',
  '   • Export reports (PDF/CSV)',
  '',
  '🏢 Enterprise Options:',
  '   • Custom pricing for schools, universities, bootcamps, corporate training',
  '   • Features: Unlimited seats, SSO integration, LMS connectors (Canvas, Blackboard,',
  '     Moodle), white-label branding, dedicated account manager',
  `   • Contact: ${SUPPORT_EMAIL} with "Teams" or "Educator" in subject line`,
  '',
  '🗓️ Onboarding Clinics:',
  '   • When: Every Thursday, rolling availability slots',
  '   • Duration: 25 minutes',
  '   • Covers: Importing content via /generate, setting up playlists, configuring analytics,',
  '     aligning difficulty levels, streak best practices',
  '   • Book at: /welcome',
  '   • Premium: Can request private 1-on-1 sessions',
  '',
  '═══════════════════════════════════════════════════════════════════════════',
  'ACCOUNT MANAGEMENT:',
  '═══════════════════════════════════════════════════════════════════════════',
  '',
  '🔐 Authentication:',
  '   • Methods: Email (magic link OTP) or Google OAuth',
  '   • Login: /login',
  '   • Password Reset: /login → "Forgot Password" (link expires after 1 hour)',
  '   • Account Lockout: 15-minute temporary lock after too many failed attempts',
  '   • 2FA: NOT currently supported (planned for future, Premium early access)',
  '',
  '✏️ Username:',
  '   • Change at: /profile → "Edit Profile"',
  '   • Requirements: 3-20 characters, alphanumeric + underscores only, unique, case-insensitive',
  '   • Reserved: Cannot use "admin", "support", "lernex", etc.',
  '   • Visibility: Public (appears on /friends search, /leaderboard, shared playlists)',
  '   • Availability: Real-time checking (green checkmark if available)',
  '',
  '📧 Email:',
  '   • Change at: /settings → Account → "Update Email"',
  '   • Verification: Link sent to new email (expires after 24 hours)',
  '   • Used for: Login, password resets, billing notifications, support replies',
  '   • Privacy: NEVER shown publicly',
  '',
  '🗑️ Account Deletion:',
  '   • Process: /settings → "Account Deletion" → Enter password → Confirm',
  '   • Timeline: Data deleted within 30 days (GDPR)',
  '   • Scope: ALL data (profile, lessons, attempts, analytics, points, streaks, playlists, friends)',
  '   • Subscriptions: Auto-canceled (no refunds—cancel separately first if you want access until period ends)',
  '   • Irreversible: Cannot undo after initiating',
  '   • Re-registration: Can sign up again after 30 days (treated as new account)',
  '',
  '═══════════════════════════════════════════════════════════════════════════',
  'TROUBLESHOOTING QUICK REFERENCE:',
  '═══════════════════════════════════════════════════════════════════════════',
  '',
  '🔴 Login Issues:',
  '   → Clear cookies/cache (Ctrl+Shift+Del), try incognito mode, use OAuth (Google)',
  '   → Forgot password: /login → "Forgot Password"',
  '   → Account locked: Wait 15 minutes or call +1 (866) 555-LEARN',
  '',
  '🔴 Generation Failures:',
  '   → Check daily limits (Free tier: ~3-5/day), refresh page and retry',
  '   → Shorten text input (max 2 paragraphs), ensure supported language',
  '   → Wait 10-15 seconds (Cerebras may be busy, auto-fallback to OpenAI)',
  '',
  '🔴 Sync Issues:',
  '   → Hard refresh browser (Ctrl+F5 / Cmd+Shift+R), check internet connection',
  '   → Log out and back in',
  '   → Streak not updating: Must complete full lesson (lesson + quiz)',
  '',
  '🔴 Payment Issues:',
  '   → Card declined: Verify details, try different card, ensure billing address matches',
  '   → Contact bank to allow international charges (Stripe)',
  `   → Incorrect charge: Email ${SUPPORT_EMAIL} with invoice number`,
  '   → Subscription not activating: Wait 1-2 minutes, refresh, log out/in',
  '',
  '🔴 General:',
  '   → Page not loading: Clear cache, disable browser extensions, try different browser',
  `   → Contact support@lernex.net or /support live chat with: account email, description,`,
  '     error messages, screenshots',
  '',
  '═══════════════════════════════════════════════════════════════════════════',
  'SPECIALIZED CONTACT EMAILS:',
  '═══════════════════════════════════════════════════════════════════════════',
  '',
  `📧 ${SUPPORT_EMAIL} — Help, billing, troubleshooting (~4hr response)`,
  '📧 feedback@lernex.app — Product ideas, feature requests (reviewed weekly by product team)',
  '📧 security@lernex.app — Urgent security vulnerabilities (pings engineering on-call)',
  '',
  '═══════════════════════════════════════════════════════════════════════════',
  'KEY PLATFORM METRICS:',
  '═══════════════════════════════════════════════════════════════════════════',
  '',
  '• 92% of beta learners report remembering details after one week',
  '• Average session: 7 minutes daily',
  '• Onboarding to first lesson: ~2 minutes',
  '• Teams using Lernex: 3x faster onboarding in regulated industries',
  '',
  '╔═══════════════════════════════════════════════════════════════════════════╗',
  '║   This reference contains ALL factual information about Lernex platform   ║',
  '║     Use ONLY this information when answering user questions. DO NOT      ║',
  '║       guess, speculate, or make assumptions beyond what is stated.        ║',
  '╚═══════════════════════════════════════════════════════════════════════════╝',
].join('\n');

type ChatRole = 'user' | 'assistant';

type ChatPayloadMessage = {
  role: ChatRole;
  content: string;
};

function sanitizeMessages(input: unknown): ChatPayloadMessage[] {
  if (!Array.isArray(input)) return [];
  const result: ChatPayloadMessage[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const role = (entry as { role?: unknown }).role;
    const content = (entry as { content?: unknown }).content;
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string') continue;
    const trimmed = content.trim();
    if (trimmed.length === 0) continue;
    result.push({ role, content: trimmed.slice(0, 2000) });
  }
  return result.slice(-12);
}

const integerFormatter = new Intl.NumberFormat('en-US');
const percentFormatter = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

type AttemptRow = {
  subject: string;
  correctCount: number;
  total: number;
  createdAt: string | null;
};

type LearnerAnalytics = {
  totalAttempts: number;
  weeklyAttempts: number;
  activeDays: number;
  avgAccuracy: number | null;
  topSubject: string | null;
  lastAttemptAt: string | null;
  streak: number;
  points: number;
  lastStudyDate: string | null;
};

type SubjectState = {
  subject: string | null;
  course: string | null;
  mastery: number | null;
  difficulty: string | null;
  nextTopic: string | null;
  updatedAt: string | null;
};

type LearnerContext = {
  profile: {
    fullName: string | null;
    username: string | null;
    isPremium: boolean | null;
    interests: string[] | null;
    streak: number | null;
    points: number | null;
    lastStudyDate: string | null;
    createdAt: string | null;
  } | null;
  analytics: LearnerAnalytics | null;
  subjects: SubjectState[];
};

function safeString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp01(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function formatNumber(value: number | null): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return integerFormatter.format(Math.round(value));
}

function formatPercent(value: number | null): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return percentFormatter.format(value);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatAbsoluteDate(value: string | null): string | null {
  const parsed = parseDate(value);
  return parsed ? dateFormatter.format(parsed) : null;
}

function formatRelativeDays(value: string | null): string | null {
  const parsed = parseDate(value);
  if (!parsed) return null;
  const now = Date.now();
  const diff = now - parsed.getTime();
  const dayMs = 86_400_000;
  const days = Math.floor(diff / dayMs);
  if (Number.isNaN(days)) return null;
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  return dateFormatter.format(parsed);
}

function normalizeAttempt(row: Record<string, unknown>): AttemptRow {
  const subject = safeString(row['subject']) ?? 'General';
  const correctRaw = toNumber(row['correct_count'] ?? row['correctCount']) ?? 0;
  const totalRaw = toNumber(row['total']) ?? 0;
  const createdAt = safeString(row['created_at'] ?? row['createdAt']);
  return {
    subject,
    correctCount: Math.max(0, Math.round(correctRaw)),
    total: Math.max(0, Math.round(totalRaw)),
    createdAt,
  };
}

function computeAnalytics(
  attempts: AttemptRow[],
  streak: number | null,
  points: number | null,
  lastStudyDate: string | null,
): LearnerAnalytics {
  const now = Date.now();
  const weekThreshold = now - 7 * 86_400_000;
  const dayKeys = new Set<string>();
  const subjectCounts = new Map<string, { attempts: number; correct: number; total: number }>();
  let weeklyAttempts = 0;
  let totalCorrect = 0;
  let totalQuestions = 0;
  let latestTimestamp = 0;
  let latestIso: string | null = null;

  for (const attempt of attempts) {
    totalCorrect += attempt.correctCount;
    totalQuestions += attempt.total;

    const createdAt = parseDate(attempt.createdAt);
    if (createdAt) {
      const ts = createdAt.getTime();
      const dayKey = createdAt.toISOString().slice(0, 10);
      dayKeys.add(dayKey);
      if (ts >= weekThreshold) {
        weeklyAttempts += 1;
      }
      if (ts > latestTimestamp) {
        latestTimestamp = ts;
        latestIso = attempt.createdAt;
      }
    }

    const subjectKey = attempt.subject || 'General';
    const aggregate = subjectCounts.get(subjectKey) ?? { attempts: 0, correct: 0, total: 0 };
    aggregate.attempts += 1;
    aggregate.correct += attempt.correctCount;
    aggregate.total += attempt.total;
    subjectCounts.set(subjectKey, aggregate);
  }

  let topSubject: string | null = null;
  let maxAttempts = 0;
  for (const [subject, aggregate] of subjectCounts.entries()) {
    if (aggregate.attempts > maxAttempts) {
      maxAttempts = aggregate.attempts;
      topSubject = subject;
    }
  }

  const avgAccuracy = totalQuestions > 0 ? totalCorrect / Math.max(totalQuestions, 1) : null;

  return {
    totalAttempts: attempts.length,
    weeklyAttempts,
    activeDays: dayKeys.size,
    avgAccuracy,
    topSubject,
    lastAttemptAt: latestIso ?? lastStudyDate ?? null,
    streak: streak ?? 0,
    points: points ?? 0,
    lastStudyDate: lastStudyDate ?? null,
  };
}

function normalizeSubjectState(row: Record<string, unknown>): SubjectState {
  return {
    subject: safeString(row['subject']),
    course: safeString(row['course']),
    mastery: toNumber(row['mastery']),
    difficulty: safeString(row['difficulty']),
    nextTopic: safeString(row['next_topic'] ?? row['nextTopic']),
    updatedAt: safeString(row['updated_at'] ?? row['updatedAt']),
  };
}

async function gatherLearnerContext(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<LearnerContext> {
  try {
    const [profileRes, attemptsRes, subjectsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, username, is_premium, interests, streak, points, last_study_date, created_at')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('attempts')
        .select('subject, correct_count, total, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('user_subject_state')
        .select('subject, course, mastery, difficulty, next_topic, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(10),
    ]);

    if (profileRes.error) {
      console.warn('[support-chat] profile load failed', profileRes.error);
    }
    if (attemptsRes.error) {
      console.warn('[support-chat] attempts load failed', attemptsRes.error);
    }
    if (subjectsRes.error) {
      console.warn('[support-chat] subject state load failed', subjectsRes.error);
    }

    const profileRow = profileRes.data ?? null;
    const attemptsData = Array.isArray(attemptsRes.data) ? attemptsRes.data : [];
    const subjectData = Array.isArray(subjectsRes.data) ? subjectsRes.data : [];

    const profile = profileRow
      ? {
          fullName: safeString(profileRow.full_name),
          username: safeString(profileRow.username),
          isPremium: typeof profileRow.is_premium === 'boolean' ? profileRow.is_premium : null,
          interests: Array.isArray(profileRow.interests)
            ? (profileRow.interests.filter((entry: unknown): entry is string => typeof entry === 'string') as string[])
            : null,
          streak: toNumber(profileRow.streak),
          points: toNumber(profileRow.points),
          lastStudyDate: safeString(profileRow.last_study_date),
          createdAt: safeString(profileRow.created_at),
        }
      : null;

    const attempts = attemptsData.map((row) => normalizeAttempt(row as Record<string, unknown>));
    const analytics = computeAnalytics(
      attempts,
      profile?.streak ?? null,
      profile?.points ?? null,
      profile?.lastStudyDate ?? null,
    );

    const subjects = subjectData
      .map((row) => normalizeSubjectState(row as Record<string, unknown>))
      .filter((row) => row.subject || row.course);

    return { profile, analytics, subjects };
  } catch (error) {
    console.warn('[support-chat] gatherLearnerContext failed', error);
    return { profile: null, analytics: null, subjects: [] };
  }
}

function renderLearnerSummary(context: LearnerContext | null): string | null {
  if (!context) return null;
  const lines: string[] = [];

  if (context.profile) {
    const { fullName, username, isPremium, interests, streak, points, lastStudyDate, createdAt } = context.profile;
    const identityParts = [fullName, username ? `@${username}` : null].filter(Boolean);
    const identityLabel = identityParts.length > 0 ? identityParts.join(' ') : null;
    const planLabel =
      typeof isPremium === 'boolean' ? (isPremium ? 'Premium plan' : 'Standard plan') : null;
    const streakLabel = streak != null && streak > 0 ? `${formatNumber(streak)} day streak` : null;
    const pointsLabel = points != null && points > 0 ? `${formatNumber(points)} points` : null;
    const lastStudyLabel = formatRelativeDays(lastStudyDate) ?? formatAbsoluteDate(lastStudyDate);
    const memberSinceLabel = formatAbsoluteDate(createdAt);

    const profileBits = [
      identityLabel,
      planLabel,
      streakLabel,
      pointsLabel,
      lastStudyLabel ? `last study ${lastStudyLabel}` : null,
      memberSinceLabel ? `member since ${memberSinceLabel}` : null,
    ].filter(Boolean);

    if (interests && interests.length > 0) {
      profileBits.push(`interests: ${interests.slice(0, 5).join(', ')}`);
    }

    if (profileBits.length > 0) {
      lines.push(`- Profile: ${profileBits.join(' | ')}`);
    }
  }

  if (context.analytics) {
    const { totalAttempts, weeklyAttempts, activeDays, avgAccuracy, topSubject, lastAttemptAt } =
      context.analytics;
    const bits: string[] = [];

    bits.push(`${formatNumber(totalAttempts) ?? String(totalAttempts)} total attempts`);
    bits.push(`${formatNumber(weeklyAttempts) ?? String(weeklyAttempts)} this week`);
    bits.push(`${formatNumber(activeDays) ?? String(activeDays)} active days in last 7`);

    const accuracyLabel = formatPercent(avgAccuracy);
    if (accuracyLabel) {
      bits.push(`avg accuracy ${accuracyLabel}`);
    } else {
      bits.push('avg accuracy pending more quiz data');
    }

    if (topSubject) {
      bits.push(`top subject ${topSubject}`);
    }

    const lastActivityLabel = formatRelativeDays(lastAttemptAt) ?? formatAbsoluteDate(lastAttemptAt);
    if (lastActivityLabel) {
      bits.push(`last activity ${lastActivityLabel}`);
    }

    lines.push(`- Attempts: ${bits.join(' | ')}`);
  }

  if (context.subjects && context.subjects.length > 0) {
    const subjectSummaries = context.subjects.slice(0, 3).map((subject) => {
      const descriptors: string[] = [];
      const name = subject.subject ?? subject.course ?? 'Subject';
      descriptors.push(name);
      if (subject.difficulty) {
        descriptors.push(`difficulty ${subject.difficulty}`);
      }
      const masteryLabel = formatPercent(clamp01(subject.mastery));
      if (masteryLabel) {
        descriptors.push(`mastery ${masteryLabel}`);
      }
      if (subject.nextTopic) {
        descriptors.push(`next ${subject.nextTopic}`);
      }
      return descriptors.join(' | ');
    });
    lines.push(`- Subject focus: ${subjectSummaries.join('; ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function renderKnowledgeDigest(entries: SupportKnowledgeEntry[]): string | null {
  if (!entries.length) return null;
  return entries
    .map((entry) => {
      const parts = [
        `- ${entry.title} - ${entry.summary}`,
        `  Key notes: ${entry.details}`,
      ];
      const tagPreview = entry.tags.slice(0, 4);
      if (tagPreview.length > 0) {
        parts.push(`  Tags: ${tagPreview.join(', ')}`);
      }
      return parts.join('\n');
    })
    .join('\n');
}

type SystemPromptOptions = {
  knowledgeDigest?: string | null;
  learnerSummary?: string | null;
  clientContext?: string | null;
  websiteContext?: string | null;
};

function buildSystemPrompt({
  knowledgeDigest,
  learnerSummary,
  clientContext,
  websiteContext,
}: SystemPromptOptions): string {
  const base = [
    'You are the Lernex Support Assistant—an expert AI helper embedded on lernex.net to provide accurate, helpful, and actionable support to users of this AI-powered micro-learning platform.',
    '',
    '═══════════════════════════════════════════════════════════',
    'CORE PRINCIPLES (READ CAREFULLY):',
    '═══════════════════════════════════════════════════════════',
    '',
    '1. ACCURACY IS PARAMOUNT:',
    '   • ONLY provide information explicitly stated in the Lernex Platform Reference or Knowledge Articles below',
    '   • NEVER guess, invent, speculate, or make assumptions about features, pricing, timelines, policies, or technical details',
    '   • If a detail is not explicitly mentioned (e.g., exact free tier limit numbers), acknowledge the limitation',
    '   • Do NOT extrapolate or infer beyond what is directly stated',
    '',
    '2. HANDLING UNCERTAINTY:',
    `   • When information is NOT in your knowledge base, respond: "I don't have specific information about [topic]. For accurate details, please contact support:"`,
    `   • Live chat: /support (Mon-Fri 8am-6pm MT, 1-2 min response)`,
    `   • Email: ${SUPPORT_EMAIL} (~4 hour response, 7 days/week)`,
    '   • Phone (urgent): +1 (866) 555-LEARN',
    '   • NEVER say "I think", "probably", "might", "should", or "usually" when uncertain',
    '',
    '3. BE SPECIFIC AND ACTIONABLE:',
    '   • Always cite exact navigation paths: "/analytics dashboard", "visit /generate", "go to /pricing"',
    '   • Provide numbered step-by-step instructions for multi-step processes',
    '   • Include specific requirements (e.g., "username must be 3-20 characters, alphanumeric + underscores only")',
    '   • Mention exact limitations (e.g., "PDF max 10MB", "3 quiz questions per lesson")',
    '',
    '4. USE LEARNER CONTEXT INTELLIGENTLY:',
    '   • If learner analytics provided below, personalize your response',
    '   • Examples: "I see you have a 15-day streak—great work maintaining consistency!"',
    '   • "Your Math mastery is at 85%, which is excellent. Consider trying Medium or Hard difficulty."',
    '   • "You haven\'t used /generate yet—it\'s perfect for creating custom lessons from your textbooks."',
    '',
    '5. PROACTIVELY EDUCATE:',
    '   • Suggest relevant features users might not know about',
    '   • Mention best practices: "To maintain your streak, complete at least 1 lesson before midnight local time"',
    '   • Recommend /analytics for tracking, /playlists for organization, /achievements for motivation',
    '   • Point Premium users to exclusive features they might not be using',
    '',
    '6. HANDLE ACCOUNT ACTIONS CAREFULLY:',
    '   • For self-serve actions (password reset, username change, cancellation), provide exact navigation steps',
    '   • For manual actions (refunds, account recovery, billing disputes), escalate to support immediately',
    '   • Be clear about what YOU can help with vs. what requires human support',
    '',
    '7. TONE AND STYLE:',
    '   • Friendly but professional—balance warmth with competence',
    '   • Concise—avoid unnecessary fluff or over-explaining',
    '   • Clear—use plain language unless user uses technical terms first',
    '   • Action-oriented—always end with next steps or options',
    '',
    '═══════════════════════════════════════════════════════════',
    'RESPONSE STRUCTURE (FOLLOW THIS PATTERN):',
    '═══════════════════════════════════════════════════════════',
    '',
    '1. DIRECT ANSWER FIRST',
    '   Start with the answer to their specific question (1-2 sentences)',
    '',
    '2. SPECIFIC DETAILS',
    '   Provide navigation paths, steps, requirements, or explanations',
    '   Use bullet points or numbered lists for clarity',
    '',
    '3. RELEVANT CONTEXT',
    '   Include helpful related information from knowledge articles',
    '   Reference their personal analytics if relevant',
    '',
    '4. ACTIONABLE NEXT STEPS',
    '   End with clear next actions or escalation path if needed',
    '',
    '═══════════════════════════════════════════════════════════',
    'STRICT GUARDRAILS (DO NOT VIOLATE):',
    '═══════════════════════════════════════════════════════════',
    '',
    '✗ DO NOT make up features, pricing, timelines, or policies not in your knowledge base',
    '✗ DO NOT provide medical, legal, financial, or academic advice (e.g., "Is this course right for my career?")',
    '✗ DO NOT share or request sensitive information (passwords, credit card numbers, API keys)',
    '✗ DO NOT promise future features, ETAs, or changes ("AI will soon...", "Coming next month...")',
    '✗ DO NOT perform account actions (you cannot reset passwords, process refunds, change subscriptions)',
    '✗ DO NOT use vague language when uncertain ("I think", "probably", "might be", "should work")',
    '✗ DO NOT contradict the knowledge base or make assumptions beyond it',
    '',
    `✓ DO escalate complex/sensitive issues to live chat (/support) or email (${SUPPORT_EMAIL})`,
    '✓ DO admit when you don\'t know and provide escalation path',
    '✓ DO stick to documented facts from knowledge base',
    '',
    '═══════════════════════════════════════════════════════════',
    'COMMON USER QUESTIONS (HANDLE THESE PROACTIVELY):',
    '═══════════════════════════════════════════════════════════',
    '',
    '• GETTING STARTED: Explain /onboarding → select interests → /placement test → /fyp flow',
    '• LESSON GENERATION: /generate workflow (text input, subject/difficulty selection, limits by plan)',
    '• PRICING: Free ($0), Plus ($5.99/mo), Premium ($14.99/mo)—clearly explain differences and upgrade process',
    '• STREAKS: Requirements (1 lesson+quiz before midnight local time), viewing, Premium freeze feature',
    '• GENERATION LIMITS: Free (standard daily quota), Plus (3x), Premium (unlimited)—reset at midnight',
    '• TROUBLESHOOTING: Login (clear cookies, try OAuth), generation (check limits), sync (refresh, check internet)',
    '• SUBSCRIPTIONS: How to cancel (/pricing → Manage Subscription), 14-day refund policy, timing',
    '• PLAYLISTS: Creating, sharing, Viewer vs Moderator permissions, collaborative workflows',
    '• TEAM/EDUCATOR: Collaborative playlists, team analytics (Premium), onboarding clinic at /welcome (Thursdays)',
    '• TECHNICAL: LaTeX support (\\(...\\) inline, \\[...\\] display), cross-device sync, mobile compatibility',
    '• FYP ALGORITHM: Based on interests, placement, quiz performance, likes/dislikes, mastery—adapts in real-time',
    '• QUIZZES: 3 MCQs per lesson, 10 points per correct answer, instant feedback, affects mastery and difficulty',
    '• ACHIEVEMENTS: 7 categories, 6 tiers (Bronze → Mythic), automatic earning, view at /achievements',
    '• FRIENDS: Search at /friends, send/accept requests, activity feed, friends-only leaderboard',
    '• ANALYTICS: /analytics shows attempts, accuracy, streaks, points, token usage, subject mastery',
    '• ACCOUNT MANAGEMENT: Username (/profile), email (/settings), password (/settings), deletion (/settings)',
    '• PDF UPLOADS: /generate or /upload, max 10MB, text-based PDFs only (no OCR for scans)',
    '',
    '═══════════════════════════════════════════════════════════',
    'QUALITY CHECKLIST (REVIEW BEFORE RESPONDING):',
    '═══════════════════════════════════════════════════════════',
    '',
    '□ Is every fact in my response explicitly stated in the knowledge base below?',
    '□ Have I avoided guessing or making assumptions?',
    '□ Have I provided specific navigation paths and steps?',
    '□ Did I use the learner\'s personal context if available?',
    '□ Have I included actionable next steps?',
    '□ Is my response concise and scannable (bullets/lists)?',
    '□ Did I escalate appropriately if question is beyond my knowledge?',
    '□ Have I avoided all restricted guardrails listed above?',
  ].join('\n');

  const segments = [base];

  const siteReference =
    websiteContext && websiteContext.trim().length > 0 ? websiteContext.trim() : WEBSITE_CONTEXT;
  segments.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nLERNEX PLATFORM REFERENCE (Your primary knowledge source):\n${siteReference}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (knowledgeDigest && knowledgeDigest.trim().length > 0) {
    segments.push(`RELEVANT KNOWLEDGE ARTICLES (Detailed information matching this query):\n${knowledgeDigest.trim()}`);
  } else {
    segments.push(
      `RELEVANT KNOWLEDGE ARTICLES:\nNo specific articles matched this query. Use only the Lernex Platform Reference above. If the user's question requires information not in your knowledge base, acknowledge the limitation clearly and direct them to ${SUPPORT_EMAIL} or live chat at /support for human assistance.`,
    );
  }

  if (learnerSummary && learnerSummary.trim().length > 0) {
    segments.push(`LEARNER ANALYTICS SNAPSHOT (Personalize your response using this data):\n${learnerSummary.trim()}\n\nUse this information to provide personalized guidance. For example: if they have a 15-day streak, congratulate them; if their accuracy in Math is low, suggest using /analytics to review weak topics; if they haven't used /generate, mention it as a way to create custom lessons.`);
  }

  if (clientContext && clientContext.trim().length > 0) {
    segments.push(`USER-PROVIDED CONTEXT:\n${clientContext.trim().slice(0, 600)}`);
  }

  segments.push(
    [
      '═══════════════════════════════════════════════════════════',
      'CRITICAL FINAL REMINDERS:',
      '═══════════════════════════════════════════════════════════',
      '',
      '⚠️  ACCURACY OVER HELPFULNESS: It\'s better to say "I don\'t know" and escalate than to guess incorrectly.',
      '⚠️  STICK TO THE FACTS: Only use information explicitly stated in the knowledge base above.',
      '⚠️  NO SPECULATION: Never invent features, timelines, or details not documented.',
      '⚠️  ESCALATE WHEN NEEDED: Complex issues require human support—don\'t try to handle everything.',
      '',
      '📞 ESCALATION CONTACTS (provide these when you cannot help):',
      `   • Live chat: /support (Mon-Fri 8am-6pm MT, 1-2 minute response) — FASTEST`,
      `   • Email: ${SUPPORT_EMAIL} (~4 hour response, 7 days/week) — MOST DETAILED`,
      '   • Phone (urgent only): +1 (866) 555-LEARN — ACCESS ISSUES',
      '   • Onboarding clinic: /welcome (Book Thursday sessions) — TEAM SETUP',
      '',
      '✨ YOUR GOAL: Be the most helpful, accurate, and trustworthy support assistant possible.',
      '   Users rely on you for correct information. Earn their trust by never guessing.',
      '',
      '═══════════════════════════════════════════════════════════',
    ].join('\n'),
  );

  return segments.join('\n\n');
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
  if (!take(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 });
  }

  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: missing CEREBRAS_API_KEY' }), { status: 500 });
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get('sb-access-token')?.value;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: missing Supabase credentials' }), { status: 500 });
  }

  const authHeaders: Record<string, string> = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    global: {
      headers: authHeaders,
    },
  });

  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id ?? null;
  } catch {
    userId = null;
  }

  if (userId) {
    const allowed = await checkUsageLimit(supabase, userId);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Usage limit exceeded' }), { status: 403 });
    }
  }

  let payload: { messages?: unknown; context?: unknown };
  try {
    payload = (await req.json()) as { messages?: unknown; context?: unknown };
  } catch {
    payload = {};
  }

  const chatMessages = sanitizeMessages(payload.messages);
  if (chatMessages.length === 0 || chatMessages.every((message) => message.role !== 'user')) {
    return new Response(JSON.stringify({ error: 'Provide at least one user message.' }), { status: 400 });
  }

  const context =
    typeof payload.context === 'string' && payload.context.trim().length > 0 ? payload.context.trim() : null;

  let learnerContext: LearnerContext | null = null;
  if (userId) {
    learnerContext = await gatherLearnerContext(supabase, userId);
  }

  const userQueryText = chatMessages
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => message.content)
    .join(' ');

  const knowledgeEntries = rankSupportKnowledge(userQueryText, 5);
  const knowledgeDigest = renderKnowledgeDigest(knowledgeEntries);
  const learnerSummary = renderLearnerSummary(learnerContext);
  const systemPrompt = buildSystemPrompt({
    knowledgeDigest,
    learnerSummary,
    clientContext: context,
    websiteContext: WEBSITE_CONTEXT,
  });

  const client = new OpenAI({
    apiKey,
    baseURL: CEREBRAS_BASE_URL,
  });

  try {
    const completion = await client.chat.completions.create({
      model: SUPPORT_MODEL,
      temperature: SUPPORT_TEMPERATURE,
      max_tokens: SUPPORT_MAX_TOKENS,
      reasoning_effort: 'low',
      messages: [
        { role: 'system' as const, content: systemPrompt },
        ...chatMessages.map(({ role, content }) => ({ role, content })),
      ],
    });

    const usage = completion.usage;
    const reply =
      completion.choices?.[0]?.message?.content?.trim() ??
      'I am here to help. Could you rephrase that question for me?';

    if (userId || ip) {
      const usageSummary = {
        input_tokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null,
        output_tokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null,
      };
      try {
        await logUsage(
          supabase,
          userId,
          ip,
          SUPPORT_MODEL,
          usageSummary,
          {
            metadata: {
              feature: 'support-chat',
              messageCount: chatMessages.length,
              hasContext: Boolean(context),
              knowledgeIds: knowledgeEntries.map((entry) => entry.id),
              knowledgeCount: knowledgeEntries.length,
              hasLearnerSummary: Boolean(learnerSummary),
            },
          },
        );
      } catch (logErr) {
        console.warn('[support-chat] usage log failed', logErr);
      }
    }

    return new Response(JSON.stringify({ reply }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (error) {
    console.error('[support-chat] error', error);
    const message = error instanceof Error ? error.message : 'Support chat failed';
    if (userId || ip) {
      try {
        await logUsage(
          supabase,
          userId,
          ip,
          SUPPORT_MODEL,
          { input_tokens: null, output_tokens: null },
          {
            metadata: {
              feature: 'support-chat',
              error: message,
              messageCount: chatMessages.length,
              hasContext: Boolean(context),
              knowledgeIds: knowledgeEntries.map((entry) => entry.id),
              knowledgeCount: knowledgeEntries.length,
              hasLearnerSummary: Boolean(learnerSummary),
            },
          },
        );
      } catch (logErr) {
        console.warn('[support-chat] error-log failed', logErr);
      }
    }
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
