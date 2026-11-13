"use client";

import { AlertCircle } from "./icons";

interface FormErrorSummaryProps {
  messages: string[];
}

/**
 * Banner that appears above a form after the user attempts submit and
 * one or more fields have errors. Each message is one line: "fieldName:
 * errorText". Purely presentational — the caller computes `messages` from
 * react-hook-form's errors object (each form knows its own field labels).
 */
export function FormErrorSummary({ messages }: FormErrorSummaryProps) {
  if (messages.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger/5 p-3 animate-fade-in"
    >
      <div className="flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1 text-sm text-danger">
          <p className="font-medium">
            يرجى تصحيح {messages.length} حقل قبل الحفظ:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5 text-xs">
            {messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}