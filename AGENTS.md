# Shared instructions for DM Cockpit agents

Read `CLAUDE.md` for project invariants, `CURRENT_CONTEXT.md` for current owner decisions,
`TASKS.md` for the backlog, then your assigned file under `coordination/tasks/`.
These files are shared context, not evidence that an external agent has started working.
The owner's current instructions take precedence over this workflow.

## Coordination

- Codex owns architecture, integration, global checks and acceptance. Kimi owns only the
  files/deliverables explicitly assigned to it. Kimi may delegate independent research,
  implementation and review to its own agents; give every child the same scope and invariants.
- Owner preference: keep Codex token use modest; delegate independent implementation,
  research and review to Kimi with concise, bounded briefs. Do necessary integration locally
  when Kimi is unavailable; do not retry a known exhausted quota repeatedly.
- Read `coordination/README.md` and `coordination/assignments.json`. A prepared assignment
  is not delivered or running until a real execution/session handle or acknowledgement exists.
- Use an isolated clone/worktree and task branch. Do not edit another agent's active checkout.
  Do not reset, clean, stash or overwrite pre-existing changes to make a workspace convenient.
- A shared baseline must include the current uncommitted implementation, not only old main.
  Verify each task's prerequisite files before work; report a missing baseline explicitly.
- Do not merge into main, push, publish, or change repository access as part of these initial
  assignments. Return a task commit/patch and evidence for integration. A later explicit owner
  instruction can authorize these actions.
- Common files (`TASKS.md`, `CURRENT_CONTEXT.md`, `HANDOFF.md`, manifests, generators,
  engine state/events/reducer and `DeskPage.tsx`) remain with Codex unless the assignment says otherwise.
  Write task-specific handoffs separately; do not independently mark the whole backlog task complete.

## Product invariants

- Campaign state is an event log; changes must replay, undo and survive reload. Navigation is not an event.
- Simulation/import propose; accepted world patches change the world. Catalog import alone does not activate actors/scenes.
- Player projections must exclude secrets from data and DOM, including metadata and hidden links.
- Rules require an explicit source/version/layer. Never invent missing numbers, canonical facts or mechanical effects.
- Use the approved painterly direction, existing theme tokens, readable text and accessible controls.
  Full character sheets open modally. Keep the party and time controls available around overlays.

## Verification and handoff

- Run meaningful targeted tests for your changes, normally `npx vitest run <files> --maxWorkers=2`.
  Codex runs coordinated generators, full tests and production build. Do not run generators in a shared checkout.
- For a source type check use `npx tsc --noEmit -p tsconfig.app.json`, or the coordinated build.
  The root tsconfig.json has an empty files list and references: `tsc -p tsconfig.json` alone
  does not prove the application sources type-check.
- Report actual command results, base/result commit, changed files, limitations and unresolved assumptions.
  For UI changes include browser evidence with viewport, state and screenshots. If browser/assets are unavailable,
  report that limitation; a DOM unit test is not proof of visual layout.
- Follow the task's allowed output paths. Keep SSH keys, tokens, local credentials, full source books and
  local campaign saves out of commits/reports. A shared SSH key is not a message channel or an isolation boundary.

## Browser boundary
Use only the computer-use/browser connector supplied by the host platform for browser interaction.
Do not substitute shell-driven Chrome/Chromium, Playwright, CDP, debug ports or AppleScript.
If no such connector is available to you, report browser checks as unverified and perform code review.
Codex owns the actual browser acceptance in this collaboration. Do not start browser/server smoke runs for K02.
