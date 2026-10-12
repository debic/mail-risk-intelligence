# CLAUDE.md

Context for Claude Code. Read this before doing anything in this repo.

## What this project is

A take-home assignment for a job application: **Mail Risk Intelligence**, a small
full-stack app for a fictional compliance team called Arcline. Emails land in a
mailbox, two chained AI agents analyze each one, and the UI shows who is
involved, what they want, and whether it looks risky (fraud, insider threat,
phishing, harassment, market abuse).

The full assignment text is in `docs/ASSIGNMENT.md`. Seed data is in
`data/mock_mailbox_data.json` (10 emails).

Time box: about 5-6 focused hours. Good judgment about scope matters more than
production polish.

## Track: UI-focused

I'm on the **UI-focused track**. Extra weight goes to:
- Visual design quality and consistency (spacing, type scale, color)
- Responsiveness across breakpoints (must work at mobile width)
- Accessibility basics (contrast, keyboard navigation, visible focus states)
- Polished loading, empty, and error states
- Knowledge graph interaction quality (bonus, only if time allows)

The pipeline, storage, and API must work and be robust, but keep them simple.

## Stack (decided)

- Frontend: React + TypeScript, Vite
- Backend: Node + Express (TypeScript)
- LLM: Groq free tier, key in `GROQ_API_KEY` (never hardcode, never commit `.env`)
- Storage: SQLite
- Validation of LLM output: zod
- PDF text extraction: pdf-parse

## Architecture

Keep a clean separation between these layers:

```
client/            React app (UI only, talks to the API)
server/
  ingestion/       parse raw text, .txt, .eml, .pdf into a common email shape
  agents/          Agent A (extraction) and Agent B (risk and graph), plus orchestration
  storage/         SQLite access
  routes/          Express API
data/              seed JSON
docs/              assignment text
```

## The pipeline

**Agent A, Extraction.** Input: raw email (+ attachment text). Output JSON:
sender, recipients, date, subject, short summary, key facts (amounts, dates,
account/reference numbers, attachment content).

**Agent B, Risk and Graph.** Input: Agent A output. Output JSON:
- risk: level (`none` | `low` | `medium` | `high`), short rationale, tags
  (e.g. `urgency`, `financial-anomaly`, `threat-language`, `mnpi-risk`, `phishing`, `insider-threat`)
- entities: people, organizations, amounts, accounts, locations
- relationships between entities (e.g. `Person -requests_transfer_to-> Org`)

**Failure handling is required.** If the model call fails, times out, or returns
invalid JSON: validate with zod, retry once, then store the email with a
`failed` status and an error message. The app must never crash because of one
bad email. The UI shows the failed state with a retry button.

Seed emails are processed on first run only if they are not already stored, to
avoid wasting API calls.

## Expected results for the seed data (use as a test baseline)

| ID | What it is | Expected risk |
|---|---|---|
| E001 | Fake CEO asks for urgent, confidential $184,500 wire. Lookalike domain `arclne-corp.com` | high |
| E002 | VPN maintenance notice | none |
| E003 | Departing employee forwards confidential contracts to personal email | high |
| E004 | Supplier changes bank account, amount jumps from ~$13K to $47,300 | high |
| E005 | Employee tips a friend to buy shares before deal announcement (MNPI) | high |
| E006 | External contact threatens an employee ("I know where your office is") | high |
| E007 | HR holiday calendar | none |
| E008 | Password expiry phishing. Lookalike domain `arclline-portal.com`, defanged `hxxp` link | high |
| E009 | Normal earlier invoice from the same supplier as E004 (account ending 6621) | none |
| E010 | Anonymous report: CFO Robert Ainsley moved ~$300K before board review | medium or high |

Notes:
- The real company domain is `arcline.com`. Prompts should make the model check for lookalike domains.
- E004 and E009 are linked (same supplier, two different accounts). The knowledge graph should show this.
- Never "fix" `hxxp` links into clickable links in the UI.

## UI requirements

- Inbox list: sender, subject, date, color-coded risk badge (color is never the only signal, include the text label).
- Detail view: original content, structured extraction, risk rationale and tags.
- Entities and relationships panel for the selected email.
- Add email: paste raw text or upload `.txt`, `.eml`, `.pdf`. Same pipeline as seed data. Show an "Analyzing..." state.
- Mobile: list full width, tapping an email opens the detail with a back button.
- Bonus: knowledge graph view across all emails, pan/zoom, click a node to see its connections.
- Nice extra if time allows: filter/sort by risk, "mark as reviewed", manual risk override (human-in-the-loop).

## Deliverables

- `README.md`: setup and run instructions, architecture overview, key decisions and tradeoffs,
  styling choice justification, LLM choice and fallback behavior, what I'd do with more time.
  Must state clearly at the top that I approached this as the UI-focused track.
- `PROCESS.md`: how I used AI tools (planning, where the agent ran autonomously, where I corrected it).
- `.env.example` with `GROQ_API_KEY=`
- Some tests: at least LLM output parsing/validation (including garbage responses) and a UI component or two.

## Plan and progress

Work stage by stage. Don't start a stage until the previous one works, even if basic.
Update the checkboxes as steps are completed.

### Stage 0: Setup (20 min)
- [x] 0.1 Create Groq account
- [x] 0.2 Create Groq API key (stored privately, not in the repo)
- [x] 0.3 Create GitHub repo `debic/mail-risk-intelligence` (README + Node .gitignore)
- [x] 0.4 Clone and open in VS Code
- [x] 0.5 Create `process-notes.md` (gitignored, personal notes for PROCESS.md)
- [x] 0.6 Add `CLAUDE.md`, `docs/ASSIGNMENT.md` and `data/mock_mailbox_data.json`, commit and push
- [x] 0.7 Claude Code proposes an architecture plan; I review and adjust it before any code

### Stage 1: Project skeleton (30 min)
- [x] 1.1 Create `client/` (Vite + React + TS) and `server/` (Express + TS)
- [x] 1.2 Create server folders: `ingestion/`, `agents/`, `storage/`, `routes/`
- [x] 1.3 Add `.env.example` and load `GROQ_API_KEY` from `.env`
- [x] 1.4 Simple endpoint that returns the 10 seed emails (no AI yet)
- [x] 1.5 Client shows the email list on screen (can be ugly)

### Stage 2: Agents (1 h 15 min)
- [x] 2.1 Groq client wrapper with timeout
- [x] 2.2 Agent A prompt + zod schema for its output
- [x] 2.3 Agent B prompt + zod schema for its output
- [x] 2.4 Orchestrator: A then B, retry once on failure, mark `failed` with error message if it still fails
- [x] 2.5 Run on the 10 seed emails and compare with the expected results table

### Stage 3: Storage and API (30 min)
- [x] 3.1 SQLite schema for emails, analysis results, entities and relationships
- [x] 3.2 On startup, process seed emails only if not already stored
- [x] 3.3 Endpoints: list emails, get one, add new, retry a failed one

### Stage 4: Main UI (1 h 30 min) - main focus
- [x] 4.1 Design tokens: colors, spacing, type scale, risk badge colors
- [x] 4.2 Inbox list with color-coded risk badge (with text label)
- [x] 4.3 Detail view: original, extraction, rationale, tags
- [x] 4.4 Entities and relationships panel
- [x] 4.5 Loading, empty and error states (including failed analysis + retry)
- [x] 4.6 Responsive: mobile list then detail with back button
- [x] 4.7 Accessibility: contrast, keyboard navigation, visible focus

### Stage 5: Add email (30 min)
- [ ] 5.1 Form: paste raw text or upload `.txt`, `.eml`, `.pdf`
- [x] 5.2 Server-side parsing (pdf-parse for PDF, basic .eml parsing)
- [ ] 5.3 "Analyzing..." state while the pipeline runs

### Stage 6: Tests (20 min)
- [ ] 6.1 LLM output parsing/validation tests, including garbage responses
- [ ] 6.2 One or two UI component tests (e.g. risk badge)

### Stage 7: Documentation (40 min)
- [ ] 7.1 `README.md` (UI-track statement at the top)
- [ ] 7.2 `PROCESS.md` built from `process-notes.md`
- [ ] 7.3 Final check of `.env.example` and run instructions from a clean clone

### Bonus, only if time allows: Knowledge graph (1 h)
- [ ] B.1 Graph view of all entities and relationships (react-force-graph or React Flow)
- [ ] B.2 Pan/zoom, click a node to see its connections

If running late, cut the bonus first.

## How to work with me

- Go **one step at a time**. Propose a plan first and wait for my approval before writing code.
- Keep changes small and focused so I can review them. Suggest a git commit after each working step.
- Explain briefly what you did and why, in plain language.
- If something in the spec is ambiguous, tell me the options and your recommendation instead of guessing silently.
- Don't use em dashes in docs you write for me.
