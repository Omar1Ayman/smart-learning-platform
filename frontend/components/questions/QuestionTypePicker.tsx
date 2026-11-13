"use client";

import type { QuestionType } from "@/lib/api/questions";

interface QuestionTypePickerProps {
  onPick: (type: QuestionType) => void;
}

const CARDS: Array<{
  type: QuestionType;
  icon: string;
  label: string;
  hint: string;
  bg: string;
  border: string;
}> = [
  {
    type: "MCQ",
    icon: "🔤",
    label: "اختيار من متعدد",
    hint: "خياران أو أكثر، إجابة صحيحة واحدة",
    bg: "bg-info/5",
    border: "border-info/30 hover:border-info/60",
  },
  {
    type: "TRUE_FALSE",
    icon: "✓✗",
    label: "صح / خطأ",
    hint: "خياران ثابتان: صح وخطأ",
    bg: "bg-success/5",
    border: "border-success/30 hover:border-success/60",
  },
  {
    type: "SHORT_ANSWER",
    icon: "✏️",
    label: "إجابة قصيرة",
    hint: "الطالب يكتب إجابة، تُقارن مع إجابات مقبولة",
    bg: "bg-accent/5",
    border: "border-accent/30 hover:border-accent/60",
  },
  {
    type: "ESSAY",
    icon: "📝",
    label: "مقالي",
    hint: "إجابة مفتوحة، تصحيح يدوي",
    bg: "bg-ink-50",
    border: "border-line hover:border-ink/40",
  },
];

/**
 * Batch 16: replaces the generic "+ إضافة سؤال" button on the Questions
 * page with a 4-card picker. Picking a card opens the QuestionForm with
 * the type pre-selected — one fewer click, and the user sees what
 * options exist before committing.
 */
export function QuestionTypePicker({ onPick }: QuestionTypePickerProps) {
  return (
    <div className="p-6 card">
      <h2 className="text-lg font-bold font-display text-ink">ما نوع السؤال؟</h2>
      <p className="mt-1 text-sm text-ink-400">
        اختر النوع لبدء إضافة سؤال جديد
      </p>
      <div className="grid gap-3 mt-4 sm:grid-cols-2">
        {CARDS.map((c) => (
          <button
            key={c.type}
            onClick={() => onPick(c.type)}
            className={`flex items-start gap-3 rounded-lg border-2 p-4 text-start transition-all ${c.bg} ${c.border}`}
          >
            <span className="text-2xl shrink-0">{c.icon}</span>
            <span className="flex-1 min-w-0">
              <p className="text-sm font-bold text-ink">{c.label}</p>
              <p className="mt-0.5 text-xs text-ink-400">{c.hint}</p>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}