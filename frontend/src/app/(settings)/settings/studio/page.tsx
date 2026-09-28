"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Permanent redirect: /settings/studio → /studio */
export default function StudioRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/studio"); }, [router]);
  return null;
}
