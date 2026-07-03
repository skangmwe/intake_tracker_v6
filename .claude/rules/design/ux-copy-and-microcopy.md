---
name: McDermott UX Copy & Microcopy
description: 'Use when writing button labels, form labels, error messages, empty state copy, confirmation dialogs, tooltips, microcopy, voice and tone, success messages, helper text, navigation labels, or any user-facing text.'
version: 1.0.0
---
# McDermott UX Copy & Microcopy
Words on the screen are part of the design. Treat them with the same rigor as the visual system.

## Voice (consistent) vs tone (situational)
**Voice:** precise, warm, confident, never cute.
**Tone shifts by context:** Success → brief, factual, no exclamation marks · Error → direct, takes responsibility, points to fix · Onboarding → welcoming, slightly conversational · Marketing → confident, claims backed by specifics · Legal/financial → precise, plain language, no euphemisms.

## Capitalization
- Eyebrows / labels → ALL CAPS
- Buttons → ALL CAPS
- Headlines / page titles → Sentence case
- Proper nouns → Title Case
- Everything else → Sentence case

Never use Title Case for headlines — looks dated, harder to scan.

## Buttons — verb + noun
| ✗ Don't | ✓ Do |
|---|---|
| OK | Got it |
| Submit | Save changes |
| Confirm | Delete 3 files |
| Yes | Send invitation |
| No | Cancel |

Primary is the affirmative action. Cancel is always secondary, never destructive-styled. Destructive confirmations name the specific consequence ("Delete account permanently"), never just "Confirm" or "Yes."

## Error messages — what + why + how (canonical)
Three parts, in order:
1. **What happened** — clear, no jargon
2. **Why** — only if knowing helps
3. **How to fix** — the specific next action

| ✗ Don't | ✓ Do |
|---|---|
| Error 500 | Something went wrong on our end. Try again in a moment. |
| Invalid input | This email is missing an @ sign. |
| Required | Add a billing address to continue. |
| Network error | Couldn't reach the server. Check your connection and retry. |

Never apologize excessively ("Oh no!", "Oops!", "Sorry!"). Never blame the user ("You entered…"). Don't show error codes alone — log them, hide them, optionally expose under "Technical details."

## Empty states (three flavors)
**Zero-data:** explain the value of creating the first item.
> No projects yet
> Create your first project to start tracking work across your team. [Create project]

**Filtered-to-zero:** point to the filters.
> No matches for these filters
> Try broadening your search or clearing filters. [Clear filters]

**No access:** explain who can grant it.
> You don't have access to this workspace. Ask your workspace admin to invite you.

## Confirmations
- Trivial action → silent or quick toast ("Saved")
- Consequential → explicit toast with Undo if reversible
- Destructive → modal with the specific consequence in title and the item named in the action button

> **Delete this project?**
> This will remove "Q4 Planning" and all 23 of its tasks. This can't be undone.
> [Cancel] [Delete project]

## Helper text
Below label, above input. One short sentence — never multi. Clarifies *what* the field is for, not *how* to fill it.
- ✗ "Enter your email address in the format name@example.com"
- ✓ "We'll send order updates here."

## Tooltips
Supplemental, non-essential info only. Never put critical information in a tooltip (mobile can't hover; keyboard may miss it). Max 1 sentence.

## Voice and tone don'ts
No "Oops!", "Uh oh!", "Yay!", "Whoops" · no emoji in product UI · no exclamation marks in errors/warnings · no "please" ("Please enter your email" → "Enter your email") · no "just" (minimizes effort, reads condescending) · no idioms in legal/financial · no metaphors that don't translate (sports, food, weather).

## Inclusive language
- Use "they" as a singular pronoun
- Avoid gendered defaults ("guys" → "team")
- Avoid violence/war metaphors ("kill"/"execute" → "stop"/"run")
- Use "deny list" / "allow list" instead of "blacklist" / "whitelist"
- Use "primary" / "secondary" instead of "master" / "slave"

## Numbers, dates, currency
Use locale-aware formatting (`Intl.NumberFormat`, not hardcoded "$"). Spell month names long-form when ambiguity matters ("Jan 5, 2026" not "1/5/26"). Include time zone when relevant. Pluralize correctly ("1 file", "0 files", "2 files" — never "1 file(s)").

## Mobile copy
- **Button labels shorter** — "Save changes" → "Save" if context is clear. Never ellipsis-truncate; use icon-only with `aria-label`.
- **Helper text** stays one line whenever possible.
- **Error messages** still follow what+why+how, but ~30% shorter on mobile.
- **Long values** (paths, URLs, IDs) reveal full content on tap (sheet) rather than ellipsis-only.
- **Tooltips** avoid on mobile (hover-dependent); use an `info-circle` icon that opens a sheet.
- **Currency / large numbers** keep full notation for accuracy; if shortening, do it deliberately ("$2.89M") and show full value on tap.

See `responsive-and-mobile.md` for the universal checklist.

## Anti-patterns
- "OK"/"Cancel"/"Yes"/"No" as button labels · Title Case headlines
- Exclamation marks in errors/warnings · generic errors with no follow-up
- "Please" everywhere · apologetic copy that delays the actual information
- Clever or pun-heavy copy in workflows · idioms in copy that will be translated
- Critical info in tooltips · placeholder as the label
- Sentence-fragment helper text ending in "…"
