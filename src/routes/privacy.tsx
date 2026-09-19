import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, ScrollText, ArrowLeft, ExternalLink, Lock, Trash2, Mail } from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Xora" },
      {
        name: "description",
        content:
          "Privacy Policy and Terms of Service for XoraTV social video-sharing and entertainment platform.",
      },
      { property: "og:title", content: "Privacy Policy — Xora" },
      {
        property: "og:description",
        content: "Learn how XoraTV collects, uses, protects, and retains your data.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <AppShell wide>
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Back Link & Header */}
        <div className="flex flex-col gap-3">
          <Link
            to="/"
            className="press inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to Home
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                XoraTV Privacy Policy & Terms
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Last Updated: September 15, 2026 • Website:{" "}
                <a
                  href="https://xoratv-x.onrender.com"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                >
                  https://xoratv-x.onrender.com
                  <ExternalLink className="size-3" />
                </a>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="#privacy"
                className="press rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
              >
                Privacy Policy
              </a>
              <a
                href="#terms"
                className="press rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Terms of Service
              </a>
            </div>
          </div>
        </div>

        {/* Quick Highlights Banner */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="size-4" />
              <span className="font-display text-xs font-semibold uppercase tracking-wider">
                Transparent Data
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              We never sell your personal information. Data is used solely to operate and improve
              XoraTV.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-primary">
              <Trash2 className="size-4" />
              <span className="font-display text-xs font-semibold uppercase tracking-wider">
                7-Day Chat Expiry
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              All direct messages and group chat conversations are automatically deleted after 7
              days.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-primary">
              <Lock className="size-4" />
              <span className="font-display text-xs font-semibold uppercase tracking-wider">
                OAuth Security
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Secure token authentication via Firebase Auth and standard Google Identity protocols.
            </p>
          </div>
        </div>

        {/* Privacy Policy Container */}
        <div
          id="privacy"
          className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8"
        >
          <div className="flex items-center gap-2 border-b border-border pb-4">
            <ShieldCheck className="size-5 text-primary" />
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
              XoraTV Privacy Policy
            </h2>
          </div>

          <div className="mt-6 space-y-6 text-sm leading-relaxed text-foreground/90">
            <p>
              Welcome to XoraTV (“Xora,” “we,” “us,” or “our”). XoraTV is a social video-sharing and
              entertainment platform that allows users to discover, watch, share, and interact with
              video and other content.
            </p>
            <p>
              This Privacy Policy explains what information we collect, how we use it, how we
              protect it, and the choices available to you when you use XoraTV.
            </p>
            <p className="font-medium text-foreground">
              By using XoraTV, you acknowledge that you have read and understood this Privacy
              Policy.
            </p>

            {/* Section 1 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                1. Information We Collect
              </h3>
              <p>
                We may collect information that you provide directly to us, information generated
                when you use XoraTV, and technical information from your device.
              </p>
              <div className="space-y-2 pl-4">
                <p className="font-medium text-foreground">A. Information You Provide</p>
                <p>Depending on how you use XoraTV, we may collect:</p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>Name or display name</li>
                  <li>Email address</li>
                  <li>Profile information</li>
                  <li>Profile picture or other images you choose to upload</li>
                  <li>Account login information</li>
                  <li>Content you upload or publish</li>
                  <li>Comments, posts, and other content you submit</li>
                  <li>Information you provide when contacting us or requesting support</li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  You should avoid submitting sensitive personal information that is not necessary
                  for using XoraTV.
                </p>

                <p className="pt-2 font-medium text-foreground">
                  B. Information About How You Use XoraTV
                </p>
                <p>
                  XoraTV collects information about how users actually interact with and use our
                  platform. This may include:
                </p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>Videos you watch</li>
                  <li>Videos you search for</li>
                  <li>Searches and search terms</li>
                  <li>Videos you like or dislike</li>
                  <li>Comments and other interactions</li>
                  <li>Accounts or creators you follow</li>
                  <li>Content you share</li>
                  <li>Pages or sections you visit</li>
                  <li>Features you use</li>
                  <li>Approximate viewing or interaction duration</li>
                  <li>Your interactions with recommendations</li>
                  <li>Content you create or upload</li>
                  <li>General patterns of activity on XoraTV</li>
                </ul>
                <p>
                  We use this information primarily to understand how our platform is being used and
                  to improve XoraTV, personalize the experience, improve recommendations, identify
                  technical problems, develop new features, and make the platform more useful to our
                  users.
                </p>
                <p className="text-muted-foreground">
                  For example, if many users frequently watch or search for a particular type of
                  content, this information may help us understand what content and features are
                  useful to our community.
                </p>

                <p className="pt-2 font-medium text-foreground">
                  C. Device and Technical Information
                </p>
                <p>
                  When you access XoraTV, we may automatically collect certain technical
                  information, such as:
                </p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>Device type</li>
                  <li>Operating system</li>
                  <li>Browser type</li>
                  <li>IP address</li>
                  <li>General location information derived from IP address</li>
                  <li>Device and application identifiers where applicable</li>
                  <li>Network information</li>
                  <li>Pages and features accessed</li>
                  <li>Error and diagnostic information</li>
                  <li>Date and time of activity</li>
                </ul>
                <p>
                  This information helps us maintain security, troubleshoot problems, monitor
                  performance, and improve the platform.
                </p>
              </div>
            </div>

            {/* Section 2 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                2. How We Use Information
              </h3>
              <p>We may use collected information to:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Provide and operate XoraTV</li>
                <li>Create and manage user accounts</li>
                <li>Deliver and recommend content</li>
                <li>Improve video and content discovery</li>
                <li>Understand how users interact with XoraTV</li>
                <li>Improve our website, application, and PWA</li>
                <li>Develop and test new features</li>
                <li>Personalize parts of the user experience</li>
                <li>Maintain platform security</li>
                <li>Detect and prevent fraud, abuse, spam, and other harmful activity</li>
                <li>Investigate violations of our rules</li>
                <li>Monitor technical performance</li>
                <li>Fix bugs and other technical problems</li>
                <li>Respond to support requests</li>
                <li>Measure platform performance and engagement</li>
                <li>Understand general trends among our users</li>
                <li>Display advertising and measure advertising performance where applicable</li>
                <li>Comply with applicable laws and legal obligations</li>
              </ul>
            </div>

            {/* Section 3 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                3. Analytics and Usage Data
              </h3>
              <p>
                XoraTV may analyze aggregated or otherwise appropriately protected information about
                how people use the platform.
              </p>
              <p>
                This can include information such as which features are popular, how long users
                generally watch content, which content categories receive engagement, and where
                users encounter technical difficulties.
              </p>
              <p>
                We use these insights to improve XoraTV. Where practical, we may use aggregated or
                de-identified information for analytics, reporting, research, product development,
                and other legitimate business purposes.
              </p>
            </div>

            {/* Section 4 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                4. Cookies and Similar Technologies
              </h3>
              <p>
                XoraTV may use cookies, local storage, pixels, SDKs, and similar technologies to:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Keep users signed in</li>
                <li>Remember preferences</li>
                <li>Maintain sessions</li>
                <li>Improve website functionality</li>
                <li>Understand how users use XoraTV</li>
                <li>Improve performance</li>
                <li>Detect security issues</li>
                <li>Measure advertising and promotional performance</li>
              </ul>
              <p>
                Some third-party services used by XoraTV may also use their own cookies or similar
                technologies in accordance with their own privacy policies.
              </p>
              <p>
                You may be able to control cookies through your browser or device settings.
                Disabling certain technologies may affect some XoraTV features.
              </p>
            </div>

            {/* Section 5 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                5. Advertising
              </h3>
              <p>XoraTV may display advertisements from third-party advertising partners.</p>
              <p>
                Advertising partners may collect certain information through cookies, pixels, or
                similar technologies to provide, personalize, measure, or improve advertising,
                subject to their own policies and applicable laws.
              </p>
              <p>
                XoraTV does not guarantee or control the privacy practices of third-party
                advertisers or websites that users may access through advertisements.
              </p>
            </div>

            {/* Section 6 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                6. Third-Party Services
              </h3>
              <p>
                XoraTV may use third-party service providers to help operate the platform. These
                services may include providers for:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Hosting</li>
                <li>Database services</li>
                <li>Authentication</li>
                <li>Analytics</li>
                <li>Content delivery</li>
                <li>Advertising</li>
                <li>Security</li>
                <li>Email and communications</li>
                <li>Video and media delivery</li>
                <li>Error monitoring</li>
              </ul>
              <p>
                These providers may process information on our behalf as necessary to provide their
                services. Third-party services may have their own privacy policies and terms.
              </p>
            </div>

            {/* Section 7 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                7. Content You Publish
              </h3>
              <p>
                If you create an account or publish content on XoraTV, information associated with
                your public profile and content may be visible to other users. This may include:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Your display name</li>
                <li>Profile picture</li>
                <li>Public profile information</li>
                <li>Videos</li>
                <li>Posts</li>
                <li>Comments</li>
                <li>Other content you choose to publish</li>
              </ul>
              <p>Please consider carefully what information you make publicly available.</p>
            </div>

            {/* Section 8 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                8. Information Sharing
              </h3>
              <p>
                XoraTV does not sell your personal information simply because you use our platform.
              </p>
              <p>We may share information when reasonably necessary to:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Provide XoraTV's services</li>
                <li>Work with service providers that help operate XoraTV</li>
                <li>Maintain security and prevent abuse</li>
                <li>Protect the rights, safety, and property of XoraTV and its users</li>
                <li>Comply with legal obligations</li>
                <li>Respond to valid legal requests</li>
                <li>Investigate suspected fraud or abuse</li>
                <li>
                  Facilitate a business transaction such as a merger, acquisition, restructuring, or
                  sale of assets
                </li>
              </ul>
              <p>
                We may also share aggregated or de-identified information that does not reasonably
                identify individual users.
              </p>
            </div>

            {/* Section 9 */}
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <h3 className="font-display text-base font-semibold text-foreground">
                9. Data Retention & 7-Day Chat Expiration
              </h3>
              <p>
                We retain information for as long as reasonably necessary for the purposes described
                in this Privacy Policy, including providing our services, maintaining security,
                resolving disputes, enforcing our agreements, and complying with legal obligations.
              </p>
              <p>
                The length of time information is retained may vary depending on the type of
                information and how it is used.
              </p>
              <p className="font-semibold text-primary">
                Chat messages on XoraTV are automatically deleted after 7 days.
              </p>
            </div>

            {/* Section 10 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                10. Data Security
              </h3>
              <p>
                We take reasonable technical and organizational measures designed to protect
                information against unauthorized access, loss, misuse, alteration, or disclosure.
              </p>
              <p>
                However, no internet service or method of electronic storage can be guaranteed to be
                completely secure. You should use a strong password and protect your account
                credentials.
              </p>
            </div>

            {/* Section 11 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                11. Children's Privacy
              </h3>
              <p>
                XoraTV is not intended for children who are below the minimum age required to use
                online services under applicable law without appropriate parental or guardian
                involvement.
              </p>
              <p>
                If we become aware that we have collected personal information from a child in
                circumstances where such collection is not permitted, we will take reasonable steps
                to address the situation. Parents or guardians who believe that a child has provided
                personal information to XoraTV may contact us.
              </p>
            </div>

            {/* Section 12 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                12. Your Choices and Rights
              </h3>
              <p>
                Depending on your location and applicable law, you may have rights regarding your
                personal information, including the right to:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Request access to certain personal information</li>
                <li>Request correction of inaccurate information</li>
                <li>Request deletion of certain information</li>
                <li>Object to or restrict certain processing</li>
                <li>Request a copy of certain information</li>
                <li>Withdraw consent where processing is based on consent</li>
                <li>Manage certain cookies or similar technologies</li>
                <li>Close your XoraTV account</li>
              </ul>
              <p>
                Some information may need to be retained where we have a legitimate legal or
                security reason to do so. To make a privacy-related request, please contact XoraTV
                using the contact information provided on our platform.
              </p>
            </div>

            {/* Section 13 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                13. Account Deletion
              </h3>
              <p>
                If XoraTV provides an account deletion feature, you may use that feature to request
                deletion of your account.
              </p>
              <p>
                Deleting an account may not immediately remove information that must be retained for
                legal, security, fraud-prevention, dispute-resolution, or other legitimate purposes.
                Public content may also remain available where it has been shared or reposted by
                other users, subject to the features and policies of XoraTV.
              </p>
            </div>

            {/* Section 14 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                14. International Data Processing
              </h3>
              <p>
                Depending on the services and infrastructure used by XoraTV, your information may be
                processed or stored in countries other than the country where you live. Where
                required by applicable law, we will take appropriate measures for international
                transfers of personal information.
              </p>
            </div>

            {/* Section 15 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                15. Changes to This Privacy Policy
              </h3>
              <p>
                We may update this Privacy Policy from time to time as XoraTV develops new features,
                changes its services, or as applicable laws change.
              </p>
              <p>
                When we make significant changes, we may provide notice through XoraTV or other
                appropriate means. The “Last Updated” date at the beginning of this policy indicates
                when the policy was most recently updated.
              </p>
            </div>

            {/* Section 16 */}
            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="font-display text-base font-semibold text-foreground">
                16. Contact Us
              </h3>
              <p>
                If you have questions, concerns, or requests regarding this Privacy Policy or the
                way XoraTV handles information, please contact us through the official
                contact/support channel provided on XoraTV.
              </p>
              <div className="rounded-xl border border-border bg-surface-2 p-4 text-xs space-y-1">
                <p className="font-semibold text-foreground">XoraTV</p>
                <p className="text-muted-foreground">
                  Website:{" "}
                  <a
                    href="https://xoratv-x.onrender.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    https://xoratv-x.onrender.com
                  </a>
                </p>
                <p className="text-muted-foreground">Last Updated: September 15, 2026</p>
              </div>
            </div>
          </div>
        </div>

        {/* Terms of Service Section */}
        <div
          id="terms"
          className="scroll-mt-20 rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8"
        >
          <div className="flex items-center gap-2 border-b border-border pb-4">
            <ScrollText className="size-5 text-primary" />
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
                XoraTV Terms of Service
              </h2>
              <p className="text-xs text-muted-foreground">Last Updated: September 16, 2026</p>
            </div>
          </div>

          <div className="mt-6 space-y-6 text-sm leading-relaxed text-foreground/90">
            <p>
              Welcome to XoraTV (“XoraTV,” “Xora,” “we,” “us,” or “our”). These Terms of Service
              (“Terms”) govern your access to and use of the XoraTV website, PWA, applications,
              services, features, content, rewards, and other services operated by XoraTV.
            </p>
            <p>
              By creating an account or using XoraTV, you agree to these Terms. If you do not agree
              with these Terms, please do not use XoraTV.
            </p>

            {/* Section 1 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                1. About XoraTV
              </h3>
              <p>
                XoraTV is a social video and entertainment platform where users may discover, watch,
                share, upload, and interact with content.
              </p>
              <p>Depending on the features available at a particular time, XoraTV may provide:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Video streaming</li>
                <li>Short-form videos</li>
                <li>Creator content</li>
                <li>Educational content</li>
                <li>User profiles</li>
                <li>Likes and comments</li>
                <li>Following and sharing</li>
                <li>Search and discovery</li>
                <li>Creator features</li>
                <li>Promotional campaigns</li>
                <li>Engagement rewards</li>
                <li>Other social and entertainment features</li>
              </ul>
              <p>
                XoraTV may introduce, modify, suspend, or discontinue features from time to time.
              </p>
            </div>

            {/* Section 2 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                2. Eligibility
              </h3>
              <p>You must provide accurate information when creating or using an XoraTV account.</p>
              <p>
                You are responsible for ensuring that your use of XoraTV complies with the laws
                applicable to you.
              </p>
              <p>
                Where a particular XoraTV feature has additional eligibility requirements, those
                requirements apply in addition to these Terms.
              </p>
            </div>

            {/* Section 3 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                3. XoraTV Engagement Reward
              </h3>
              <p>XoraTV may operate promotional engagement-reward programs from time to time.</p>
              <p>
                As part of such promotions, eligible new users may have an opportunity to receive a
                1GB mobile-data reward after completing the applicable qualification requirements.
              </p>
              <p>
                The reward is intended to encourage genuine participation and engagement on XoraTV.
              </p>
              <p className="font-medium text-foreground">Important:</p>
              <p>The 1GB reward is not guaranteed to every new user.</p>
              <p>Availability may depend on:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Campaign availability</li>
                <li>Available reward allocation</li>
                <li>User eligibility</li>
                <li>Completion of the required activities</li>
                <li>Verification of the user's activity</li>
                <li>Compliance with these Terms</li>
                <li>Network or technical availability</li>
                <li>Other conditions announced by XoraTV</li>
              </ul>
              <p>
                The reward may be available to most users who genuinely participate and satisfy the
                requirements, but XoraTV does not promise that every applicant will receive a
                reward.
              </p>
            </div>

            {/* Section 4 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                4. How to Qualify for the New-User Reward
              </h3>
              <p>
                XoraTV may establish specific qualification requirements for each reward campaign.
              </p>
              <p>Unless a campaign states otherwise, qualification may require a new user to:</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Create a legitimate XoraTV account.</li>
                <li>Complete any required application or reward registration.</li>
                <li>Use the same legitimate account consistently.</li>
                <li>Watch and engage with content on XoraTV.</li>
                <li>Perform genuine activities required by the campaign.</li>
                <li>Meet the minimum activity or engagement requirements announced by XoraTV.</li>
                <li>
                  Remain compliant with XoraTV's Terms of Service and other applicable policies.
                </li>
                <li>Successfully pass XoraTV's eligibility and anti-abuse verification.</li>
              </ol>
              <p>XoraTV may verify activity before approving a reward.</p>
              <p>
                Simply creating an account does not automatically qualify a user for the reward.
              </p>
            </div>

            {/* Section 5 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                5. Genuine Engagement Requirement
              </h3>
              <p>XoraTV rewards are intended for genuine users and genuine participation.</p>
              <p>Engagement should represent normal use of the platform.</p>
              <p>Users must not artificially generate engagement through:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Bots</li>
                <li>Automated scripts</li>
                <li>Fake accounts</li>
                <li>Account farms</li>
                <li>Automated viewing</li>
                <li>Artificial likes</li>
                <li>Artificial follows</li>
                <li>Artificial comments</li>
                <li>Repeated or coordinated fraudulent activity</li>
                <li>Manipulation of XoraTV systems</li>
                <li>Any other method designed primarily to obtain rewards unfairly</li>
              </ul>
              <p>
                XoraTV may disregard activity that it reasonably determines to be artificial,
                fraudulent, manipulated, or otherwise inconsistent with genuine platform use.
              </p>
            </div>

            {/* Section 6 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                6. Duplicate Accounts and Reward Farming
              </h3>
              <p>
                Creating duplicate accounts for the purpose of farming, multiplying, or repeatedly
                claiming XoraTV rewards is prohibited.
              </p>
              <p>A user must not create multiple accounts in order to:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Obtain the new-user reward more than once</li>
                <li>Circumvent reward limits</li>
                <li>Artificially increase engagement</li>
                <li>Manipulate campaigns</li>
                <li>Transfer or multiply promotional benefits</li>
                <li>Exploit referral or reward systems</li>
              </ul>
              <p>
                If XoraTV determines that an individual has created or controlled duplicate accounts
                for reward abuse, XoraTV may:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Disqualify the affected accounts from the reward</li>
                <li>Cancel pending rewards</li>
                <li>
                  Reverse or invalidate improperly obtained rewards where technically or legally
                  possible
                </li>
                <li>Restrict the user's participation in future reward programs</li>
                <li>Suspend or terminate affected accounts</li>
                <li>Restrict the user from accessing XoraTV and any of its services</li>
              </ul>
              <p>
                Attempting to obtain rewards through duplicate accounts may therefore result in
                permanent disqualification from XoraTV services.
              </p>
              <p>
                XoraTV may use reasonable technical and account-level signals to identify suspected
                duplicate or abusive accounts.
              </p>
            </div>

            {/* Section 7 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                7. Reward Verification
              </h3>
              <p>
                Completion of an activity does not necessarily mean that a reward has been approved.
              </p>
              <p>XoraTV may review an account and its activity before issuing a reward.</p>
              <p>Verification may consider factors including:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Account history</li>
                <li>Engagement patterns</li>
                <li>Device and technical information</li>
                <li>Reward application information</li>
                <li>Account relationships</li>
                <li>Suspected duplicate accounts</li>
                <li>Abnormal activity</li>
                <li>Compliance with XoraTV policies</li>
              </ul>
              <p>XoraTV may delay verification where additional review is necessary.</p>
            </div>

            {/* Section 8 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                8. Reward Availability
              </h3>
              <p>Promotional rewards are subject to availability.</p>
              <p>XoraTV may:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Limit the number of rewards available</li>
                <li>Pause a reward campaign</li>
                <li>Change qualification requirements</li>
                <li>Change the duration of a campaign</li>
                <li>Temporarily suspend rewards</li>
                <li>End a reward campaign</li>
                <li>Replace a reward with another promotional benefit</li>
              </ul>
              <p>
                Unless expressly stated otherwise, participation in a previous reward campaign does
                not create a permanent entitlement to future rewards.
              </p>
            </div>

            {/* Section 9 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                9. Weekly Reward Pull
              </h3>
              <p>
                XoraTV may operate a weekly reward pull or similar promotional selection system.
              </p>
              <p>The reward pull may be conducted approximately every 14 days.</p>
              <p className="font-medium text-foreground">However:</p>
              <p>A reward pull is not guaranteed to take place every 14 days.</p>
              <p>The availability of a reward pull may depend on:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Campaign funding</li>
                <li>Reward availability</li>
                <li>Technical circumstances</li>
                <li>Platform operations</li>
                <li>Verification requirements</li>
                <li>Promotional schedules</li>
                <li>Other circumstances affecting the campaign</li>
              </ul>
              <p>XoraTV may postpone, pause, change, or cancel a reward pull where necessary.</p>
              <p>
                Users should not treat the 14-day period as a guaranteed payment or reward date.
              </p>
            </div>

            {/* Section 10 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                10. No Guaranteed Monetary or Data Reward
              </h3>
              <p>
                Unless XoraTV expressly confirms otherwise, participation in XoraTV does not create
                a guaranteed right to receive money, mobile data, airtime, prizes, or other rewards.
              </p>
              <p>
                Rewards are promotional benefits subject to the applicable campaign requirements.
              </p>
              <p>
                The 1GB data reward, where offered, is a promotional reward and not a salary,
                investment return, guaranteed payment, or contractual income.
              </p>
            </div>

            {/* Section 11 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                11. Mobile Data Rewards
              </h3>
              <p>
                Where XoraTV provides a mobile-data reward, the actual delivery of the data may
                depend on the applicable telecommunications provider, network availability,
                technical systems, and information supplied by the eligible user.
              </p>
              <p>
                XoraTV is not responsible for network outages, incorrect information supplied by
                users, telecommunications-provider failures, or circumstances outside XoraTV's
                reasonable control.
              </p>
              <p>
                Users are responsible for providing accurate information required to receive a
                mobile-data reward.
              </p>
            </div>

            {/* Section 12 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                12. Using XoraTV
              </h3>
              <p>Users are expected to use XoraTV responsibly and respectfully.</p>
              <p>You agree not to:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Violate applicable laws</li>
                <li>Harass, threaten, or abuse other users</li>
                <li>Impersonate another person or organization</li>
                <li>Create fraudulent accounts</li>
                <li>Attempt to gain unauthorized access to accounts or systems</li>
                <li>Distribute malware or malicious code</li>
                <li>Attempt to disrupt XoraTV</li>
                <li>Scrape or automatically collect information without authorization</li>
                <li>Manipulate engagement metrics</li>
                <li>Abuse reward systems</li>
                <li>Upload content you do not have the right to distribute</li>
                <li>Infringe copyright or other intellectual-property rights</li>
                <li>Upload illegal content</li>
                <li>Upload content intended to facilitate criminal activity</li>
                <li>Circumvent security or access controls</li>
                <li>
                  Attempt to reverse engineer protected parts of the service where prohibited by law
                </li>
                <li>Use XoraTV primarily to conduct spam or scams</li>
                <li>Misuse advertising or promotional systems</li>
                <li>
                  Sell, transfer, or commercially exploit an XoraTV account without authorization
                </li>
              </ul>
              <p>XoraTV may take appropriate action when these rules are violated.</p>
            </div>

            {/* Section 13 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                13. User-Generated Content
              </h3>
              <p>
                Users may be able to upload videos, images, posts, comments, or other material to
                XoraTV.
              </p>
              <p>You remain responsible for content you upload.</p>
              <p>By uploading content, you represent that:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>You have the necessary rights or permissions to upload it.</li>
                <li>Your content does not unlawfully infringe another person's rights.</li>
                <li>Your content complies with applicable laws.</li>
                <li>Your content complies with XoraTV's rules.</li>
              </ul>
              <p>You must not upload content that you do not have permission to distribute.</p>
              <p>
                XoraTV may remove, restrict, or disable access to content that violates these Terms,
                applicable law, or our policies.
              </p>
            </div>

            {/* Section 14 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                14. Copyright and Intellectual Property
              </h3>
              <p>XoraTV respects intellectual-property rights.</p>
              <p>
                If you believe content on XoraTV infringes your copyright or other
                intellectual-property rights, you may contact XoraTV through the appropriate support
                or copyright-reporting channel.
              </p>
              <p>XoraTV may remove or restrict content when appropriate.</p>
              <p>
                The XoraTV name, branding, logos, interface, software, original designs, and other
                XoraTV-owned materials remain the property of XoraTV or their respective owners.
              </p>
              <p>
                You may not copy, reproduce, modify, distribute, or commercially exploit
                XoraTV-owned materials without appropriate authorization.
              </p>
            </div>

            {/* Section 15 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                15. Advertising
              </h3>
              <p>XoraTV may display advertisements from third-party advertising providers.</p>
              <p>Advertisements may appear within or around certain areas of the platform.</p>
              <p>
                XoraTV does not necessarily endorse products or services displayed through
                third-party advertisements.
              </p>
              <p>
                Interactions with third-party advertisers may be subject to those companies' own
                terms and privacy policies.
              </p>
            </div>

            {/* Section 16 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                16. Third-Party Services
              </h3>
              <p>XoraTV may rely on third-party services for functions such as:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Hosting</li>
                <li>Authentication</li>
                <li>Databases</li>
                <li>Advertising</li>
                <li>Analytics</li>
                <li>Content delivery</li>
                <li>Payments or rewards</li>
                <li>Telecommunications services</li>
                <li>Security</li>
                <li>Email and communications</li>
              </ul>
              <p>Third-party services may have separate terms and policies.</p>
              <p>XoraTV is not responsible for independent services operated by third parties.</p>
            </div>

            {/* Section 17 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                17. Account Security
              </h3>
              <p>You are responsible for protecting your XoraTV account credentials.</p>
              <p>You should not share your password or account access with other people.</p>
              <p>
                If you believe your account has been compromised, you should contact XoraTV as soon
                as reasonably possible.
              </p>
              <p>
                You may be responsible for activity occurring through your account where
                appropriate.
              </p>
            </div>

            {/* Section 18 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                18. Suspension and Termination
              </h3>
              <p>
                XoraTV may suspend, restrict, or terminate an account when reasonably necessary,
                including where a user:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Violates these Terms</li>
                <li>Abuses reward programs</li>
                <li>Creates fraudulent or duplicate accounts</li>
                <li>Uses automated systems to manipulate the platform</li>
                <li>Engages in illegal activity</li>
                <li>Attempts to compromise platform security</li>
                <li>Uploads prohibited content</li>
                <li>Repeatedly violates XoraTV policies</li>
                <li>Attempts to defraud XoraTV or other users</li>
              </ul>
              <p>
                Depending on the circumstances, termination may result in loss of access to the
                account, content, rewards, promotional programs, and other XoraTV services.
              </p>
            </div>

            {/* Section 19 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                19. Changes to XoraTV
              </h3>
              <p>XoraTV is continuously developing.</p>
              <p>
                We may change, improve, add, remove, suspend, or discontinue features at any time.
              </p>
              <p>This may include changes to:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>The user interface</li>
                <li>Video features</li>
                <li>Creator programs</li>
                <li>Reward programs</li>
                <li>Eligibility requirements</li>
                <li>Promotional campaigns</li>
                <li>Advertising</li>
                <li>Search and recommendation systems</li>
                <li>Account features</li>
              </ul>
              <p>Where appropriate, we may provide notice of significant changes.</p>
            </div>

            {/* Section 20 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                20. Service Availability
              </h3>
              <p>XoraTV is provided on an availability basis.</p>
              <p>
                We work to keep the platform functional and reliable, but we cannot guarantee that
                XoraTV will always be available or free from:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Downtime</li>
                <li>Bugs</li>
                <li>Errors</li>
                <li>Network problems</li>
                <li>Maintenance</li>
                <li>Service interruptions</li>
                <li>Third-party failures</li>
              </ul>
              <p>Some features may occasionally be unavailable.</p>
            </div>

            {/* Section 21 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                21. Limitation of Liability
              </h3>
              <p>
                To the extent permitted by applicable law, XoraTV will not be responsible for losses
                arising from circumstances outside our reasonable control, including third-party
                network failures, telecommunications failures, internet outages, unauthorized
                actions by third parties, or temporary service interruptions.
              </p>
              <p>
                Nothing in these Terms is intended to exclude rights or protections that cannot
                legally be excluded under applicable law.
              </p>
            </div>

            {/* Section 22 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">22. Privacy</h3>
              <p>Your use of XoraTV is also subject to our Privacy Policy.</p>
              <p>
                Our Privacy Policy explains what information XoraTV may collect, including
                information about how users interact with the platform, and how that information may
                be used to operate and improve XoraTV.
              </p>
            </div>

            {/* Section 23 */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display text-base font-semibold text-foreground">
                23. Changes to These Terms
              </h3>
              <p>XoraTV may update these Terms when necessary.</p>
              <p>
                When changes are made, the updated version will be posted on XoraTV with a new “Last
                Updated” date.
              </p>
              <p>
                Your continued use of XoraTV after an updated version becomes effective means that
                you agree to the updated Terms to the extent permitted by applicable law.
              </p>
            </div>

            {/* Section 24 */}
            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="font-display text-base font-semibold text-foreground">24. Contact</h3>
              <p>
                If you have questions about these Terms, XoraTV rewards, account restrictions, or
                other aspects of the service, please contact XoraTV through the official support or
                contact channel provided on the platform.
              </p>
              <div className="rounded-xl border border-border bg-surface-2 p-4 text-xs space-y-1">
                <p className="font-semibold text-foreground">XoraTV</p>
                <p className="text-muted-foreground">Last Updated: September 16, 2026</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="flex flex-col items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground sm:flex-row">
          <p>© 2026 XoraTV. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#privacy" className="hover:underline">
              Privacy Policy
            </a>
            <a href="#terms" className="hover:underline">
              Terms of Service
            </a>
            <Link to="/" className="hover:underline">
              Home
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
