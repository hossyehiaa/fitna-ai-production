"use client";

// =====================================================================
// Live classroom — the speech pipeline (spec §10):
//   MIC -> /api/stt (Groq Whisper, dialect from server profile)
//        -> /api/sessions/[id]/turn (AI agents react)
//        -> /api/tts per reaction (Edge neural voice per dialect)
//        -> playback. Text input is always available as graceful fallback.
// =====================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  SendHorizontal,
  Loader2,
  Volume2,
  VolumeX,
  Flag,
  Hand,
  CircleAlert,
  Sparkles,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { api, ApiClientError } from "@/lib/client/api";

interface AgentBrief {
  key: string;
  name: string;
  description: string;
  gender: string;
}

interface EventItem {
  id: string;
  eventType: string;
  actor: string;
  content: string;
  occurredMs: number;
  emotion: string | null;
}

interface ReactionOut {
  agentKey: string;
  agentName: string;
  text: string;
  attention: number;
  emotion: "attentive" | "hand_raised" | "distracted" | "enthusiastic" | "confused";
}

const EMOTION_META: Record<string, { label: string; emoji: string; cls: string }> = {
  attentive: { label: "منتبه", emoji: "🙂", cls: "bg-primary/10 text-primary" },
  hand_raised: { label: "رافع يده", emoji: "✋", cls: "bg-chart-2/20 text-chart-2" },
  enthusiastic: { label: "متحمس", emoji: "🤩", cls: "bg-chart-5/30 text-foreground" },
  confused: { label: "محتار", emoji: "🤔", cls: "bg-chart-4/15 text-chart-4" },
  distracted: { label: "تائه", emoji: "😵‍💫", cls: "bg-muted text-muted-foreground" },
};

export function LiveRoom({
  session,
  agents,
  initialEvents,
}: {
  session: {
    id: string;
    status: string;
    topicTitle: string;
    durationMinutes: number;
    classroomStyle: string;
    dialectLabel: string;
    startedAtMs: number;
  };
  agents: AgentBrief[];
  initialEvents: EventItem[];
}) {
  const router = useRouter();

  const [events, setEvents] = useState<EventItem[]>(initialEvents);
  const [thinking, setThinking] = useState(false);
  const [ending, setEnding] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [micState, setMicState] = useState<"idle" | "recording" | "processing">("idle");
  const [speakingAgent, setSpeakingAgent] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [sttNotice, setSttNotice] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(
    session.status === "in_progress" ? Math.floor((Date.now() - session.startedAtMs) / 1000) : 0
  );

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastVoiceRef = useRef<HTMLAudioElement | null>(null);
  const transcriptRef = useRef<HTMLTextAreaElement | null>(null);

  const ended = session.status !== "in_progress";
  const agentByKey = useMemo(() => new Map(agents.map((a) => [a.key, a])), [agents]);

  // Session timer
  useEffect(() => {
    if (ended) return;
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [ended]);

  const timeStr = useMemo(() => {
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [elapsedSec]);

  /** Play a reaction through /api/tts (dialect fixed by the server profile). */
  const speak = useCallback(
    async (agentKey: string, text: string) => {
      if (!voiceOn) return;
      try {
        const blob = await api.postForBlob("/api/tts", { text, agentKey });
        const url = URL.createObjectURL(blob);
        const el = new Audio(url);
        lastVoiceRef.current?.pause();
        lastVoiceRef.current = el;
        setSpeakingAgent(agentKey);
        el.onended = () => {
          setSpeakingAgent(null);
          URL.revokeObjectURL(url);
        };
        el.onerror = () => setSpeakingAgent(null);
        await el.play().catch(() => setSpeakingAgent(null));
      } catch {
        // Graceful degradation: text is already visible; voice is optional.
        setSpeakingAgent(null);
      }
    },
    [voiceOn]
  );

  /** Send the teacher utterance to the turn API and render reactions. */
  const sendTurn = useCallback(
    async (teacherText: string) => {
      if (!teacherText.trim() || thinking) return;
      setError(null);
      setThinking(true);
      setEvents((ev) => [
        ...ev,
        {
          id: `local-t-${Date.now()}`,
          eventType: "teacher_utterance",
          actor: "teacher",
          content: teacherText,
          occurredMs: 0,
          emotion: null,
        },
      ]);
      try {
        const res = await api.post<{ reactions: ReactionOut[] }>(
          `/api/sessions/${session.id}/turn`,
          { teacherText, elapsedMs: elapsedSec * 1000, speechDurationMs: 0 }
        );
        const now = Date.now();
        setEvents((ev) => [
          ...ev,
          ...res.reactions.map((r, i) => ({
            id: `local-r-${now}-${i}`,
            eventType: "student_reaction",
            actor: r.agentKey,
            content: r.text,
            occurredMs: 0,
            emotion: r.emotion,
          })),
        ]);
        // Sequential voice playback: first reacting student speaks.
        if (res.reactions.length > 0) {
          speak(res.reactions[0].agentKey, res.reactions[0].text);
        }
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "تعذر إكمال الدور. حاول مرة أخرى.");
      } finally {
        setThinking(false);
      }
    },
    [session.id, thinking, elapsedSec, speak]
  );

  /** Start microphone recording. */
  async function startRecording() {
    setError(null);
    setSttNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)
      );
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1200) {
          setMicState("idle");
          setSttNotice("التسجيل قصير جداً — اضغط زر التسجيل وتحدث ثم أوقفه.");
          return;
        }
        void transcribe(blob);
      };
      mediaRef.current = rec;
      rec.start();
      setMicState("recording");
    } catch {
      setError("تعذر الوصول إلى الميكروفون. تحقق من أذونات المتصفح أو اكتب كلامك نصياً.");
    }
  }

  function stopRecording() {
    if (mediaRef.current?.state === "recording") {
      setMicState("processing");
      mediaRef.current.stop();
    }
  }

  /** STT: audio blob -> text, then run the turn. */
  async function transcribe(blob: Blob) {
    try {
      const form = new FormData();
      const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("wav") ? "wav" : "webm";
      form.append("audio", blob, `utterance.${ext}`);
      const res = await api.postForm<{ text: string }>("/api/stt", form);
      if (transcriptRef.current) {
        transcriptRef.current.value = res.text;
        transcriptRef.current.focus();
      }
      setTextDraft(res.text);
      setMicState("idle");
      if (res.text) await sendTurn(res.text);
      else setSttNotice("لم يُتعرَّف على كلام واضح. حاول مجدداً أو اكتب النص.");
    } catch (err) {
      setMicState("idle");
      if (err instanceof ApiClientError && err.code === "stt_unavailable") {
        setSttNotice(err.message);
      } else {
        setError(err instanceof ApiClientError ? err.message : "تعذر تحويل الكلام إلى نص.");
      }
    }
  }

  async function endSession(reason: "completed" | "abandoned") {
    setEnding(true);
    try {
      lastVoiceRef.current?.pause();
      const res = await api.post<{ reportId: string | null }>(
        `/api/sessions/${session.id}/end`,
        { reason }
      );
      if (reason === "completed" && res.reportId) {
        router.push(`/report/${session.id}`);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "تعذر إنهاء الجلسة.");
      setEnding(false);
    }
  }

  const teacherTurns = events.filter((e) => e.actor === "teacher").length;

  return (
    <div className="min-h-screen flex flex-col bg-secondary/20">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-heading font-bold truncate">{session.topicTitle}</p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-2">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span className="tabular-nums" dir="ltr">{timeStr}</span> / {session.durationMinutes}:00
              <span className="mx-1">·</span>
              {session.dialectLabel}
              <span className="mx-1">·</span>
              {teacherTurns} تدخلاً
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setVoiceOn((v) => !v)}
            aria-label={voiceOn ? "كتم صوت الطلاب" : "تشغيل صوت الطلاب"}
            title={voiceOn ? "كتم صوت الطلاب" : "تشغيل صوت الطلاب"}
          >
            {voiceOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </Button>
          {!ended && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => endSession("abandoned")}
                disabled={ending}
              >
                مغادرة
              </Button>
              <Button size="sm" onClick={() => endSession("completed")} disabled={ending}>
                {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
                إنهاء واستلام التقرير
              </Button>
            </>
          )}
        </div>
        <Progress
          value={Math.min(100, (elapsedSec / (session.durationMinutes * 60)) * 100)}
          className="h-1 rounded-none"
          aria-label="تقدم زمن الجلسة"
        />
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 grid lg:grid-cols-[1fr_340px] gap-6">
        {/* Transcript column */}
        <section className="order-2 lg:order-1 space-y-4" aria-label="نص الحوار">
          {error && (
            <Alert variant="destructive" role="alert">
              <CircleAlert className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {sttNotice && (
            <Alert role="status">
              <AlertDescription>{sttNotice}</AlertDescription>
            </Alert>
          )}
          {ended && (
            <Alert role="status">
              <AlertDescription>انتهت هذه الجلسة — استعرض التقرير أو عد إلى لوحة التحكم.</AlertDescription>
            </Alert>
          )}

          <div className="rounded-2xl border bg-card p-4 space-y-4 max-h-[55vh] overflow-y-auto scroll-area-rtl">
            {events.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-60" aria-hidden="true" />
                <p className="font-medium text-foreground mb-1">افتح الحصة بترحيبك بالطلاب</p>
                <p className="text-sm">
                  اضغط زر التسجيل وتحدث، أو اكتب كلامك نصياً في الأسفل — الطلاب سيردون فوراً.
                </p>
              </div>
            )}
            {events.map((ev) =>
              ev.actor === "teacher" ? (
                <div key={ev.id} className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-primary text-primary-foreground px-4 py-2.5 shadow-sm">
                    <p className="text-xs opacity-80 mb-0.5 font-medium">أنت</p>
                    <p className="leading-relaxed">{ev.content}</p>
                  </div>
                </div>
              ) : (
                <div key={ev.id} className="flex justify-end">
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl rounded-tr-sm border bg-background px-4 py-2.5 shadow-sm",
                      speakingAgent === ev.actor && "avatar-speaking border-primary"
                    )}
                  >
                    <p className="text-xs text-muted-foreground mb-0.5 font-semibold">
                      {agentByKey.get(ev.actor)?.name || ev.actor}
                      {ev.emotion && (
                        <span className="mr-1.5">
                          {EMOTION_META[ev.emotion]?.emoji}
                        </span>
                      )}
                    </p>
                    <p className="leading-relaxed">{ev.content}</p>
                  </div>
                </div>
              )
            )}
            {thinking && (
              <div className="flex justify-end">
                <div className="rounded-2xl border bg-background px-4 py-3 flex items-center gap-2 text-muted-foreground">
                  <span className="flex gap-1" aria-hidden="true">
                    <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                  <span className="text-sm">الطلاب يفكرون…</span>
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          {!ended && (
            <div className="rounded-2xl border bg-card p-3 space-y-3">
              <div className="flex gap-2 items-end">
                <Button
                  type="button"
                  size="icon"
                  className={cn(
                    "h-12 w-12 rounded-full shrink-0",
                    micState === "recording"
                      ? "bg-destructive text-destructive-foreground mic-recording"
                      : "h-12 w-12"
                  )}
                  onClick={micState === "recording" ? stopRecording : startRecording}
                  disabled={micState === "processing" || thinking}
                  aria-label={micState === "recording" ? "إيقاف التسجيل وإرسال" : "بدء التسجيل الصوتي"}
                  title={micState === "recording" ? "إيقاف التسجيل وإرسال" : "بدء التسجيل الصوتي"}
                >
                  {micState === "processing" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : micState === "recording" ? (
                    <MicOff className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </Button>
                <Textarea
                  ref={transcriptRef}
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const t = textDraft.trim();
                      setTextDraft("");
                      if (t) void sendTurn(t);
                    }
                  }}
                  placeholder="اكتب كلامك هنا أو استخدم الميكروفون… (Enter للإرسال)"
                  rows={2}
                  maxLength={2000}
                  className="resize-none min-h-[48px]"
                  aria-label="نص كلام المعلم"
                />
                <Button
                  type="button"
                  size="icon"
                  className="h-12 w-12 shrink-0"
                  onClick={() => {
                    const t = textDraft.trim();
                    setTextDraft("");
                    if (t) void sendTurn(t);
                  }}
                  disabled={thinking || !textDraft.trim()}
                  aria-label="إرسال"
                >
                  <SendHorizontal className="h-5 w-5" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                يتفاعل الطلاب بـ{session.dialectLabel} — يمكنك الكلام أو الكتابة
              </p>
            </div>
          )}
        </section>

        {/* Students column */}
        <aside className="order-1 lg:order-2 space-y-3" aria-label="حالة الطلاب">
          <h2 className="font-heading font-bold text-sm text-muted-foreground px-1">
            الطلاب الأربعة
          </h2>
          {agents.map((agent) => {
            const lastReaction = [...events]
              .reverse()
              .find((e) => e.actor === agent.key && e.eventType === "student_reaction");
            const emotion = lastReaction?.emotion;
            const meta = emotion ? EMOTION_META[emotion] : null;
            const speaking = speakingAgent === agent.key;
            return (
              <Card
                key={agent.key}
                className={cn(
                  "transition-all",
                  speaking && "border-primary shadow-md",
                  lastReaction && "bg-card",
                  !lastReaction && "opacity-80"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "h-11 w-11 rounded-2xl grid place-items-center text-xl shrink-0",
                        speaking ? "avatar-speaking bg-primary text-primary-foreground" : "bg-secondary"
                      )}
                      aria-hidden="true"
                    >
                      {agent.gender === "male" ? "👦" : "👧"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold">{agent.name}</p>
                        {emotion === "hand_raised" && (
                          <Hand className="h-4 w-4 hand-raised-icon text-chart-2" aria-hidden="true" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {lastReaction?.content || "بانتظار افتتاح الحصة…"}
                      </p>
                      {meta && (
                        <span className={cn("mt-1.5 inline-block text-[10px] rounded-full px-2 py-0.5 font-medium", meta.cls)}>
                          {meta.emoji} {meta.label}
                        </span>
                      )}
                    </div>
                    {speaking && (
                      <Volume2 className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </aside>
      </main>
    </div>
  );
}
