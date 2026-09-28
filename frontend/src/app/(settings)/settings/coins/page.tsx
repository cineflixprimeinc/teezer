import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Coins");

export default function Page() { redirect("/settings/studio"); }
