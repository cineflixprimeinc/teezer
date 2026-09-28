import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";

export const metadata: Metadata = {
  title: "Tax Information Guide for Creators",
  description:
    "A plain-language guide to tax forms on Teezer - which form applies to you (W-9, W-8BEN, W-8BEN-E), what information you need, how to submit it in Teezer Studio, withholding, and year-end documents.",
  alternates: { canonical: "https://teezer.live/tax-guide" },
};

const LAST_UPDATED = "July 19, 2026";
const CONTACT_EMAIL = "tax@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "why", label: "Why We Collect Tax Information" },
  { id: "which-form", label: "Which Form Applies to You" },
  { id: "what-you-need", label: "Information You Will Need" },
  { id: "how-to-submit", label: "How to Submit in Studio" },
  { id: "review", label: "Review and Status" },
  { id: "withholding", label: "Withholding and Treaty Benefits" },
  { id: "year-end", label: "Year-End Documents" },
  { id: "keeping-current", label: "Keeping Your Details Current" },
  { id: "security", label: "Security and Privacy" },
  { id: "faq", label: "Frequently Asked Questions" },
];

const RELATED: RelatedDoc[] = [
  { href: "/policies/monetization-terms", label: "Monetization Terms", desc: "How earnings, revenue share and payouts work." },
  { href: "/policies/creator-earnings", label: "Creator Earnings & Payouts", desc: "Eligibility, Gift conversion and payout schedule." },
  { href: "/policies/creator-agreement", label: "Creator Agreement", desc: "The terms that govern creating and earning on Teezer." },
];

export default function TaxGuidePage() {
  return (
    <LegalShell
      eyebrow="Guide · Creator Taxes"
      title="Tax Information Guide"
      lastUpdated={LAST_UPDATED}
      toc={TOC}
      related={RELATED}
    >
      <P>
        This guide explains, in plain language, the tax forms Teezer may ask you to complete before you can receive
        payouts. It is written to help you choose the right form and submit it correctly the first time. It is not tax
        advice - for advice about your personal situation, please consult a qualified tax professional in your country.
      </P>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-[14px] leading-6 text-amber-900">
        <strong className="font-bold">Important:</strong> You are responsible for the accuracy of the tax information you
        provide and for any taxes owed on your earnings. Providing incorrect or incomplete information can delay or pause
        your payouts.
      </div>

      <H2 id="overview" n={1}>Overview</H2>
      <P>
        Teezer operates globally and is required by tax authorities to identify who is receiving payouts and, in some
        cases, to withhold and report tax. Before your first payout - and whenever your circumstances change - we collect
        a tax form so we can pay you correctly and stay compliant with the law. You submit and manage everything from{" "}
        <strong>Teezer Studio → Settings → Tax Forms</strong>.
      </P>

      <H2 id="why" n={2}>Why We Collect Tax Information</H2>
      <UL>
        <li><strong>To pay you on time.</strong> A verified tax form is a prerequisite for releasing payouts.</li>
        <li><strong>To determine withholding.</strong> Your tax status and country of residence decide whether any tax must be withheld before you are paid.</li>
        <li><strong>To meet reporting duties.</strong> Where the law requires it, we report payments and issue year-end documents.</li>
        <li><strong>To apply treaty benefits.</strong> A valid form may reduce the amount withheld if a tax treaty applies to you.</li>
      </UL>

      <H2 id="which-form" n={3}>Which Form Applies to You</H2>
      <P>
        Teezer Studio guides you to the correct form, but the table below is a quick reference. Most creators outside the
        United States use a <strong>W-8BEN</strong>; U.S. persons use a <strong>W-9</strong>.
      </P>
      <DataTable
        headers={["Form", "Who it is for", "Typical creator"]}
        rows={[
          ["W-8BEN", "Individuals who are NOT U.S. persons", "A non-U.S. creator earning as an individual"],
          ["W-9", "U.S. persons and U.S. entities", "A U.S. citizen, resident, or U.S.-registered business"],
          ["W-8BEN-E", "Entities (companies) that are NOT U.S. persons", "A non-U.S. company or registered studio"],
          ["Other", "Forms required by your local tax laws", "Where your country requires a different declaration"],
        ]}
      />
      <P>
        A <strong>U.S. person</strong> generally means a U.S. citizen, a U.S. resident for tax purposes, or a business
        formed in the United States. If you are unsure whether you are a U.S. person, check with a tax professional before
        submitting.
      </P>

      <H2 id="what-you-need" n={4}>Information You Will Need</H2>
      <P>Have these ready before you start - it takes only a few minutes when you do:</P>
      <UL>
        <li>Your <strong>full legal name</strong> exactly as it appears on your government ID or tax documents.</li>
        <li>Your <strong>country of tax residency</strong> (the country whose tax rules apply to you).</li>
        <li>Your <strong>Tax Identification Number (TIN)</strong> and its type. Common TIN types by region:</li>
      </UL>
      <DataTable
        headers={["TIN type", "Where it is used", "Example holder"]}
        rows={[
          ["PAN", "India", "Indian individuals and businesses"],
          ["SSN", "United States", "U.S. individuals"],
          ["EIN", "United States", "U.S. businesses and entities"],
          ["ITIN", "United States", "Individuals not eligible for an SSN"],
          ["Other", "Rest of world", "Your local national tax ID"],
        ]}
      />
      <P>
        You may also be asked to <strong>upload a supporting document</strong> (for example, a government ID or a tax
        certificate) so we can verify what you entered.
      </P>

      <H2 id="how-to-submit" n={5}>How to Submit in Studio</H2>
      <P>The in-app wizard walks you through each step:</P>
      <DataTable
        headers={["Step", "What you do"]}
        rows={[
          ["1. Choose form type", "Pick the form that matches your tax status (W-8BEN, W-9, W-8BEN-E, or Other)"],
          ["2. Personal information", "Enter your full legal name as on your ID"],
          ["3. Tax residency", "Select the country you are a tax resident of"],
          ["4. Tax identification", "Enter your TIN and choose its type"],
          ["5. Review", "Check every field carefully - mistakes here cause payout delays"],
          ["6. Upload documents", "Attach any supporting documents requested"],
          ["7. Preview & confirm", "Confirm everything is correct and submit"],
        ]}
      />
      <P>
        Open the wizard from <strong>Teezer Studio → Settings → Tax Forms → Add form</strong>. You can save more than one
        form if your situation requires it (for example, an individual and an entity form).
      </P>

      <H2 id="review" n={6}>Review and Status</H2>
      <P>After you submit, your form moves through these states, which you can see any time in Tax Forms:</P>
      <UL>
        <li><strong>Under Review</strong> - we are verifying your information. You will get an email update.</li>
        <li><strong>Approved</strong> - your form is valid and payouts can proceed.</li>
        <li><strong>Rejected</strong> - something needs fixing. The reason is shown so you can correct and resubmit.</li>
      </UL>

      <H2 id="withholding" n={7}>Withholding and Treaty Benefits</H2>
      <P>
        Depending on your tax status and country, a percentage of certain earnings may be withheld before you are paid and
        remitted to the relevant tax authority. If a <strong>tax treaty</strong> exists between your country and the
        country of the income source, a correctly completed form (such as a W-8BEN claiming treaty benefits) may reduce
        that rate. Teezer applies withholding based on the information you provide - keeping your form accurate and current
        is the best way to ensure you are not over-withheld.
      </P>

      <H2 id="year-end" n={8}>Year-End Documents</H2>
      <P>
        Where required by law, Teezer issues year-end tax documents summarizing what you earned and any tax withheld.
        These are made available in Teezer Studio and, where applicable, sent to the email on your account. Keep your
        contact details current so you do not miss them. For details of how earnings are calculated, see our{" "}
        <DocLink href="/policies/creator-earnings">Creator Earnings &amp; Payouts</DocLink> policy.
      </P>

      <H2 id="keeping-current" n={9}>Keeping Your Details Current</H2>
      <P>
        You must update your tax form if any of the details change - for example, you move to a new country of tax
        residency, change from an individual to a registered company, or your TIN changes. An out-of-date form can lead to
        incorrect withholding or paused payouts. You can edit or replace a form at any time from Tax Forms.
      </P>

      <H2 id="security" n={10}>Security and Privacy</H2>
      <P>
        Your tax information is sensitive, and we treat it that way. It is transmitted over encrypted connections, stored
        securely, and accessed only to process payouts and meet legal obligations. We handle it in line with our{" "}
        <DocLink href="/privacy">Privacy Policy</DocLink>. We never sell your tax information.
      </P>

      <H2 id="faq" n={11}>Frequently Asked Questions</H2>
      <H3>Do I have to submit a tax form?</H3>
      <P>Yes, if you want to receive payouts. A verified form is required before earnings can be withdrawn.</P>
      <H3>I am not in the United States - why is there a U.S. form?</H3>
      <P>
        The W-8 series is how non-U.S. creators declare that they are not U.S. persons and, where relevant, claim treaty
        benefits. It is standard for international payouts and does not make you a U.S. taxpayer.
      </P>
      <H3>Will Teezer file my taxes for me?</H3>
      <P>
        No. Teezer may withhold and report where required, but filing your own tax return and paying any tax due is your
        responsibility. Teezer does not provide tax advice.
      </P>
      <H3>My form was rejected - what now?</H3>
      <P>Open the form in Tax Forms to see the reason, correct the flagged details, and resubmit. Most rejections are simple typos in a name or TIN.</P>

      <P>
        Questions about the tax process on Teezer:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fd4605] hover:underline">{CONTACT_EMAIL}</a>. For
        personal tax advice, please consult a qualified professional.
      </P>
    </LegalShell>
  );
}
