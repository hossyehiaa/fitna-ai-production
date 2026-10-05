import Link from "next/link";
import { Logo } from "@/components/app/Logo";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { SignupWizard } from "./SignupWizard";

export const metadata = { title: "إنشاء حساب" };

export default function SignupPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-3">
          <Link href="/" aria-label="العودة إلى الصفحة الرئيسية">
            <Logo />
          </Link>
          <div className="flex-1" />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex-1 grid place-items-center px-4 py-10">
        <SignupWizard />
      </main>
    </div>
  );
}
