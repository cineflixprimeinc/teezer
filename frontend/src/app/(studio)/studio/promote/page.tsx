// Promote pages are accessed via /studio/content/[id]/promote
// This route redirects to content so the user picks a video first.
import { redirect } from "next/navigation";
export default function Page() {
  redirect("/studio/content");
}
