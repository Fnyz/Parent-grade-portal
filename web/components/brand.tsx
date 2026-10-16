// Small visual pieces shared by the parent and teacher pages.

import { isGrade } from "../../shared/grades.ts";
import { cn } from "@/lib/utils";

export function Logo({ onDark, subtitle }: { onDark?: boolean; subtitle?: string }) {
  return (
    <div className="flex flex-none items-center gap-2.5">
      <div className={cn("flex size-8 items-center justify-center rounded-[9px]", onDark ? "bg-marigold" : "bg-primary")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={onDark ? "#0F1B2D" : "#FFFFFF"} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 19.5V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-1.5z" /><path d="M8 7h6M8 11h6" />
        </svg>
      </div>
      <div className="flex flex-col leading-tight">
        <span className="font-display text-[17px] font-bold whitespace-nowrap">Report Cards</span>
        {subtitle && <span className={cn("text-xs", onDark ? "text-ink-muted" : "text-muted-foreground")}>{subtitle}</span>}
      </div>
    </div>
  );
}

const TINTS = ["#FDE7B0", "#D6E1F8", "#CDEFD9", "#F6D9E4", "#E3DCF7", "#FAD9C8"];

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

/** A round badge with a person's initials, its tint picked from the name so it stays the same. */
export function Avatar({ name, tint, className }: { name: string; tint?: string; className?: string }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <div aria-hidden="true" style={{ background: tint ?? TINTS[h % TINTS.length] }}
      className={cn("flex size-9 flex-none items-center justify-center rounded-full text-[13px] font-bold text-[#0F1B2D]", className)}>
      {initials(name)}
    </div>
  );
}

/** The general average as a ring on the dark hero band. */
export function AverageRing({ value, label }: { value: number | null; label: string }) {
  const r = 44, c = 2 * Math.PI * r;
  const filled = isGrade(value) ? (value / 100) * c : 0;
  return (
    <div className="relative size-[104px] flex-none">
      <svg width="104" height="104" viewBox="0 0 104 104" role="img" aria-label={label}>
        <circle cx="52" cy="52" r={r} fill="none" stroke="var(--ink-2)" strokeWidth="10" />
        <circle cx="52" cy="52" r={r} fill="none" stroke="var(--marigold)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`} transform="rotate(-90 52 52)" />
      </svg>
      <span className="font-display absolute inset-0 flex items-center justify-center text-[26px] font-extrabold tabular-nums">
        {isGrade(value) ? value.toFixed(1) : "—"}
      </span>
    </div>
  );
}

/** A thin bar showing a grade out of 100; red below the passing mark. */
export function GradeBar({ value, pass, className }: { value: number | null; pass: number; className?: string }) {
  const below = isGrade(value) && value < pass;
  return (
    <div className={cn("bg-muted h-2 overflow-hidden rounded-full", className)} aria-hidden="true">
      <div className={cn("h-full rounded-full", below ? "bg-fail" : "bg-primary")} style={{ width: `${isGrade(value) ? value : 0}%` }} />
    </div>
  );
}
