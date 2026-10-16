# Progress log

What changed, what is verified, and where we left off. Newest entry first.
The plan itself is in [PLAN.md](PLAN.md).

---

## 2026-10-16 — README

### Changed
- Added `README.md`: what the project is, local setup, scripts, teacher account commands,
  project layout, the security rules worth knowing, the steps before the first deploy, and what
  is still open. Written for the developer and the backup person named in PLAN.md.

---

## 2026-10-16 — Open the parent page from the dashboard, and per-student preview

### Changed
- **Open parent page** link (new tab): teacher sidebar on a computer, and the Students tab
  ("Import, print or preview" card). It opens the normal parent page, which asks for a code.
- **Preview** button on each student (Students tab): opens the parent page for that child
  without a code, at `/?preview&class=<id>&student=<id>`. IDs only; the access code never goes in
  a web address. A marigold banner says "Teacher preview: what <name>'s family sees" with
  "Back to dashboard". No Forget this phone button in preview.
- API: `GET /api/teacher/class/:cid/students/:sid/preview` (`src/teacher.ts`). Needs the teacher's
  session and ownership of the class; uses the same `report()` as the parent page
  (now exported from `src/parent.ts`), so hidden quarters stay hidden. Sets no parent cookie.
- Logo text no longer wraps in a narrow top bar.

### Verified
- 3 new API tests: preview matches what the family gets from their code exactly, hidden quarter
  not shown, no cookie set, sign-in required, another teacher gets 404.
  `npm test`: 65 passed, 1 skipped. Type check and build pass.
- Chrome on the dev server: Preview opens Juan's page in a new tab with the banner and no Forget
  button; only the teacher cookie exists; Open parent page shows the code screen; a preview link
  opened while signed out asks to sign in first.

---

## 2026-10-16 — Light and dark mode switch

### Changed
- A theme switch on every page: **Light → Dark → Auto** (Auto follows the device). Light is the
  default, matching the approved design. Remembered per device in `localStorage` (`pgp-theme`).
  - Parent: top bar, and the report card header. Teacher: sidebar (with its name) on a computer,
    the dark header on a phone. Privacy and sign-in: top bar.
- `web/lib/theme.ts`: one shared theme value, so every switch and the toasts stay in step.
  `web/components/theme-toggle.tsx`: the button.
- `public/theme.js`: a small script in each page's `<head>` that applies a saved dark choice before
  the page paints, so it never flashes light. A separate file because the content policy blocks
  inline scripts.
- `web/styles.css`: dark palette restored under a `.dark` class on `<html>`.
- Printing switches to light for the print and back afterwards.
- Toasts follow the theme.

### Verified
- Chrome: default Light; one click → Dark (background `#0B1424`), choice kept after reload;
  Auto follows the device both ways, including after reload. Screenshots of the parent report
  card, teacher desktop and teacher phone in dark look right. Type check, 62 tests (1 skipped)
  and build pass.
- The dev server had a stale package cache after the new imports ("Outdated Optimize Dep");
  restarted it with `--force`.

### Not verified yet
- Printing from dark mode on a real printer or PDF.
- Dark mode was not designed on the canvas first; colours are my own choice.

---

## 2026-10-16 — Always light, to match the design

The app followed the device's dark setting, so on a Mac set to Dark it showed a navy theme
that is not in the approved design.

### Changed
- `web/styles.css`: removed the dark palette; `color-scheme: light`. The `dark:` variant now
  needs a `.dark` class that nothing sets, so shadcn's dark styles never switch on.
- Toasts (`web/components/ui/sonner.tsx`) always light. Removed three leftover `dark:` classes.

### Verified
- Chrome set to dark appearance: all three pages paint `#F3F5F9`, teacher dashboard matches the
  design. Type check and build pass.

### Note
- If dark mode is wanted later, it needs its own approved design first.

---

## 2026-10-16 — Applied the "School Notebook" design

### Changed
- Theme (`web/styles.css`): new palette and dark mode, larger corners. Fonts Bricolage Grotesque
  (headings) and Figtree (body), bundled from `@fontsource-variable/*` so they are served from our
  own site and pass the content policy. New colour tokens: `ink`, `marigold`, `missing`, `*-soft`.
- Shared pieces (`web/components/brand.tsx`): logo, initials badge, general-average ring, grade bar.
- Parent page (`web/parent/ParentApp.tsx`) rebuilt to the design: code screen with
  "Where is my code?", navy hero with the average ring, quarter cards (locked when not released),
  latest quarter by subject, and the report card with subject bars, the change from the previous
  quarter and a below-passing note. Same behaviour as before.
- Teacher shell (`web/teacher/TeacherApp.tsx`): dark sidebar on a computer (classes with student
  counts, New class, name and sign out); dark header with the class picker on a phone;
  segmented tabs; restyled sign-in.
- Grades tab (`web/teacher/GradesTab.tsx`): summary tiles (students, grades entered with progress,
  class average, below passing), quarter chips, Visible to parents pill, colour-coded cells
  (red below passing, amber missing), average pills. On a phone, one card per student;
  students with every grade in fold away. Saving logic unchanged.
- Students list shows initials badges. `NewClass` now takes its own trigger button.

### Verified
- Type check, 62 tests (1 skipped) and build pass.
- Headless Chrome on the dev server: parent code screen, overview (light and dark) and report card;
  teacher desktop and phone. Autosave still works and the tiles update while typing
  (value restored afterwards). No page errors.

### Not verified yet
- Students, Quarters and Settings tabs only picked up the new colours and fonts; not reworked further.
- Printing the restyled report card and access slips.
- Real phones, and `npm run preview` with the content policy on.

---

## 2026-10-16 — Sample UI designs (not built yet)

No app code changed. Design samples to follow, on a canvas:
https://claude.ai/artifact/9YX6ZyUS13yQUXgyfQg7ov

- Look ("School Notebook"): cool paper background, navy ink `#0F1B2D`, blue `#2B59C3`,
  marigold accent `#F5B83D`; Bricolage Grotesque headings, Figtree body.
- Parent: code entry (with "Where is my code?"), report overview (child card, general average
  ring, quarter cards with locked ones, latest quarter by subject), quarter report card
  (subject bars, below-passing note).
- Teacher: desktop dashboard (dark sidebar with class list and New class, summary tiles,
  colour-coded grade grid, Visible to parents pill, save bar); phone grading view
  (class picker, quarter chips, progress bar, one student card, sticky save bar).

### Waiting on you
- Pick or adjust the look, then I apply it to the React pages.

### To decide when applying it
- Fonts would be self-hosted (the content policy blocks Google Fonts).
- New bits not in the app yet: summary tiles, "grades entered" progress, "Up 1.5 from First
  Quarter", "N grades missing", and the "Where is my code?" box. All come from data we already have.

---

## 2026-10-16 — Delete a class

### Changed
- Settings tab: **Delete this class** card (`DeleteClass` in `web/teacher/SettingsTab.tsx`).
  The dialog lists what will be deleted, and the button stays disabled until the teacher
  types the class name. Disabled when it is her only class.
- API: `DELETE /api/teacher/class/:id`. Deletes the class record, every grade record for its
  students, and its access codes. Refuses to delete the last class.
- Deleted classes are recorded in the Durable Object (`removed_classes` table in `src/gate.ts`),
  so the delete takes effect at once even while KV may still hold a copy for about a minute.
  `classesOf` became `classList`, which also leaves out deleted classes.
- Parent page: a remembered phone whose class was deleted now just asks for a code,
  instead of saying the code was replaced (`src/parent.ts`).
- After deleting, the dashboard drops the class from the picker, clears its drafts on this
  phone, and opens the next class on the Grades tab.

### Verified
- 4 new API tests: class leaves the list, its record and grades are gone from KV, its codes stop
  working (including on a remembered phone), the last class cannot be deleted, another teacher
  cannot delete it. `npm test`: 62 passed, 1 skipped. Type check and build pass.
- Headless Chrome on the dev server, with a throwaway class: button disabled until the name
  matches (case doesn't matter), class deleted, picker updated, still gone after reload.
- Your own classes (Grade 4 - Sampaguita, Grade 2 - Rosal, Grade 3 - Caroline) were not touched.

### Left out
- No undo and no archive. Deleting a big class uses KV deletes (students × quarters), which count
  toward the same free daily limit of about 1,000 as saves.
- The setup script has no `delete-class` command; deleting is done from the dashboard.

---

## 2026-10-16 — One teacher, several sections (classes)

The teacher advises several sections (about 5, Grades 2 to 6) and enters every
subject's grades for each. Each section is its own class.

### Changed
- **New class** button on the dashboard (`web/teacher/NewClass.tsx`): class name and school.
  The new class starts with the default subjects and opens on its Students tab.
- The class picker shows whenever there are two or more classes, and follows renames made in Settings.
  Every tab resets when switching classes, so one section's form never shows another's data.
- API: `POST /api/teacher/classes` (`src/teacher.ts`). Refuses a blank or duplicate name,
  and caps one account at 12 classes.
- Classes added from the dashboard are recorded in the Durable Object (`classes` table in
  `src/gate.ts`), not by rewriting the teacher's KV record. KV can answer with a stale copy for
  about a minute, which would have hidden a new class or lost one added right after another.
- Ownership is now checked on the class record itself (`teacherId`), so a new class works at once.
- `/api/teacher/me` lists classes from both places: the first class (KV) plus dashboard-added ones.
- Setup script: `npm run teacher -- add-class --email ... --class "Grade 5 - Narra"`.
- `src/admin.ts`: `newClass()` and `addClassRecords()`, shared by the script and the API.

### Verified
- 5 new API tests: a class works at once and shows in the list, students and codes stay
  separate between classes, blank and duplicate names refused, another teacher cannot open it.
  `npm test`: 58 passed, 1 skipped. Type check and build pass.
- Headless Chrome on the dev server: picker lists classes, New class dialog creates one and
  opens Students, duplicate name shows an error, students stay in their own class,
  renaming updates the picker, reload keeps the chosen class.
- `add-class` script command works on local data (demo teacher now has "Grade 2 - Rosal").

### Not verified yet / left out
- No way to delete or archive a class yet (deliberately left out; ask before adding).
- **KV free write limit:** about 1,000 writes a day. Five full sections graded on the same day
  could get close. Fix when more than a couple of classes go live (Phase 7): store a class's
  quarter as one record, or move to the paid plan. See PLAN.md, "Check the free limits".
- One subject teacher entering grades into another adviser's class is still not supported
  (more than one teacher per class is in the plan's "Not in version one" list).

---

## 2026-10-16 — Copy button for access codes

### Changed
- Students tab: a copy button next to each access code (`CopyCode` in
  `web/teacher/StudentsTab.tsx`). It shows a check mark for 2 seconds and a toast
  reminding the teacher to send the code to that family only. On browsers without
  the clipboard API it falls back to a hidden text box.

### Verified
- Headless Chrome on the dev server: clicking it put the right code on the clipboard,
  the toast showed, and the icon reset. Type check passes.

### Not verified yet
- On a real phone (iOS Safari is the strictest about clipboard access).
- Under `npm run preview`, with the content policy on.

---

## 2026-10-16 — Switched the frontend to React + shadcn/ui

**Where we stopped:** the React rebuild is written and the teacher page passes
a full browser run. The parent page browser run was interrupted before it
finished, so it is **not yet verified** in the React version.

### Changed
- Frontend rebuilt in React 19 + Vite 8 + Tailwind 4 + shadcn/ui (`web/`).
  Three separate pages, so parents never download the teacher dashboard:
  - `index.html` → `web/parent/` (parent page)
  - `teacher.html` → `web/teacher/` (teacher dashboard: Grades, Students, Quarters, Settings)
  - `privacy.html` → `web/privacy/` (draft privacy notice)
- The old plain-JS pages (`public/js`, `public/css`, `public/*.html`) were removed.
- Grade calculation moved from `public/js/grades.js` to `shared/grades.ts`,
  imported by both the Worker and the pages.
- Build: `@cloudflare/vite-plugin` builds the pages and the Worker together into `dist/`.
  `wrangler.jsonc` no longer points `assets` at `./public`.
- `public/` now holds only `_headers` and `favicon.svg`; Vite copies them into the build.
- Content policy: `style-src` now allows `'unsafe-inline'`, because shadcn's dialogs and
  toasts set inline styles. Scripts are still restricted to our own site.
- SheetJS is installed from SheetJS's own CDN tarball (0.20.3) and loads only on import.
- Selects use the phone's native picker (`web/components/ui/native-select.tsx`), not Radix Select.
- Buttons and inputs made taller than shadcn's defaults for phone tap targets.
- `dist/` added to `.gitignore` (the build copies `.dev.vars` into it).
- Removed two packages shadcn added by mistake: `cn` (an unrelated npm package)
  and `next-themes` (not needed).

### Verified
- `npm test`: 53 passed, 1 skipped (the past-report-card check, waiting on Phase 0).
- `npm run typecheck`: passes for the Worker and the React pages.
- `npm run build`: succeeds.
- Teacher page in headless Chrome (phone and desktop): sign in, autosave after a pause,
  invalid grade blocks saving, decimals like `85.5`, draft survives a reload,
  Visible to parents confirm dialog, spreadsheet import preview and import,
  new-code dialog, Quarters and Settings tabs render.
- Parent page: the code screen shows and a wrong code is refused with the right message.

### Not verified yet
- [ ] Parent page in React: open report, open a quarter, Back, reload stays signed in,
      Forget this phone + Back does not show the report, light and dark mode.
- [ ] Screenshots of the React pages not reviewed yet (layout check on phone).
- [ ] After the content policy change, no remaining policy errors in the console.
- [ ] Printing access slips and the report card (needs a real print preview).
- [ ] Settings: add a subject, save, save again; the new subject keeps its id.

### Notes
- Parent page download is about 100 KB gzipped (React and Radix in a shared chunk),
  more than the plain version. Worth trimming later if slow data is a problem.
- A `vite preview` server may still be running on port 4173 from testing.

---

## 2026-10-16 — Phase 2 finished, first version of Phases 3–4

### Changed
- Tests in `test/` covering the Phase 2 checks in PLAN.md (53 tests).
- `scripts/teacher.mjs`: create a teacher and reset a password. Local data by default; `--remote` for Cloudflare.
- `package.json` scripts and `"type": "module"`.
- Plain-JS teacher and parent pages (since replaced by the React version above).

---

## Still open from the plan

- **Phase 0:** the school's official grading formula (averages are a placeholder mean),
  real past report cards for the skipped test, and approval of the privacy notice wording.
- **Phase 1:** real KV namespace IDs in `wrangler.jsonc`, `PARENT_SECRET` set as a secret,
  first deploy. Not done — do not deploy or push until local testing is finished.
- **Password reset** does not sign out devices already signed in (sessions end within 12 hours).
- **Real phones:** three phones including an older Android, slow mobile data (Phase 4).
- First commit `f20d822` ("initial code changes") is pushed to `main` and `DEV-PORTAL-001` on GitHub (Fnyz/Parent-grade-portal). Checked: no secrets or build folders in it.

## Running it locally

```bash
npm run dev        # Vite dev server with the Worker
npm run preview    # production build, served with the real security headers
npm test
npm run teacher -- create --email you@x.ph --name "Name" --class "Grade 4 - X"
```

Demo teacher in local data: `demo@school.test` / `demo-password-123`.
