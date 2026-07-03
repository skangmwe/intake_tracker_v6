# pre-intake-form-notes.md
## Recommendations for the Requester-Facing Intake Form
**Audience:** AI Solutions Lead + Analyst Manager
**Existing artifact:** `Intake System/AI_Intake_Form.html` (requester-facing, 867 lines, writes to `AISolutionIntake.xlsx`)

---

## Summary

The existing `AI_Intake_Form.html` is a strong foundation. It is genuinely requester-facing (placeholder copy like "Your name", "Describe the problem you're trying to solve..."), captures most of the information an analyst needs to walk into intake prepared, and persists to a tracking spreadsheet. **Do not replace it.** The recommendations below are additive — small fields and prompts that close known gaps and make the form do more of the intake heavy lifting before the analyst's first conversation.

## What's already strong

The current form already captures: project name and description, requestor and business sponsor, workstream and PG/department, business value (qualitative and quantitative), priority/urgency/desired deadline, expected user count, data sensitivity, compliance flags, existing-solution check, preferred AI model, solution format, supporting docs availability, and notes. That's the bulk of Sections 1–4 of the solution-requirements.md.

## Recommended additions

These are gaps that, when filled in by the requester before intake, save 20–45 minutes of the analyst's first session.

**1. "What have you already tried?"** — Free text. Surfaces existing workarounds (a Word template, a Power Automate flow, a paid SaaS tool, ChatGPT in the personal account) and the reasons they didn't work. Often the answer reveals that the request is really about a workflow change, not an AI need.

**2. "What would success look like in one sentence?"** — Free text. The requester's own framing of "good output" feeds directly into Section 5 of the solution-requirements.md (acceptance criteria) and is the seed QA validates against. Phrased as one sentence specifically to force prioritization.

**3. "How often does this task happen today, and what happens if it isn't solved?"** — Two short fields. Frequency × consequence = value, and this pair gives the analyst the data to challenge tier and priority claims that don't pass scrutiny.

**4. "Who needs to approve this before it can be built?"** — Free text or structured (requester / sponsor / IT / Legal / Practice Group head / Compliance). Catches approval-chain gaps that otherwise surface mid-build and stall delivery.

**5. "Have you checked the Solution Registry for similar existing solutions?"** — Yes / No / Need help checking, with a link to the [SOLUTION-REGISTRY.md](https://mcdermottwillemery.sharepoint.com/sites/AI/SiteAssets/Solutions/Registry/SOLUTION-REGISTRY.md) on SharePoint. Reduces duplicate intake conversations. Also lets the analyst quickly redirect ("the Litigation Intake Assistant already does this — let me connect you").

**6. "Can you provide a sample of the input data at intake?"** — Yes / Will provide before build / No, file attachment optional. Sets the expectation early that sample data is required before development and surfaces sensitivity issues before they become blockers.

**7. "Are there things this solution must NOT do?"** — Free text. Boundaries are as important as goals, and requesters rarely volunteer them unless asked. Often surfaces confidentiality scope, audience restrictions, or content categories to avoid.

## Field mapping into the solution-requirements.md

The pre-intake form should pre-populate as many solution-requirements.md fields as possible, so the analyst's intake conversation is about *refining* and *probing*, not data entry. Recommended mapping:

| Pre-intake form field | solution-requirements.md destination |
|---|---|
| Project Name, Description | Section 1: Solution Identity, Section 3: The Request |
| Requestor, Business Sponsor | Section 2: Requestor & Stakeholders |
| PG / Department, Workstream | Section 2: Requestor & Stakeholders |
| Data Sensitivity, Compliance Flag | Section 4: Data & Inputs (Sensitivity), Section 11: Instructions for Claude |
| Expected User Count, Solution Format | Section 5: Outputs & Success Criteria |
| Business Value, Hours Saved, Cost Savings | Section 3: The Request (Problem) |
| Desired Deadline, Priority, Urgency | Section 10: Timeline |
| Existing Solution check | Triggers registry check before intake (skill Step 0) |
| What success looks like (new) | Section 5: Acceptance Criteria |
| What must NOT happen (new) | Section 6: Constraints & Boundaries |
| Approval chain (new) | Section 9: Approvals Required |
| Sample data commitment (new) | Section 4: Data Schema (sets PENDING expectation) |

## Positioning in the workflow

The form sits **before** the product-requirements-gathering skill kicks off. Workflow:

1. Requester (or team admin on their behalf) fills out the pre-intake form.
2. Form submission lands in `AISolutionIntake.xlsx` and (recommended) sends a notification to the Analyst inbox.
3. Analyst reviews the submission. If it's a registry duplicate, redirects without scheduling intake. If it's out of scope, declines with explanation. If it's a real new request, schedules intake and walks in with the solution-requirements.md pre-populated.
4. The product-requirements-gathering skill runs the intake conversation, refining and filling gaps rather than starting from zero.

This positioning matters: without the pre-intake form gating the queue, the analyst's first 30 minutes of every intake is repeated data-collection. With it, the analyst spends that time on the high-value questions the skill is designed for.

## Open question for the Solutions Lead

Should the pre-intake form be self-service for all firm personnel, or gated through a team admin or practice group coordinator? Self-service maximizes volume and reduces friction; gated submissions improve quality but slow the front door. Recommend self-service with a clear "we'll respond within X business days" expectation, then revisit after 90 days if the noise-to-signal ratio is too high.

---

*Companion to `Intake System/AI_Intake_Form.html`. Maintained by the AI Solutions Lead and Analyst Manager.*
