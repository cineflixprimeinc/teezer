import { pageMetadata } from "@/lib/metadata";
import { FollowingRouter } from "@/features/following/following-page";

export const metadata = pageMetadata('Following');

export default function FollowingPage() {
  return <FollowingRouter />;
}
