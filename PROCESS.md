# Process: how I built this with AI tools

I built this with **Claude** (chat, for planning) and **Claude Code** (desktop app, for building). I did not use sub-agents: one agent, working step by step under my approval, with a built-in browser to verify every UI change. This document is assembled from the notes I kept while working.

## 1. Planning before any code

- I used Claude chat to break the assignment down: understand the scenario, analyze the seed data and split the work into stages with a time budget.
- I asked it to go through the 10 seed emails and predict the expected risk level of each one. That table became my **test baseline** for the agents later.
- I wrote a [`CLAUDE.md`](CLAUDE.md) before writing code: project context, the stack I decided on, the architecture, the expected results table, a staged checklist, and working rules ("go one step at a time, propose a plan and wait for my approval", "don't use em dashes in docs"). It lives in the repo so any new agent session starts with the same context, and the checklist was updated as steps were completed.
- Claude Code then proposed an architecture. I did not accept it blindly: I asked it to explain the parts I wasn't sure about (npm workspaces, what SQLite is versus SQL, what the knowledge graph would show, how the app behaves without an API key) and approved it only once I understood each decision.

## 2. How I worked with the agent

The loop for every step:

1. The agent explains what it will do and why, including options and a recommendation when something is ambiguous.
2. I approve, ask questions, or change the plan.
3. It does the step and verifies it (typecheck, scripts, tests, or the in-app browser).
4. It explains what it did in plain language; I check it myself.
5. Commit and push.

For infrastructure work I approved whole steps at a time; for the UI, which is the focus of my track, I reviewed in more detail and asked for design changes.

## 3. Where the agent ran autonomously

Within steps I had approved, I let the agent work on its own:

- Scaffolding the client and server, installing dependencies, and checking everything compiled before reporting back.
- Both agent prompts, the zod schemas and the orchestrator, each verified with small scripts before moving on.
- An **evaluation script** (`npm run eval`) that runs the 10 seed emails through the real pipeline and compares them with my baseline. It diagnosed each failing run and proposed fixes; I approved each fix before it was applied.
- The storage layer, verified with an in-memory database and hand-written results (no API calls).
- UI verification in the built-in browser at several screen sizes, including an **axe-core accessibility audit** and simulated failures (server down, failed analysis) to check the error states.
- Spotting problems I had not asked about: the `.env.*` rule in `.gitignore` was also hiding `.env.example` (a required deliverable); a comma spacing glitch in a screenshot; a duplicated Retry button in the failed state.

## 4. Where I stepped in and corrected it

**Process**

- The first plan listed many steps at once. I asked for one step at a time so I stayed in control.
- After I said "yes" to start Stage 1, the agent took it as approval for the whole stage: it scaffolded both apps, installed dependencies, started the server and committed, all without step-by-step approval. I stopped it, had it list everything it had done, and **reverted the repo to the initial commit**. From then on it explained each step and waited for an explicit yes.
- I questioned why the assignment text should be in the repo. We kept it locally for the agent's context but gitignored it, so the company's take-home brief is not published.
- Secrets: my Groq key never went through the chat. I created `.env` myself and the agent verified it was ignored by git and loaded, without opening it.

**AI pipeline**

- The model the agent recommended (`llama-3.3-70b-versatile`) had been deprecated by Groq. The first connectivity test caught it, we listed the models available on my account and switched to `openai/gpt-oss-120b`.
- I asked why a general-purpose model would be good at email fraud. The answer (the specialization comes from our prompt, not the model) is why I spent time on the Agent B prompt.
- The evaluation against my baseline took **4 runs**:
  1. **3/10**: the free tier limit (8K tokens per minute) was hit after 3 emails. Fix: lower reasoning effort, and wait the time Groq asks for before retrying.
  2. **4/10**: still rate limited, and with less reasoning the model under-rated non-financial risks (an insider trading tip and a physical threat came out "medium") and contradicted itself on a normal invoice. Fix: a throttle that waits for the token budget to refill before each call, plus explicit severity rules in the prompt.
  3. **9/10**: the polite supplier bank-change email came out "medium". Fix: one prompt rule for the classic invoice-fraud pattern.
  4. **10/10**, no rate-limit errors.

  I chose prompt fixes over raising the reasoning effort, which would have doubled token use on the free tier.
- A real failure mode appeared while seeding: Groq's JSON mode intermittently rejected a response (`json_validate_failed`). The app handled it as designed (that email was marked failed, the rest continued), and we added a fallback: retry without strict JSON mode and let our own validation guard the result.

**UI and design** (my track)

- I found that on mobile, tapping an email opened an empty page with no way back. It was planned for the next step, but it made me prioritize the detail view and the Back button.
- I asked for more whitespace in the inbox rows.
- I replaced the full colored risk pill with a small colored marker next to neutral text, which is calmer and still never relies on color alone.
- Since Arcline is fictional, I based the palette on the hiring company's own brand colors (stargo.co). The agent extracted the exact colors from the site's CSS and adapted the button blue slightly for WCAG contrast.
- I picked the risk scale (orange / yellow / violet / green) from a reference image I liked.
- I chose a single-panel layout for tablets instead of the agent's two-panel suggestion.
- After finishing, I asked another AI chat to review the repo as a hiring panel would. It flagged that the canvas graph had no full keyboard equivalent (search only works if you already know a name). We added a browsable entity list grouped by type, focus management into the panel, and an "All entities" back button, then re-tested with the keyboard and axe.
- The same review pointed out that "axe: 0 violations" in the README was not reproducible: we had run axe manually in the browser. We added axe-core to the test suite (WCAG checks on the main components), a contrast test that reads the real design tokens, and a test breakdown in the README. We also checked that the axe test really fails on a deliberately broken component.
- I asked the agent to explain how the knowledge graph connects emails (through shared entities, not email-to-email links) before accepting it, which also surfaced a known limitation for the README.

## 5. Time log

About 30 min of planning in Claude chat before starting, then building from 12:20. Two breaks (lunch and a short one) are not counted.

| Stage | Time | Planned |
| --- | --- | --- |
| Planning in Claude chat (brief, seed analysis, CLAUDE.md) | ~30 min | |
| 0. Understand the brief, setup, architecture plan | ~45 min (includes the revert) | 20 min |
| 1. Skeleton: client, server, env, seed endpoint | ~23 min | 30 min |
| 2. Groq client, both agents, orchestrator, eval to 10/10 | ~47 min | 1h15 |
| 3. Storage, queue, startup seeding, API, snapshot | ~20 min | 30 min |
| 4. UI: tokens, inbox, detail, entities, states, responsive, accessibility | ~34 min | 1h30 |
| 5. Add email: parsing, dialog, analyzing state | ~10 min | 30 min |
| Bonus: knowledge graph | ~10 min | 1h |
| 6. Tests | ~5 min | 20 min |
| 7. README, PROCESS, screenshots, final check | ~15 min | 40 min |
| Fixes from an external review (graph keyboard access, reproducible a11y tests) | ~20 min | |
| **Total** | **about 4h20** (30 min planning + 3h50 building) | 5h45 |

Stage 0 ran over because of the revert and because I took time to understand the plan; everything after went faster than planned because writing code with an agent is quick, and most of my time went into reviewing, deciding and verifying.

## 6. Reflection

- **What worked**: a written `CLAUDE.md` with rules and an expected-results table; small approved steps with a commit after each one; letting the agent verify its own work (scripts, tests, browser, axe) before showing me; and an evaluation script against a baseline, which turned "the AI seems fine" into a measurable 10/10.
- **What I'd do differently**: make the approval rule explicit from the very first message to avoid the Stage 1 revert, and check the LLM provider's current model list before planning around a specific model.
