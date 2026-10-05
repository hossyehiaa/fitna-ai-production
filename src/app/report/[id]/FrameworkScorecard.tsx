"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n/context";

export type FrameworkScoresProps = {
  danielson?: {
    questioningDiscussion?: { score: number; label: string; feedback: string };
    studentEngagement?: { score: number; label: string; feedback: string };
    managingBehavior?: { score: number; label: string; feedback: string };
  };
  classFramework?: {
    instructionalSupport?: { score: number; label: string; feedback: string };
    classroomOrganization?: { score: number; label: string; feedback: string };
    emotionalSupport?: { score: number; label: string; feedback: string };
  };
};

export function FrameworkScorecard({ scores }: { scores: FrameworkScoresProps | null }) {
  const { t, lang } = useTranslation();
  if (!scores) return null;

  const isEn = lang === "en";

  return (
    <div className="bg-white dark:bg-white/5 rounded-2xl p-6 space-y-6 shadow-sm">
      <div className="border-b border-[#071B3A]/10 dark:border-white/10 pb-3">
        <h2 className="font-bold text-base text-[#071B3A] dark:text-white">
          {t.report.frameworkTitle}
        </h2>
        <p className="text-xs text-[#071B3A]/60 dark:text-white/60 mt-0.5">
          {t.report.frameworkSubtitle}
        </p>
      </div>

      {/* Danielson Framework */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 px-2.5 py-1 rounded-md">
            {t.report.danielsonTitle}
          </span>
          <span className="text-[11px] text-[#071B3A]/50 dark:text-white/50">{t.report.danielsonScale}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {scores.danielson?.questioningDiscussion && (
            <FrameworkCard
              title={isEn ? "Questioning & Discussion (3b)" : "تقنيات الأسئلة والنقاش (3b)"}
              score={scores.danielson.questioningDiscussion.score}
              maxScore={4}
              label={scores.danielson.questioningDiscussion.label}
              feedback={scores.danielson.questioningDiscussion.feedback}
              levelText={t.report.levelLabel}
            />
          )}
          {scores.danielson?.studentEngagement && (
            <FrameworkCard
              title={isEn ? "Engaging Students in Learning (3c)" : "إشراك الطلاب في التعلم (3c)"}
              score={scores.danielson.studentEngagement.score}
              maxScore={4}
              label={scores.danielson.studentEngagement.label}
              feedback={scores.danielson.studentEngagement.feedback}
              levelText={t.report.levelLabel}
            />
          )}
          {scores.danielson?.managingBehavior && (
            <FrameworkCard
              title={isEn ? "Managing Student Behavior (2d)" : "إدارة سلوك الطلاب (2d)"}
              score={scores.danielson.managingBehavior.score}
              maxScore={4}
              label={scores.danielson.managingBehavior.label}
              feedback={scores.danielson.managingBehavior.feedback}
              levelText={t.report.levelLabel}
            />
          )}
        </div>
      </div>

      {/* CLASS Framework */}
      <div className="space-y-3 pt-2 border-t border-[#071B3A]/5 dark:border-white/5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-yellow-800 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/40 px-2.5 py-1 rounded-md">
            {t.report.classTitle}
          </span>
          <span className="text-[11px] text-[#071B3A]/50 dark:text-white/50">{t.report.classScale}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {scores.classFramework?.instructionalSupport && (
            <FrameworkCard
              title={isEn ? "Instructional Support" : "الدعم التعليمي (Instructional Support)"}
              score={scores.classFramework.instructionalSupport.score}
              maxScore={7}
              label={scores.classFramework.instructionalSupport.label}
              feedback={scores.classFramework.instructionalSupport.feedback}
              levelText={t.report.levelLabel}
            />
          )}
          {scores.classFramework?.classroomOrganization && (
            <FrameworkCard
              title={isEn ? "Classroom Organization" : "تنظيم الفصل (Classroom Organization)"}
              score={scores.classFramework.classroomOrganization.score}
              maxScore={7}
              label={scores.classFramework.classroomOrganization.label}
              feedback={scores.classFramework.classroomOrganization.feedback}
              levelText={t.report.levelLabel}
            />
          )}
          {scores.classFramework?.emotionalSupport && (
            <FrameworkCard
              title={isEn ? "Emotional Support" : "الدعم النفسي والتشجيع (Emotional Support)"}
              score={scores.classFramework.emotionalSupport.score}
              maxScore={7}
              label={scores.classFramework.emotionalSupport.label}
              feedback={scores.classFramework.emotionalSupport.feedback}
              levelText={t.report.levelLabel}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FrameworkCard({
  title,
  score,
  maxScore,
  label,
  feedback,
  levelText,
}: {
  title: string;
  score: number;
  maxScore: number;
  label: string;
  feedback: string;
  levelText: string;
}) {
  const percentage = Math.min(100, Math.round((score / maxScore) * 100));

  return (
    <div className="border border-[#071B3A]/10 dark:border-white/10 rounded-xl p-3.5 bg-[#071B3A]/[0.01] dark:bg-white/[0.02] space-y-2">
      <div className="flex items-start justify-between">
        <h4 className="font-semibold text-xs text-[#071B3A] dark:text-white">{title}</h4>
        <span className="text-xs font-bold text-teal-700 dark:text-teal-400 font-mono">
          {score}/{maxScore}
        </span>
      </div>

      <div className="w-full bg-[#071B3A]/10 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full ${
            percentage >= 75 ? "bg-teal-500" : percentage >= 50 ? "bg-yellow-500" : "bg-red-400"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="text-[#071B3A]/50 dark:text-white/50">{levelText}:</span>
        <span className="font-bold text-[#071B3A] dark:text-white">{label}</span>
      </div>

      {feedback && (
        <p className="text-[11px] text-[#071B3A]/75 dark:text-white/70 leading-relaxed pt-1 border-t border-[#071B3A]/5 dark:border-white/5">
          {feedback}
        </p>
      )}
    </div>
  );
}
