import Link from "next/link";
import { Logo } from "@/components/app/Logo";
import { ForgotForm } from "./ForgotForm";

export const metadata = { title: "استعادة كلمة المرور" };

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen grid place-items-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" aria-label="العودة إلى الصفحة الرئيسية" className="inline-block rounded-xl">
            <Logo size="lg" />
          </Link>
        </div>
        <ForgotForm />
      </div>
    </main>
  );
}
