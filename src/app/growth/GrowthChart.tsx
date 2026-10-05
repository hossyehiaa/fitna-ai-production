"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n/context";

type SessionPoint = {
  date: string;
  overallScore: number | null;
  teacherTalkRatio: number | null;
  socraticQuestionRate: number | null;
  inclusivityIndex: number | null;
};

export function GrowthChart({ sessions }: { sessions: SessionPoint[] }) {
  const { t, lang } = useTranslation();

  const metricsConfig = {
    overallScore: { label: t.growth.overallScoreAvg, key: "overallScore" as const },
    teacherTalkRatio: { label: t.growth.teacherTalkAvg, key: "teacherTalkRatio" as const },
    socraticQuestionRate: { label: t.growth.socraticRateAvg, key: "socraticQuestionRate" as const },
    inclusivityIndex: { label: t.growth.inclusivityAvg, key: "inclusivityIndex" as const },
  };

  const [metric, setMetric] = useState<keyof typeof metricsConfig>("overallScore");

  const values = sessions.map((s) => s[metricsConfig[metric].key]).filter((v): v is number => v !== null);
  const width = 640;
  const height = 220;
  const padding = 32;

  const points = sessions
    .map((s, i) => {
      const v = s[metricsConfig[metric].key];
      if (v === null) return null;
      const x = padding + (i / Math.max(1, sessions.length - 1)) * (width - padding * 2);
      const y = height - padding - (v / 100) * (height - padding * 2);
      return { x, y, v, date: s.date };
    })
    .filter((p): p is { x: number; y: number; v: number; date: string } => p !== null);

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const trendLabel =
    values.length >= 2
      ? values[values.length - 1] > values[0]
        ? (lang === "en" ? "Improving ▲" : "في تحسن ▲")
        : values[values.length - 1] < values[0]
        ? (lang === "en" ? "Declining ▼" : "في تراجع ▼")
        : (lang === "en" ? "Stable" : "مستقر")
      : null;

  return (
    <div className="bg-white dark:bg-white/5 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-sm text-[#071B3A] dark:text-white">{t.growth.performanceTrend}</h2>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as keyof typeof metricsConfig)}
          className="text-xs rounded-lg border border-[#071B3A]/15 dark:border-white/20 dark:bg-[#0D2554] dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          {Object.entries(metricsConfig).map(([key, m]) => (
            <option key={key} value={key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {points.length === 0 ? (
        <p className="text-xs text-[#071B3A]/40 dark:text-white/40 py-12 text-center">
          {lang === "en"
            ? "Not enough data to graph trends yet — complete more simulations."
            : "لسه مفيش بيانات كفاية لعرض التطور — كمّل جلسات أكتر."}
        </p>
      ) : (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
            {[0, 50, 100].map((tick) => {
              const y = height - padding - (tick / 100) * (height - padding * 2);
              return (
                <g key={tick}>
                  <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="currentColor" className="text-[#071B3A]/10 dark:text-white/10" />
                  <text x={padding - 8} y={y + 4} textAnchor="end" fontSize="10" fill="currentColor" className="text-[#071B3A]/40 dark:text-white/40 font-mono">
                    {tick}%
                  </text>
                </g>
              );
            })}
            <path d={pathD} fill="none" stroke="#0d9488" strokeWidth={2.5} />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={4} fill="#0d9488" className="hover:r-6 transition-all" />
            ))}
          </svg>
          <div className="flex justify-between text-xs text-[#071B3A]/40 dark:text-white/40 mt-2 font-mono">
            <span>{points[0]?.date}</span>
            {trendLabel && (
              <span
                className={`font-semibold ${
                  trendLabel.includes("▲")
                    ? "text-teal-600 dark:text-teal-400"
                    : trendLabel.includes("▼")
                    ? "text-red-500"
                    : ""
                }`}
              >
                {trendLabel}
              </span>
            )}
            <span>{points[points.length - 1]?.date}</span>
          </div>
        </>
      )}
    </div>
  );
}
