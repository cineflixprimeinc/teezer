import type { Metadata } from "next";
import { LegalShell, H2, P, UL, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Music Attribution",
  description: "How Teezer identifies music in videos, what an Original Track or Original Sound credit means, and what it does not claim about copyright.",
  alternates: { canonical: "https://teezer.live/policies/music-attribution" },
};

const LAST_UPDATED = "September 3, 2026";
const CONTACT_EMAIL = "support@teezer.live";
const RIGHTS_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "scope", label: "What This Covers" },
  { id: "how", label: "How Music Is Identified" },
  { id: "credits", label: "The Two Credits" },
  { id: "means", label: "What a Credit Does Not Mean" },
  { id: "data", label: "What We Store" },
  { id: "apple-music", label: "Links to Apple Music" },
  { id: "wrong", label: "If a Credit Is Wrong" },
  { id: "rights", label: "For Rights Holders" },
  { id: "contact", label: "Contact" },
];

const RELATED: RelatedDoc[] = [
  { href: "/guidelines", label: "Community Guidelines", desc: "The rules every account agrees to follow." },
  { href: "/policies/enforcement", label: "Enforcement & Appeals", desc: "How decisions are made and challenged." },
  { href: "/policies/integrity", label: "Integrity & Authenticity", desc: "Impersonation and misattribution rules." },
  { href: "/privacy", label: "Privacy Policy", desc: "What we collect and why." },
];

export default function MusicAttributionPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="music-attribution" eyebrow="Policy · Music Attribution" fallback={
      <LegalShell eyebrow="Policy · Music Attribution" title="Music Attribution" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        Teezer tries to identify commercially released music heard in the videos people post, so
        viewers can see what a track is and go and listen to it properly. This page explains what
        that credit means, what it deliberately does not mean, and what to do if it is wrong.
      </P>

      <H2 id="scope" n={1}>What This Covers</H2>
      <P>
        This policy is about <strong>identification and credit</strong> - the line of text under a
        video naming a track or a creator. It is not a licensing policy and it is not a copyright
        policy. Those are separate, and are handled under our{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink> and{" "}
        <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink>.
      </P>

      <H2 id="how" n={2}>How Music Is Identified</H2>
      <P>
        When a video is posted, Teezer may analyse its audio and compare it against a catalogue of
        commercially released recordings, using the same kind of acoustic matching that music
        identification apps use. It compares a compact acoustic signature rather than storing or
        sharing the audio itself.
      </P>
      <UL>
        <li>Identification is automatic. Nobody at Teezer listens to your video to produce this credit.</li>
        <li>It runs in the background, and never delays or blocks posting.</li>
        <li>Not all music can be identified. Live recordings, covers, heavily edited audio, quiet background music and anything outside the catalogue frequently cannot be matched.</li>
        <li>A credit only appears once the result is settled. While identification is still running, no music credit is shown - we would rather show nothing than credit the wrong person for a few seconds.</li>
      </UL>
      <P>
        We do not publish the specific thresholds, sampling strategy or scoring we use to decide
        whether a match is good enough. Those details would make the system straightforward to work
        around, and the people most motivated to do that are the ones passing off other people&apos;s
        recordings as their own.
      </P>

      <H2 id="credits" n={3}>The Two Credits</H2>
      <P>
        Every video carries exactly one of two credits, and the wording of each is deliberate.
      </P>
      <UL>
        <li>
          <strong>Original Track — Artist Name.</strong> A commercially released recording was
          identified in the audio, and this is the artist credited on that recording. Tapping it
          opens the track&apos;s details.
        </li>
        <li>
          <strong>Original Sound — @username.</strong> No release was identified, so the audio is
          credited to the account that posted it. This is a statement about where the audio came from
          on Teezer - nothing more.
        </li>
      </UL>
      <P>
        &quot;Original Sound&quot; is also what you see when identification finds nothing, is unsure,
        or fails. We treat an uncertain match the same as no match: naming an artist we are not
        confident about would credit somebody else&apos;s work to a stranger, which is the worse
        mistake of the two.
      </P>

      <H2 id="means" n={4}>What a Credit Does Not Mean</H2>
      <P>
        This section is the important one, and it applies to both credits.
      </P>
      <UL>
        <li>
          <strong>An Original Track credit does not establish ownership.</strong> Identifying a
          recording tells you which recording it is. It does not determine who holds the copyright in
          that recording or the underlying composition, which are frequently different parties.
        </li>
        <li>
          <strong>It is not a licence.</strong> A credit does not mean Teezer or the person posting
          has permission to use that recording, and it does not grant anyone any rights.
        </li>
        <li>
          <strong>An Original Sound credit is not a claim of authorship.</strong> It means no release
          was identified. It does not mean the account created the audio, and it does not mean the
          audio is free of anyone else&apos;s rights.
        </li>
        <li>
          <strong>A credit is not a moderation decision.</strong> Content is not removed, muted or
          restricted merely because music was identified in it. Identification and enforcement are
          separate systems, and an identification alone never triggers an action against a post.
        </li>
      </UL>

      <H2 id="data" n={5}>What We Store</H2>
      <P>
        For an identified recording we keep standard catalogue metadata - the title, credited artist,
        release, artwork, and industry identifiers such as an ISRC - together with a record of when
        the identification happened and roughly where in the video the music was found.
      </P>
      <P>
        A recording is stored once and shared by every video containing it, rather than copied for
        each post. Where an identification comes from a device rather than our servers, we keep the
        result, not the audio. See our <DocLink href="/privacy">Privacy Policy</DocLink> for how this
        sits alongside everything else we hold.
      </P>

      <H2 id="apple-music" n={6}>Links to Apple Music</H2>
      <P>
        Where an identified recording has a known Apple Music page, the track details show a link to
        it. Teezer does not stream the full commercial recording; the link takes you to Apple Music,
        which is a separate service with its own terms and privacy policy.
      </P>
      <P>
        We only ever show that link when the identification actually provided one. We never construct
        or guess a link, so you should not encounter a music button that leads nowhere.
      </P>

      <H2 id="wrong" n={7}>If a Credit Is Wrong</H2>
      <P>
        Automatic identification makes mistakes in both directions - crediting the wrong recording, or
        failing to identify one that is there. If a credit on your video is wrong, or a video credits
        your recording incorrectly, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fe2c55] hover:underline">{CONTACT_EMAIL}</a>{" "}
        with the video link and what you believe the correct credit is.
      </P>
      <P>
        Correcting a credit is not the same as a copyright complaint. If you want content removed
        rather than re-credited, use the process in the next section.
      </P>

      <H2 id="rights" n={8}>For Rights Holders</H2>
      <P>
        If you hold rights in a recording or composition and want to raise an infringement claim,
        contact{" "}
        <a href={`mailto:${RIGHTS_EMAIL}`} className="font-semibold text-[#fe2c55] hover:underline">{RIGHTS_EMAIL}</a>{" "}
        with the subject line &quot;Music Rights&quot;, identifying the work, the specific videos, and
        your authority to act. Claims are handled under our{" "}
        <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink> policy.
      </P>
      <P>
        Please note that a Teezer music credit is not evidence for or against a claim. It records
        what was identified, not who owns it, and we do not treat it as a determination of rights in
        either direction.
      </P>

      <H2 id="contact" n={9}>Contact</H2>
      <P>
        Questions about this policy:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fe2c55] hover:underline">{CONTACT_EMAIL}</a>{" "}
        with the subject line &quot;Music Attribution&quot;.
      </P>
    </LegalShell>
    } />
  );
}
