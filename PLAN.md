# Parent Grade Portal — Project Plan

Oct 15, 2026 · @Piattos

## What we are building

Two pages on one website, both made for phones.

**The parent page.** Every parent uses the same address. She types the access code from the slip her child's adviser gave her and sees that child's report cards. A school year dropdown lets her pick a year, and under it are that year's four quarters with the general average. Tapping a quarter opens the full report card. Her phone remembers her, so she types the code once, and a Forget this phone button clears it on a shared family phone.

**The teacher page.** The teacher signs in with her own email and password. She adds students one at a time or by importing a spreadsheet, picks the school year and quarter from dropdowns, types grades into a grid, and watches every average update as she types. Saving stores the grades at once. Parents see a quarter only after she turns on its Visible to parents switch, usually on report card distribution day, and from then on every save shows straight away. There is no script to run and nothing to install.

There are no parent accounts, no parent passwords, and no QR codes. The access code is the only thing a parent needs. A QR code on the slip can be added later but nothing depends on it.

## Where we are now

A working prototype covers the teacher and parent screens end to end. It is only a prototype: its storage is a sandbox, not the real database.

**What it already proves**

- Adding, editing and removing students, each with a unique access code, and reissuing a code when a slip is lost
- Importing a spreadsheet of names and grades
- School years and quarters picked from dropdowns, with start and end dates
- A grade grid that turns into cards on a phone, with averages updating as the teacher types
- The parent flow: code, school year dropdown, quarters, year average, full report card, print

**What is not real yet**

- There is no teacher login. Anyone who opens the prototype is treated as the teacher.
- The parent's code check happens inside the browser, with the whole class loaded into the page. In the real build the server does the lookup and sends back one child only.
- Nothing on the server limits wrong code guesses.
- There is no Visible to parents switch, so every saved grade would show at once.
- The averages have not been checked against the school's official grading formula.
- There is no backup.
- Data lives in the prototype's sandbox, not in Cloudflare.

**One confirmation before building.** The latest fixes made grade saving work in testing. Have the teacher enter real grades on her own phone, close the page, reopen it, and check that the grades and averages are still there. Do not port a screen that has not passed that test.

## Roadmap

Estimates assume one developer working part-time, and come to roughly four to six weeks of building before the pilot. Phase 0 runs alongside Phases 1 to 5. Building on fake data can start straight away, but no real grades go in until Phase 0 is finished.

| Phase | What happens | Rough time | Done when |
| --- | --- | --- | --- |
| 0. Approval and decisions | School head approves, privacy rules checked, open decisions settled | 1 to 2 weeks, in parallel | Written approval in hand |
| 1. Foundation | Cloudflare account, tools installed, a first deploy | 2 to 3 days | A live HTTPS address answers |
| 2. Backend | Database records, teacher login, code lookup, rate limit | About 1 week | Every endpoint passes its tests |
| 3. Teacher dashboard | Prototype screens connected to the real backend | About 1 week | Teacher finishes a full session on her phone |
| 4. Parent page | Server-side lookup, year dropdown, report cards | 3 to 4 days | Works on three phones and slow data |
| 5. Hardening | Security tests, backup, recovery practice | 3 to 5 days | The rules below all pass |
| 6. Pilot | One class, one quarter, real grades | One quarter | No wrong-child incident, parents manage alone |
| 7. Rollout | More classes, one grade level at a time | After the pilot | Each class onboarded |

### Phase 0: Approval and decisions

- [ ] Show the prototype to the school head and get written approval to publish grades online
- [ ] Check the Data Privacy Act of 2012 and any DepEd data privacy policy that applies, including whether parents must consent
- [ ] Write a short privacy notice for the parent page, a consent line for the access slip, and a retention period for each kind of record
- [ ] Get the school's grading formula in writing: how quarterly grades, final grades and the general average are computed and rounded, and how composite subjects such as MAPEH are handled
- [ ] Collect three to five real past report cards, with names removed, to test the averages against
- [ ] Settle the open decisions listed near the end of this plan
- [ ] Choose the pilot class, the teacher, and the quarter the pilot starts on
- [ ] Name a backup person who can keep things running if the developer is unavailable
- [ ] Teacher confirms the prototype passes the save-and-reopen test

### Phase 1: Foundation

- [ ] Create a free Cloudflare account on a school email address, not a personal one
- [ ] Install Node.js and Wrangler, Cloudflare's command-line tool, on the developer's computer
- [ ] Create a GitHub repository for the code
- [ ] Create two KV namespaces, one for development and one for production, so fake data and real data never mix
- [ ] Confirm the current free limits for KV writes, Durable Objects and the Rate Limiting binding on Cloudflare's pricing page, and note them in the repository
- [ ] Deploy a minimal Worker and confirm it answers over HTTPS on a free workers.dev address

Only the developer installs anything. Teachers and parents only ever use a web browser.

### Phase 2: Backend

- [ ] Set up the records described under Data model, with a check on everything read back from the database
- [ ] Put sessions and access code records in one Durable Object, so signing out and reissuing a code take effect at once
- [ ] Teacher login: password hashed with PBKDF2 from Web Crypto (Workers caps it at 100,000 iterations), session that expires
- [ ] Session cookie set HttpOnly, Secure and SameSite=Strict, and every teacher action checks the Origin header
- [ ] A setup script that creates the teacher account and resets a password, written now rather than when someone is locked out
- [ ] Teacher actions: students, subjects, school years and quarters, grades, the Visible to parents switch, reissue a code
- [ ] Keep a short change history inside each grades record: old value, new value and time
- [ ] Grade calculation written once on the server, with tests that reproduce the past report cards exactly
- [ ] Parent actions: look up a code, list the child's visible report cards, open one report card
- [ ] Remember the parent's phone with a signed token holding the student ID and code version, never the code itself
- [ ] Wrong code guesses limited with the Workers Rate Limiting binding, not with KV counters
- [ ] Every response sends Cache-Control: no-store and a strict Content-Security-Policy
- [ ] Test with fake data: no login is refused, a teacher cannot touch another teacher's class, a wrong code reveals nothing, and a hidden quarter never reaches a parent

### Phase 3: Teacher dashboard

- [ ] Connect the prototype's screens to the real backend in place of the sandbox
- [ ] Keep what the prototype got right: cards on a phone, live averages, and a status line that says whether the save worked
- [ ] Save on a button or after a pause in typing, never on every keystroke, to stay inside the KV write limit
- [ ] Keep unsaved grades as a draft on the phone and warn before the page closes with unsaved changes
- [ ] A Visible to parents switch on each quarter, off by default, with a clear label of what parents can see
- [ ] Spreadsheet import in the browser with SheetJS pinned to an exact version and served from our own site, with a preview before anything is saved
- [ ] Printable access slips carrying the privacy notice and consent line
- [ ] Teacher completes a full session on her own phone: add students, enter grades, save, reopen

### Phase 4: Parent page

- [ ] One address for everyone, with the server returning one child's data only
- [ ] School year dropdown, quarter list, year average, full report card, print or save as PDF
- [ ] Only quarters marked Visible to parents are listed; others show as not yet released
- [ ] Remember the parent on her phone so she types the code once, sign that phone out when the code is reissued, and offer a Forget this phone button
- [ ] The code is typed into a form and never placed in a web address, so it cannot leak through history, logs or screenshots
- [ ] The privacy notice is one tap away from the code screen
- [ ] Clear messages for a wrong code, too many tries, and a code that has been replaced
- [ ] Test on at least three phones including an older Android, on slow mobile data, and in light and dark mode

### Phase 5: Hardening

- [ ] Walk through every rule in the Rules section
- [ ] Open two children's records and confirm each code opens only its own child
- [ ] Try to guess codes quickly and confirm the limit blocks it
- [ ] Send many parents through one shared connection, as on school Wi-Fi, and confirm real parents are not locked out
- [ ] Reissue a code and confirm the old one fails at once, including on a phone that remembered it
- [ ] Press Back after Forget this phone and confirm no report card reappears
- [ ] Confirm the averages match the past report cards to the last digit
- [ ] Write the backup export, run it, and confirm it restores into an empty database
- [ ] Encrypt the backup files before they go onto offline drives
- [ ] Write a one-page guide for the teacher and one for whoever takes over from the developer
- [ ] Practise recovery: reset the teacher's password, reissue a code, restore from backup

### Phase 6: Pilot

- [ ] Start on a quarter boundary so the pilot covers one complete quarter
- [ ] Teacher enters one real class for that quarter with Visible to parents left off
- [ ] Turn the switch on at report card distribution, and hand out access codes in person, checking each against the class list
- [ ] Keep paper report cards as normal, since this runs alongside them
- [ ] Ask ten parents a week later whether they opened it and what confused them
- [ ] Note every support question the teacher receives

Success means most parents who try it get in without help, every average matches the paper card, and no child's grades reach another family. Low use is a communication problem, not a reason to stop.

### Phase 7: Rollout

- [ ] Fix what the pilot exposed, then retest
- [ ] Add classes one grade level at a time, so support questions do not all arrive on one afternoon
- [ ] Decide at this point, and not before, whether more than one teacher needs access
- [ ] Consider a custom address once the school is committed

## Tools and services

| What it does | Tool | Cost | Notes |
| --- | --- | --- | --- |
| Serves the website and runs the backend | Cloudflare Workers | Free plan | One place for pages and logic |
| Stores classes, students and grades (NoSQL) | Cloudflare KV | Free plan | Simple key and value records; fine for data that changes a few times a day |
| Holds sessions and access codes | One Durable Object with SQLite storage | Free plan at last check | Strongly consistent, so sign-outs and reissued codes take effect at once |
| Limits wrong code guesses | Workers Rate Limiting binding | Free at last check | Does not spend KV writes, so guessing cannot block the teacher's saves |
| Developer's command line | Node.js and Wrangler | Free | Developer's computer only |
| Code storage and history | GitHub | Free | Also the safety net if a change breaks something |
| Spreadsheet import | SheetJS, running in the teacher's browser | Free | Pin an exact version from SheetJS's own CDN and serve it from our site; the npm registry copy is outdated |
| Password hashing | Web Crypto, built into Workers | Free | PBKDF2, capped at 100,000 iterations on Workers |
| Blocking bots on the code page | Cloudflare Turnstile | Free | Shown after a few wrong tries instead of a hard block |
| Custom address | A domain registrar | Roughly 600 to 900 pesos a year | Optional, the free workers.dev address works to start |

**No third-party API is required.** There is no email or text message service, no payment service, and no outside login. Everything runs on Cloudflare plus code we write.

**Why Cloudflare rather than Netlify or Vercel.** Netlify and Vercel host pages well, but neither comes with a database for this design, so you would add a second service and manage two accounts. Cloudflare hosts the pages, runs the backend and holds the data on one free account. The deciding reason is the database, not that the others are worse.

**Why KV plus a Durable Object rather than D1.** You asked for NoSQL, and KV suits records read often and written rarely, such as grades. KV is eventually consistent, though, and its free plan allows only about 1,000 writes a day. That makes it wrong for two jobs: counting wrong guesses, where an attacker could spend the whole day's writes and stop the teacher saving, and revoking codes, where a deleted code could keep working for up to a minute. A Durable Object handles both consistently. D1's free write limit is higher than KV's, so the old reason for avoiding it does not hold; it stays out only because the design is NoSQL.

**Check the free limits when Phase 1 starts.** At last check the free Workers plan allowed about 100,000 requests a day, far more than one school needs. KV's free plan allows about 1,000 writes a day, which is why the design saves one record per student per quarter, writes only the students whose grades changed, and never saves on every keystroke. Do the sum once: a class of 40 saved five times a day, plus one import, stays well under the limit, but several classes saving at once will not. If it gets close, store each class's grades for a quarter as one record instead. Free plans change, so confirm the current figures on Cloudflare's pricing page before relying on them.

## Data model

Everything is stored as records in KV, each with a key and a value. Keys are built from IDs the system generates, never from typed text. In the prototype, subject names with dots in them were used as part of a stored field name, the database refused the write, and grades silently failed to save. Typed text belongs inside values only.

| Key | Stored in | What it holds |
| --- | --- | --- |
| login:{hash of email} | KV | The teacher's ID, so sign-in can find her |
| teacher:{id} | KV | Email, hashed password, the classes she owns |
| class:{id} | KV | Class name, subject list, passing mark, grading formula settings, and the school years and quarters with their dates and Visible to parents switch |
| student:{id} | KV | Name and class |
| grades:{student id}:{quarter id} | KV | Each subject and its grade for that quarter, plus a short change history |
| session:{token} | Durable Object | Which teacher is signed in; expires on its own |
| code:{access code} | Durable Object | The student ID it belongs to. This lookup is what lets one address serve every parent |
| codeversion:{student id} | Durable Object | The current version of the student's access code, checked on every parent visit |

Wrong guesses are counted by the Rate Limiting binding, so they need no record.

**How a parent's visit works.** She types her code. The server checks the rate limit, looks up the code in the Durable Object, finds the student, lists only the quarters marked Visible to parents, fetches the grades for each, and sends back that one child's data and nothing else.

**Access codes.** Ten characters from an alphabet with no look-alikes (no zero or letter O, no one or letters I and L), shown as XXXXX-XXXXX and unique across the school. Reissuing a code deletes the old code record and raises the student's code version, which signs out any phone that remembered the old one. Both live in the Durable Object, so this happens at once rather than up to a minute later.

**Two things to plan around.**

- KV is eventually consistent. After a teacher saves, a parent in another location can see the old grades for up to about a minute. That is fine for report cards, but tell the teacher not to expect instant changes everywhere. Sessions and codes do not have this delay because they live in the Durable Object.
- Check everything read back from the database before using it. The prototype hit three separate bugs from trusting stored data: numbers that came back as text, lists that came back as objects, and fields that were missing. Grades must be numbers from 0 to 100, lists must be lists, and anything else is rejected.

**Grade calculation.** The portal computes averages with the school's official formula and rounding, written once on the server and shared by both pages. If the portal shows 89.6 where the paper card shows 90, parents stop trusting it, so tests reproduce real past report cards exactly. A year average shown before all four quarters are in is labelled as partial.

**The parent's phone.** The phone keeps a signed token in an HttpOnly, Secure cookie holding the student ID and code version, never the code itself. Every response is sent with Cache-Control: no-store, so the Back button on a shared phone cannot bring back another family's report card. The code is never placed in a web address; a future QR code must open the code screen, not carry the code.

## Rules that must hold

These are not preferences. Phase 5 does not pass until every one of them is true.

1. The server decides who sees what. A parent's request returns one child's data only, and the browser never receives the rest of the class. The prototype breaks this rule, so the real build must not.
2. Wrong code guesses are limited on the server, per visitor and across the whole site, without using KV writes. Per-visitor limits are generous, because many parents share one connection on mobile data and school Wi-Fi; Turnstile appears before any hard block.
3. Every teacher action checks three things: she is signed in, she is a teacher, and she owns that class. Requests from other sites are refused.
4. Codes are never posted in a group chat, on a bulletin board, or in a shared folder. Each code goes to one family.
5. Reissuing a code stops the old one working at once, including on phones that remembered it. Reissue whenever a slip is lost or a family situation changes, such as a custody dispute.
6. No typed text goes into database keys, and everything read from the database is checked before it is used.
7. The page shows grades only: no addresses, birthdays, contact numbers or disciplinary notes.
8. A quarter's grades reach parents only after the teacher turns on Visible to parents.
9. The averages match the school's official report card exactly.
10. The site runs over HTTPS only, sends Cache-Control: no-store, loads no analytics or third-party scripts, and never puts an access code in a web address.
11. Back up all data to an encrypted file after each grading period, keep two copies offline, and prove once that a backup restores.
12. Remove data once its retention period ends, such as students who have left, instead of keeping it forever.

Be honest about what this protects against. A strong random code plus a server-side guess limit covers the realistic threats to a school: curious people, forwarded messages and lucky guesses. It is not built to resist a determined, well-resourced attacker, and nobody should describe it that way to parents.

## Costs

| Item | Cost | Required |
| --- | --- | --- |
| Cloudflare Workers and KV | Free plan | Yes |
| HTTPS certificate | Free, included | Yes |
| GitHub | Free | Recommended |
| Printing access slips | Paper and toner already in use, several slips to a page | Yes |
| Custom address | Roughly 600 to 900 pesos a year | No |
| Paid Cloudflare plan | A small monthly fee, only if the free limits are outgrown | No, check the current price |

The running cost is effectively zero.

The real cost is time. The developer's time is the build, covered in the roadmap. After that it is small: an hour or two each quarter to add the new quarter and check a few records. Teachers enter grades much as they do today, and importing a spreadsheet saves retyping names. Because codes last, slips are printed only for new students and for lost codes, not every quarter.

## Risks

| Risk | Why it matters | What we do |
| --- | --- | --- |
| A code reaches the wrong family | A child's grades go to a stranger and cannot be un-shared | Hand codes out in person and check each against the class list; reissue at once if it happens |
| Grades show before they are final | Parents see half-entered or unchecked grades before distribution day | Each quarter stays hidden until the teacher turns on Visible to parents |
| Averages differ from the paper card | Parents decide the portal is wrong and stop using it | Get the formula in writing and test against real past cards before the pilot |
| A wrong grade is saved | Parents see it immediately and trust drops | The dashboard rejects values outside 0 to 100, shows whether the save worked, and keeps a change history |
| Someone guesses codes | It would expose records | Long random codes, a server-side limit, and Turnstile if attempts appear |
| Guessing uses up the free write budget | The teacher's saves fail on grading day | Guesses are counted by the Rate Limiting binding, not KV |
| Real parents are locked out by the guess limit | Many parents share one connection on mobile data or school Wi-Fi | Generous per-visitor limits, with Turnstile before any hard block |
| The teacher loses unsaved grades | A dropped connection wipes 40 typed grades | Unsaved grades are kept as a draft on the phone, with a warning before closing |
| The teacher forgets her password | She is locked out at grading time | The developer runs the reset script; the backup person knows how |
| The developer is unavailable | Nothing can be fixed | A named backup person, a written guide, and the code kept on GitHub |
| Data is lost | The whole history disappears | Encrypted export after each quarter, two offline copies, and a tested restore |
| The free plan changes or is outgrown | Limits or charges appear | Check limits at Phase 1 and once a year; the paid plan is inexpensive |
| Saved grades appear late | A parent sees old grades for up to about a minute | Tell the teacher; acceptable for report cards |
| Approval never arrives | The work is wasted | Phase 0 comes before any real grades |
| Parents cannot get in | The system looks broken to them | The teacher helps in person at first, and reissuing a code takes a moment |

The first row deserves the most attention. Every other risk is an inconvenience that can be corrected. That one is a breach of a family's privacy and cannot be undone.

## Decisions still open

Each has a recommended default, so the fastest path is to accept all of them and change only what does not fit. Fill in the last column as you decide.

| Question | Recommended default | Our decision |
| --- | --- | --- |
| Which class and teacher run the pilot? | One class, with a teacher comfortable testing |  |
| Which quarter does the pilot start on? | The next full quarter after approval, not one already under way |  |
| How are terms organised? | Four quarters per school year, already built in. Change only if the school uses semesters |  |
| How are grades and averages computed and rounded? | Exactly as on the official report card, confirmed in writing by the school |  |
| What is the passing mark? | 75, shown in red below it |  |
| How are subjects set? | One list per class, shared by every quarter |  |
| When do parents see a quarter? | When the teacher turns on Visible to parents, on distribution day |  |
| What does the year average show before all quarters are in? | The average so far, labelled as partial |  |
| What language is the page in? | English, with subject names as the school writes them |  |
| Does a parent's phone remember her? | Yes, for the school year, with a Forget this phone button |  |
| What happens to a lost code? | The teacher reissues it from the dashboard |  |
| Can a grade be corrected after saving? | Yes, the teacher edits it, the change is recorded, and parents see it with no notification |  |
| What do the privacy notice and consent say? | A short notice on the parent page and a consent line on the slip, approved by the school head |  |
| How long is data kept? | Until a student leaves the school plus one school year, then deleted |  |
| What address do we start with? | The free workers.dev address, with a custom one later |  |
| Who is the backup person? | Named before the pilot starts |  |

## Who does what

| Role | Responsibility |
| --- | --- |
| Developer | Builds and maintains the system, resets the teacher's password, runs the backups |
| Backup person | Can do the developer's recovery tasks from the written guide |
| School head | Approves publishing grades and signs off on the privacy rules |
| Teacher | Adds students, enters grades, hands out codes and reissues lost ones |
| Parent support | Answers parent questions, and is the teacher in a small school |

## Not in version one

The aim is a basic tool that does its job. These are left out on purpose:

- Parent accounts and parent passwords
- Notifications by text message or email
- Attendance, teacher comments, messaging and fee information
- More than one teacher, or an admin role
- Different subject lists for different quarters
- A PDF made on the server, since the browser's print and save as PDF is enough
- Tracking which parents opened their report cards

Write this list down and get the school to agree to it. Each item sounds small, and together they would turn a basic tool into a system someone has to maintain forever. Revisit the list after the pilot, once real use shows what is missing.
