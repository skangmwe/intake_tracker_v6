---
name: McDermott AI Uncertainty & Errors
description: 'Use when designing AI "I don''t know" responses, refusals, hallucination guardrails, partial-failure recovery, rate-limit messaging, content-policy errors, model errors, or any AI-specific error or uncertainty surface.'
version: 1.0.0
---
# McDermott AI Uncertainty & Errors
How the AI says "I don't know," refuses, fails partway, or hits a limit. Done well, these moments build trust.

## "I don't know" patterns
The model lacks information to answer reliably.
- State the gap directly: "I don't have current data on this."
- Offer the next-best action: "Want me to search the web?" / "Try uploading the document." / "Ask your admin."
- Never fabricate to fill silence.

Visual: same surface as a normal AI response, no special chrome. Optional small `info` icon in `--text-secondary`. Tone: matter-of-fact, not apologetic — "I don't have that," not "Sorry, I can't help with that!"

## Refusals
The request crosses a policy line (safety, legal, ethical).
- Name the category briefly: "I can't help with requests that…"
- Offer an adjacent path: "I can talk through the general topic, or help you find official sources."
- Never lecture, moralize, or repeat the refusal.

Visual: subtle `--color-warning` left border, `--color-pale-gold` background, navy text per theme-stable rule. Phosphor `shield-warning` icon. 1–2 sentences max.

## Hallucination guardrails
**Cite-or-don't-claim rule:** factual claims must come with a citation. If the model can't cite, the UI marks the claim as unsourced (see `ai-trust-and-provenance.md`).

**Hedge language:** when uncertain, the UI surfaces hedges ("may," "likely") and styles them subtly so they're not skipped.

**Verification prompts:** for high-stakes claims (medical, legal, financial), the UI appends a verify-with-source recommendation as a footer.

## Partial-failure recovery
The AI completed some operations but not all. Show what succeeded, show what failed with the specific reason, offer to retry only the failed parts.

```
✓ Drafted email to Alex
✓ Drafted email to Sam
✗ Couldn't reach Jordan's calendar — they may have private settings.
  [Retry] [Skip]
```

## Rate limit & quota
- State what was hit: "You've used 50 of 50 prompts for the hour."
- State when it resets: "Try again at 4:15pm."
- Offer upgrade path if applicable.

Use an inline alert (warning severity). Don't surface as a modal unless it blocks an in-progress action.

## Timeout & connection errors
"Took too long to respond. The model may be experiencing high demand." Offer [Try again] or [Use a different model]. **Preserve the user's prompt** — never discard input on timeout.

## Content policy errors
"I can't generate content like that. Try rephrasing or pointing me at a related topic." Don't quote the offending part back at the user. Don't moralize.

## Tool / agent errors
"Tried to read the file, but it's locked. Try unlocking it and asking again." Show which tool failed (transparency builds trust). See `ai-tool-use-and-agency.md` for the full tool-call visualization.

## Recovery copy formula
**What happened + (if known) why + the specific action to fix it.**

| ✗ Don't | ✓ Do |
|---|---|
| Something went wrong | Couldn't reach the search service. Try again in a moment. |
| Error processing your request | This file is over 50MB — try splitting it. |
| Sorry, I can't help with that | I can't generate code that bypasses authentication. Want help building secure auth instead? |
| Generation failed | The model timed out. Try a shorter prompt or pick a faster model. |

## Tone for AI errors
Direct, not apologetic. Take responsibility ("I couldn't…" not "You didn't…"). Never blame the user. No emoji, no exclamation marks.

## McDermott-specific
All AI error surfaces follow the alert styles in `notifications-and-feedback.md`. Refusals: `--color-warning` border + `--color-pale-gold` fill + navy text. "I don't know": no special chrome. Error copy follows `ux-copy-and-microcopy.md` (no "Oops," verb + noun buttons).

## Mobile
- Refusal/uncertainty blocks: full-width, padding `var(--space-3)`.
- Recovery action buttons stack vertically via `flex-wrap`. Primary action full width.
- Long technical details collapse under "Show details" on mobile.
- Error icons: 16px mobile, 20px desktop. Aligned to baseline of first text line.
- Tool-failure messages: short summary on mobile, full diagnostic on tap.
- Rate-limit alerts: inline banner desktop, sticky bottom sheet on mobile.

See `responsive-and-mobile.md` for the universal checklist.

## Anti-patterns
- Fabricate to fill silence
- Apologize excessively ("Sorry!", "Oh no!", "Whoops!")
- Lecture or moralize during a refusal
- Repeat the refusal multiple times
- Show raw error codes or stack traces to end users
- Discard the user's prompt on error
- Generic "Error" with no context or recovery action
- Confidence styling on uncertain claims that matches certain ones
- Quote the offending portion of a refused request back at the user
- Modal blocking on rate limit (use inline alert)
- Wrap a refusal in friendly language that hides what's happening
- Tool errors that say "an error occurred" without naming the tool
- Hide hedging language so it disappears
