"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { listAuditLogs } from "@/lib/api/audit";
import type { AuditLogEntry } from "@/types";
import { formatMetadataAsJson, formatMetadataForDisplay } from "@/lib/utils/auditMetadata";

const ACTION_GROUPS = [
  { value: "", label: "كل الأحداث" },
  { value: "user.", label: "المستخدمون" },
  { value: "content.", label: "المحتوى" },
  { value: "question.", label: "الأسئلة" },
  { value: "assessment.", label: "الامتحانات" },
  { value: "session.", label: "الجلسات" },
  { value: "enrollment.", label: "التسجيلات" },
  { value: "academic_year.", label: "السنوات الدراسية" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ar-EG", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AuditPage() {
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit-logs", { action, from, to, page }],
    queryFn: () => listAuditLogs({ action: action || undefined, from: from || undefined, to: to || undefined, page }),
  });
  if (isLoading) return <Spinner />;
  if (!data) return <Spinner />;   

  function resetFilters() {
    setAction(""); setFrom(""); setTo(""); setPage(1);
  }

  const hasFilters = !!(action || from || to);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-ink">سجل الأحداث</h1>
        <p className="mt-1 text-sm text-ink-400">
          تتبع دقيق لكل إجراء حساس في مؤسستك — من قام به، ومتى، وتفاصيله.
        </p>
      </div>

      {/* 🌟 Horizontal Filter Toolbar */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper-elevated p-3 shadow-sm">
        <div className="flex flex-col gap-1.5 min-w-[160px]">
          <label className="text-xs font-medium text-ink-500">نوع الحدث</label>
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
          >
            {ACTION_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-ink-500">من تاريخ</label>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-ink-500">إلى تاريخ</label>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" onClick={resetFilters} className="text-xs mb-0.5">
            ✕ مسح الفلاتر
          </Button>
        )}
      </div>

      {/* Table Section */}
      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : isError ? (
        <ErrorState message="تعذّر تحميل سجل الأحداث." />
      ) : data?.results.length === 0 ? (
        <EmptyState title="لا توجد أحداث" description="لم يتم تسجيل أي حدث يطابق بحثك." />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-ink-50 text-start text-ink-500">
                  <tr>
                    <th className="px-5 py-4 font-semibold text-start">الحدث</th>
                    <th className="px-4 py-4 font-semibold text-start">المنفذ</th>
                    <th className="px-4 py-4 font-semibold text-start">الوقت</th>
                    <th className="w-12 px-3 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.results.map((log) => (
                    <AuditRow
                      key={log.id}
                      log={log}
                      expanded={expanded === log.id}
                      onToggle={() => setExpanded(expanded === log.id ? null : log.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Enhanced Pagination */}
          <div className="flex items-center justify-between gap-4 mt-2">
            <p className="text-xs text-ink-400">
              صفحة <strong className="text-ink">{page}</strong> من {Math.ceil((data.count ?? 0) / 20)}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setPage(page - 1)} disabled={!data.previous} className="text-xs">
                السابق
              </Button>
              <Button variant="secondary" onClick={() => setPage(page + 1)} disabled={!data.next} className="text-xs">
                التالي
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AuditRow({ log, expanded, onToggle }: { log: AuditLogEntry; expanded: boolean; onToggle: () => void; }) {
  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
  const [showRaw, setShowRaw] = useState(false);
  const formatted = hasMetadata ? formatMetadataForDisplay(log.metadata) : [];

  return (
    <>
      <tr
        className={`transition-colors ${hasMetadata ? "cursor-pointer hover:bg-ink-50/50" : ""} ${expanded ? "bg-ink-50/30" : ""}`}
        onClick={hasMetadata ? onToggle : undefined}
      >
        <td className="px-5 py-4">
          <p className="font-semibold text-ink">{log.action_label}</p>
          {log.object_type && (
            <p className="mt-0.5 text-[11px] text-ink-400 font-medium">
              {objectTypeLabel(log.object_type)}
              {log.object_id && ` #${log.object_id.slice(0, 8)}`}
            </p>
          )}
        </td>
        <td className="px-4 py-4">
          {log.actor_email ? (
            <div>
              <p className="font-medium text-ink-700">{log.actor_email}</p>
              {log.actor_role && (
                <p className="mt-0.5 text-[11px] text-ink-400">{roleLabel(log.actor_role)}</p>
              )}
            </div>
          ) : (
            <span className="text-xs text-ink-300">نظام آلي</span>
          )}
        </td>
        <td className="px-4 py-4 text-xs text-ink-400">{formatDate(log.created_at)}</td>
        <td className="px-3 py-4 text-center">
          {hasMetadata && (
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md bg-ink-50 text-ink-500 transition-transform ${expanded ? "rotate-180" : ""}`}>
              ▼
            </span>
          )}
        </td>
      </tr>
      
      {/* Expanded Metadata Panel */}
      {expanded && hasMetadata && (
        <tr className="border-b border-line bg-paper-muted/30">
          <td colSpan={4} className="px-5 py-4">
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }}
                  className="text-[11px] font-medium text-accent hover:underline"
                >
                  {showRaw ? "عرض منسق" : "عرض JSON خام"}
                </button>
              </div>

              {showRaw ? (
                <pre dir="ltr" className="whitespace-pre-wrap rounded-lg bg-ink-900 p-4 font-mono text-[11px] text-success overflow-x-auto">
                  {formatMetadataAsJson(log.metadata)}
                </pre>
              ) : (
                <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {formatted.map((row) => (
                    <div key={row.key} className="flex flex-col rounded-lg border border-line bg-white p-2.5 shadow-sm">
                      <dt className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">{row.label}</dt>
                      <dd className="mt-1 text-sm font-medium text-ink truncate">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function objectTypeLabel(objectType: string): string {
  const map: Record<string, string> = {
    AttendanceSession: "جلسة حضور", AttendanceRecord: "سجل حضور", GroupSchedule: "جدول أسبوعي",
    Question: "سؤال", QuestionBank: "بنك أسئلة", Content: "محتوى", Assessment: "امتحان",
    ExamAttempt: "محاولة", User: "مستخدم", Tenant: "مؤسسة", Enrollment: "تسجيل",
    AcademicYear: "سنة دراسية", Term: "ترم", Course: "مادة دراسية", Group: "مجموعة",
    Grade: "صف", Stage: "مرحلة", Subject: "مادة",
  };
  return map[objectType] ?? objectType;
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    OWNER: "مالك", ADMIN: "مسؤول", TEACHER: "معلم", STUDENT: "طالب", PARENT: "ولي أمر",
  };
  return map[role] ?? role;
}