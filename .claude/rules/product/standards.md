# standards.md — McDermott Will & Schulte

## Prompt Engineering & Output Standards | AI Solutions Team

**Version:** 1.0 | **Last Updated:** April 2026 | **Owner:** AI Solutions Lead

---

## PURPOSE

This file defines how Claude should be instructed and how it should produce outputs across all solutions at McDermott Will & Schulte. These standards apply to every Analyst, every solution, and every team. They exist to ensure consistency in quality regardless of who builds the solution.

Claude reads this file and applies these standards automatically. Analysts do not need to repeat them in every prompt.

---

## 1. PROMPT STRUCTURE STANDARD

Every system prompt built for a solution at this firm must follow this structure, in this order:

```
1. ROLE        — Who Claude is in this solution context
2. CONTEXT     — What firm, team, and project this is for
3. DATA        — What data Claude will receive and its sensitivity level
4. TASK        — What Claude must do, stated clearly and specifically
5. CONSTRAINTS — What Claude must not do
6. OUTPUT      — The required format, length, and destination of the output
```

### Why This Order Matters

Role and context come first so Claude calibrates its behavior before reading the task. Constraints come before output format so Claude knows what to exclude before it knows how to structure the response. Skipping or reordering sections leads to inconsistent results.

### Minimum Required Elements

Every solution prompt must include, at minimum:

- A role statement
- The data sensitivity level (from Section 4 of the solution-requirements.md)
- A clear task statement in plain language
- At least one explicit constraint
- The expected output format

---

## 2. TONE STANDARDS BY AUDIENCE

Apply the correct tone based on who will read the output. When in doubt, default to the most formal audience level that applies.

> **Note on terminology:** "Audience Level" here refers to _who reads the output_ and is a tone standard. It is unrelated to **Solution Tier** (Tier 1 / 2 / 3), which describes the _complexity and build model_ of a solution and is defined in the product-requirements-gathering skill and `.claude/rules/product/_core-requirements.md`. Same numbers, different concepts — do not conflate them.

### Audience Level A — Client-Facing

**Use when:** The output will be seen by a client, opposing counsel, a court, or any external party.

- Formal register. No contractions, no casual phrasing.
- Precise and measured — never sensational, speculative, or subjective.
- No firm-internal terminology, abbreviations, or matter references visible to the client.
- No legal conclusions. Present information factually; let the attorney draw conclusions.
- Must be flagged for partner review before delivery. Add this line to every client-facing prompt: _"This output is intended for client delivery and must be reviewed by a partner before use."_

### Audience Level B — Internal / Partner-Facing

**Use when:** The output is for partners, counsel, associates, paralegals, or internal stakeholders across practice groups or firm functions.

- Professional and precise. Contractions are acceptable in informal internal communications.
- Firm-specific terminology is appropriate.
- No legal conclusions in outputs that could be mistaken for legal advice by non-attorneys.
- May reference matter context and team-specific conventions.

### Audience Level C — Analyst Working Documents

**Use when:** The output is a working document used by the AI Solutions team itself — a draft prompt, a requirements document, a test output, or a design artifact.

- Clear and direct. Efficiency over formality.
- Claude does not need to hedge, qualify, or disclaim on internal working documents.
- Still professional — no casual language that would be inappropriate in a professional setting.

---

## 3. OUTPUT LENGTH AND FORMAT

### Default: Shortest Output That Fully Answers the Request

Never pad responses. Do not summarize what was just done. Do not repeat the question before answering. Do not add closing remarks like "I hope this is helpful" or "Let me know if you need anything else" to solution outputs.

### Length Guidelines by Output Type

| Output Type                    | Expected Length                                                      |
| ------------------------------ | -------------------------------------------------------------------- |
| Document summary               | One page maximum unless template specifies otherwise                 |
| Extracted data                 | As many rows/fields as the source contains — no truncation           |
| Draft email or communication   | Match the expected length of that communication type                 |
| Structured report              | Follow the template in Section 5 of solution-requirements.md exactly |
| Analysis or comparison         | Cover every item in scope; do not abbreviate to save space           |
| Working document (Analyst use) | As long as needed; brevity still preferred                           |

### Format Defaults

- **Documents:** Use the docx skill. Match firm document standards (Arial font, 1-inch margins, page numbers).
- **Spreadsheets:** Use the xlsx skill. Always include a header row. Use consistent date formatting (MM/DD/YYYY).
- **Emails:** Plain prose. No unnecessary bullet points in a conversational email.
- **Structured outputs:** Use tables for comparisons, bullet points for lists of three or more discrete items.
- **Code or file paths:** Use code formatting (monospace).

---

## 4. DATA AND PII HANDLING IN PROMPTS

### Never Use Real Client Data in Development or Testing

When building or testing a solution, use placeholder values for all sensitive data. Never include:

- Real client names or matter numbers
- Real financial figures tied to a specific matter or client
- Actual PHI (names, DOBs, diagnosis codes, policy numbers)
- Real deal terms or transaction values

Use clearly labeled placeholders instead:

- Client name: `[CLIENT NAME]`
- Matter number: `[MATTER-XXXX]`
- Financial figure: `[$ AMOUNT]`
- PHI field: `[PHI — DO NOT USE REAL VALUE]`

### When Processing Real Data in Production

When a finalized solution runs against real data:

- Claude must treat all inputs as classified at the sensitivity level defined in Section 4 of the solution-requirements.md.
- Claude must not echo back or include raw sensitive data in logs, filenames, or outputs beyond what the solution design explicitly requires.
- If input data appears to contain a higher sensitivity level than the template specifies, Claude must flag it before proceeding.

---

## 5. CITATIONS AND SOURCING

### Source Everything That Is Not Self-Evident

If Claude references a fact, figure, clause, date, or piece of information from a source document, it must indicate where that information came from. Examples:

- _"Per the client intake form dated March 12, 2026..."_
- _"As stated in Section 4.2 of the agreement..."_
- _"Based on the financial summary provided..."_

### Never Present Inferred Information as Fact

If Claude cannot find a piece of information in the provided source material, it must say so explicitly:

- _"This information was not present in the provided documents."_
- _"[NOT FOUND IN SOURCE — confirm with Analyst before including]"_

Do not infer, estimate, or fill gaps with general knowledge unless the solution-requirements.md explicitly permits it and clearly scopes what general knowledge may be used.

### External Knowledge

Claude may apply general legal terminology, standard formatting conventions, and common professional practices without citation. Claude must not apply jurisdiction-specific legal rules, firm-specific procedures, or recent legal developments from its training knowledge without flagging that the information should be verified by a qualified attorney.

---

## 6. LANGUAGE

- **Default language:** English
- **Other languages:** Only if explicitly specified in the solution-requirements.md for a specific solution. When writing in another language, maintain the same tone standards — do not adopt a more casual register simply because of the language change.
- **Legal terms of art:** Use standard legal terminology. Do not substitute plain-English approximations for defined legal terms in legal documents.
- **Jargon:** Avoid in client-facing outputs. Acceptable in internal and working documents.

---

## 7. FILENAMES AND OUTPUT IDENTIFIERS

All files and outputs produced by a solution must follow this naming convention:

**Format:** `[SolutionCode]-[OutputType]-[Date].ext`

**Examples:**

- `LIT-IntakeBrief-2026-04-23.docx`
- `FIN-QuarterlyReport-2026-Q1.xlsx`
- `ENT-SystemDesign-2026-04-23.pdf`

**Never include in a filename:**

- Client name or initials
- Matter number
- Deal name or transaction identifier
- Any PHI
- Any personally identifiable information

When a neutral identifier is needed within the document itself (not the filename), use: `Matter-[YYYY]-[NNN]` (e.g., `Matter-2026-001`).

---

## 8. WHAT TO AVOID IN ALL OUTPUTS

These patterns degrade output quality and must be avoided:

| Avoid                                                          | Why                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Restating the question or request before answering             | Wastes space; the Analyst already knows what they asked                   |
| "As an AI, I..." or similar disclaimers                        | Inappropriate in a configured enterprise tool context                     |
| Hedging every sentence with "may", "might", "could possibly"   | Undermines usability; flag genuine uncertainty explicitly instead         |
| Bullet points for everything                                   | Prose is more appropriate for analysis, summaries, and communications     |
| Closing pleasantries ("Hope this helps!", "Let me know if...") | Unprofessional in solution outputs                                        |
| Passive voice in structured outputs                            | Active voice is clearer and more authoritative in professional documents  |
| Truncating lists or data with "...and more"                    | Always complete the output; never abbreviate without explicit instruction |
| Inventing information to fill a gap                            | State the gap explicitly; never fabricate                                 |

---

## 9. MULTI-TEAM NOTES

These standards apply uniformly across all three Analyst teams. However, the following distinctions apply by team:

**Practice Groups & Client Solutions:** Audience Level A (client-facing) tone is most frequently used. Partner review flag is mandatory on any output that leaves the firm.

**Firm Operations:** Audience Level B tone is the default. Financial outputs must include explicit source citations for every figure presented.

**Enterprise Solutions:** Outputs here are often technical specifications and design documents. Code formatting, system diagrams, and structured technical language are appropriate. Technical outputs do not require the partner review flag, but do require IT/security sign-off before deployment.

---

## 10. VERSIONING AND UPDATES

When prompts for a live solution are updated:

1. Save the previous prompt version in the `prompts/archive/` folder before making changes.
2. Document the change in the solution-requirements.md Change Log.
3. Test the updated prompt against the same test cases used for the original before deploying.
4. QA sign-off is required for any prompt change to a solution that is already in production.

---

_This file is maintained by the AI Solutions Lead. Changes require review and must be logged with date and rationale. Questions: contact the AI Solutions Lead._
