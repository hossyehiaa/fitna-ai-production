"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n/context";
import { Scale, ArrowUpRight } from "lucide-react";

type SessionRow = {
  id: string;
  started_at: string;
  topic_id: string | null;
  overall_score: number | null;
  classroom_pattern: string | null;
};

export function HistoryTable({
  sessions,
  topicTitleById,
}: {
  sessions: SessionRow[];
  topicTitleById: Record<string, string>;
}) {
  const router = useRouter();
  const { t, lang } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  }

  function handleCompare() {
    if (selectedIds.length === 2) {
      router.push(`/history/compare?sessionA=${selectedIds[0]}&sessionB=${selectedIds[1]}`);
    }
  }

  if (sessions.length === 0) {
    return (
      <p className="text-xs text-[#071B3A]/50 dark:text-white/50 p-6">
        {t.teacherDashboard.noSessionsYet}{" "}
        <Link href="/session/setup" className="text-teal-600 dark:text-teal-400 font-bold hover:underline">
          {t.teacherDashboard.startFirstSession}
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-teal-50 dark:bg-teal-950/40 border border-teal-500/30 rounded-xl px-4 py-3">
          <span className="text-xs text-teal-800 dark:text-teal-200 font-semibold">
            {t.history.compareTwoNotice.replace("{count}", String(selectedIds.length))}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-[#071B3A]/60 dark:text-white/60 hover:underline px-2 py-1"
            >
              {t.history.cancelSelection}
            </button>
            <button
              onClick={handleCompare}
              disabled={selectedIds.length !== 2}
              className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition"
            >
              {t.history.compareButton}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto w-full -mx-2 sm:mx-0">
        <table className="w-full text-xs min-w-[560px]">
        <thead>
          <tr className="text-[#071B3A]/50 dark:text-white/50 text-start border-b border-[#071B3A]/5 dark:border-white/10">
            <th className="px-4 py-3 font-semibold w-8 text-center" title="Compare sessions">
              <Scale className="w-3.5 h-3.5 mx-auto text-[#071B3A]/40 dark:text-white/40" />
            </th>
            <th className="px-6 py-3 font-semibold">{t.common.date}</th>
            <th className="px-6 py-3 font-semibold">{t.common.topic}</th>
            <th className="px-6 py-3 font-semibold">{t.common.score}</th>
            <th className="px-6 py-3 font-semibold">{t.common.pattern}</th>
            <th className="px-6 py-3 font-semibold"></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const isSelected = selectedIds.includes(s.id);
            return (
              <tr
                key={s.id}
                className={`border-t border-[#071B3A]/5 dark:border-white/10 transition ${
                  isSelected ? "bg-teal-50/50 dark:bg-teal-950/20" : ""
                }`}
              >
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(s.id)}
                    className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer accent-teal-600"
                  />
                </td>
                <td className="px-6 py-3 text-[#071B3A] dark:text-white font-medium">
                  {new Date(s.started_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}
                </td>
                <td className="px-6 py-3 text-[#071B3A] dark:text-white">
                  {s.topic_id ? topicTitleById[s.topic_id] ?? "—" : "—"}
                </td>
                <td className="px-6 py-3 text-[#071B3A] dark:text-white font-bold">
                  {s.overall_score ?? "—"}%
                </td>
                <td className="px-6 py-3 text-[#071B3A] dark:text-white">
                  {s.classroom_pattern === "balanced"
                    ? t.common.balanced
                    : s.classroom_pattern === "disruptive"
                    ? t.common.disruptive
                    : s.classroom_pattern === "disengaged"
                    ? t.common.disengaged
                    : "—"}
                </td>
                <td className="px-6 py-3 text-end">
                  <Link
                    href={`/report/${s.id}`}
                    className="text-teal-600 dark:text-teal-400 hover:underline font-semibold text-xs inline-flex items-center gap-1"
                  >
                    <span>{t.common.view}</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
