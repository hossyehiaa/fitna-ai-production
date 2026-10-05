"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, History, Settings, LogOut, Loader2 } from "lucide-react";
import { LogoLink } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/history", label: "سجل الجلسات", icon: History },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

export function AppHeader({ userName, dialectLabel }: { userName: string; dialectLabel: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* proceed to login regardless */
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-3">
        <LogoLink href="/dashboard" />
        <nav className="hidden md:flex items-center gap-1 mr-4" aria-label="التنقل الرئيسي">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <div className="hidden sm:flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">مرحباً،</span>
          <span className="font-semibold">{userName}</span>
          <span className="rounded-full bg-accent text-accent-foreground px-2.5 py-0.5 text-xs font-medium">
            {dialectLabel}
          </span>
        </div>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          onClick={signOut}
          disabled={signingOut}
          aria-label="تسجيل الخروج"
          title="تسجيل الخروج"
        >
          {signingOut ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
        </Button>
      </div>
      {/* Mobile nav */}
      <nav className="md:hidden border-t bg-background/95 px-2 py-1.5 flex items-center justify-around" aria-label="التنقل للجوال">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                active ? "text-primary" : "text-muted-foreground"
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="h-5 w-5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
