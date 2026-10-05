"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n/context";
import { Link2, FileText, Check } from "lucide-react";

export function ReportActions({ shareToken }: { shareToken: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  function handleShare() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = `${origin}/report/share/${shareToken}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="flex items-center gap-2 print:hidden">
      <button
        onClick={handleShare}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#071B3A]/15 dark:border-white/20 hover:border-teal-600 bg-white dark:bg-white/5 text-xs font-semibold text-[#071B3A] dark:text-white hover:text-teal-700 dark:hover:text-teal-300 transition shadow-sm"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Link2 className="w-3.5 h-3.5" />}
        <span>{copied ? t.report.linkCopied : t.report.shareReport}</span>
      </button>

      <button
        onClick={handlePrint}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#071B3A] hover:bg-[#071B3A]/90 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold transition shadow-sm"
      >
        <FileText className="w-3.5 h-3.5" />
        <span>{t.report.exportPdf}</span>
      </button>
    </div>
  );
}
