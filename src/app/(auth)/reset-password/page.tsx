import Link from "next/link";
import { Logo } from "@/components/app/Logo";
import { ResetForm } from "./ResetForm";

export const metadata = { title: "إعادة تعيين كلمة المرور" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" aria-label="العودة إلى الصفحة الرئيسية" className="inline-block rounded-xl">
            <Logo size="lg" />
          </Link>
        </div>
        <ResetForm token={typeof token === "string" ? token : ""} />
      </div>
    </main>
  );
}
