import { cookies } from "next/headers";
import { HomeClient } from "./HomeClient";

export default async function Home() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("language")?.value === "en" ? "en" : "ar") as "ar" | "en";

  return <HomeClient initialLang={lang} />;
}
