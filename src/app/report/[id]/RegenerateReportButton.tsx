"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RegenerateReportButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/report/regenerate`, { method: "POST" });
      if (res.ok) {
        router.refresh();
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "حصل خطأ أثناء توليد التقرير");
      }
    } catch {
      setError("حصل خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 text-center space-y-3">
      <p className="text-sm text-[#071B3A]/60">
        التحليل النصي للجلسة دي لسه مش متولّد (ممكن يكون حصل خطأ مؤقت وقت إنهاء الجلسة).
      </p>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button
        onClick={handleRegenerate}
        disabled={loading}
        className="bg-yellow-400 hover:bg-yellow-500 disabled:opacity-60 text-[#071B3A] font-semibold rounded-lg px-5 py-2.5"
      >
        {loading ? "جاري التوليد..." : "ولّد التحليل دلوقتي"}
      </button>
    </div>
  );
}
