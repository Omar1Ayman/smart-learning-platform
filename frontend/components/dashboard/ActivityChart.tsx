"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimeSeriesPoint } from "@/types";

export function ActivityChart({ data }: { data: TimeSeriesPoint[] }) {
  const formatted = data.map((p) => ({
    ...p,
    label: new Date(p.date).toLocaleDateString("ar-EG", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="card p-5">
      <h2 className="mb-4 font-display text-base font-bold text-ink">النشاط اليومي</h2>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={formatted} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7280" }} />
            <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} />
            <Tooltip
              contentStyle={{
                direction: "rtl",
                fontFamily: "inherit",
                fontSize: 12,
                borderRadius: 8,
              }}
            />
            <Line
              type="monotone"
              dataKey="attempts"
              name="المحاولات"
              stroke="#2B3A67"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="avg_percentage"
              name="متوسط النسبة %"
              stroke="#F59E0B"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}