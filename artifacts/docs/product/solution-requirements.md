# SOLUTION REQUIREMENTS
> **For Claude:** Read this file at the start of every session for this project. Use all sections below as your primary context before taking any action. If a section is marked `[PENDING]`, ask the Analyst to complete it before proceeding.
>
> *This artifact is the Analyst's requirements deliverable for a solution — what should be built, for whom, and why. Distinct from a developer specification (how it should be built), which is owned by Development.*

---

## 1. SOLUTION IDENTITY

| Field | Details |
|---|---|
| **Solution Name** | [Short descriptive name] |
| **Solution Tier** | `Tier 1` / `Tier 2` / `Tier 3` — see definitions below. Default to Tier 2 if uncertain. |
| **Version** | v1.0 |
| **Status** | `Draft` / `In Development` / `In Review` / `Deployed` |
| **Date Created** | [YYYY-MM-DD] |
| **Last Updated** | [YYYY-MM-DD] |
| **Analyst Owner** | [Name] |

**Tier Definitions (for Claude and Analysts):**
- **Tier 1** — Analyst-owned. Runs interactively in Claude Code. No system integrations. Human always present. No developer needed.
- **Tier 2** — Analyst builds the AI layer in Claude Code; Developer wraps infrastructure (scheduling, auth, UI, integrations). **MCP note:** if an approved platform MCP covers a required system integration, the Analyst calls it directly — the developer only builds what the MCP doesn't cover.
- **Tier 3** — Full development project. Complex UI, deep multi-system integration, multi-user scale, or building a new MCP server. Developer leads from the start. All Enterprise solutions are Tier 3 by default.

> **For Claude:** Read the Tier field before taking any design or build action. Tier 1 means the Analyst owns the full build — do not route work to a Developer. Tier 2 or 3 means include infrastructure handoff notes in any solution design you produce. If this field is blank or `[PENDING]`, treat the solution as Tier 2 and flag it.

---

## 2. REQUESTOR & STAKEHOLDERS

| Field | Details |
|---|---|
| **Requesting Group / Department** | [e.g., Litigation Practice Group, HR, Client: Acme Corp] |
| **Primary Contact** | [Name, Title] |
| **Executive Sponsor** | [Name, Title — if applicable] |
| **End Users** | [Who will actually use this? e.g., Associates, Paralegals, Partners] |
| **Approximate User Count** | [e.g., 12 associates across 2 offices] |

---

## 3. THE REQUEST

### Problem Being Solved
*In plain language, what pain point or inefficiency is this solution addressing?*

[Describe the current situation and why it's a problem]

### Proposed Solution
*At a high level, what will Claude do to solve it?*

[Describe what the solution will do — what goes in, what comes out, what gets automated]

### User Workflow — Today vs. With the Solution
*Walk through the user's current process step by step, then show what changes when the solution exists. This prevents the failure mode where a solution technically works but doesn't fit how the user actually operates. Required for every solution, every tier.*

| Step | Today | With the Solution |
|---|---|---|
| 1 | [e.g., Associate receives filing] | [Same / changed — describe] |
| 2 | [e.g., Skims for key dates manually] | [e.g., Solution extracts dates with confidence scores] |
| 3 | [e.g., Enters into matter calendar] | [e.g., Solution proposes entries; associate confirms] |
| 4 | | |

### Solution Category
*Select all that apply. This is a high-level categorization for portfolio reporting — distinct from Use Cases (Section 5), which describe specific scenarios.*

- [ ] Document automation (generation, summarization, extraction)
- [ ] Workflow automation (routing, approvals, notifications)
- [ ] Research & analysis
- [ ] Client-facing output
- [ ] Internal reporting
- [ ] Data processing
- [ ] Q&A / Knowledge retrieval
- [ ] Other: ___________

---

## 4. DATA & INPUTS

### Input Sources
*What information will Claude receive to do its work?*

| Input | Format | Example |
|---|---|---|
| [e.g., Client intake form] | [e.g., PDF] | [e.g., 2–5 page form] |
| | | |

### Data Sensitivity
- [ ] **Public** — No restrictions
- [ ] **Internal Only** — Not for external sharing
- [ ] **Confidential** — Firm/client sensitive data
- [ ] **Privileged** — Attorney-client privileged
- [ ] **PII Present** — Contains personally identifiable information
- [ ] **Regulated Data** — Subject to HIPAA, GDPR, or other compliance frameworks

### Data Handling Notes
*Any special instructions for how Claude should treat the data in this solution?*

[e.g., "Never include client names in output filenames" or "Anonymize all identifiers before summarizing"]

---

## 5. OUTPUTS & SUCCESS CRITERIA

### User Stories
*Who is using this solution, what are they trying to do, and what outcome matters? Capture one row per distinct persona — don't accept "everyone" or "the firm." Push for specificity. If Development uses a specific user-story tool or format, align with theirs for handoff.*

| As a... | I want to... | So that... |
|---|---|---|
| [role / persona — e.g., Litigation associate] | [specific capability] | [outcome or benefit] |
| | | |

### Expected Output
*What should Claude produce?*

| Output | Format | Destination |
|---|---|---|
| [e.g., One-page client brief] | [e.g., .docx] | [e.g., Saved to client matter folder] |
| | | |

### Testable Acceptance Criteria
*For each user story, define 3–4 concrete conditions QA can validate as pass or fail. Push past vague claims like "it should work well." Include accuracy thresholds, performance bounds, format conformance, and boundary conditions.*

| User Story (persona) | Criterion | How it will be tested |
|---|---|---|
| [e.g., Litigation associate] | [e.g., Extracted date is correct in ≥95% of cases on 100-doc sample] | [e.g., QA runs against test set; computes accuracy] |
| [e.g., Litigation associate] | [e.g., Output produced in under 30 seconds per document] | [e.g., QA times 20 runs; computes p95] |
| | | |

**Re-phrase any criterion that is not testable as written:**
- *"Output is accurate"* → specify the accuracy threshold and the test sample.
- *"Output is professional"* → give a concrete example of what would be rejected.
- *"It saves time"* → state how much time per use, against what baseline.

If testable criteria cannot be articulated yet, mark `[PENDING — testable AC to be confirmed with requester before build]` and surface in the Change Log.

### Use Cases
*Scenario-level detail that elaborates each user story. Required for Tier 2 and Tier 3. Recommended for Tier 1 when more than one persona or workflow is involved. Each scenario captures the main flow, at least one alternative flow, and at least one exception — push for these even if the requester says "nothing unusual happens."*

**Use Case 1: [Name]**
- **Trigger:** [What kicks this off]
- **Main flow:** (1) ... (2) ... (3) ... (4) ...
- **Alternative flow:** [What happens when input is unusual but valid — e.g., multiple matches, missing optional fields]
- **Exception:** [What happens when input is invalid or the operation fails — e.g., corrupted file, timeout, no result]

**Use Case 2: [Name]**
- **Trigger:**
- **Main flow:**
- **Alternative flow:**
- **Exception:**

*Add additional use cases as needed.*

### What "Good Output" Looks Like
*Give Claude a concrete example or description of an ideal output for this solution.*

[Describe or paste a sample — tone, length, structure, what to include/exclude]

---

## 6. CONSTRAINTS & BOUNDARIES

### What Claude Should NOT Do in This Solution
*Be explicit — this becomes part of Claude's instructions.*

- [ ] Do not include raw legal citations without verification
- [ ] Do not make recommendations — only summarize and present facts
- [ ] Do not retain or reference prior client matters
- [ ] Do not output content in languages other than English (unless specified)
- [ ] Other: ___________

### Technical Constraints
- [ ] Must work within firm's approved tools only (no external APIs)
- [ ] Must not send data outside the local environment
- [ ] Must work without internet access
- [ ] Output must be compatible with [specific system, e.g., iManage, SharePoint]
- [ ] Other: ___________

### Approved Integrations for This Solution
*List only tools/MCPs/APIs that have been explicitly approved for this solution.*

[e.g., SharePoint MCP, internal document library only]

---

## 7. USERS, ADMINISTRATION & REPORTING

*What people need to see out of the solution, and — for anything more than a one-person tool — who can use it and who keeps it running. Always complete the Reporting sub-section. Complete User Management for any solution more than one person uses, including Tier 1. Complete Administration & Operations when the solution runs unattended or connects to a system. Write `N/A` for any sub-area that genuinely doesn't apply; mark unknowns `[PENDING]`.*

### Reporting & Analytics
*What does someone need to be able to look at — to do the work, or to know it's going well?*

| Report / View | Audience | Frequency | Form (screen / file / email / dashboard) | Exportable? |
|---|---|---|---|---|
| [e.g., Run history for the end user] | [e.g., End user] | [e.g., On-demand] | [e.g., On screen] | [e.g., No] |
| [e.g., Monthly volume processed] | [e.g., Practice Group lead] | [e.g., Monthly] | [e.g., Excel export] | [e.g., Yes] |
| | | | | |

*If there are genuinely no reporting needs, record that explicitly here — it's a real answer, not a gap.*

### User Management & Access
*Who can use the solution and what they're allowed to do.*

| Item | Details |
|---|---|
| **User types / roles** | [e.g., All users same access / regular user vs. elevated permissions] |
| **Access restrictions** | [Should some people see or do things others can't? Describe] |
| **Add / remove process** | [How do people get added or removed, and who decides?] |
| **Activity log** | [Does the solution record who did what? If so, who sees it?] |

*Even a simple Tier 1 tool can have a short answer here ("just these five people, all the same access") — capture it rather than skipping it.*

### Administration & Operations
*Who keeps it running and how problems surface. Lightest for a single-user interactive tool; most important when the solution runs unattended or connects to a system.*

| Item | Details |
|---|---|
| **Owner / maintainer** | [Who owns and maintains it day-to-day after launch?] |
| **Admin-configurable settings** | [What can an administrator adjust without a developer — settings, rules, lists, thresholds?] |
| **Failure handling** | [When a run fails, input is bad, or there's an outage — how should that surface, and to whom?] |
| **Operational reports** | [Usage, errors, exceptions, health — separate from end-user reporting above] |

---

## 8. ROLES & HANDOFFS

| Role | Responsibility for This Solution |
|---|---|
| **AI Solutions Analyst** | Requirements owner, template maintainer, solution design |
| **UI/UX Designer** | [Involved? Y/N — if yes, describe scope] |
| **Developer** | [Build scope, key tasks] |
| **QA** | [Testing scope, acceptance criteria owner] |
| **Requestor / Business Owner** | UAT sign-off |

---

## 9. APPROVALS REQUIRED

| Approval Type | Required? | Approver | Status |
|---|---|---|---|
| IT / Security Review | [ ] Yes / [ ] No | | `Pending` |
| Data Privacy Review | [ ] Yes / [ ] No | | `Pending` |
| Practice Group Sign-off | [ ] Yes / [ ] No | | `Pending` |
| Legal / Compliance | [ ] Yes / [ ] No | | `Pending` |
| Executive Sponsor | [ ] Yes / [ ] No | | `Pending` |

---

## 10. TIMELINE

| Milestone | Target Date | Owner | Status |
|---|---|---|---|
| Requirements finalized | | Analyst | |
| Solution design approved | | Analyst | |
| Build complete | | Developer | |
| QA complete | | QA | |
| UAT / Business review | | Requestor | |
| Deployment | | Developer | |

---

## 11. INSTRUCTIONS FOR CLAUDE

*This section is written directly to Claude. Follow these instructions every time you work on this solution.*

1. Always read this entire template before taking any action.
2. If any required field above is blank or marked `[PENDING]`, flag it to the user before proceeding.
3. Treat all data in this project as **[insert sensitivity level]** unless otherwise specified.
4. Your primary audience for outputs is **[end user role]** — calibrate tone, complexity, and format accordingly.
5. When in doubt about scope, refer back to Section 3 (The Request) and Section 6 (Constraints).
6. Do not deviate from the approved integrations listed in Section 6.
7. [Add any additional standing instructions specific to this solution]

---

## 12. CHANGE LOG

*The Analyst maintains this log. Every change to this template should be recorded here — no matter how small.*

| Date | Changed By | Section(s) Affected | What Changed & Why |
|---|---|---|---|
| [YYYY-MM-DD] | [Name] | [e.g., Section 4] | [e.g., Added PII flag after legal review confirmed client names are present in input forms] |
| | | | |

---

*Template Version: 1.0 | Maintained by: AI Solutions Analyst*
