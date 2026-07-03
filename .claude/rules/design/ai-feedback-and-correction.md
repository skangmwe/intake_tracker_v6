---
name: McDermott AI Feedback & Correction
description: 'Use when designing thumbs up/down on AI responses, "why this rating" follow-ups, regenerate flows, edit-and-resend, AI memory inspection, reporting harmful AI output, or any user-to-AI feedback loop.'
version: 1.0.0
---
# McDermott AI Feedback & Correction
Closing the loop between user and model. Feedback is how the system learns; correction is how trust is repaired when the AI gets it wrong.

## The feedback principle
Make feedback effortless to give and visible in its effect. Users who never see their feedback acted on stop giving it.

## Thumbs up / down
Attached to every AI response. Inline with the response affordances (copy, regenerate, share), right-aligned below the response text.

- Icons: Phosphor `thumbs-up` / `thumbs-down`, 18px.
- Default: `--text-secondary`. Hover: `--accent-interactive`.
- Selected: filled icon. Up uses `--color-teal`; down uses navy outline.
- Hover (desktop): tooltip "Helpful" / "Not helpful". Touch: persistent.

## Why-this-rating follow-up
After thumbs down, optionally surface a brief follow-up:
- **Don't block** — the down vote is recorded immediately. Follow-up is supplemental.
- Inline panel below the response with 3–5 tappable categories: "Inaccurate," "Unhelpful," "Off-topic," "Unsafe / harmful," "Other."
- Optional free-text: "Tell us more (optional)."
- Auto-submit on selection (or explicit submit).

After thumbs up, only optionally surface a follow-up — most up votes need no detail.

## Regenerate
Discard the current response and re-run from the same prompt.
- Phosphor `arrow-clockwise` + "Regenerate" label.
- For models with variants/temperatures: open a popover with "More creative" / "More precise" before regenerating.
- Show prior responses in a versions list ("Response 1 of 3 [<] [>]").

## Edit & resend
Edit the previous user message and re-run from there.
- Each user message has a `pencil` icon on hover.
- Click reveals the message in an editable input with original text pre-filled.
- Save submits the edit; subsequent assistant turns are discarded.
- Cmd/Ctrl+Enter submits.

## Memory inspection
For products with long-term memory:
- "What I remember about you" view, accessible from settings or the AI surface.
- List remembered facts in plain language: "You prefer concise summaries.", "You're working on the Q4 review."
- Each fact has delete (`x`) and edit (`pencil`) actions.
- Bulk clear: "Forget everything."

Memory must be inspectable. Hidden memory creates surveillance vibes.

## Correcting in-line
For factual errors mid-conversation:
- Reply with a correction ("Actually, it was 2024, not 2023.") — the AI updates and acknowledges.
- Or a "This is wrong" inline action that pre-fills a correction template.

The AI's response to a correction must: acknowledge it explicitly ("You're right — it was 2024."), apply it to the rest of the conversation, not over-apologize.

## Reporting harmful output
Separate from thumbs down, for content that's actually unsafe.
- "Report" link in response affordances, smaller than thumbs.
- Opens a focused modal: category (harassment, false info, illegal content, etc.) + free-text + submit.
- Confirmation: "Reported. Thank you."
- Reported content preserved (for review) but visually marked.

## Feedback visibility
Periodically surface aggregate signals so users see their input mattered: "You've improved this assistant 23 times this month." Only when there's real signal — never performative.

## Don't interrupt the flow
Feedback is **never** modal. Never blocks the next interaction. The user must always be able to send the next message. Auto-prompts ("Was this helpful?") are forbidden as full-screen interruptions.

## Accessibility
All controls reachable by Tab, operable by Enter/Space. Selected state announced via `aria-pressed="true"`. Free-text field has a real `<label>`. Memory list uses semantic list structure.

## McDermott-specific
Feedback controls use McDermott link styles (CTA for "Report", secondary buttons for "Regenerate", "Edit"). Selected thumbs-up: `--color-teal` fill, navy icon (theme-stable). Follow-up category chips: `--color-pale-blue` background, navy text, pill-shape, 12pt sans uppercase. Memory view uses form patterns from `forms-and-input.md`. Report modal uses the pattern from `disclosure-surfaces.md`.

## Mobile
- Thumbs: persistent visibility on touch — no hover-only. Tap target ≥36×36 (pad with transparent space around 18px icon).
- Feedback follow-up: full-width **bottom sheet**, not a popover or inline expansion.
- Category chips: wrap to multiple rows; ≥40px height.
- Memory inspection: stack rows vertically (label above value). Delete icons persistent, not on-hover.
- Report dialog: full-screen sheet, not centered modal.
- Edit-and-resend: tap triggers inline editor with auto-focus. Don't open in a separate modal.

See `responsive-and-mobile.md` for the universal checklist.

## Anti-patterns
- Block the next message until feedback is given
- Modal "Was this helpful?" pop-up
- Hide thumbs-down behind a menu (asymmetric to thumbs-up)
- Require a long explanation before recording the down vote
- Hide what the AI remembers about the user
- Memory that can't be inspected, edited, or cleared
- Combine "Report" with thumbs-down
- Acknowledge a correction by repeating the wrong fact
- Performative aggregate metrics that aren't real
- Replace user feedback with silent telemetry only
- "Reported. Thank you." with no follow-up on what happened
- Destructive-styled buttons for thumbs down
