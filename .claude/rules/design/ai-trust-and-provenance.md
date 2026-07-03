---
name: McDermott AI Trust & Provenance
description: 'Use when designing or building AI-generated content displays, citations, source attribution, confidence indicators, AI vs human content distinction, "based on" attributions, or anything related to user trust in AI output.'
version: 1.0.0
---
# McDermott AI Trust & Provenance
How the UI earns trust in AI output. Get this wrong and users either over-trust or stop using the feature.

## The trust principle
Users trust AI when they can **verify**. Every claim should be traceable to a source the user can inspect. When verification isn't possible, the UI says so clearly.

## Citations
**Inline** (short responses, under ~200 words): numeric markers (¹, ²) next to each claim. Hover/focus reveals source title and link. Tap/click jumps to the source list.

**Source list** (longer responses or many sources): numbered list at the end or in a sidebar. Each entry shows title, publisher/author, date, link. Group repeated sources.

**Inline links** (one or two sources, conversational): wrap the cited phrase in a hyperlink. Use McDermott hyperlink style (underlined, navy → blue/teal on hover).

## When citations are missing
If the model generated a claim without a verifiable source, the UI must say so. "Generated without a specific source." Subtle muted text below the claim in `--text-secondary`. Never present an unsourced claim as if it had a source.

## Confidence indicators
Communicate uncertainty **linguistically**, not numerically.
- ✓ "This may be the case…" / "Likely…" / "There's evidence that…"
- ✗ "Confidence: 73%"

Numeric scores require calibration the user can't verify and create false precision. For low-confidence output: italicize uncertain phrases, append "(low confidence)" in `--text-secondary`. Never style uncertain claims to look identical to certain ones.

## Distinguishing AI from human content
Wherever AI and human content coexist, distinguish them.
- AI-generated: subtle pale background (`--color-pale-blue`), "Generated" label with `ph-sparkle` icon.
- AI-edited human content: "Suggested by AI" badge in the corner.
- Pure human content: no marker.

Never use these markers as decoration — reserve them for actual provenance.

## "Based on…" attribution
When the AI used specific user data, surface what: "Based on your last 3 reports…" / "Using context from this thread…" / "Drawing from your design system file…". Place near the response, not in a tooltip. This is how users learn what the AI can see.

## Source freshness
Show source dates — stale sources are worse than no sources. Real-time data gets a retrieval timestamp ("Fetched 3 minutes ago"). Training-data-only responses indicate the model's knowledge cutoff.

## Disclosure on first use
First time a user encounters an AI surface, briefly disclose: that the content is AI-generated, that it may be wrong and should be verified, where to give feedback. Dismissible banner, not a modal — never block first use.

## McDermott-specific
- AI content surfaces: `--color-pale-blue` background, navy text (theme-stable rule).
- AI marker icon: Phosphor `ph-sparkle` regular 16px.
- AI marker label: `--font-sans`, 11pt, ALL CAPS, 10% tracking, `--text-secondary`.
- Citations use McDermott link styles (CTA for "View sources", hyperlink for inline).

## Mobile
- Citation markers: tapping opens a sheet (per `disclosure-surfaces.md`); no hover.
- Source list: collapses to a "View N sources" expandable section; expanded list is a sheet.
- Confidence: stick to linguistic hedges — no bar indicators on phones.
- AI/human content markers: keep ≥24×24 visibility; never shrink for a few pixels.
- Source freshness: abbreviate on mobile ("2h", "Mar 5"), full timestamp on tap.

See `responsive-and-mobile.md` for the universal checklist.

## Anti-patterns
- Present unsourced claims as if they had sources
- Numeric confidence scores without calibration
- AI content visually identical to human content
- Hide source freshness
- Bury attribution in a tooltip
- Use the AI marker as decoration on non-AI content
- Citations that link to the AI's own past responses
- "Based on your data" attribution when the model didn't actually use it
- Strip citations to "save space" in compact UI
- Modal first-use disclosure that blocks the user
- Confidence visualizations the user can't act on
- Cite paywalled sources without indicating that
