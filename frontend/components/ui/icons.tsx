import type { SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function base({ size = 20, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

// ---- Navigation & Actions ----

export function ChevronDown(p: IconProps) {
  return <svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>;
}
export function ChevronRight(p: IconProps) {
  return <svg {...base(p)}><path d="m9 18 6-6-6-6" /></svg>;
}
export function ChevronLeft(p: IconProps) {
  return <svg {...base(p)}><path d="m15 18-6-6 6-6" /></svg>;
}
export function Plus(p: IconProps) {
  return <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>;
}
export function X(p: IconProps) {
  return <svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>;
}
export function Check(p: IconProps) {
  return <svg {...base(p)}><path d="m5 12 5 5L20 7" /></svg>;
}
export function Search(p: IconProps) {
  return <svg {...base(p)}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>;
}
export function Pencil(p: IconProps) {
  return <svg {...base(p)}><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>;
}
export function Trash(p: IconProps) {
  return <svg {...base(p)}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" /></svg>;
}
export function MoreVertical(p: IconProps) {
  return <svg {...base(p)}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>;
}
export function MoreHorizontal(p: IconProps) {
  return <svg {...base(p)}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
}
export function Copy(p: IconProps) {
  return <svg {...base(p)}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>;
}
export function ExternalLink(p: IconProps) {
  return <svg {...base(p)}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>;
}
export function Download(p: IconProps) {
  return <svg {...base(p)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>;
}
export function Upload(p: IconProps) {
  return <svg {...base(p)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>;
}
export function Filter(p: IconProps) {
  return <svg {...base(p)}><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>;
}
export function Sort(p: IconProps) {
  return <svg {...base(p)}><path d="m3 16 4 4 4-4M7 20V4M21 8l-4-4-4 4M17 4v16" /></svg>;
}
export function Refresh(p: IconProps) {
  return <svg {...base(p)}><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></svg>;
}

// ---- Content & Documents ----

export function Home(p: IconProps) {
  return <svg {...base(p)}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>;
}
export function Book(p: IconProps) {
  return <svg {...base(p)}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
}
export function BookOpen(p: IconProps) {
  return <svg {...base(p)}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>;
}
export function FileText(p: IconProps) {
  return <svg {...base(p)}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>;
}
export function File(p: IconProps) {
  return <svg {...base(p)}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M13 2v7h7" /></svg>;
}
export function Image(p: IconProps) {
  return <svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>;
}
export function Video(p: IconProps) {
  return <svg {...base(p)}><path d="m22 8-6 4 6 4V8z" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>;
}
export function Link(p: IconProps) {
  return <svg {...base(p)}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>;
}

// ---- People & Roles ----

export function User(p: IconProps) {
  return <svg {...base(p)}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}
export function Users(p: IconProps) {
  return <svg {...base(p)}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
export function GraduationCap(p: IconProps) {
  return <svg {...base(p)}><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>;
}
export function Shield(p: IconProps) {
  return <svg {...base(p)}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
}

// ---- Education ----

export function ClipboardList(p: IconProps) {
  return <svg {...base(p)}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h6" /></svg>;
}
export function BarChart(p: IconProps) {
  return <svg {...base(p)}><path d="M12 20V10M18 20V4M6 20v-4" /></svg>;
}
export function PieChart(p: IconProps) {
  return <svg {...base(p)}><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>;
}
export function Award(p: IconProps) {
  return <svg {...base(p)}><circle cx="12" cy="8" r="7" /><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12" /></svg>;
}
export function Target(p: IconProps) {
  return <svg {...base(p)}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;
}
export function Flag(p: IconProps) {
  return <svg {...base(p)}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" /></svg>;
}
export function Clock(p: IconProps) {
  return <svg {...base(p)}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>;
}
export function Calendar(p: IconProps) {
  return <svg {...base(p)}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
}

// ---- Status & Feedback ----

export function AlertCircle(p: IconProps) {
  return <svg {...base(p)}><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>;
}
export function AlertTriangle(p: IconProps) {
  return <svg {...base(p)}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3zM12 9v4M12 17h.01" /></svg>;
}
export function CheckCircle(p: IconProps) {
  return <svg {...base(p)}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>;
}
export function Info(p: IconProps) {
  return <svg {...base(p)}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>;
}
export function XCircle(p: IconProps) {
  return <svg {...base(p)}><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></svg>;
}
export function Loader(p: IconProps) {
  return <svg {...base({ ...p, className: `animate-spin ${p.className ?? ""}` })}><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>;
}

// ---- Navigation ----

export function Bell(p: IconProps) {
  return <svg {...base(p)}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;
}
export function Settings(p: IconProps) {
  return <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
}
export function LogOut(p: IconProps) {
  return <svg {...base(p)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>;
}
export function Menu(p: IconProps) {
  return <svg {...base(p)}><path d="M3 12h18M3 6h18M3 18h18" /></svg>;
}
export function Command(p: IconProps) {
  return <svg {...base(p)}><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" /></svg>;
}

// ---- Misc ----

export function Eye(p: IconProps) {
  return <svg {...base(p)}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
}
export function EyeOff(p: IconProps) {
  return <svg {...base(p)}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" /></svg>;
}
export function Lock(p: IconProps) {
  return <svg {...base(p)}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
}
export function Mail(p: IconProps) {
  return <svg {...base(p)}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>;
}
export function Phone(p: IconProps) {
  return <svg {...base(p)}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>;
}
export function Zap(p: IconProps) {
  return <svg {...base(p)}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>;
}
export function Star(p: IconProps) {
  return <svg {...base(p)}><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>;
}

// ---- Theme icons ----

export function Sun(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
export function Moon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
export function Monitor(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}