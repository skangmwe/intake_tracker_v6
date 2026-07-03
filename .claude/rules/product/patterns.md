# patterns.md — Solution Patterns Library
## AI Solutions Team | McDermott Will & Schulte
**Version:** 1.0 (starter) | **Last Updated:** May 2026 | **Owner:** AI Solutions Lead

---

## PURPOSE

Most requests across attorneys, practice groups, finance, marketing, and operations will collapse into a small number of solution patterns. This catalog gives analysts a shared vocabulary, a starting architecture, a known set of test cases, and a list of common pitfalls for each pattern. It is the connective tissue between intake and build.

Patterns compound. Each new solution that matches a pattern adds to the test bank, the prompt library, and the example set — so the next solution of the same shape gets faster, safer, and higher quality.

---

## HOW TO USE THIS

During intake, identify which pattern(s) the request matches. Most solutions are a single pattern; many are a small composition of two or three. Record the matched pattern(s) in Section 3 of the `artifacts/docs/product/solution-requirements.md`.

Once a pattern is matched, the catalog hands you:
- The typical Solution Tier for this pattern
- A starting architecture to design against
- A prompt approach to begin from
- A QA test-case starter set (handed to QA at handoff)
- Common pitfalls to actively avoid

If a request doesn't fit, see **Adding New Patterns** at the bottom. New patterns should be rare — the goal is convergence, not proliferation.

---

## PATTERN 1: EXTRACT

Pull structured data from unstructured documents.

**Typical inputs:** Contracts, court filings, invoices, emails, scanned PDFs of forms, deposition transcripts.
**Typical outputs:** A spreadsheet, JSON, filled template, or database insert with named fields.
**Common variations:** Single document vs batch; flat fields vs nested; with or without confidence scores; OCR-required vs digital-native.
**Most-common Solution Tier:** Tier 1 if interactive (analyst hands over one doc at a time), Tier 2 if scheduled or queued batch.

**Starting architecture:** Define the target schema explicitly (field names, types, required flags). Process one document at a time, then aggregate downstream. For batch flows, separate the extraction step from any business logic. Always validate output against the schema before persisting.

**Starting prompt approach:** Provide the schema in the prompt, the source document, and explicit instructions to return JSON conforming to the schema. **Always require Claude to mark unknown fields as null rather than guess.** Forbid inference unless the requirement explicitly asks for it.

**QA test cases (starter set):**
- Document missing a required field — marks null, doesn't hallucinate.
- Document with conflicting data (e.g., two dates in different formats) — picks consistently per defined rule.
- Empty document or wrong document type — fails safely with a clear error.
- Document in a different language — refuses or extracts per defined policy.
- Field with edge-case formatting (e.g., negative dollar amount, redacted name) — handles correctly.

**Common pitfalls:** Letting Claude infer values that aren't present. Schema drift across solutions (the same field named differently). Skipping output-against-schema validation before downstream use.

---

## PATTERN 2: SUMMARIZE / SYNTHESIZE

Condense one or many documents into a shorter useful form.

**Typical inputs:** Long contracts, deposition transcripts, research memos, email threads, document sets for a matter.
**Typical outputs:** Executive summary, bulleted key points, key-decisions list, action items, multi-doc synthesis report.
**Common variations:** Single-doc summary vs multi-doc synthesis vs ongoing-stream digest (weekly/monthly).
**Most-common Solution Tier:** Tier 1 for interactive use; Tier 2 if scheduled (e.g., weekly digest of new matter filings).

**Starting architecture:** Specify the audience and target length up front, in the prompt. For multi-doc: chunk → summarize per chunk → synthesize summaries → review. For ongoing streams, persist state so the same content isn't re-summarized.

**Starting prompt approach:** Tell Claude the audience (`Audience Level A/B/C` from standards.md), the desired length, what to emphasize, what to ignore. **Require source citations for any specific claim** so reviewers can verify.

**QA test cases (starter set):**
- Summary that should fit in 200 words — stays under the cap.
- Multi-doc synthesis where docs conflict — surfaces the conflict explicitly, doesn't silently pick one.
- Document with very long repetitive content — deduplicates rather than padding.
- Sensitive content (privileged, PII) — carries through sensitivity markers; doesn't strip them.
- Citation accuracy — every quoted/specific claim links back to the right source.

**Common pitfalls:** Paraphrased "quotes" that aren't actually verbatim. Losing track of which source a claim came from in multi-doc cases. Producing a shorter version of everything rather than an actually prioritized summary.

---

## PATTERN 3: DRAFT

Generate text in a specific voice or template, for human review and send.

**Typical inputs:** A few facts, a template, a style reference, optionally samples of prior work.
**Typical outputs:** Email drafts, client communications, internal memos, standard form letters, marketing copy.
**Most-common Solution Tier:** Tier 1. Human always reviews before sending.

**Starting architecture:** Human-in-the-loop is mandatory — never auto-send. Always show the requester the draft alongside the facts/prompts that produced it. Capture revisions for future prompt refinement.

**Starting prompt approach:** Provide the template/voice example, the facts to incorporate, the audience, and explicit constraints. Apply the appropriate standards.md Audience Level for tone. Forbid invention of facts not in the brief.

**QA test cases (starter set):**
- Client-facing draft — applies Audience Level A correctly (formal, no contractions, no firm-internal jargon).
- Draft with missing facts — leaves placeholders, does not invent.
- Draft using a style sample — actually matches the voice, not generic AI-helpful.
- Sensitive-topic draft — applies the right caution and disclaimers.
- Legal content — does not include legal conclusions or recommendations (per roles.md).

**Common pitfalls:** Hallucinating facts not in the source brief. Drifting toward generic helpful-AI voice instead of firm voice. Inventing legal conclusions or recommendations.

---

## PATTERN 4: CLASSIFY / ROUTE

Categorize incoming items and direct them to the right place, queue, or person.

**Typical inputs:** Inbound emails, support tickets, document queues, client matter requests, vendor invoices.
**Typical outputs:** A category label, a priority, a routing recommendation, optionally an automated action.
**Most-common Solution Tier:** Tier 2 (typically runs automatically on a stream or queue).

**Starting architecture:** Define categories explicitly with positive and negative examples. **Always include an "uncertain — route to human" category.** Log every classification with its rationale for audit and accuracy review. Set a confidence threshold below which the item escalates rather than auto-routes.

**Starting prompt approach:** Provide the categories with examples, the item to classify, and require Claude to return both a category and a confidence rationale. Build the escalation threshold into the calling code, not the prompt.

**QA test cases (starter set):**
- Edge case that could go in two categories — picks consistently per defined rule.
- Item that doesn't fit any category — escalates, doesn't force-fit.
- Item with adversarial content (prompt injection in subject line) — ignores injection, classifies normally.
- Class drift over time — accuracy stays stable on a fixed regression test set.
- Privileged or sensitive content — routes appropriately, never to wrong-audience queue.

**Common pitfalls:** Category definitions that overlap. Under-using the "escalate to human" path. No feedback mechanism to learn from misclassifications.

---

## PATTERN 5: COMPARE

Find and report differences between two or more artifacts.

**Typical inputs:** Two contract versions, a draft vs. a precedent, two financial reports, a policy vs. its prior version, a vendor proposal vs. firm standards.
**Typical outputs:** A diff report, a list of changes ranked by significance, a "what's new" summary, a flagged-fields table.
**Most-common Solution Tier:** Tier 1 interactive, Tier 2 if scheduled (e.g., nightly diff of regulatory updates).

**Starting architecture:** Never modify the source documents. Distinguish "material" vs "cosmetic" differences explicitly in the output. For legal use, **never miss differences in defined terms, dates, monetary amounts, or named parties** — these are non-negotiable.

**Starting prompt approach:** Provide both documents, an instruction to find differences, an explicit definition of "material," and require structured output (location, original, new, significance, suggested action).

**QA test cases (starter set):**
- Two near-identical documents — finds the small material change.
- Cosmetic-only changes (formatting, whitespace) — doesn't report as material.
- Documents with reordered but unchanged content — handles reorder correctly.
- Critical field changed (dollar amount, date, party name) — flags as high significance.
- Change inside a table or footnote — catches it (commonly missed).
- Deletion vs. addition — distinguishes accurately.

**Common pitfalls:** Missing changes inside tables, footnotes, or appendices. Treating reorganized but unchanged content as a change. Failing to detect deletions when focused on insertions.

---

## PATTERN 6: GENERATE FROM TEMPLATE

Produce a structured artifact (form, document, report) by filling a known template with provided inputs.

**Typical inputs:** Data records, prior work product, requester-supplied facts, queries against firm systems.
**Typical outputs:** A filled Word doc, an Excel report, a PDF form, an HTML page, a slide deck.
**Most-common Solution Tier:** Tier 1 if interactive, Tier 2 if scheduled batch (e.g., monthly client report generation).

**Starting architecture:** The template is the source of truth — never let Claude restructure it. Validate that all required fields are populated before producing output. Use the appropriate skill (docx, xlsx, pdf, pptx) for the target format. For batch, separate templating from data retrieval so each can fail independently.

**Starting prompt approach:** Provide the template, the data to insert, and explicit field-mapping instructions. Tell Claude exactly where each piece of data goes. **Require it to flag missing required fields rather than skip them or guess.**

**QA test cases (starter set):**
- All fields present — populates correctly with no drift.
- Required field missing — flags and refuses to produce incomplete output.
- Data type mismatch (text where number expected) — handles per defined rule or flags.
- Template structure modified (extra section added) — handles or errors gracefully.
- Multiple records in batch — no cross-contamination between outputs.

**Common pitfalls:** Claude reformatting the template instead of just filling it. Silent skipping of missing fields. Mixing data from multiple records into one output by mistake.

---

## COMPOSING PATTERNS

Most real solutions combine patterns. Recognizing the composition during intake helps Dev architect the build cleanly. Common combinations:

- **Extract → Classify → Route** — inbound docs parsed, categorized, then routed to the right team or queue.
- **Compare → Summarize** — diff two contracts, then summarize the material changes for partner review.
- **Extract → Generate from Template** — pull data from source docs, fill a standard report.
- **Summarize → Draft** — synthesize meeting notes, then draft follow-up communications.
- **Classify → Extract** — route docs to the right extraction schema based on their type.

When intake suggests a composition, capture each component pattern in the solution-requirements.md. Each component carries its own test cases and pitfalls — QA inherits the union.

---

## ADDING NEW PATTERNS

If a request genuinely doesn't fit any pattern, document the candidate with:
- Name and one-line description
- Typical inputs and outputs
- Why it doesn't fit an existing pattern
- The first solution that exhibited it
- A proposed starter set of QA test cases

Discuss with the AI Solutions Lead before adding to this file. Most "new patterns" are actually variations of existing ones — push hard on the existing six before declaring a seventh.

---

*Maintained by the AI Solutions Lead. Every pattern update should be accompanied by at least one example solution that exhibits it. Changes logged with date and rationale.*
