"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check current state from documentElement or cookie
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);

    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // Persist in cookie for server components and next page loads
    document.cookie = `theme=${nextTheme}; path=/; max-age=31536000; SameSite=Lax`;
  }

  if (!mounted) {
    return (
      <button
        className={`w-8 h-8 rounded-full border border-current/25 bg-current/5 flex items-center justify-center text-current/60 ${className}`}
        aria-label="Toggle dark/light theme"
        disabled
      >
        <Moon size={16} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`w-8 h-8 rounded-full border border-current/25 hover:border-current/40 bg-current/5 hover:bg-current/10 flex items-center justify-center transition-all duration-200 transform active:scale-95 text-current ${className}`}
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label="Toggle dark/light theme"
    >
      {theme === "dark" ? (
        <Sun size={16} className="text-[#FFB52E] drop-shadow-[0_0_8px_rgba(255,181,46,0.6)] transition-transform duration-200 hover:rotate-45" />
      ) : (
        <Moon size={16} className="text-current transition-transform duration-200 hover:-rotate-12" />
      )}
    </button>
  );
}