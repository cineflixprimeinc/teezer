import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description:
    "The rules for content and behaviour on Teezer - what's allowed, what's not, how we moderate, and how to report.",
  alternates: { canonical: "https://teezer.live/guidelines" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Our Approach" },
  { id: "safety", label: "Safety and Physical Harm" },
  { id: "adult-content", label: "Adult and Sexual Content" },
  { id: "minors", label: "Protecting Minors" },
  { id: "harassment", label: "Harassment and Bullying" },
  { id: "hate", label: "Hateful Behaviour" },
  { id: "violence", label: "Violent and Graphic Content" },
  { id: "integrity", label: "Integrity and Authenticity" },
  { id: "ai-content", label: "AI-Generated Content" },
  { id: "ip-privacy", label: "Copyright and Privacy of Others" },
  { id: "enforcement", label: "How We Enforce These Rules" },
  { id: "appeals", label: "Appeals" },
  { id: "reporting", label: "Reporting" },
];

const RELATED: RelatedDoc[] = [
  { href: "/terms", label: "Terms of Service", desc: "The agreement that governs your use of Teezer." },
  { href: "/privacy", label: "Privacy Policy", desc: "How we collect, use and protect your information." },
  { href: "/settings/privacy", label: "Privacy Settings", desc: "Manage your privacy controls directly in your account." },
];

/** Severity chip used in the enforcement matrix. */
function Chip({ tone, children }: { tone: "green" | "amber" | "red" | "black"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    black: "bg-gray-900 text-white ring-gray-900",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

export default function GuidelinesPage() {
  return (
    <CmsAwarePolicyPage slug="guidelines" eyebrow="Legal · Community" fallback={
      <LegalShell eyebrow="Legal · Community" title="Community Guidelines" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        Teezer is a place to create, watch and share short videos. These Community Guidelines set out what is and
        isn&apos;t allowed, so the Platform stays welcoming, authentic and safe for everyone. They apply to all
        content and behaviour on Teezer - videos, stories, sounds, comments, messages, profiles, usernames and live
        features - and they form part of our <DocLink href="/terms">Terms of Service</DocLink>.
      </P>

      {/* At a glance */}
      <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">The guidelines at a glance</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            ["Be safe", "No violence, dangerous acts, self-harm content or illegal activity."],
            ["Be respectful", "No harassment, bullying, hate speech or doxxing - ever."],
            ["Be authentic", "No impersonation, fake engagement, spam or deceptive content."],
            ["Protect minors", "Zero tolerance for any content that harms or endangers children."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-gray-900">{t}</p>
              <p className="mt-1 text-sm leading-6 text-gray-600">{d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 1 */}
      <H2 id="overview" n={1}>Our Approach</H2>
      <P>
        Every upload is checked by automated content-safety systems before it reaches the feed, and our moderation
        team reviews content that is flagged automatically or reported by users. When content breaks these rules we
        remove or restrict it; when behaviour breaks these rules we warn, restrict, suspend or permanently ban the
        account, depending on severity and history. We aim to be consistent and proportionate - and serious harm is
        removed immediately.
      </P>
      <P>
        Context matters. Educational, documentary, scientific, artistic and counter-speech content may be allowed
        where the same material would otherwise violate a rule - we consider intent, framing and audience when we
        review.
      </P>

      {/* 2 */}
      <H2 id="safety" n={2}>Safety and Physical Harm</H2>
      <DataTable
        headers={["Allowed", "Not allowed"]}
        rows={[
          [
            "Awareness, recovery and prevention content about self-harm or addiction, handled responsibly.",
            "Content that promotes, instructs or glorifies suicide, self-harm or eating disorders.",
          ],
          [
            "Professionally supervised sports, stunts and action content with appropriate safety context.",
            "Dangerous challenges, stunts or activities likely to cause injury if imitated - especially by young viewers.",
          ],
          [
            "News and educational discussion of weapons, drugs or crime.",
            "Instructions for making weapons or explosives; buying, selling or promoting illegal drugs or regulated goods; facilitating criminal activity.",
          ],
          [
            "Fictional or clearly staged action content.",
            "Threats or incitement of violence against any person, group or place - including celebrating violent acts.",
          ],
        ]}
      />

      {/* 3 */}
      <H2 id="adult-content" n={3}>Adult and Sexual Content</H2>
      <UL>
        <li>Nudity, pornography and sexually explicit content are not allowed. Every upload is screened automatically before it can reach the feed.</li>
        <li>Sexually suggestive content involving implied nudity or sexual framing may be removed or restricted from recommendations.</li>
        <li>Sexual solicitation - offering, asking for or linking to sexual services or explicit material - is not allowed.</li>
        <li>Sharing or threatening to share intimate images of any person without their consent is strictly prohibited.</li>
        <li>Non-sexual nudity in specific contexts (medical, educational, breastfeeding, protest) may be allowed with clear context.</li>
      </UL>

      {/* 4 */}
      <H2 id="minors" n={4}>Protecting Minors</H2>
      <P>
        Nothing matters more to us than the safety of young people. You must be at least 13 years old (or your
        country&apos;s higher minimum) to use Teezer.
      </P>
      <UL>
        <li>Any content that sexualizes, exploits, grooms or endangers a minor is removed immediately, the account is permanently banned, and where required we report it to the authorities and preserve evidence.</li>
        <li>Do not post content of minors in dangerous situations, or content that reveals a minor&apos;s private information.</li>
        <li>Adults must not use Teezer messaging to make unwanted contact with minors.</li>
        <li>If you believe a user is underage, report the account in-app - see <DocLink href="/privacy">Children and Teens</DocLink> in our Privacy Policy.</li>
      </UL>

      {/* 5 */}
      <H2 id="harassment" n={5}>Harassment and Bullying</H2>
      <DataTable
        headers={["Allowed", "Not allowed"]}
        rows={[
          [
            "Criticism of public figures' public actions, satire and strong opinions expressed respectfully.",
            "Degrading, shaming, threatening or intimidating any person, or coordinating others to do so (brigading).",
          ],
          [
            "Sharing your own experiences, including naming your own harasser to seek help.",
            "Doxxing - sharing someone's address, phone number, ID documents or private messages without consent.",
          ],
          [
            "Flirtatious content between consenting adults.",
            "Sexual harassment - unwanted sexualized comments, messages or requests.",
          ],
          [
            "Blocking, restricting and filtering people from your own space.",
            "Creating accounts to evade someone's block or continue contact they've refused.",
          ],
        ]}
      />
      <P>
        You control your own space: use comment filters, hidden words, per-user comment restrictions, message
        controls and blocking - all available in{" "}
        <DocLink href="/settings/privacy">Settings → Privacy</DocLink>.
      </P>

      {/* 6 */}
      <H2 id="hate" n={6}>Hateful Behaviour</H2>
      <P>
        Teezer does not allow hate speech or hateful ideologies. Do not attack, dehumanize, mock or exclude people -
        in videos, sounds, comments, usernames, profiles or messages - on the basis of:
      </P>
      <UL>
        <li>Race, ethnicity, national origin or caste;</li>
        <li>Religion or belief;</li>
        <li>Sexual orientation, sex or gender identity;</li>
        <li>Disability or serious disease;</li>
        <li>Immigration or refugee status.</li>
      </UL>
      <P>
        Content that promotes hateful ideologies, their symbols, slogans or leaders is removed, whether or not a
        specific person is targeted. Counter-speech, education and documentary coverage are allowed with clear
        context.
      </P>

      {/* 7 */}
      <H2 id="violence" n={7}>Violent and Graphic Content</H2>
      <UL>
        <li>Do not post gratuitously graphic, gory or shocking content intended to disgust or disturb.</li>
        <li>Newsworthy graphic content may be allowed with warnings and restricted distribution, where it serves the public interest.</li>
        <li>Content produced by or promoting terrorist organizations, violent extremists or organized hate groups is removed and reported where required.</li>
        <li>Depictions of animal cruelty are not allowed.</li>
      </UL>

      {/* 8 */}
      <H2 id="integrity" n={8}>Integrity and Authenticity</H2>
      <DataTable
        headers={["Allowed", "Not allowed"]}
        rows={[
          [
            "Clearly labelled parody, commentary and fan accounts.",
            "Impersonating people or organizations, or misrepresenting who you are.",
          ],
          [
            "Growing your audience through real content and engagement.",
            "Buying or selling likes, views, followers, shares or gifts; coordinated engagement manipulation; account trading.",
          ],
          [
            "Honest promotion of your own products or services, within reason.",
            "Spam, deceptive links, pyramid schemes, phishing, scams and fraudulent commercial content.",
          ],
          [
            "Sharing opinions and commentary on current events.",
            "Harmful misinformation that risks public health, safety or election integrity, presented as fact.",
          ],
        ]}
      />

      {/* 9 */}
      <H2 id="ai-content" n={9}>AI-Generated Content</H2>
      <UL>
        <li>AI-generated and heavily synthesized content is welcome on Teezer - creativity is the point - but it must not mislead.</li>
        <li>Teezer labels AI-generated uploads so viewers have context; do not remove or evade these labels.</li>
        <li>Do not use AI to create realistic depictions of real people saying or doing things they never did, without clear disclosure and consent.</li>
        <li>AI-generated sexual imagery of real people, and any AI-generated content involving minors, is strictly prohibited.</li>
      </UL>

      {/* 10 */}
      <H2 id="ip-privacy" n={10}>Copyright and the Privacy of Others</H2>
      <UL>
        <li>Only post content you created or have the right to use, including music, clips and images. Copyright complaints can be filed in-app or via {CONTACT_EMAIL} - the process is described in our <DocLink href="/terms">Terms of Service</DocLink>.</li>
        <li>Do not record or share private moments of identifiable people without their consent.</li>
        <li>Respect others&apos; privacy settings - do not re-share private-account content outside its intended audience, and do not share private conversations without consent.</li>
      </UL>

      {/* 11 */}
      <H2 id="enforcement" n={11}>How We Enforce These Rules</H2>
      <P>
        Enforcement is graduated and considers severity, context, intent and account history. This matrix shows the
        typical response at each level:
      </P>
      <DataTable
        headers={["Severity", "Examples", "Typical action"]}
        rows={[
          [
            <Chip key="l" tone="green">Low</Chip>,
            "Borderline content, first-time minor violations",
            "Content removed or excluded from recommendations; warning issued",
          ],
          [
            <Chip key="m" tone="amber">Medium</Chip>,
            "Repeated violations, harassment, spam, engagement manipulation",
            "Content removed; features restricted (comments, uploads, messaging); temporary suspension",
          ],
          [
            <Chip key="h" tone="red">High</Chip>,
            "Sexual content, violent threats, hate speech, scams, doxxing",
            "Content removed; account suspended or permanently banned",
          ],
          [
            <Chip key="z" tone="black">Zero tolerance</Chip>,
            "Child sexual abuse material, terrorism, imminent real-world danger",
            "Immediate permanent ban; evidence preserved and reported to authorities where required",
          ],
        ]}
      />
      <H3>What enforcement can include</H3>
      <UL>
        <li>Removing or age-gating content, or excluding it from the For You feed and search;</li>
        <li>Holding new uploads for review before they appear publicly;</li>
        <li>Restricting specific features - commenting, messaging, uploading, monetization or live features;</li>
        <li>Temporary suspension or permanent ban of the account;</li>
        <li>Withholding or reversing earnings obtained through violations, as described in the <DocLink href="/terms">Terms of Service</DocLink>;</li>
        <li>Preserving evidence and cooperating with law enforcement where legally required, as described in our <DocLink href="/privacy">Privacy Policy</DocLink>.</li>
      </UL>

      {/* 12 */}
      <H2 id="appeals" n={12}>Appeals</H2>
      <P>
        We make mistakes sometimes. If your content was removed or your account restricted and you believe we got it
        wrong, contact us at {CONTACT_EMAIL} with your username and details of the decision. A member of the
        moderation team who was not involved in the original decision will take another look, and we will tell you
        the outcome.
      </P>

      {/* 13 */}
      <H2 id="reporting" n={13}>Reporting</H2>
      <P>
        You can report any video, story, comment, message or account directly in the app - open the menu on the
        content and choose Report. Every report is reviewed, reporting is confidential, and the person you report is
        not told who reported them. For anything urgent or sensitive you can also reach us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fd4605] hover:underline">
          {CONTACT_EMAIL}
        </a>
        . If someone is in immediate danger, contact your local emergency services first.
      </P>
      <P>Thank you for helping keep Teezer safe and creative.</P>
    </LegalShell>
    } />
  );
}
