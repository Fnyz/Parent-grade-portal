import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export function TopBar({ right }: { right?: ReactNode }) {
  return (
    <header className="no-print bg-card border-b">
      <div className="mx-auto flex min-h-[60px] max-w-5xl items-center justify-between gap-3 px-5">
        <Logo />
        <div className="flex min-w-0 items-center gap-2">
          {right}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function Page({ narrow, className, children }: { narrow?: boolean; className?: string; children: ReactNode }) {
  return (
    <main className={cn("mx-auto px-5 pt-6 pb-12", narrow ? "max-w-md" : "max-w-5xl", className)}>
      {children}
    </main>
  );
}
