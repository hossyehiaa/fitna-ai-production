"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Loader2,
  PlayCircle,
  BookOpenText,
  Clock,
  Users,
  Scale,
  AlertTriangle,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiClientError } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import type { Dialect } from "@/lib/dialect/config";

interface AgentBrief {
  key: string;
  name: string;
  description: string;
  comprehension: number;
}

const DURATIONS = [10, 15, 20, 30];
const STYLES = [
  { value: "balanced", label: "متوازن", desc: "تفاعل طبيعي ومتنوع", icon: Scale },
  { value: "disruptive", label: "مشاغب", desc: "تحدي سلوكي يتطلب إدارة فصل", icon: AlertTriangle },
  { value: "disengaged", label: "خامل", desc: "فتور ومقاومة للمشاركة", icon: Users },
];

export function SessionSetupForm({
  topics,
  agents,
  dialect,
  dialectLabel,
}: {
  topics: Array<{ id: string; title: string }>;
  agents: AgentBrief[];
  dialect: Dialect;
  dialectLabel: string;
}) {
  const router = useRouter();
  const [topicId, setTopicId] = useState(topics[0]?.id || "");
  const [lessonContext, setLessonContext] = useState("");
  const [duration, setDuration] = useState(15);
  const [style, setStyle] = useState<"balanced" | "disruptive" | "disengaged">("balanced");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ sessionId: string }>("/api/sessions", {
        topicId,
        lessonContext: lessonContext.trim(),
        durationMinutes: duration,
        classroomStyle: style,
        trainingObjective: "socratic_focus",
      });
      router.push(`/session/${res.sessionId}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "تعذر بدء الجلسة. حاول مرة أخرى.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={start} className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="font-heading text-3xl font-extrabold">تجهيز جلسة التدريب</h1>
        <p className="text-muted-foreground">
          الطلاب سيتحدثون بـ{dialectLabel} — جهّز الموضوع والإعدادات ثم افتتح الحصة
        </p>
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-lg">
            <BookOpenText className="h-5 w-5 text-primary" aria-hidden="true" />
            موضوع الدرس
          </CardTitle>
          <CardDescription>اختر موضوعاً جاهزاً أو اكتب سياق درسك بنفسك</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="topic">الموضوع الجاهز</Label>
            <Select value={topicId} onValueChange={setTopicId}>
              <SelectTrigger id="topic" className="h-11">
                <SelectValue placeholder="اختر موضوعاً" />
              </SelectTrigger>
              <SelectContent>
                {topics.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="context">سياق الدرس (اختياري)</Label>
            <Textarea
              id="context"
              placeholder="مثال: شرح مقارنة الكسور ذات المقامات المختلفة باستخدام الرسوم التوضيحية، مع تمارين تطبيقية متدرجة…"
              value={lessonContext}
              onChange={(e) => setLessonContext(e.target.value)}
              rows={4}
              maxLength={4000}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground">
              كلما زاد وضوح السياق، كانت أسئلة الطلاب وردودهم أقرب لدرسك الفعلي
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-lg">
            <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
            مدة الجلسة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="مدة الجلسة">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={duration === d}
                onClick={() => setDuration(d)}
                className={cn(
                  "rounded-xl border-2 px-5 py-2.5 font-semibold transition-all focus-visible:outline-2 focus-visible:outline-ring",
                  duration === d ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40"
                )}
              >
                {d} دقيقة
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-lg">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            نمط الفصل
          </CardTitle>
          <CardDescription>حدد مستوى التحدي السلوكي الذي تريد التدرب عليه</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-3" role="radiogroup" aria-label="نمط الفصل">
            {STYLES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={style === s.value}
                onClick={() => setStyle(s.value as typeof style)}
                className={cn(
                  "rounded-xl border-2 p-4 text-right transition-all focus-visible:outline-2 focus-visible:outline-ring",
                  style === s.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                )}
              >
                <s.icon className="h-5 w-5 mb-2 text-primary" aria-hidden="true" />
                <span className="block font-bold mb-1">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.desc}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-lg">
            <UserRound className="h-5 w-5 text-primary" aria-hidden="true" />
            طلابك اليوم — ب{dialectLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {agents.map((a) => (
              <div key={a.key} className="rounded-xl border bg-secondary/30 p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">{a.name}</span>
                  <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
                    فهم {a.comprehension}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{a.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" className="w-full h-14 text-lg" disabled={loading}>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        ) : (
          <>
            <PlayCircle className="h-6 w-6" aria-hidden="true" />
            افتتح الحصة والدخول إلى الفصل
          </>
        )}
      </Button>
    </form>
  );
}
