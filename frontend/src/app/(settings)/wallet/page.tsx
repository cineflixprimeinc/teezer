import { pageMetadata } from "@/lib/metadata";
import { RequireAuth } from "@/components/layout/protected-route";
import { SectionPage } from "@/components/layout/section-page";

export const metadata = pageMetadata('Wallet / Coins / Rewards');

export default function Page() {
  return <RequireAuth><SectionPage title="Wallet / Coins / Rewards" description="Coins, rewards, wallet balance, and transaction history." /></RequireAuth>;
}
