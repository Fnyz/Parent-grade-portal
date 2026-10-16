// Shapes the API sends. They mirror src/store.ts and src/parent.ts.

export interface Subject { id: string; name: string }
export interface Student { id: string; name: string; no: string }
export interface Term { id: string; year: string; label: string; from: string; to: string; visible: boolean }
export interface ClassRec {
  id: string; teacherId: string; name: string; school: string; pass: number;
  subjects: Subject[]; terms: Term[]; students: Student[];
}
export interface ClassView { class: ClassRec; codes: Record<string, string> }
export interface Me { name: string; email: string; classes: string[] }
/** studentId -> subjectId -> grade */
export type GradeTable = Record<string, Record<string, number>>;
/** studentId -> subjectId -> grade, or null to clear it */
export type GradeEdits = Record<string, Record<string, number | null>>;

export interface ReportTerm {
  id: string; year: string; label: string; from: string; to: string;
  grades: { subject: string; grade: number | null }[];
  average: number | null;
}
export interface Report {
  student: { name: string };
  class: { name: string; school: string; pass: number };
  terms: ReportTerm[];
  held: number;
}
