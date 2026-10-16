// Printable access slips, several to a page. They carry the privacy notice
// and consent line, and are printed for new students and lost codes only.

import { createPortal } from "react-dom";
import { useEffect } from "react";
import type { ClassRec, Student } from "@/lib/types";

export function Slips({ cls, codes, students, onDone }: {
  cls: ClassRec; codes: Record<string, string>; students: Student[]; onDone: () => void;
}) {
  useEffect(() => {
    document.body.classList.add("printing-slips");
    const done = () => { document.body.classList.remove("printing-slips"); onDone(); };
    window.addEventListener("afterprint", done, { once: true });
    // Let the slips render before the print dialog opens.
    const t = setTimeout(() => window.print(), 50);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); document.body.classList.remove("printing-slips"); };
  }, [onDone]);

  const where = location.origin;
  return createPortal(
    students.map((s) => (
      <div key={s.id} className="break-inside-avoid border border-dashed border-black p-3 text-[11pt] leading-snug text-black">
        <p><strong>{cls.school || "Report cards"}</strong> · {cls.name}</p>
        <p>Report card access code for <strong>{s.name}</strong></p>
        <p className="my-1 font-mono text-[17pt] font-bold tracking-wider">{codes[s.id] ?? "—"}</p>
        <p>Go to <strong>{where}</strong> and type this code.</p>
        <p className="mt-1 text-[8.5pt]">Keep this code private. Anyone who has it can see this child's grades. If it is lost, ask the adviser for a new one.</p>
        <p className="text-[8.5pt]">By using this code you agree to the privacy notice at {where}/privacy.</p>
      </div>
    )),
    document.getElementById("slips")!,
  );
}
