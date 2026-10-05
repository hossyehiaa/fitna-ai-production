"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Lock, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, ApiClientError } from "@/lib/client/api";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/reset", { token, password });
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <Card className="shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="font-heading text-2xl font-extrabold">رابط غير صالح</CardTitle>
          <CardDescription>
            رابط إعادة التعيين غير مكتمل. اطلب رابطاً جديداً من صفحة استعادة كلمة المرور.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full h-11">
            <Link href="/forgot-password">طلب رابط جديد</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-border/70">
      <CardHeader className="text-center space-y-2">
        <span className="mx-auto h-14 w-14 rounded-2xl bg-primary text-primary-foreground grid place-items-center mb-2">
          <KeyRound className="h-7 w-7" aria-hidden="true" />
        </span>
        <CardTitle className="font-heading text-2xl font-extrabold">إعادة تعيين كلمة المرور</CardTitle>
        <CardDescription>أدخل كلمة المرور الجديدة لحسابك</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <div className="space-y-4 text-center">
            <Alert role="status">
              <AlertDescription>
                تم تغيير كلمة المرور بنجاح. يتم الآن تحويلك إلى صفحة تسجيل الدخول…
              </AlertDescription>
            </Alert>
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" aria-hidden="true" />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="rp-password">كلمة المرور الجديدة</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="rp-password"
                  type="password"
                  className="pr-10"
                  placeholder="8 أحرف على الأقل، تضم حرفاً ورقماً"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  maxLength={128}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rp-confirm">تأكيد كلمة المرور</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="rp-confirm"
                  type="password"
                  className="pr-10"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  maxLength={128}
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : "تأكيد التغيير"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
