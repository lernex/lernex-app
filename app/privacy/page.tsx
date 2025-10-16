"use client";

export default function PrivacyPolicy() {
  return (
    <main className="min-h-[calc(100vh-56px)] mx-auto w-full max-w-4xl px-4 py-8 text-neutral-900 dark:text-white">
      {/* Header Section */}
      <div className="mb-8 space-y-3">
        <h1 className="bg-gradient-to-r from-lernex-blue to-lernex-purple bg-clip-text text-4xl font-bold text-transparent">
          Privacy Policy
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
      <section className="mb-8 rounded-xl border border-neutral-200 bg-gradient-to-br from-lernex-blue/5 to-lernex-purple/5 p-6 dark:border-neutral-800 dark:from-lernex-blue/10 dark:to-lernex-purple/10">
        <h2 className="mb-3 text-xl font-semibold">Introduction</h2>
        <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
          Lernex (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) values your privacy. This Privacy Policy explains how we collect, use, and protect your information when you use our website, mobile app, and related services (the &ldquo;Service&rdquo;).
        </p>
        <p className="mt-3 leading-relaxed text-neutral-700 dark:text-neutral-300">
          By using Lernex, you agree to the terms described in this Privacy Policy.
        </p>
      </section>

      {/* Main Content */}
      <div className="space-y-6">
        {/* Section 2 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-blue/10 text-lernex-blue dark:bg-lernex-blue/20">
              2
            </span>
            Information We Collect
          </h2>
          <div className="space-y-4 text-neutral-700 dark:text-neutral-300">
            <p className="leading-relaxed">
              We may collect the following types of information:
            </p>
            <div className="space-y-3 pl-4">
              <div>
                <h3 className="mb-1 font-medium text-neutral-900 dark:text-white">
                  Account Information
                </h3>
                <p className="text-sm">
                  When you sign up, we collect your name, email address, username, date of birth, and login credentials (or via Google sign-in).
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-neutral-900 dark:text-white">
                  Learning Preferences & Activity
                </h3>
                <p className="text-sm">
                  Subjects you choose, lessons attempted, streaks, quiz results, and progress data.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-neutral-900 dark:text-white">
                  Device & Usage Data
                </h3>
                <p className="text-sm">
                  IP address, browser type, operating system, pages viewed, and actions within the Service.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-neutral-900 dark:text-white">
                  Optional Information
                </h3>
                <p className="text-sm">
                  Profile photo or avatar, bio, and other personal details you choose to share.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-purple/10 text-lernex-purple dark:bg-lernex-purple/20">
              3
            </span>
            How We Use Your Information
          </h2>
          <div className="space-y-2 text-neutral-700 dark:text-neutral-300">
            <p className="leading-relaxed">
              We use the information we collect to:
            </p>
            <ul className="list-inside list-disc space-y-2 pl-4">
              <li>Provide and improve the Service</li>
              <li>Personalize learning content to your style and level</li>
              <li>Track streaks, progress, and performance</li>
              <li>Communicate updates, offers, or support messages</li>
              <li>Ensure platform security and prevent misuse</li>
            </ul>
          </div>
        </section>

        {/* Section 4 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-blue/10 text-lernex-blue dark:bg-lernex-blue/20">
              4
            </span>
            Sharing of Information
          </h2>
          <div className="space-y-3 text-neutral-700 dark:text-neutral-300">
            <p className="font-medium text-neutral-900 dark:text-white">
              We do not sell your data.
            </p>
            <p className="leading-relaxed">
              We may share information only in these cases:
            </p>
            <ul className="list-inside list-disc space-y-2 pl-4">
              <li>
                <span className="font-medium">Service Providers:</span> With trusted vendors who help us operate (e.g., hosting, analytics, authentication)
              </li>
              <li>
                <span className="font-medium">Legal Obligations:</span> If required by law, regulation, or legal process
              </li>
              <li>
                <span className="font-medium">Business Transfers:</span> In the case of a merger, acquisition, or sale of assets
              </li>
            </ul>
          </div>
        </section>

        {/* Section 5 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-purple/10 text-lernex-purple dark:bg-lernex-purple/20">
              5
            </span>
            Data Retention
          </h2>
          <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
            We retain your information only as long as necessary to provide the Service or comply with legal obligations. You may request deletion of your data at any time.
          </p>
        </section>

        {/* Section 6 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-blue/10 text-lernex-blue dark:bg-lernex-blue/20">
              6
            </span>
            Security
          </h2>
          <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
            We take reasonable measures to protect your information but cannot guarantee 100% security of any data transmitted online. We use industry-standard encryption and security practices to safeguard your personal information.
          </p>
        </section>

        {/* Section 7 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-purple/10 text-lernex-purple dark:bg-lernex-purple/20">
              7
            </span>
            Children&apos;s Privacy
          </h2>
          <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
            Lernex is not intended for children under 13 (or under 16 in some regions). We do not knowingly collect data from children without parental consent. If you believe a child has provided us with personal information, please contact us immediately.
          </p>
        </section>

        {/* Section 8 */}
        <section className="rounded-xl border border-neutral-200 bg-white/50 p-6 backdrop-blur-sm dark:border-neutral-800 dark:bg-lernex-charcoal/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-blue/10 text-lernex-blue dark:bg-lernex-blue/20">
              8
            </span>
            Your Rights
          </h2>
          <div className="space-y-3 text-neutral-700 dark:text-neutral-300">
            <p className="leading-relaxed">
              Depending on your location, you may have the right to:
            </p>
            <ul className="list-inside list-disc space-y-2 pl-4">
              <li>Access, correct, or delete your personal information</li>
              <li>Object to or limit certain uses of your data</li>
              <li>Request a copy of your data</li>
              <li>Withdraw consent where we rely on it for processing</li>
            </ul>
          </div>
        </section>

        {/* Section 9 - Contact */}
        <section className="rounded-xl border border-lernex-blue/30 bg-gradient-to-br from-lernex-blue/10 to-lernex-purple/10 p-6 dark:border-lernex-blue/50">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lernex-green/10 text-lernex-green dark:bg-lernex-green/20">
              9
            </span>
            Contact Us
          </h2>
          <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
            If you have questions or concerns about this Privacy Policy, please contact us at:
          </p>
          <a
            href="mailto:support@lernex.net"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-lernex-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-lernex-blue/90"
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
        This policy was last updated on January 21, 2025. We may update this Privacy Policy from time to time. Continued use of Lernex after changes means you accept the updated policy.
      </div>
    </main>
  );
}
