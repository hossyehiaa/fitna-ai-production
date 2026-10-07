import { cookies } from "next/headers";
import { AboutClient } from "./AboutClient";

export const metadata = {
  title: "عن المنصة | فِطْنَة AI",
  description: "ما هي منصة فِطْنَة؟ فصل افتراضي بيتكلم بلهجتك — محاكاة تدريب كاملة للمعلمين بتقرير بيداغوجي.",
};

export default async function AboutPage() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("language")?.value === "en" ? "en" : "ar") as "ar" | "en";
  return <AboutClient initialLang={lang} />;
}
