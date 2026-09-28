import { redirect } from "next/navigation";

/**
 * Superseded by /reported (under Users & Creators) - the same review queue,
 * extended to all 7 report types with evidence photos, replacing this page's
 * video+user-only version. Kept as a redirect, not deleted outright, so any
 * bookmark or old link to /reports still lands somewhere real.
 */
export default function ReportsPage() {
  redirect("/admin/reported");
}
