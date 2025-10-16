"use client";

export default function TermsAndConditions() {
  return (
    <main className="min-h-[calc(100vh-56px)] mx-auto w-full max-w-4xl px-4 py-8 text-neutral-900 dark:text-white">
      {/* Header Section */}
      <div className="mb-8 space-y-3">
        <h1 className="bg-gradient-to-r from-lernex-purple to-lernex-blue bg-clip-text text-4xl font-bold text-transparent">
          Terms & Conditions
        </h1>
        <div className="flex gap-4 text-sm text-neutral-600 dark:text-neutral-400">
          <div>
            <span className="font-medium">Effective Date:</span> January 21, 2025
          </div>
          <div>
            <span className="font-medium">Last Updated:</span> January 21, 2025
          </div>
        </div>
      </div>

      {/* Introduction */}
      <section className="mb-8 rounded-xl border border-neutral-200 bg-gradient-to-br from-lernex-purple/5 to-lernex-blue/5 p-6 dark:border-neutral-800 dark:from-lernex-purple/10 dark:to-lernex-blue/10">
        <h2 className="mb-3 text-xl font-semibold">Acceptance of Terms</h2>
        <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
          By accessing or using Lernex ("Service"), you agree to be bound by these Terms & Conditions. If you disagree with any part of these terms, please do not use the Service.
        </p>
      </section>

      {/* Main Content */}
      <div className="space-y-6">
        {/* Section 2 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-purple/10 text-lernex-purple dark:bg-lernex-purple/20">
              2
            </span>
            Use of the Service
          </h2>
          <div className="space-y-3 text-neutral-700 dark:text-neutral-300">
            <ul className="list-inside list-disc space-y-2 pl-4">
              <li>
                You must be at least 13 years old (or older depending on your country's laws) to use Lernex
              </li>
              <li>
                You agree not to misuse Lernex, including attempting to hack, disrupt, or cheat the system
              </li>
              <li>
                You are responsible for maintaining the confidentiality of your account credentials
              </li>
              <li>
                You must not use the Service for any illegal or unauthorized purpose
              </li>
            </ul>
          </div>
        </section>

        {/* Section 3 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-blue/10 text-lernex-blue dark:bg-lernex-blue/20">
              3
            </span>
            Accounts
          </h2>
          <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
            When creating an account, you agree to provide accurate and complete information. We reserve the right to suspend or terminate accounts that violate these Terms. You are responsible for all activities that occur under your account.
          </p>
        </section>

        {/* Section 4 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-purple/10 text-lernex-purple dark:bg-lernex-purple/20">
              4
            </span>
            Content & Intellectual Property
          </h2>
          <div className="space-y-3 text-neutral-700 dark:text-neutral-300">
            <ul className="list-inside list-disc space-y-2 pl-4">
              <li>
                All Lernex content (lessons, quizzes, design, and branding) is owned by Lernex and protected by copyright and trademark laws
              </li>
              <li>
                You may use Lernex only for personal, non-commercial learning purposes
              </li>
              <li>
                You retain ownership of any content you submit but grant Lernex a worldwide, royalty-free license to use it within the Service
              </li>
              <li>
                You must not reproduce, distribute, or create derivative works from Lernex content without permission
              </li>
            </ul>
          </div>
        </section>

        {/* Section 5 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-blue/10 text-lernex-blue dark:bg-lernex-blue/20">
              5
            </span>
            Payments & Subscriptions
          </h2>
          <div className="space-y-3 text-neutral-700 dark:text-neutral-300">
            <p className="leading-relaxed">
              Lernex may offer both free and paid subscription plans:
            </p>
            <ul className="list-inside list-disc space-y-2 pl-4">
              <li>
                Paid subscriptions are billed as disclosed at checkout
              </li>
              <li>
                You may cancel your subscription at any time through your account settings
              </li>
              <li>
                Refunds are subject to our refund policy and applicable laws
              </li>
              <li>
                We reserve the right to modify pricing with reasonable notice to existing subscribers
              </li>
            </ul>
          </div>
        </section>

        {/* Section 6 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-purple/10 text-lernex-purple dark:bg-lernex-purple/20">
              6
            </span>
            Disclaimer of Warranties
          </h2>
          <div className="space-y-3 text-neutral-700 dark:text-neutral-300">
            <p className="leading-relaxed">
              The Service is provided <span className="font-medium">"as is"</span> without warranties of any kind, either express or implied. We do not guarantee:
            </p>
            <ul className="list-inside list-disc space-y-2 pl-4">
              <li>Uninterrupted or error-free access to the Service</li>
              <li>That the Service will meet all your requirements</li>
              <li>The accuracy or reliability of any content</li>
              <li>Specific learning outcomes or results</li>
            </ul>
          </div>
        </section>

        {/* Section 7 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-blue/10 text-lernex-blue dark:bg-lernex-blue/20">
              7
            </span>
            Limitation of Liability
          </h2>
          <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
            To the maximum extent permitted by law, Lernex and its affiliates, officers, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses arising from your use of the Service.
          </p>
        </section>

        {/* Section 8 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-purple/10 text-lernex-purple dark:bg-lernex-purple/20">
              8
            </span>
            Termination
          </h2>
          <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
            We may suspend or terminate your access to the Service immediately, without prior notice or liability, if you breach these Terms or engage in conduct that we determine is harmful to other users, us, or third parties. Upon termination, your right to use the Service will immediately cease.
          </p>
        </section>

        {/* Section 9 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-blue/10 text-lernex-blue dark:bg-lernex-blue/20">
              9
            </span>
            Changes to Terms
          </h2>
          <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
            We reserve the right to modify or update these Terms at any time. We will notify users of significant changes via email or through the Service. Continued use of Lernex after changes become effective constitutes acceptance of the updated Terms.
          </p>
        </section>

        {/* Section 10 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-purple/10 text-lernex-purple dark:bg-lernex-purple/20">
              10
            </span>
            Governing Law
          </h2>
          <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
            These Terms shall be governed and construed in accordance with the laws of the United States of America, without regard to its conflict of law provisions. Any disputes arising from these Terms or your use of the Service shall be resolved in the appropriate courts.
          </p>
        </section>

        {/* Section 11 - Contact */}
        <section className="rounded-xl border border-lernex-purple/30 bg-gradient-to-br from-lernex-purple/10 to-lernex-blue/10 p-6 dark:border-lernex-purple/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-green/10 text-lernex-green dark:bg-lernex-green/20">
              11
            </span>
            Contact
          </h2>
          <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
            For questions or concerns about these Terms & Conditions, please contact us at:
          </p>
          <a
            href="mailto:support@lernex.net"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-lernex-purple px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-lernex-purple/90"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            support@lernex.net
          </a>
        </section>
      </div>

      {/* Footer Note */}
      <div className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-center text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400">
        These terms were last updated on January 21, 2025. By continuing to use Lernex, you acknowledge that you have read, understood, and agree to be bound by these Terms & Conditions.
      </div>
    </main>
  );
}
