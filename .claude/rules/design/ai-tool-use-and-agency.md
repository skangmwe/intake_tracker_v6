---
name: McDermott AI Tool Use & Agency
description: 'Use when designing AI agentic flows, tool calls, multi-step plans, function calling visualization, permission prompts, approval flows, "AI is doing X" indicators, background jobs, or any UI where the AI takes action on the user''s behalf.'
version: 1.0.0
---
# McDermott AI Tool Use & Agency
When the AI does things — searches, reads files, sends emails, runs code — the UI must surface what's happening, why, and let the user intervene. Hidden agency is broken agency.

## The agentic surface principle
Every tool call is shown. Every destructive action is approved. Every multi-step plan is inspectable.

## Tool-call visualization
Each tool call appears as a row:
- **Icon** — Phosphor icon matching category (`magnifying-glass` for search, `file-text` for read, `paper-plane` for send).
- **Tool name** — human-readable, not the API name. "Searched the web" not "web_search_v2".
- **One-line summary** — "Searched: 'McDermott design tokens 2026'"
- **Status** — running/done/failed (`circle-notch` rotating / `check-circle` / `x-circle`).
- **Expand chevron** — click to see full inputs and outputs.

Default state: **collapsed**. Tool calls are noise unless the user wants detail.

## Multi-step plans
- Show the plan up front: "I'll do this in 4 steps: 1. Read your design file. 2. Identify inconsistencies. 3. Generate fixes. 4. Send a summary."
- Update visually as steps complete (checkmark on done, spinner on current).
- Allow user to interrupt between steps.
- If the plan changes mid-flow, surface the change.

## Permission prompts
Required for any action that: sends external communication, modifies user data, costs money, accesses sensitive data, or has compounding effect (creating many records).

**Anatomy:** what the AI wants to do (plain language), why (context), specific consequence (name the recipient/file/amount), Approve/Reject buttons (primary/secondary).

```
[About to send an email]
To: jordan@company.com
Subject: Q4 review notes
Body preview: "Hi Jordan, here's a summary of…"
[Reject] [Send email]
```

**Never auto-execute.** No exceptions. "Trust mode" is a known anti-pattern — make permissions easy to grant repeatedly, never permanent.

## Pause / resume / cancel
- **Pause** — stops further steps; current step completes.
- **Resume** — continues from the pause point.
- **Cancel** — stops current step (if cancelable) and aborts.

Always reachable, always keyboard-accessible.

## Artifacts mid-flow
When the AI produces intermediate results (a query, a draft email, a file): surface inline with a preview, allow inspection, allow editing before the AI continues. Files / large outputs: card with name, type, size, preview action.

## Background jobs
For long-running tasks: send to background and keep chatting. "Working on X" pill in the top bar with progress. Notify on completion via toast (per `notifications-and-feedback.md`). User can return to the in-progress task anytime.

## Tool failure handling
See `ai-uncertainty-and-errors.md` for the full pattern. Show which tool failed and why. Offer retry, alternative tool, or skip-and-continue. Never silently fail.

## Trust signals
- What the AI accessed: "Read 3 files from your project."
- What the AI didn't: "I didn't open any files outside the workspace you shared."
- Time per step: "Search took 2.3s."

Transparency is the only way users develop accurate mental models.

## Reversibility
- Destructive completions: **Undo** in the toast for ≥30s (longer than the standard 5s).
- Irreversible actions (sending email, posting publicly): show "This can't be undone" in the permission prompt.
- Batch destructive: name the count. "Deleted 23 records."

## McDermott-specific
Tool-call rows: 1px `--border-light`, 2px radius, `--bg-surface`, `--space-3` padding. Tool icons: Phosphor regular 20px, `--icon-default`. Status icons: spinner uses `--color-teal` rotating; success `--color-success`; error `--color-error` border with navy `x-circle`. Permission prompts use the modal pattern from `disclosure-surfaces.md`. Approval primary: `--color-teal` bg, navy text. Destructive approval primary: `--color-error` bg, navy text per theme-stable rule.

## Mobile
- Tool-call rows: summary truncates with ellipsis; tap to expand.
- Multi-step plan: stack steps vertically. Show only current + next on phones (with "View all steps").
- Permission prompts: bottom sheet on mobile, not centered modal. Thumb reach is better at the bottom.
- Approve/Reject: stack vertically. For destructive actions, place **Reject on top** (more reachable) — opposite of desktop "primary right" convention because the safer action should be the easier tap.
- Background-job indicators: icon + count on mobile ("3 running").
- Artifact previews: cards stack to full-width.
- "Working on X": top-bar pill on desktop, persistent bottom banner on mobile.

See `responsive-and-mobile.md` for the universal checklist.

## Anti-patterns
- Auto-execute destructive, external, or paid actions
- "Trust mode" toggles that disable permissions permanently
- Hide tool calls under a single "AI worked on this" summary
- Same icon for every tool (no differentiation)
- Approve buttons that don't name the specific consequence
- Permission prompts in a side panel (use modal for blocking actions)
- Silently retry failed tools without telling the user
- Show the plan but make it un-interruptible
- Expand tool-call details by default
- Hide background-job state
- Generic "Working on it…" when the operation could be named
- Permission prompts where Enter approves but Reject requires a click (asymmetric friction biases toward approval)
