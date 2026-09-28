import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ mark = false, className }: { mark?: boolean; className?: string }) {
  if (mark) {
    return <Image src="/favicon.png" alt="Teezer" width={40} height={40} className={cn("rounded-xl", className)} priority />;
  }
  return <Image src="/reelsoo-logo.png" alt="Teezer" width={210} height={54} className={cn("h-10 w-auto", className)} priority />;
}
