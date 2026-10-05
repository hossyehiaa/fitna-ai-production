"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n/context";
import { X } from "lucide-react";

type TeacherOption = {
  id: string;
  name: string;
  email: string;
};

export function CreateCohortModal({ teachers }: { teachers: TeacherOption[] }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTeacher(id: string) {
    setSelectedTeachers((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t.institution.cohortNameLabel);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cohorts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          teacherIds: selectedTeachers,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || t.common.error);
        return;
      }

      setIsOpen(false);
      setName("");
      setDescription("");
      setSelectedTeachers([]);
      router.refresh();
    } catch {
      setError(t.common.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg px-4 py-2.5 shadow-sm transition flex items-center gap-2"
      >
        <span>{t.institution.createCohortButton}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#0D2554] border border-[#071B3A]/10 dark:border-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 text-start">
            <div className="flex items-center justify-between border-b border-[#071B3A]/10 dark:border-white/10 pb-3">
              <h3 className="font-bold text-base text-[#071B3A] dark:text-white">
                {t.institution.createCohortModalTitle}
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-[#071B3A]/40 dark:text-white/40 hover:text-black dark:hover:text-white p-1 rounded-lg transition"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#071B3A] dark:text-white mb-1">
                  {t.institution.cohortNameLabel}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.institution.cohortNamePlaceholder}
                  className="w-full rounded-lg border border-[#071B3A]/15 dark:border-white/15 dark:bg-white/5 dark:text-white px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#071B3A] dark:text-white mb-1">
                  {t.institution.cohortDescLabel}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder={t.institution.cohortDescPlaceholder}
                  className="w-full rounded-lg border border-[#071B3A]/15 dark:border-white/15 dark:bg-white/5 dark:text-white px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#071B3A] dark:text-white mb-2">
                  {t.institution.selectTeachersLabel} ({selectedTeachers.length})
                </label>
                {teachers.length === 0 ? (
                  <p className="text-xs text-[#071B3A]/40 dark:text-white/40">
                    {t.institution.noTeachersYet}
                  </p>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1.5 border border-[#071B3A]/10 dark:border-white/10 rounded-lg p-2 bg-white dark:bg-[#071B3A]">
                    {teachers.map((tItem) => {
                      const checked = selectedTeachers.includes(tItem.id);
                      return (
                        <label
                          key={tItem.id}
                          className={`flex items-center gap-2 p-1.5 rounded cursor-pointer text-xs transition ${
                            checked
                              ? "bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200 font-semibold"
                              : "hover:bg-[#071B3A]/5 dark:hover:bg-white/5 text-[#071B3A] dark:text-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTeacher(tItem.id)}
                            className="rounded text-teal-600 accent-teal-600"
                          />
                          <span>{tItem.name || tItem.email}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 p-2.5 rounded-lg">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#071B3A]/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-[#071B3A]/70 dark:text-white/70 hover:bg-[#071B3A]/5 dark:hover:bg-white/5 rounded-lg"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 text-xs font-bold bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg shadow-sm transition"
                >
                  {loading ? t.common.saving : t.institution.saveCohortButton}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
