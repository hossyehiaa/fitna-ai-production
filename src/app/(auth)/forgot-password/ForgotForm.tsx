"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Mail, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, ApiClientError } from "@/lib/client/api";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ message: string; devResetUrl?: string }>(
        "/api/auth/forgot",
        { email }
      );
      setSent(true);
      setDevUrl(res.devResetUrl || null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="shadow-lg border-border/70">
      <CardHeader className="text-center space-y-2">
        <span className="mx-auto h-14 w-14 rounded-2xl bg-primary text-primary-foreground grid place-items-center mb-2">
          <Mail className="h-7 w-7" aria-hidden="true" />
        </span>
        <CardTitle className="font-heading text-2xl font-extrabold">استعادة كلمة المرور</CardTitle>
        <CardDescription>
          أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4 text-center">
            <Alert role="status">
              <AlertDescription className="text-base">
                إذا كان البريد الإلكتروني مسجلاً لدينا فستصلك رسالة تحتوي رابط إعادة التعيين
                خلال دقائق. الرابط صالح لمدة 30 دقيقة ولمرة واحدة فقط.
              </AlertDescription>
            </Alert>
            {devUrl && (
              <div className="rounded-lg border border-dashed p-3 text-sm break-all bg-secondary/40">
                <p className="mb-2 font-medium">وضع التطوير — رابط مباشر:</p>
                <Link href={devUrl.replace(/^https?:\/\/[^/]+/, "")} className="text-primary underline" dir="ltr">
                  {devUrl}
                </Link>
              </div>
            )}
            <Button asChild variant="outline" className="w-full h-11">
              <Link href="/login">العودة إلى تسجيل الدخول</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="fp-email">البريد الإلكتروني</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="fp-email"
                  type="email"
                  dir="ltr"
                  className="pr-10 text-left"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={254}
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  <SendHorizontal className="h-4 w-4" aria-hidden="true" />
                  إرسال رابط الاستعادة
                </>
              )}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              تذكرت كلمة المرور؟{" "}
              <Link href="/login" className="text-primary font-medium hover:underline">
                تسجيل الدخول
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
