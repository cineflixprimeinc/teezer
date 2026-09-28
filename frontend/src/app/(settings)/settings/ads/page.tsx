import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Ads Manager");

export default function Page() { redirect("/ads-manager"); }
