"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import type { ActionMenuItem } from "@/components/ui/ActionMenu";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  DataTable,
  type Column,
  type FilterDef,
} from "@/components/ui/DataTable";
import { PageShell } from "@/components/ui/PageShell";
import { EmptyState } from "@/components/ui/States";
import { bulkDelete } from "@/lib/api/bulkDelete";
import { useCanWrite } from "@/lib/auth/useCanWrite";
import { useUrlState } from "@/lib/hooks/useUrlState";
import {
  extractBlockedItems,
  extractErrorMessage,
  toastError,
  toastSuccess,
  toastWithAction,
} from "@/lib/utils/toast";

export type { Column, FilterDef };

interface ResourcePageProps<T extends { id: string }, F> {
  title: string;
  description?: string;

  queryKey: string[];
  queryFn: (params: { page: number }) => Promise<{ results: T[]; count: number }>;
  queryEnabled?: boolean;

  columns: Column<T>[];
  searchable?: boolean;
  searchPlaceholder?: string;
  searchPredicate?: (row: T, query: string) => boolean;
  filters?: FilterDef<T>[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;

  createLabel: string;
  formTitle: string;
  FormComponent: React.ComponentType<{
    onSubmit: (values: F) => Promise<void>;
    initialValues?: Partial<F>;
    /** Phase 1.16: allow forms to control the "add another" behaviour */
    keepOpen?: boolean;
    onKeepOpenChange?: (checked: boolean) => void;
  }>;
  onSubmit: (values: F) => Promise<void>;

  EditFormComponent?: React.ComponentType<{
    onSubmit: (values: F) => Promise<void>;
    initialValues?: Partial<F>;
  }>;
  rowToFormValues?: (row: T) => Partial<F>;
  onUpdate?: (id: string, values: F) => Promise<void>;

  onDelete?: (id: string) => Promise<void>;
  deleteLabel?: (row: T) => string;

  canEditRow?: (row: T) => boolean;
  canDeleteRow?: (row: T) => boolean;

  bulkResource?: string | null;

  extraActions?: (row: T) => ActionMenuItem[];

  extraHeaderActions?: React.ReactNode;

  emptyTitle: string;
  emptyDescription?: string;
  pageSize?: number;
}

const UNDO_WINDOW_MS = 5000;

export function ResourcePage<T extends { id: string }, F>({
  title,
  description,
  queryKey,
  queryFn,
  queryEnabled = true,
  columns,
  searchable = true,
  searchPlaceholder = "ابحث...",
  searchPredicate,
  filters,
  filterValues,
  onFilterChange,
  createLabel,
  formTitle,
  FormComponent,
  onSubmit,
  EditFormComponent,
  rowToFormValues,
  onUpdate,
  onDelete,
  deleteLabel,
  canEditRow,
  canDeleteRow,
  bulkResource,
  extraActions,
  extraHeaderActions,
  emptyTitle,
  emptyDescription,
  pageSize = 20,
}: ResourcePageProps<T, F>) {
  const canWrite = useCanWrite();
  const queryClient = useQueryClient();

  const [page, setPage] = useUrlState("p", "1");
  const pageNum = Math.max(1, parseInt(page, 10) || 1);

  const [createOpen, setCreateOpen] = useState(false);
  const [keepOpen, setKeepOpen] = useState(false);
  // Changing formKey forces the FormComponent to remount (fresh state)
  const [formKey, setFormKey] = useState(0);

  const [editTarget, setEditTarget] = useState<T | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const deleteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const canEdit = canWrite && !!onUpdate && !!rowToFormValues;
  const canDelete = canWrite && !!onDelete;
  const canBulkDelete = canDelete;

  const EditForm = EditFormComponent ?? FormComponent;

  const resolvedBulkResource =
    bulkResource === null ? null : bulkResource ?? queryKey[0];

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: [...queryKey, pageNum],
    queryFn: () => queryFn({ page: pageNum }),
    enabled: queryEnabled,
  });

  const visibleData = useMemo(() => {
    if (!data?.results) return [];
    if (pendingDeletes.size === 0) return data.results;
    return data.results.filter((r) => !pendingDeletes.has(r.id));
  }, [data?.results, pendingDeletes]);

  async function handleCreate(values: F) {
    await onSubmit(values);
    if (keepOpen) {
      // Stay open: refresh the data and reset the form so the user
      // can immediately enter the next row without any clicking.
      await invalidate();
      setFormKey((k) => k + 1);
    } else {
      setCreateOpen(false);
      setPage("1");
    }
  }

  async function handleUpdate(values: F) {
    if (!editTarget || !onUpdate) return;
    await onUpdate(editTarget.id, values);
    setEditTarget(null);
  }

  function handleDeleteWithUndo(row: T) {
    if (!onDelete) return;
    const id = row.id;
    const label = deleteLabel ? deleteLabel(row) : "العنصر";

    setPendingDeletes((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    const timer = setTimeout(async () => {
      delete deleteTimers.current[id];
      try {
        await onDelete(id);
        await invalidate();
      } catch (err) {
        setPendingDeletes((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toastError(err, "تعذّر الحذف — تم التراجع.");
      }
    }, UNDO_WINDOW_MS);

    deleteTimers.current[id] = timer;

    toastWithAction(`تم حذف "${label}"`, {
      actionLabel: "تراجع",
      durationMs: UNDO_WINDOW_MS,
      onAction: () => {
        const t = deleteTimers.current[id];
        if (t) {
          clearTimeout(t);
          delete deleteTimers.current[id];
        }
        setPendingDeletes((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
    });

    setDeleteTarget(null);
  }

  async function handleBulkDeleteConfirm() {
    if (!onDelete || selectedIds.size === 0) return;
    setBusyDelete(true);
    const ids = Array.from(selectedIds);

    try {
      if (resolvedBulkResource) {
        const result = await bulkDelete(resolvedBulkResource, ids);
        await invalidate();
        setSelectedIds(new Set());
        if (result.missing.length > 0) {
          toastSuccess(
            `تم حذف ${result.deleted.length} — ${result.missing.length} كان محذوفًا بالفعل.`
          );
        } else {
          toastSuccess(`تم حذف ${result.deleted.length} عنصر.`);
        }
      } else {
        let succeeded = 0;
        const failures: string[] = [];
        for (const id of ids) {
          try {
            await onDelete(id);
            succeeded += 1;
          } catch {
            failures.push(id);
          }
        }
        await invalidate();
        setSelectedIds(new Set(ids.filter((id) => failures.includes(id))));
        if (failures.length === 0) {
          toastSuccess(`تم حذف ${succeeded} عنصر.`);
        } else {
          toastError(
            new Error(`تم حذف ${succeeded} — فشل حذف ${failures.length}.`),
            ""
          );
        }
      }
      setConfirmBulkDelete(false);
    } catch (err) {
      const blocked = extractBlockedItems(err);
      if (blocked.length > 0) {
        toastError(
          new Error(
            `لم يُحذف أي شيء — ${blocked.length} عنصر مرتبط ببيانات أخرى (${blocked[0].label}).`
          ),
          ""
        );
      } else {
        toastError(
          new Error(extractErrorMessage(err, "تعذّر حذف العناصر.")),
          ""
        );
      }
      setConfirmBulkDelete(false);
    } finally {
      setBusyDelete(false);
    }
  }

  function rowActions(row: T): ActionMenuItem[] {
    const rowCanEdit = canEdit && (canEditRow ? canEditRow(row) : true);
    const rowCanDelete = canDelete && (canDeleteRow ? canDeleteRow(row) : true);

    return [
      ...(extraActions ? extraActions(row) : []),
      ...(rowCanEdit
        ? [{ label: "تعديل", onClick: () => setEditTarget(row) }]
        : []),
      ...(rowCanDelete
        ? [
            {
              label: "حذف",
              variant: "danger" as const,
              onClick: () => setDeleteTarget(row),
            },
          ]
        : []),
    ];
  }

  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const stableFilterValues = useMemo(
    () => filterValues ?? {},
    [filterValues]
  );

  function openCreateModal() {
    setCreateOpen(true);
  }

  const showCreateButton = canWrite && queryEnabled;

  return (
    <>
      {canBulkDelete && (
        <BulkActionBar
          count={selectedIds.size}
          onClearSelection={() => setSelectedIds(new Set())}
          onDeleteSelected={() => setConfirmBulkDelete(true)}
        />
      )}

      <PageShell
        title={title}
        description={description ?? (total > 0 ? `${total} عنصر` : undefined)}
        isLoading={isLoading}
        isError={isError}
        errorMessage={`تعذّر تحميل ${title}.`}
        onRetry={() => refetch()}
        loadingVariant="table"
        actions={
          <>
            {extraHeaderActions}
            {showCreateButton && (
              <Button onClick={openCreateModal}>{createLabel}</Button>
            )}
          </>
        }
        pagination={
          totalPages > 1 && total > 0
            ? {
                page: pageNum,
                totalPages,
                totalItems: total,
                pageSize,
                onPageChange: (p) => setPage(String(p)),
                isLoading: isFetching,
              }
            : undefined
        }
      >
        <DataTable<T>
          data={visibleData}
          columns={columns}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          searchPredicate={searchPredicate}
          filters={filters}
          filterValues={stableFilterValues}
          onFilterChange={onFilterChange}
          selectable={canBulkDelete}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          rowActions={
            canEdit || canDelete || extraActions ? rowActions : undefined
          }
          emptyState={
            <EmptyState
              icon="📭"
              title={emptyTitle}
              description={emptyDescription}
              action={
                showCreateButton && (
                  <Button onClick={openCreateModal}>{createLabel}</Button>
                )
              }
            />
          }
        />
      </PageShell>

      {canWrite && (
        <QuickCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title={formTitle}
        >
          <FormComponent
            key={formKey}
            onSubmit={handleCreate}
            keepOpen={keepOpen}
            onKeepOpenChange={setKeepOpen}
          />
        </QuickCreateModal>
      )}

      {canEdit && editTarget && rowToFormValues && (
        <QuickCreateModal
          open={true}
          onClose={() => setEditTarget(null)}
          title={`تعديل — ${formTitle.replace(/^إضافة\s+/, "")}`}
        >
          <EditForm
            onSubmit={handleUpdate}
            initialValues={rowToFormValues(editTarget)}
          />
        </QuickCreateModal>
      )}

      {canDelete && deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          title="تأكيد الحذف"
          description={`سيتم حذف "${
            deleteLabel ? deleteLabel(deleteTarget) : "هذا العنصر"
          }". يمكنك التراجع خلال ${UNDO_WINDOW_MS / 1000} ثوانٍ.`}
          confirmLabel="حذف"
          cancelLabel="إلغاء"
          variant="danger"
          onConfirm={() => {
            if (deleteTarget) handleDeleteWithUndo(deleteTarget);
          }}
          onCancel={() => setDeleteTarget(null)}
          isPending={false}
        />
      )}

      {canBulkDelete && (
        <ConfirmDialog
          open={confirmBulkDelete}
          title={`تأكيد حذف ${selectedIds.size} عنصر`}
          description={`سيتم حذف ${selectedIds.size} عنصر نهائيًا. لا يمكن التراجع.`}
          confirmLabel={busyDelete ? "جارٍ الحذف..." : "حذف الكل"}
          cancelLabel="إلغاء"
          variant="danger"
          onConfirm={handleBulkDeleteConfirm}
          onCancel={() => setConfirmBulkDelete(false)}
          isPending={busyDelete}
        />
      )}
    </>
  );
}