"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  User,
  Volume2,
  ShieldCheck,
  Languages,
  Save,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Trash2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { api, ApiClientError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

interface Initial {
  fullName: string;
  userType: "teacher" | "institution";
  institutionName: string;
  email: string;
  dialect: "saudi" | "egyptian";
}

export function SettingsTabs({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [tab, setTab] = useState("profile");

  // Profile
  const [fullName, setFullName] = useState(initial.fullName);
  const [institutionName, setInstitutionName] = useState(initial.institutionName);
  const [dialect, setDialect] = useState<"saudi" | "egyptian">(initial.dialect);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Voice
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [expressiveness, setExpressiveness] = useState<"relaxed" | "balanced" | "expressive">("balanced");
  const [previewing, setPreviewing] = useState<string | null>(null);

  // Security
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Delete
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      await api.patch("/api/account", {
        fullName: fullName.trim(),
        dialect,
        institutionName: initial.userType === "institution" ? institutionName.trim() : "",
        speakingRate,
        expressiveness,
      });
      setProfileMsg({ ok: true, text: "تم حفظ التغييرات بنجاح" });
      router.refresh();
    } catch (err) {
      setProfileMsg({
        ok: false,
        text: err instanceof ApiClientError ? err.message : "تعذر حفظ التغييرات.",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function previewVoice(previewDialect: "saudi" | "egyptian") {
    setPreviewing(previewDialect);
    try {
      const blob = await api.postForBlob("/api/tts", {
        text: "مرحباً! أنا طالبك الافتراضي، يسعدني التدرب معك اليوم.",
        previewDialect,
      });
      const el = new Audio(URL.createObjectURL(blob));
      el.onended = () => URL.revokeObjectURL(el.src);
      await el.play();
    } catch {
      /* voice preview is best-effort */
    } finally {
      setPreviewing(null);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    setChangingPw(true);
    try {
      await api.post("/api/auth/password", { currentPassword, newPassword });
      setPwMsg({ ok: true, text: "تم تغيير كلمة المرور وتحديث جلستك" });
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPwMsg({
        ok: false,
        text: err instanceof ApiClientError ? err.message : "تعذر تغيير كلمة المرور.",
      });
    } finally {
      setChangingPw(false);
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteMsg(null);
    setDeleting(true);
    try {
      await api.delete("/api/account", { password: deletePassword });
      router.push("/login");
      router.refresh();
    } catch (err) {
      setDeleteMsg(err instanceof ApiClientError ? err.message : "تعذر حذف الحساب.");
      setDeleting(false);
    }
  }

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid grid-cols-3 mb-6">
        <TabsTrigger value="profile" className="gap-2">
          <User className="h-4 w-4" aria-hidden="true" />
        الملف الشخصي
      </TabsTrigger>
      <TabsTrigger value="voice" className="gap-2">
        <Volume2 className="h-4 w-4" aria-hidden="true" />
        الصوت واللهجة
      </TabsTrigger>
      <TabsTrigger value="security" className="gap-2">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        الأمان
      </TabsTrigger>
      </TabsList>

      {/* Profile */}
      <TabsContent value="profile">
        <form onSubmit={saveProfile} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">بيانات الملف الشخصي</CardTitle>
              <CardDescription>اسمك ونوع حسابك — يظهر في لوحة التحكم والتقارير</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {profileMsg && (
                <Alert variant={profileMsg.ok ? "default" : "destructive"} role="status">
                  <AlertDescription>{profileMsg.text}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="st-name">الاسم الكامل</Label>
                <Input id="st-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} required />
              </div>
              <div className="space-y-2">
                <Label>نوع الحساب</Label>
                <div className="rounded-lg border bg-secondary/40 px-4 py-2.5 text-sm font-medium">
                  {initial.userType === "institution" ? "مؤسسة تعليمية" : "معلم"}
                  <span className="text-muted-foreground text-xs mr-2">— لا يمكن تغييره بعد التسجيل</span>
                </div>
              </div>
              {initial.userType === "institution" && (
                <div className="space-y-2">
                  <Label htmlFor="st-inst">اسم المؤسسة</Label>
                  <Input
                    id="st-inst"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    maxLength={120}
                  />
                </div>
              )}
              <Button type="submit" disabled={savingProfile} className="h-11">
                {savingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    حفظ التغييرات
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </form>
      </TabsContent>

      {/* Voice */}
      <TabsContent value="voice">
        <form onSubmit={saveProfile} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2">
                <Languages className="h-5 w-5 text-primary" aria-hidden="true" />
                نمط التحدث الصوتي
              </CardTitle>
              <CardDescription>
                يحدد لهجة وكلاء الذكاء الاصطناعي الصوتية ونطقهم — تبقى واجهة الموقع بالعربية الفصحى دائماً
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {(
                [
                  { value: "saudi", flag: "🇸🇦", title: "السعودية", voice: "صوت عصبي سعودي (Hamed / Zariyah)" },
                  { value: "egyptian", flag: "🇪🇬", title: "المصرية", voice: "صوت عصبي مصري (Shakir / Salma)" },
                ] as const
              ).map((opt) => (
                <div
                  key={opt.value}
                  className={cn(
                    "rounded-xl border-2 p-4 transition-all",
                    dialect === opt.value ? "border-primary bg-primary/5" : "border-border"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setDialect(opt.value)}
                      role="radio"
                      aria-checked={dialect === opt.value}
                      className="flex items-center gap-3 text-right"
                    >
                      <span className="text-3xl" aria-hidden="true">{opt.flag}</span>
                      <span>
                        <span className="block font-bold">اللهجة {opt.title}</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">{opt.voice}</span>
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => previewVoice(opt.value)}
                      disabled={previewing !== null}
                    >
                      {previewing === opt.value ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Volume2 className="h-4 w-4" aria-hidden="true" />
                          تجربة
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label htmlFor="rate">سرعة كلام الطلاب</Label>
                  <span className="text-sm font-bold tabular-nums" dir="ltr">
                    ×{speakingRate.toFixed(2)}
                  </span>
                </div>
                <Slider
                  id="rate"
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  value={[speakingRate]}
                  onValueChange={(v) => setSpeakingRate(v[0])}
                  aria-label="سرعة الكلام"
                />
                <div className="flex justify-between text-xs text-muted-foreground" dir="ltr">
                  <span>أبطأ 0.5×</span>
                  <span>عادي 1.0×</span>
                  <span>أسرع 1.5×</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>مستوى التعبير</Label>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="مستوى التعبير">
                  {(
                    [
                      { value: "relaxed", label: "هادئ" },
                      { value: "balanced", label: "متوازن" },
                      { value: "expressive", label: "معبّر" },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={expressiveness === o.value}
                      onClick={() => setExpressiveness(o.value)}
                      className={cn(
                        "rounded-lg border-2 py-2 text-sm font-medium transition-all",
                        expressiveness === o.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40"
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 leading-relaxed">
                تغيير اللهجة يحدّث تلقائياً: إعدادات التعرف على الكلام + لهجة حوار الوكلاء + الأصوات
                المنطوقة — دون أي تأثير على لغة واجهة الموقع.
              </p>

              <Button type="submit" disabled={savingProfile} className="h-11">
                {savingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    حفظ تفضيلات الصوت
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </form>
      </TabsContent>

      {/* Security */}
      <TabsContent value="security" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading">تغيير كلمة المرور</CardTitle>
            <CardDescription>سيتم إنهاء جميع الجلسات النشطة على كل الأجهزة بعد التغيير</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={changePassword} className="space-y-4">
              {pwMsg && (
                <Alert variant={pwMsg.ok ? "default" : "destructive"} role="status">
                  <AlertDescription>{pwMsg.text}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="cur-pw">كلمة المرور الحالية</Label>
                <Input
                  id="cur-pw"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-pw">كلمة المرور الجديدة</Label>
                <Input
                  id="new-pw"
                  type="password"
                  placeholder="8 أحرف على الأقل، تضم حرفاً ورقماً"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  maxLength={128}
                />
              </div>
              <Button type="submit" disabled={changingPw} className="h-11">
                {changingPw ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                    تغيير كلمة المرور
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="font-heading text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
              حذف الحساب نهائياً
            </CardTitle>
            <CardDescription>
              يحذف حسابك وكل بياناتك نهائياً: الجلسات والتقارير والشارات — لا يمكن التراجع
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deleteMsg && (
              <Alert variant="destructive" className="mb-4" role="alert">
                <AlertDescription>{deleteMsg}</AlertDescription>
              </Alert>
            )}
            {!deleteConfirm ? (
              <Button variant="destructive" onClick={() => setDeleteConfirm(true)}>
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                أرغب في حذف حسابي
              </Button>
            ) : (
              <form onSubmit={deleteAccount} className="space-y-4 max-w-sm">
                <div className="space-y-2">
                  <Label htmlFor="del-pw">أكّد بكلمة المرور</Label>
                  <Input
                    id="del-pw"
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    required
                    maxLength={128}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" variant="destructive" disabled={deleting}>
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد الحذف النهائي"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setDeleteConfirm(false)}>
                    إلغاء
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="rounded-xl border bg-secondary/30 p-4 text-sm text-muted-foreground flex gap-3">
          <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed">
            جلساتك محمية: كلمات المرور مُخزّنة بتجزئة scrypt، والجلسات عبر كوكيز آمنة HttpOnly،
            وبياناتك معزولة على مستوى قاعدة البيانات.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );
}
