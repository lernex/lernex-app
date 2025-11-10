'use client';

import { motion } from 'framer-motion';
import { Check, X, Sparkles } from 'lucide-react';

type FeatureValue = boolean | string | number;

type Feature = {
  name: string;
  free: FeatureValue;
  plus: FeatureValue;
  premium: FeatureValue;
  highlight?: boolean;
};

type FeatureCategory = {
  name: string;
  icon: string;
  features: Feature[];
};

const featureCategories: FeatureCategory[] = [
  {
    name: 'Core Learning Features',
    icon: '📚',
    features: [
      { name: 'AI-generated micro-lessons', free: 'Daily', plus: '3x daily limit', premium: 'Unlimited' },
      { name: 'AI model quality', free: 'Standard (GPT-OSS-20B)', plus: 'Advanced (6x more intelligent)', premium: 'Advanced (6x more intelligent)', highlight: true },
      { name: 'Generation speed', free: 'Standard', plus: 'Instant retries', premium: 'Instant retries' },
      { name: 'Lesson modes', free: true, plus: true, premium: true },
      { name: 'Context-aware follow-up questions', free: 'Basic', plus: 'Enhanced', premium: 'Advanced' },
      { name: 'Lesson history tracking', free: 'Basic', plus: 'Full with insights', premium: 'Full with insights' },
    ],
  },
  {
    name: 'Quiz & Practice',
    icon: '🎯',
    features: [
      { name: 'Interactive quizzes', free: true, plus: true, premium: true },
      { name: 'Instant feedback & explanations', free: true, plus: true, premium: true },
      { name: 'Adaptive study paths', free: false, plus: 'Learns from every answer', premium: 'Learns from every answer' },
      { name: 'Difficulty levels', free: '4 levels', plus: '4 levels', premium: '4 levels' },
      { name: 'Question skip tracking', free: false, plus: true, premium: true },
    ],
  },
  {
    name: 'Personalization',
    icon: '🧠',
    features: [
      { name: 'Placement assessment', free: true, plus: true, premium: true },
      { name: 'For You Page (FYP)', free: 'Daily lessons', plus: 'Accelerated generation', premium: 'Unlimited pre-generation', highlight: true },
      { name: 'Learning path progression', free: 'Track progress', plus: 'Track + mastery metrics', premium: 'Track + mastery + difficulty adaptation' },
      { name: 'Spaced repetition algorithms', free: false, plus: false, premium: true },
      { name: 'Automated AI coaching', free: false, plus: false, premium: true },
      { name: 'Real-time pattern adaptation', free: false, plus: 'Adaptive quizzes', premium: 'Full AI coaching' },
    ],
  },
  {
    name: 'Content Upload & Creation',
    icon: '📤',
    features: [
      { name: 'Document & PDF upload', free: true, plus: true, premium: true },
      { name: 'Image upload support', free: true, plus: true, premium: true },
      { name: 'OCR accuracy', free: 'Standard', plus: 'Medium (DeepSeek)', premium: 'High-detail (DeepSeek)' },
      { name: 'Audio transcription', free: true, plus: true, premium: true },
      { name: 'Voice input', free: true, plus: true, premium: true },
      { name: 'Batch upload processing', free: 'Single page', plus: 'Multiple pages', premium: 'Optimized batch' },
    ],
  },
  {
    name: 'Export & Study Tools',
    icon: '📥',
    features: [
      { name: 'Export study guides to PDF', free: false, plus: true, premium: true },
      { name: 'Flashcard PDFs', free: false, plus: true, premium: true },
      { name: 'Exam playlists', free: 'Basic', plus: 'Curated prep drills', premium: 'Custom + pre-built', highlight: true },
      { name: 'Interview prep drills', free: false, plus: true, premium: true },
      { name: 'Text-to-Speech (TTS)', free: true, plus: true, premium: true },
      { name: 'Voice options', free: '1 voice', plus: 'Multiple voices', premium: 'Full voice library' },
    ],
  },
  {
    name: 'Playlists & Collections',
    icon: '🎵',
    features: [
      { name: 'Create custom playlists', free: false, plus: true, premium: true },
      { name: 'Save lessons', free: false, plus: true, premium: true },
      { name: 'Playlist sharing', free: false, plus: 'Limited', premium: 'Public/private/shared' },
      { name: 'Play mode (ordered playthrough)', free: false, plus: true, premium: true },
      { name: 'AI Remix mode', free: false, plus: false, premium: 'Token-optimized remix', highlight: true },
      { name: 'Bulk management actions', free: false, plus: 'Limited', premium: 'Full bulk management' },
    ],
  },
  {
    name: 'Analytics & Insights',
    icon: '📊',
    features: [
      { name: 'Basic dashboard', free: true, plus: true, premium: true },
      { name: 'Progress analytics', free: 'Basic', plus: 'Advanced weekly insights', premium: 'Detailed exportable reports', highlight: true },
      { name: 'Subject-wise analytics', free: false, plus: 'Limited', premium: 'Complete mastery tracking' },
      { name: 'Performance reports', free: 'Basic', plus: 'Weekly personalized', premium: 'Exportable analytics' },
      { name: 'Heatmap calendar', free: false, plus: false, premium: true },
      { name: 'Spaced repetition tracking', free: false, plus: false, premium: true },
    ],
  },
  {
    name: 'Gamification & Social',
    icon: '🏆',
    features: [
      { name: 'Points system (10 per correct)', free: true, plus: true, premium: true },
      { name: 'Daily streak tracking', free: true, plus: true, premium: true },
      { name: 'Achievements & badges', free: 'Basic', plus: 'Enhanced badges', premium: 'Comprehensive' },
      { name: 'Friends system', free: 'Add/remove', plus: 'Add/remove', premium: 'Add/remove + study planning' },
      { name: 'Leaderboards', free: 'Global + Friends', plus: 'Global + Friends + Time-based', premium: 'Advanced + all types' },
      { name: 'Weekend competitions', free: true, plus: true, premium: true },
    ],
  },
  {
    name: 'SAT Prep',
    icon: '📝',
    features: [
      { name: 'SAT Reading & Writing', free: '20+ topics', plus: '20+ topics + analysis', premium: 'Advanced analysis' },
      { name: 'SAT Math', free: 'Algebra, geometry', plus: 'Full curriculum', premium: 'Full + problem-solving specialization' },
      { name: 'Contextual vocabulary', free: true, plus: true, premium: true },
      { name: 'Grammar & sentence structure', free: true, plus: true, premium: true },
    ],
  },
  {
    name: 'Support & Access',
    icon: '🎧',
    features: [
      { name: 'Ads', free: 'Ad-supported', plus: 'No ads', premium: 'No ads', highlight: true },
      { name: 'Support type', free: 'Community forums', plus: 'Priority (<2hr avg)', premium: 'Dedicated concierge', highlight: true },
      { name: 'Beta feature access', free: 'Standard release', plus: 'Early access', premium: 'Instant on launch' },
      { name: 'Feature request priority', free: 'Basic', plus: 'Prioritized', premium: 'High priority' },
    ],
  },
  {
    name: 'Advanced Features',
    icon: '⚡',
    features: [
      { name: 'API access', free: false, plus: false, premium: true },
      { name: 'LMS integration', free: false, plus: false, premium: true },
      { name: 'White-label options', free: false, plus: false, premium: 'For tutors/institutions', highlight: true },
      { name: 'Collaborative workspaces', free: false, plus: false, premium: true },
      { name: 'Team study spaces', free: false, plus: false, premium: true },
      { name: 'Custom integrations', free: false, plus: false, premium: true },
      { name: 'Multi-user accounts', free: false, plus: false, premium: true },
    ],
  },
  {
    name: 'Usage Limits',
    icon: '📈',
    features: [
      { name: 'Daily generation limit', free: 'Standard (refreshes daily)', plus: '3x higher', premium: 'Unlimited', highlight: true },
      { name: 'Monthly API calls', free: 'Limited', plus: 'Higher', premium: 'Unlimited' },
      { name: 'Storage capacity', free: 'Standard', plus: 'Standard', premium: 'Unlimited' },
      { name: 'Concurrent sessions', free: 'Single', plus: 'Single', premium: 'Multiple' },
    ],
  },
];

const renderFeatureValue = (value: FeatureValue, planType: 'free' | 'plus' | 'premium') => {
  const iconColor =
    planType === 'premium'
      ? 'text-purple-500 dark:text-purple-400'
      : planType === 'plus'
        ? 'text-lernex-blue dark:text-lernex-blue/80'
        : 'text-emerald-500 dark:text-emerald-400';

  const xColor = 'text-neutral-300 dark:text-neutral-600';

  if (typeof value === 'boolean') {
    return value ? (
      <Check className={`h-5 w-5 ${iconColor}`} strokeWidth={2.5} />
    ) : (
      <X className={`h-5 w-5 ${xColor}`} strokeWidth={2.5} />
    );
  }

  return (
    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
      {value}
    </span>
  );
};

const containerVariants = {
  hidden: { opacity: 0, y: 60 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
      staggerChildren: 0.1,
    },
  },
};

const categoryVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.5,
      ease: 'easeOut' as const,
    },
  },
};

const rowVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      delay: index * 0.02,
      ease: 'easeOut' as const,
    },
  }),
};

export default function PricingComparisonTable() {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
      variants={containerVariants}
      className="mt-24 w-full"
    >
      {/* Header */}
      <motion.div
        variants={categoryVariants}
        className="mb-12 text-center"
      >
        <motion.span
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 shadow-[0_18px_45px_-30px_rgba(59,130,246,0.6)] backdrop-blur-lg dark:border-white/20 dark:bg-white/10 dark:text-neutral-200 dark:shadow-none"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Feature Comparison
        </motion.span>
        <motion.h2
          variants={categoryVariants}
          className="mt-6 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl md:text-5xl dark:text-white"
        >
          Compare all plan{' '}
          <span className="bg-gradient-to-r from-lernex-blue via-indigo-500 to-purple-500 bg-clip-text text-transparent">
            capabilities
          </span>
        </motion.h2>
        <motion.p
          variants={categoryVariants}
          className="mt-4 text-base text-neutral-600 dark:text-neutral-300"
        >
          See exactly what&apos;s included in each tier - from AI models to analytics
        </motion.p>
      </motion.div>

      {/* Comparison Table */}
      <motion.div
        variants={categoryVariants}
        className="overflow-x-auto rounded-3xl border border-white/60 bg-white/80 shadow-[0_50px_140px_-75px_rgba(30,64,175,0.5)] backdrop-blur-lg dark:border-white/10 dark:bg-white/5 dark:shadow-[0_65px_170px_-90px_rgba(47,128,237,0.65)]"
      >
        <div className="min-w-[900px]">
          {/* Table Header */}
          <div className="sticky top-0 z-10 grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-neutral-200/50 bg-white/95 p-6 backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/95">
            <div className="text-sm font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Features
            </div>
            <div className="text-center">
              <div className="text-base font-bold text-neutral-900 dark:text-white">Free Explorer</div>
              <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">$0/forever</div>
            </div>
            <div className="text-center">
              <div className="relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-lernex-blue px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Most Popular
                </div>
                <div className="mt-2 text-base font-bold text-neutral-900 dark:text-white">Plus Momentum</div>
                <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">$5.99/mo</div>
              </div>
            </div>
            <div className="text-center">
              <div className="text-base font-bold text-neutral-900 dark:text-white">Premium Unlimited</div>
              <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">$14.99/mo</div>
            </div>
          </div>

          {/* Feature Categories */}
          <div className="divide-y divide-neutral-200/50 dark:divide-white/5">
            {featureCategories.map((category, categoryIndex) => (
              <motion.div
                key={category.name}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.05 }}
                className="p-6"
              >
                {/* Category Header */}
                <motion.div
                  variants={categoryVariants}
                  className="mb-4 flex items-center gap-2"
                >
                  <span className="text-2xl">{category.icon}</span>
                  <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                    {category.name}
                  </h3>
                </motion.div>

                {/* Category Features */}
                <div className="space-y-2">
                  {category.features.map((feature, featureIndex) => (
                    <motion.div
                      key={feature.name}
                      custom={featureIndex}
                      variants={rowVariants}
                      whileHover={{
                        backgroundColor: 'rgba(59, 130, 246, 0.03)',
                        transition: { duration: 0.2 },
                      }}
                      className={`grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 rounded-xl p-3 transition-colors ${
                        feature.highlight
                          ? 'bg-gradient-to-r from-lernex-blue/5 via-indigo-500/5 to-purple-500/5 dark:from-lernex-blue/10 dark:via-indigo-500/10 dark:to-purple-500/10'
                          : ''
                      }`}
                    >
                      <div className="flex items-center">
                        <span
                          className={`text-sm ${
                            feature.highlight
                              ? 'font-semibold text-neutral-900 dark:text-white'
                              : 'text-neutral-700 dark:text-neutral-200'
                          }`}
                        >
                          {feature.name}
                          {feature.highlight && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-gradient-to-r from-lernex-blue/20 to-purple-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-lernex-blue dark:text-lernex-blue/80">
                              Key Feature
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-center">
                        {renderFeatureValue(feature.free, 'free')}
                      </div>
                      <div className="flex items-center justify-center">
                        {renderFeatureValue(feature.plus, 'plus')}
                      </div>
                      <div className="flex items-center justify-center">
                        {renderFeatureValue(feature.premium, 'premium')}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Bottom CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="mt-12 rounded-3xl border border-white/60 bg-gradient-to-br from-lernex-blue/10 via-indigo-500/10 to-purple-500/10 p-8 text-center backdrop-blur-lg dark:border-white/10 dark:from-lernex-blue/20 dark:via-indigo-500/20 dark:to-purple-500/20"
      >
        <h3 className="text-2xl font-bold text-neutral-900 dark:text-white">
          Ready to accelerate your learning?
        </h3>
        <p className="mt-3 text-neutral-600 dark:text-neutral-300">
          Choose the plan that fits your ambition and start achieving your goals 2.7x faster
        </p>
        <motion.button
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-lernex-blue via-indigo-500 to-purple-500 px-8 py-3.5 text-sm font-bold text-white shadow-[0_20px_60px_-30px_rgba(59,130,246,0.7)] transition-all duration-300 hover:shadow-[0_25px_80px_-35px_rgba(59,130,246,0.85)]"
        >
          <Sparkles className="h-4 w-4" />
          View pricing plans
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
