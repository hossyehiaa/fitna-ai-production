import Link from "next/link";
import { GraduationCap, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <span
        className={cn(
          dims,
          "rounded-2xl bg-primary text-primary-foreground grid place-items-center font-heading font-bold shadow-sm"
        )}
        aria-hidden="true"
      >
        <GraduationCap className={size === "sm" ? "h-4 w-4" : "h-6 w-6"} />
      </span>
      <span className={cn(text, "font-heading font-extrabold tracking-tight")}>
        فِطنة
        <span className="sr-only"> — منصة التدريب التربوي الذكي</span>
      </span>
      <Sparkles className="h-4 w-4 text-accent-foreground/70 hidden sm:block" aria-hidden="true" />
    </span>
  );
}

export function LogoLink({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="rounded-xl focus-visible:outline-2 focus-visible:outline-ring" aria-label="الصفحة الرئيسية لمنصة فِطنة">
      <Logo />
    </Link>
  );
}
