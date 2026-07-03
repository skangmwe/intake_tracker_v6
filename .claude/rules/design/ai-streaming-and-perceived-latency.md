---
name: McDermott AI Streaming & Perceived Latency
description: 'Use when designing streaming AI text output, token-by-token rendering, AI loading states, "thinking" indicators, generation progress, stop/cancel patterns, auto-scroll behavior, or async AI response timing.'
version: 1.0.0
---
# McDermott AI Streaming & Perceived Latency
How async AI output appears and behaves. The AI is slow; the UI's job is to make the wait feel intentional.

## Latency thresholds
**Scope:** AI streaming and model-generation waits only. General data-fetch latency (lists, reports, uploads) uses the coarser table in `loading-empty-and-error-states.md`. Don't apply this table to non-AI loading.

| Time elapsed | Treatment |
|---|---|
| 0–300ms | Show input lock immediately. No other UI yet. |
| 300ms – 2s | Subtle "thinking" indicator (3 pulsing dots, `--color-teal`). |
| 2s – first token | Optional copy: "Working on it…" |
| Streaming begins | Replace thinking indicator with token stream + cursor |
| 10s+ without tokens | Add "This is taking a moment…" + Stop button |

## Streaming visual
- Tokens appear as generated. Don't batch chunks larger than ~3 tokens — kills the live feel.
- 4px solid blinking cursor in `--color-teal` at the insertion point. Blink: 1s on, 1s off — calm, never frantic.
- Code blocks, tables, citations render progressively as their syntax completes — never half-rendered.
- For streaming markdown: render plain text first, upgrade to formatted as closing syntax arrives.

## Auto-scroll
- Auto-scroll keeps pace **only if** the user is at the bottom.
- If the user has scrolled up to read, **do not auto-scroll**.
- Show a "Jump to latest" button (Phosphor `arrow-down`, pill-shape) when scrolled up with new content arriving. Fade away 2s after stream completes.

## Input lock during generation
- Input field remains visible but disabled (`opacity: 0.4`, `pointer-events: none`). Never hide it.
- Replace "Send" with "Stop" (Phosphor `stop` icon) — **same shape and position** as Send. Muscle memory matters.
- Stop is keyboard-accessible (Tab from input).

## Mid-stream interruption
- **Stop** halts generation; streamed output remains, marked "Stopped."
- **Regenerate** discards current output and re-runs from the same prompt.
- **Edit & resend** opens the previous user message for edit, then regenerates from there.
- All three keyboard-accessible.

## After-stream affordances
Below the completed response: Copy, Regenerate, Thumbs up/down (see `ai-feedback-and-correction.md`), Cite/share. Hover-revealed on desktop, persistent on touch. Never hide entirely.

## "Thinking" indicators
For latency over 2s without token output: three pulsing dots in `--color-teal`. Optional copy below — match the actual operation ("Reasoning…", "Searching…", "Generating…"), never generic "Loading…" For agentic flows showing tool use, see `ai-tool-use-and-agency.md`. Never use a generic spinner — suggests "system unresponsive" instead of "model working."

## Reduced motion
`prefers-reduced-motion: reduce` must:
- Disable cursor blink (cursor stays solid).
- Disable thinking-dot pulse (dots visible, no animation).
- Disable auto-scroll smoothness (jump rather than scroll).
- Streaming itself is unaffected — token reveal is content, not animation.

## Accessibility (the part most teams miss)
- Wrap streaming output in `aria-live="polite"` and `aria-atomic="false"`.
- Buffer announcements at sentence boundaries — never per-token (constant interruption).
- "Read full response" button after completion focuses the response container.
- Stop button accessible name: "Stop generating, button."
- Streaming output container is focusable so keyboard users can reach it.

## Long-form output
For responses over ~500 words: progress indicator at top ("Continuing…" or token count), collapse-and-expand of completed sections, sticky outline in sidebar for navigation.

## Errors mid-stream
Preserve what was streamed. Append: "Connection interrupted. [Continue from here] [Try again]" Use the inline-alert pattern from `notifications-and-feedback.md`.

## McDermott-specific
Cursor color `--color-teal` always. Streaming text: `--font-sans`, normal weight, `--text-primary`. Code blocks during stream: `--bg-surface` background, 1px `--border-light` border, monospace. "Stopped" indicator: navy text on `--color-pale-orange` left-border alert.

## Mobile
- Auto-scroll: detect scroll velocity; suppress until user has been at bottom for >500ms.
- Stop button: same position as Send on mobile too — don't relocate.
- Streaming text: `overflow-wrap: break-word` so URLs/paths don't push container past viewport.
- Thinking dots: inline at insertion point, never reflow to their own line.
- Cursor blink: same 1s on/off — don't speed up on mobile.
- Container: `min-width: 0` so streaming content doesn't force parent wider than viewport.

See `responsive-and-mobile.md` for the universal checklist.

## Anti-patterns
- Generic spinner during AI generation (use thinking dots)
- Hide the input field during streaming
- Auto-scroll past content the user is reading
- Render half-formed markdown
- Token-by-token screen reader announcements
- Streaming with no Stop affordance
- Stop button in a different location than Send
- Cursor blink faster than 1s on/off
- Discard streamed content on error
- Block the entire UI during generation
- Auto-scroll on touch when user is mid-swipe
- Spinner with no contextual copy
