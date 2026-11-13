import type {
  PrepareNextYearInput,
  PrepareNextYearResponse,
} from "@/types";

export type RolloverStep = 1 | 2 | 3 | 4 | 5 | 6;
export type RolloverAction = "PROMOTE" | "REPEAT" | "GRADUATE" | "TRANSFER";

export interface RolloverDecision {
  action: RolloverAction;
  targetGroup: string | null;
}

export interface RolloverProgress {
  version: 2;
  sourceYearId: string;
  step: RolloverStep;
  preparedYear: PrepareNextYearResponse | null;
  prepareInput: PrepareNextYearInput | null;
  promotedCount: number | null;
  decisions: Record<string, RolloverDecision>;
}

const VERSION = 2;

export function getRolloverProgressKey(userId: string, yearId: string): string {
  return `smart-learning:rollover:${VERSION}:${userId}:${yearId}`;
}

export function readRolloverProgress(
  key: string,
  sourceYearId: string
): { progress: RolloverProgress | null; failed: boolean } {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { progress: null, failed: false };

    const value: unknown = JSON.parse(raw);
    if (!isRolloverProgress(value) || value.sourceYearId !== sourceYearId) {
      return { progress: null, failed: true };
    }

    return { progress: value, failed: false };
  } catch (error) {
    console.error("Could not restore academic-year rollover progress.", error);
    return { progress: null, failed: true };
  }
}

export function updateRolloverProgress(
  key: string,
  sourceYearId: string,
  update: Partial<Omit<RolloverProgress, "version" | "sourceYearId">>
): boolean {
  try {
    const { progress } = readRolloverProgress(key, sourceYearId);
    const next: RolloverProgress = {
      version: VERSION,
      sourceYearId,
      step: progress?.step ?? 1,
      preparedYear: progress?.preparedYear ?? null,
      prepareInput: progress?.prepareInput ?? null,
      promotedCount: progress?.promotedCount ?? null,
      decisions: progress?.decisions ?? {},
      ...update,
    };
    window.localStorage.setItem(key, JSON.stringify(next));
    return true;
  } catch (error) {
    console.error("Could not save academic-year rollover progress.", error);
    return false;
  }
}

function isRolloverProgress(value: unknown): value is RolloverProgress {
  if (!value || typeof value !== "object") return false;
  const progress = value as Partial<RolloverProgress>;
  const decisions = progress.decisions;
  return (
    progress.version === VERSION &&
    typeof progress.sourceYearId === "string" &&
    [1, 2, 3, 4, 5, 6].includes(progress.step as number) &&
    (progress.preparedYear === null ||
      (typeof progress.preparedYear === "object" &&
        typeof progress.preparedYear.new_year_id === "string" &&
        typeof progress.preparedYear.new_year_name === "string" &&
        !!progress.preparedYear.copied &&
        typeof progress.preparedYear.copied === "object")) &&
    (progress.prepareInput === null ||
      (typeof progress.prepareInput === "object" &&
        typeof progress.prepareInput.name === "string" &&
        typeof progress.prepareInput.start_date === "string" &&
        typeof progress.prepareInput.end_date === "string" &&
        typeof progress.prepareInput.copy_terms === "boolean" &&
        typeof progress.prepareInput.copy_groups === "boolean" &&
        typeof progress.prepareInput.copy_courses === "boolean")) &&
    (progress.promotedCount === null ||
      typeof progress.promotedCount === "number") &&
    !!decisions &&
    typeof decisions === "object" &&
    !Array.isArray(decisions) &&
    Object.values(decisions).every(
      (decision) =>
        !!decision &&
        (decision.action === "PROMOTE" ||
          decision.action === "REPEAT" ||
          decision.action === "GRADUATE" ||
          decision.action === "TRANSFER") &&
        (typeof decision.targetGroup === "string" ||
          decision.targetGroup === null)
    )
  );
}
