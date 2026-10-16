import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles.css";
import { Page, TopBar } from "@/components/shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// PENDING (plan, Phase 0): the school head approves this wording, checked
// against the Data Privacy Act of 2012 and DepEd policy. Remove the draft
// notice once approved.

const sections: [string, string[]][] = [
  ["What this page shows", ["Your child's quarterly grades and general average, as recorded by the class adviser. It shows no addresses, birthdays, contact numbers or other personal details."]],
  ["Who can see it", [
    "Only someone who has your child's access code. Each code belongs to one child and is handed to one family in person. Do not post it in a group chat or share it with anyone else.",
    "Grades appear only after the adviser releases them, usually on report card distribution day.",
  ]],
  ["If your code is lost or shared", ["Ask the adviser for a new code. The old one stops working at once, including on any phone that remembered it."]],
  ["On a shared phone", ["Untick “Remember this phone” when you type the code, or tap “Forget this phone” when you are done."]],
  ["What we keep, and for how long", ["Your child's name, class, grades and a record of grade corrections. We keep them until your child leaves the school plus one school year, then delete them. We do not track who opens the report cards, and the page uses no analytics or advertising."]],
  ["Questions", ["Ask your child's adviser, or the school office."]],
];

function Privacy() {
  return (
    <>
      <TopBar />
      <Page narrow className="grid gap-4">
        <p className="bg-warning-soft text-warning rounded-xl p-3 text-sm">Draft: this notice is awaiting approval by the school head.</p>
        <Card>
          <CardHeader><CardTitle className="font-display text-[28px] leading-tight font-extrabold">How we handle your child's grades</CardTitle></CardHeader>
          <CardContent className="grid gap-5">
            {sections.map(([title, paras]) => (
              <section key={title} className="grid gap-2">
                <h2 className="font-display text-lg font-bold">{title}</h2>
                {paras.map((p) => <p key={p}>{p}</p>)}
              </section>
            ))}
          </CardContent>
        </Card>
        <a className="text-primary text-sm underline-offset-4 hover:underline" href="/">Back to report cards</a>
      </Page>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Privacy /></StrictMode>);
