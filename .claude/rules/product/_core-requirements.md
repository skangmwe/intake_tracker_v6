# requirements.md — Requirements / Intake Role

## Role-Level Configuration | McDermott Will & Schulte

**Version:** 1.0 | **Last Updated:** May 2026 | **Owner:** AI Solutions Lead
**Deploy to:** `.claude/rules/product/_core-requirements.md`

---

## ROLE CONTEXT

This folder is where the AI Solutions Analyst captures requirements for new solutions before any design or build work begins. Sessions here are intake interviews. The deliverable from any session in this folder is a completed `artifacts/docs/product/solution-requirements.md` (plus sample data and a prototype reference when applicable) that downstream UX, Development, and QA teammates can rely on.

The Analyst is the requester's primary interface with the AI Solutions team. Their job is to fully understand the need, classify it correctly, validate it with a working prototype, and hand off a clean package — not to commit to architecture, timelines, or technical implementation decisions.

The Analyst's session spans two tools: **Claude Code (this environment)** for intake and the final brief, and **Claude Design (claude.ai/design)** for prototyping. See the Workflow section below.

---

## REFERENCE MAP

Authoritative artifacts referenced from this file. None of these are duplicated here — go to the source.

- `.claude/rules/product/standards.md` — firm-wide quality and tone standards (Audience Levels A/B/C)
- `.claude/rules/product/roles.md` — role definitions, responsibilities, scope boundaries, escalation paths
- `artifacts/docs/product/solution-requirements.md` — the intake artifact every solution produces
- [SOLUTION-REGISTRY.md](https://mcdermottwillemery.sharepoint.com/sites/AI/SiteAssets/Solutions/Registry/SOLUTION-REGISTRY.md) / [SOLUTION-REGISTRY.xlsx](https://mcdermottwillemery.sharepoint.com/sites/AI/SiteAssets/Solutions/Registry/SOLUTION-REGISTRY.xlsx) on SharePoint — index of deployed and in-flight solutions
- `.claude/rules/product/patterns.md` — solution patterns library (Extract / Summarize / Draft / Classify-Route / Compare / Generate-from-Template)
- `.claude/rules/product/usage-metrics.md` — measurement framework (adoption / value / health / satisfaction / portfolio)
- `product-requirements-gathering` skill — invoked at the start of every intake

---

## STANDING INSTRUCTIONS

### Always run the product-requirements-gathering skill at the start of a new intake

If the Analyst opens a session with anything that sounds like a new request — _"new ask from Litigation"_, _"help me capture this"_, _"start a new solution"_ — invoke the `product-requirements-gathering` skill before asking anything else. Do not freelance an intake conversation.

### Check the Solution Registry before the interview

Before the first intake question, read the [SOLUTION-REGISTRY.md](https://mcdermottwillemery.sharepoint.com/sites/AI/SiteAssets/Solutions/Registry/SOLUTION-REGISTRY.md) on SharePoint. If a similar solution already exists for the same group, surface it to the Analyst and let them decide whether to proceed or coordinate.

### Always request sample data

Even when the Analyst describes the input verbally, ask for a sample file. If they don't have one, mark the Data Schema as `[PENDING — sample data to be provided before build]` and keep moving — but never let intake conclude with no plan to obtain sample data before handoff.

### Confirm data sensitivity explicitly

Sensitivity classification (Public / Internal / Confidential / Privileged / PII / Regulated) must be captured in the template before handoff. If unclear, mark `[PENDING — confirm with IT/Legal]` and surface it in the summary at the end.

### Capture testable acceptance criteria for QA

Section 5 of the solution-requirements.md ("Outputs & Success Criteria") is QA's acceptance contract. Push the Analyst to define success in concrete, testable terms — not just _"the report looks good"_ but _"the report includes columns X/Y/Z, totals match source within $0.01, and runs in under 60 seconds."_ If the requester can't articulate testable criteria yet, mark `[PENDING — acceptance criteria to be confirmed with requester before QA]` so QA knows the gap is open.

---

## WORKFLOW — CLAUDE CODE → CLAUDE DESIGN → CLAUDE CODE

The Analyst owns the full requirements-and-prototype cycle, with the UI/UX designer refining afterward. Run it in this order:

1. **Intake in Claude Code (this folder).** Run the product-requirements-gathering skill end-to-end. The skill fills in the templated `artifacts/docs/product/solution-requirements.md` that the Tier 1 scaffold already creates at the project root — no per-solution subfolder is created, because a Tier 1 project is itself a single solution. The skill produces a populated `artifacts/docs/product/solution-requirements.md` with confirmed sensitivity classification, tier, and acceptance criteria. Do not skip ahead to prototyping until the brief is complete.
2. **Prototype in Claude Design (claude.ai/design).** Upload the `artifacts/docs/product/solution-requirements.md` (and sample data, if cleared per the sensitivity rule below) to seed the session. Build a working prototype with the requester in the loop where possible — the prototype doubles as a _"is this what you meant?"_ clarification artifact.
3. **Return to Claude Code.** Save the prototype URL and any exported artifacts to the project folder. Update Section 5 of the `artifacts/docs/product/solution-requirements.md` so acceptance criteria reflect the prototype the requester signed off on. Add a Change Log entry noting the prototype iteration.
4. **Designer refinement (handoff out of this role).** The UI/UX designer takes the prototype, refines for craft, accessibility, brand consistency, and edge cases, then hands the refined prototype to Development along with the brief. The Analyst is available for clarification but does not own further iteration.

### Context packet — what travels from Claude Code into Claude Design

- The `artifacts/docs/product/solution-requirements.md` itself (upload as the source document for the Design session).
- Sample data, **only if it passes the sensitivity rule below.**
- The tier classification and any approved-integrations constraints — paste these into the Design session as standing context, since CLAUDE.md does not load there.

### Sensitivity at the tool boundary — read this carefully

CLAUDE.md governance does **not** follow you into Claude Design. The web tool is governed by Anthropic's terms and your firm's data-handling policy, not by the rules in this file.

- **Default rule:** prototype with synthetic, sanitized, or dummy data. Never upload real privileged, confidential client, PII, or regulated content to Claude Design without explicit IT/Legal approval.
- If a prototype genuinely requires real firm data to be valid, **stop and escalate to the AI Solutions Lead** before proceeding. Do not make the call unilaterally.
- When in doubt, sanitize. A prototype with dummy data is recoverable; a privileged-data leak is not.

### Prototype as part of the acceptance contract

Once a prototype is signed off by the requester, it becomes part of what QA validates against. Any **material** prototype change after handoff requires a corresponding update to Section 5 of the `artifacts/docs/product/solution-requirements.md` before Development picks the work up — otherwise QA will be testing against an outdated brief.

### Handoff to Code output is a starting point, not a deployable

Claude Design's "Handoff to Code" produces runnable HTML/CSS/JS, but it does not know about firm security standards, secrets handling, observability, compliance gates, or integration with internal systems. Treat the output as input to Development, never as a deployable artifact. Dev review is required before anything ships.

---

## TIER GUIDANCE (mirrors the skill — apply consistently)

Default to the lowest tier that fits. Escalate only when criteria are clearly met. Most solutions are Tier 1 or Tier 2; Tier 3 is the exception.

- **Tier 1** — human always present, no integrations, output stays in Claude Code.
- **Tier 2** — runs automatically, connects to a firm system, or has a UI beyond Claude Code. Capture the integration needs in the template (which systems, what data, what auth/access); the development team assesses these against the approved integrations list at build time and decides reuse vs. new build. A solution used by many people across a Practice Group is still Tier 2.
- **Tier 3** — **only** when two or more of these are clearly true: serves external clients, requires custom auth beyond existing MCPs, requires building a new MCP from scratch, or deeply integrates three or more firm systems.

Do not propose Tier 3 just because a solution is high-visibility, used widely, or labeled "enterprise." When you are uncertain between two tiers, default to the lower one and note the uncertainty in the Change Log.

---

## HANDOFF RULES — WHAT LEAVES THIS FOLDER

A completed intake hands off the following to UX / Development / QA:

1. **`artifacts/docs/product/solution-requirements.md`** — fully populated, every gap marked `[PENDING — {what / by whom}]`.
2. **Sample data file(s)** — uploaded by the Analyst and referenced by filename and date in the Data Schema section.
3. **Sensitivity classification** — explicit, confirmed, recorded in Section 11.
4. **Tier classification** — populated in Section 1; never blank.
5. **Acceptance criteria** — testable success criteria captured in Section 5; this is QA's contract for sign-off.
6. **Prototype reference** — URL and any exported artifacts saved to the project folder, linked from the template; noted as requester-signed-off where applicable.
7. **Change Log entry** — dated, noting "Initial requirements captured via intake interview" and any tier-classification uncertainty.

Once the template is saved, remind the Analyst to add a row to [SOLUTION-REGISTRY.md](https://mcdermottwillemery.sharepoint.com/sites/AI/SiteAssets/Solutions/Registry/SOLUTION-REGISTRY.md) and [SOLUTION-REGISTRY.xlsx](https://mcdermottwillemery.sharepoint.com/sites/AI/SiteAssets/Solutions/Registry/SOLUTION-REGISTRY.xlsx) on SharePoint after deployment.

---

## WHAT NOT TO DO IN THIS FOLDER

- **Do not write code, pseudocode, or technical specs.** That's Development's role; surfacing implementation detail too early biases the design.
- **Do not commit to architecture decisions** (which MCP, which storage, which framework). Note constraints and preferences in the template; let Development design within them.
- **Do not promise timelines.** Capture the requested deadline as input only; actual scheduling is set with the Dev Lead.
- **Do not change tier classification after handoff without notifying the Solutions Lead** — re-tiering mid-build has knock-on effects for staffing and approvals.
- **Do not skip the registry check** to save time. Duplicate-solution avoidance is the single highest-leverage thing this role does.
- **Do not upload privileged, confidential client, PII, or regulated data into Claude Design** without IT/Legal approval. Sanitize first or escalate to the AI Solutions Lead.
- **Do not treat Claude Design's "Handoff to Code" output as deployable.** It is input to Development, full stop. Dev review is mandatory before anything ships.
- **Do not iterate prototypes endlessly without updating the brief.** Material prototype changes require a corresponding update to Section 5 of the template, or QA tests against a stale contract.

---

## ESCALATION CHAIN — INTAKE-SPECIFIC

| Situation                                                                  | Escalate To                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Analyst unsure whether a solution is Tier 2 vs. Tier 3                     | Default Tier 2, log uncertainty, flag to AI Solutions Lead in handoff                      |
| Sensitivity classification cannot be confirmed by Analyst                  | AI Solutions Lead → IT / Legal as needed                                                   |
| Request appears to duplicate an active solution                            | Surface to Analyst; if they want to proceed anyway, AI Solutions Lead reviews              |
| Requester pushes for a specific implementation choice                      | Capture as a preference, defer technical commitment to Dev Lead                            |
| Intake reveals scope much larger than initial framing                      | Pause intake, notify AI Solutions Lead before continuing                                   |
| Prototype seems to require real privileged/PII/regulated data to be useful | Stop — escalate to AI Solutions Lead → IT/Legal before uploading anything to Claude Design |

---

## LINK MAP

- Template to fill: `artifacts/docs/product/solution-requirements.md`
- Registry to check: [SOLUTION-REGISTRY.md](https://mcdermottwillemery.sharepoint.com/sites/AI/SiteAssets/Solutions/Registry/SOLUTION-REGISTRY.md) (also [SOLUTION-REGISTRY.xlsx](https://mcdermottwillemery.sharepoint.com/sites/AI/SiteAssets/Solutions/Registry/SOLUTION-REGISTRY.xlsx)) on SharePoint
- Approved integrations list: owned and maintained by the Development team; not consulted during intake

---

_Maintained by the AI Solutions Lead. Changes require review and must be logged with date and rationale._
