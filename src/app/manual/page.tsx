import { cookies } from "next/headers";
import { ManualClient } from "./ManualClient";

export const metadata = {
  title: "دليل الاستخدام | فِطْنَة AI",
  description: "دليل استخدام منصة فِطْنَة خطوة بخطوة: من تسجيل الدخول إلى تقرير التقييم الكامل.",
};

export default async function ManualPage() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("language")?.value === "en" ? "en" : "ar") as "ar" | "en";
  return <ManualClient initialLang={lang} />;
}
