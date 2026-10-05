import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AppHeader } from "@/components/app/AppHeader";
import { DIALECT_CONFIG, parseDialect } from "@/lib/dialect/config";
import { SettingsTabs } from "./SettingsTabs";

export const metadata = { title: "الإعدادات" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/settings");

  const dialect = parseDialect(user.profile?.dialect);

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader
        userName={(user.profile?.fullName || "المستخدم").split(" ")[0]}
        dialectLabel={DIALECT_CONFIG[dialect].labelAr}
      />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="font-heading text-2xl font-extrabold mb-1">الإعدادات</h1>
        <p className="text-sm text-muted-foreground mb-6">
          إدارة ملفك الشخصي، تفضيلات الصوت واللهجة، والأمان والخصوصية
        </p>
        <SettingsTabs
          initial={{
            fullName: user.profile?.fullName || "",
            userType: user.role === "institution" ? "institution" : "teacher",
            institutionName: user.profile?.institutionName || "",
            email: user.email,
            dialect,
          }}
        />
      </main>
    </div>
  );
}
