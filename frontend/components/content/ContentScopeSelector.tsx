"use client";

import { Book, FileText, GraduationCap, Home } from "@/components/ui/icons";

export type ScopeLevel = "tenant" | "grade" | "course" | "lesson";

const OPTIONS: Array<{
  value: ScopeLevel;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: "tenant",
    label: "كل المؤسسة",
    description: "مادة عامة لكل طلاب المؤسسة، ويمكن تضييقها من الخيارات الإضافية.",
    icon: <Home size={20} />,
  },
  {
    value: "grade",
    label: "صف دراسي محدد",
    description: "كل طلاب الصف المحدد، مهما اختلفت مجموعاتهم.",
    icon: <GraduationCap size={20} />,
  },
  {
    value: "course",
    label: "مقرر دراسي محدد",
    description: "طلاب المقرر؛ وهو مرتبط بمادة وصف وسنة دراسية.",
    icon: <Book size={20} />,
  },
  {
    value: "lesson",
    label: "درس موجود",
    description: "أضف المورد إلى درس موجود داخل مقرر.",
    icon: <FileText size={20} />,
  },
];

interface ContentScopeSelectorProps {
  value: ScopeLevel;
  onChange: (v: ScopeLevel) => void;
}

export function ContentScopeSelector({ value, onChange }: ContentScopeSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-ink-700">
        من سيشاهد هذه المادة؟
      </p>
      {OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 transition-all ${
              selected
                ? "border-ink bg-ink/5"
                : "border-line bg-paper-elevated hover:border-ink/30 hover:bg-ink-50/30"
            }`}
          >
            <input
              type="radio"
              name="scope-level"
              value={opt.value}
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="mt-1 h-4 w-4 shrink-0 accent-ink"
            />
            <span
              className={`mt-0.5 shrink-0 ${
                selected ? "text-ink" : "text-ink-400"
              }`}
            >
              {opt.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{opt.label}</p>
              <p className="mt-0.5 text-xs text-ink-400">{opt.description}</p>
            </div>
          </label>
        );
      })}
    </div>
  );
}