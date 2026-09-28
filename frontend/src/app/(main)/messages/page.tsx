import { pageMetadata } from "@/lib/metadata";
import { Suspense } from "react";
import { MessagesPage } from "@/features/messages/messages-page";

export const metadata = pageMetadata('Messages');

export default function Page() {
  return (
    <Suspense>
      <MessagesPage />
    </Suspense>
  );
}
