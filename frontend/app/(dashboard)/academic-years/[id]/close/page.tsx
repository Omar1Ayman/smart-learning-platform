"use client";

import { use } from "react";
import { RolloverWizard } from "@/components/rollover/RolloverWizard";

export default function CloseAcademicYearPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <RolloverWizard yearId={id} />;
}