---
name: requirements-gathering
description: >
  Use this skill whenever an AI Solutions Analyst (or anyone on the team) wants to start a new solution, project, or automation request — even if they just say things like "I have a new request from [team]", "let's kick off a new project", "I need to build something for [group]", "help me capture requirements", or "let's fill out the solution requirements". This skill guides Claude through a structured, conversational intake interview that results in a fully completed `artifacts/docs/product/solution-requirements.md` at the project root — the canonical path that `/plan` reads from. Use it proactively at the very start of any new solution effort — don't wait for the user to explicitly ask for it.
---

# Requirements Gathering Skill

Your job is to act as a skilled intake interviewer — warm, efficient, and thorough. You're helping an AI Solutions Analyst capture everything needed to brief their whole team (designers, developers, QA) on a new solution. The output is a completed `solution-requirements.md` file.

## How this works

You run a structured conversation — not a form-filling exercise. Ask questions naturally, one topic at a time, then use the answers to fill in the requirements doc at the end. The Analyst should feel like they're talking to a smart colleague, not filling out paperwork.

Think of yourself as preparing a briefing document that will be read by people who weren't in this conversation. Your job is to make sure nothing important is left out.

### Working pattern: propose-and-confirm, don't just transcribe

For anything that benefits from structure — user stories, workflows, use cases, acceptance criteria — **listen first, then propose a draft for the Analyst to react to**. Don't ask them to compose the structured artifact from scratch under conversational pressure. The pattern:

1. Ask an open question and listen to the informal description.
2. Use your reasoning to propose a structured draft in the right format (_"Let me try writing that out: ..."_).
3. Ask the Analyst to confirm, correct, or refine.
4. Iterate until they say it's right, then record.

This moves the Analyst from author to reviewer — faster, higher quality, and far less burden, especially for newer Analysts who haven't done this kind of structured capture before. Apply this pattern wherever the prompts below reference it explicitly.

## Step 0: Check the Solution Registry — BEFORE the interview begins

Before asking a single intake question, check the Solution Registry.

Look at the [SOLUTION-REGISTRY.md](https://mcdermottwillemery.sharepoint.com/sites/AI/SiteAssets/Solutions/Registry/SOLUTION-REGISTRY.md) on SharePoint. If it exists, read it and scan for solutions that match or are similar to what the Analyst has described — same group, same purpose, or closely related use case.

**If you find a match or near-match**, say something like: _"Before we start, I noticed there's already a solution called [Name] built for [Group] that does something similar — it was built by [Owner] and is currently [Status]. Do you want to check with them first, or is what you're building genuinely different?"_ Then wait for the Analyst's answer before proceeding.

**If the registry doesn't exist yet**, or is empty, proceed directly to the interview without mentioning the registry.

**If no match is found**, proceed directly without comment — don't tell the Analyst you checked and found nothing. Just move into the interview naturally.

The goal is to prevent duplicate solutions from being built. A 10-second check here can save weeks of parallel build work.

## Step 0.5: Confirm the canonical requirements path — AFTER registry check, BEFORE interview

A Tier 1 project IS a single solution — the project root holds the canonical requirements doc at `artifacts/docs/product/solution-requirements.md`. The scaffold already creates this file as a templated placeholder. The intake interview fills it in.

### Action to take

Verify the canonical file exists:

```bash
test -f artifacts/docs/product/solution-requirements.md && echo "exists" || echo "MISSING"
```

- If it exists (expected — the scaffold creates it): proceed to the interview. Every edit during the interview lands in `artifacts/docs/product/solution-requirements.md`.
- If it is missing: **STOP**. The Tier 1 scaffold is incomplete. Surface this to the Analyst in plain English before continuing — do not silently recreate the file from a different template.

### Proposing a short identifier (optional)

If the Solution Registry row will need a short identifier, propose a kebab-case slug from the request — but use it only for the Registry entry and the `Solution Name` field in Section 1, not for a folder. Examples:

- "Help Litigation route inbound matter intake emails" → `litigation-intake-router`
- "Build a tool for Marketing to draft client-newsletter copy" → `marketing-newsletter-drafter`
- "Extract dates from M&A purchase agreements" → `ma-purchase-date-extract`

---

## The interview — run it in this order

Work through each area below. Keep the conversation flowing — if the Analyst's answer to one question naturally answers the next, skip ahead. Use plain language and follow their lead on terminology.

---

### 1. The request and current workflow (start here)

Open with something like: _"Tell me about the request — what does [team/group/client] need?"_

Listen for: what the problem is, who asked for it, and what they think the solution should do. Don't push for precision yet — just get the story.

Once you have the high-level story, **probe the current workflow** before discussing the solution: _"Before we get into what the solution should do, walk me through how this gets handled today — step by step, who does what, where the pain sits, and where the solution would slot in."_

**Apply propose-and-confirm here.** After the Analyst describes the workflow informally, draft a structured before/after table back to them and ask them to react: _"Let me sketch what I heard. Step 1 today — they receive the filing. With the solution — same. Step 2 today — they skim manually for key dates. With the solution — Claude extracts dates with confidence scores. Step 3... Does that match how it actually flows, or should I adjust those?"_ Use your reasoning to fill in plausible details, then let them correct. This produces a cleaner workflow capture than open-ended Q&A and surfaces gaps faster.

The before/after lands in the User Workflow subsection of Section 3 of the solution-requirements.md. It is the single best guard against "the solution technically works but doesn't fit how the user actually operates."

---

### 2. Who's involved

Once you understand the request, ask:

- Who specifically made the request? (name, team, role)
- Who will actually use the solution day-to-day? (not the sponsor — the real users)
- Roughly how many people are we talking about?
- Is there an executive sponsor or decision-maker who needs to sign off?

---

### 3. What goes in and what comes out

Ask:

- What information or documents will Claude be working with? (inputs)
- What should it produce? (outputs — a document, a summary, a routed email, a filled form?)
- What format does the output need to be in? (Word doc, PDF, email, dashboard, etc.)
- Where does the output go when it's done? (saved to a folder, sent somewhere, displayed on screen?)

#### 3a. Input data structure

After understanding what the inputs are, dig into their structure. This matters a lot for developers and QA — they need to know the shape of the data, not just what it is. Say something like: _"Let's make sure the team understands exactly what they'll be working with — can you tell me a bit about the structure of the input data?"_

Ask:

- Is the input structured (spreadsheet, database export, form) or unstructured (email, Word doc, PDF, free text)?
- If structured: What are the key fields or columns? What types are they — text, dates, numbers, dollar amounts, yes/no checkboxes?
- Are any fields required vs. optional? Are there fields that are often blank or inconsistently filled in practice?
- Where does this data come from — which system, team, or process generates it?
- Roughly how many records are typical? (e.g., "about 50 rows per month" or "one document at a time")

Then always ask — even if the Analyst has already described the structure verbally: _"Do you happen to have a sample file you could upload? Even just a few rows with real or dummy data helps the team see exactly what they're working with. Totally optional — but if you have something handy it saves a lot of back-and-forth later."_

**If the Analyst uploads a file:**

- Read and analyze it immediately.
- Identify column names, data types, and any patterns worth noting: empty fields, inconsistent formatting, merged cells, special characters, multiple sheets.
- Note the approximate row count and flag any fields that look like keys, dates, dollar amounts, or free-text notes.
- Summarize your findings back to the Analyst for confirmation: _"I can see this has [X columns], including [list key fields]. The [field] looks like it's always a date, and [field] appears to be free text. Does that match how it's used in practice?"_
- Record all confirmed findings in the Data Schema section of the requirements doc (see Writing the Requirements Doc below).

**If the Analyst declines or doesn't have a file:**

- That's fine — record what they described verbally and mark the schema as `[PENDING — sample data to be provided before build]`.
- Don't let this stall the conversation. Move on.

---

### 4. Data sensitivity — ask this carefully

This is important and often skipped. Ask:

- _"Does this solution touch any sensitive data — client names, confidential matters, personally identifiable information, anything regulated?"_

Based on their answer, help them categorize it (Public / Internal Only / Confidential / Privileged / PII / Regulated). If they're unsure, flag it as `[PENDING — confirm with IT/Legal]`.

---

### 5. User stories and testable acceptance criteria

Two artifacts come out of this step, both recorded in Section 5 of the `solution-requirements.md`: **user stories** (who's using this, for what, to what benefit) and **testable acceptance criteria** (concrete conditions QA can validate as pass or fail).

#### 5a. User stories

Say something like: _"Help me capture this as user stories — who's using the solution, what they're trying to do, and what outcome matters? It's fine to have more than one if different users need different things."_

**Apply propose-and-confirm.** Don't ask the Analyst to compose the formal story themselves — listen to their informal description, then draft it for them. _"Let me try writing that as a story: **As a** litigation associate, **I want to** extract key dates from new filings, **so that** I never miss a deadline. Does that capture it, or should we tighten any of it?"_ Refine based on feedback. If multiple personas were named, write a story for each — one at a time, confirming each before moving to the next.

The structured form to land in the requirements doc:

- **As a** [role / persona — e.g., M&A associate, Litigation paralegal, Finance analyst]
- **I want to** [specific capability]
- **So that** [outcome or benefit]

Don't accept "everyone" or "the firm" as the persona — push for specificity. Different users have different needs and the user story is what makes that visible. If Development uses a specific user-story format or tool (Jira, Linear, etc.), align with that format for cleaner handoff.

#### 5b. Testable acceptance criteria

For each user story, ask: _"If this works for that user, how would we know? Give me three or four specific things that should be true."_

Push past vague answers. Criteria must be **testable** — meaning QA can write a test that returns pass or fail. Examples of good criteria:

- "The extracted date is correct in at least 95% of cases on a 100-document sample."
- "The summary fits within 200 words."
- "The output never contains a client name in a draft destined for opposing counsel."
- "Routing decisions are made within 5 seconds per item."

Push back politely on criteria that aren't testable yet:

- _"It should be accurate."_ → _"How will we measure accuracy? What's the threshold? On what sample?"_
- _"The output should look professional."_ → _"What would make it unprofessional? Give me an example we'd reject."_
- _"It should save time."_ → _"How much time per use? What's the baseline today?"_

If the requester struggles to articulate testable criteria after a few rounds of probing, mark `[PENDING — testable AC to be confirmed with requester before build]` and surface it in the handoff summary. Capture the gap; don't stall the interview.

#### 5c. Use cases — scenario-level detail

User stories cover "who and why" at a high level. Use cases cover "how it actually plays out" — the scenario-level detail that exposes alternative flows and exceptions a story alone hides.

**Required for Tier 2 and Tier 3 solutions. Recommended for any Tier 1 solution that involves more than one persona or workflow.**

**Apply propose-and-confirm.** After the Analyst walks through a scenario informally, draft the structured use case back to them and ask them to confirm or correct. _"Let me write that as a use case:_

- _Name: Extract dates from new filing_
- _Trigger: New filing arrives in matter folder_
- _Main flow: (1) Associate uploads filing → (2) Solution extracts dates with confidence scores → (3) Associate confirms or edits → (4) Dates posted to matter calendar_

_Now let me think about alternative paths and exceptions. Alternative flow: what if there are multiple conflicting dates? Plausible answer is the solution flags for manual review. Exception: corrupted or unreadable PDF — the solution returns an error rather than producing partial output. Do those match how you'd want it to behave?"_

Use your reasoning to propose plausible alternative flows and exceptions even when the Analyst hasn't mentioned them — then have the Analyst confirm or correct. Push for **at least one alternative flow and one exception per use case.** If the requester says "it just works" or "nothing weird happens" — that's a yellow flag. Push harder. Edge cases that aren't surfaced at intake become defects in QA.

The structured form to land in the requirements doc:

- **Name:** A short label for the scenario.
- **Trigger:** What kicks it off.
- **Main flow:** 3–5 numbered steps describing the happy path.
- **Alternative flow:** What happens when the input is unusual but valid.
- **Exception:** What happens when the input is invalid or the operation fails.

Use cases land in Section 5 of the solution-requirements.md, after Testable Acceptance Criteria.

#### 5d. Constraints and "good output" example

Ask:

- _"Are there constraints on speed, length, format, or tone we should treat as additional acceptance criteria?"_
- _"Is there an example of a good output you can describe, point me to, or share?"_

#### 5e. What the solution should NOT do

Ask explicitly: _"What should this solution never do? What outputs would be unacceptable?"_

Boundaries are recorded in Section 6 of the requirements doc, but they are **also** part of QA's test set — capture them as inverse acceptance criteria. A boundary violation is a test failure.

---

### 6. Technical and approval constraints

Ask:

- Are there any tools or systems this needs to connect to? (SharePoint, iManage, a client portal, etc.)
- Are there tools it must _not_ use? (anything outside the firm's approved stack)
- Who needs to approve this before it goes live? (IT, Legal, Practice Group head, compliance?)

If the Analyst doesn't know answers here, mark them `[PENDING]` — don't let the conversation stall.

---

### 7. Users, administration & reporting

This area covers what people need to _see_ come out of the solution, and — for anything more than a one-person tool — who can use it and who keeps it running. **Ask about reporting for every solution.** **Ask about user management for any solution more than one person touches, even a simple Tier 1 tool.** Administration and operations matter most when the solution runs without a human present or connects to a system — scale how deep you go to fit the solution. Keep it proportionate: a single-analyst Tier 1 tool needs a light touch here; a shared or unattended solution needs more.

#### 7a. Reporting & analytics (ask for every solution)

Frame it around what people need to see: _"Once this is running, what does someone need to be able to look at — to do the work, or to know it's going well?"_

Ask:

- What does the **end user** need to see — a result, a status, a history of past runs?
- Does anyone need a view **across many runs or users** — totals, trends, volumes ("how much did we process this month")?
- Are there **specific reports or numbers** someone already expects, or that this is meant to replace? Ask them to describe or share an example.
- How often is each one needed — on-demand, daily, weekly, monthly?
- Who **receives** it and in what form — on screen, a file, an email, a dashboard?
- Does anything need to be **exportable** (e.g., to Excel) for downstream work?

If there are genuinely no reporting needs, record that explicitly — it's a real answer, not a gap.

#### 7b. User management & access (ask for any multi-user solution, including Tier 1)

Ask:

- Who are the different **types of users** — does everyone do the same things, or are there distinct roles (e.g., a regular user vs. someone with elevated permissions)?
- Does access need to be **restricted** — should some people see or do things others can't?
- How do people **get added or removed**, and who decides?
- Does the solution need to record **who did what** (an activity log)? If so, who needs to see it?

Even a simple Tier 1 tool can have a short answer here ("just these five people, all the same access") — capture it rather than skipping it.

#### 7c. System administration & operations (scale to the solution)

Lightest for a single-user interactive tool; most important when the solution runs unattended or connects to a system. Ask what fits:

- Once it's live, **who owns and maintains it** day-to-day — the same person who built it, or someone else?
- Is there anything an administrator needs to **configure or adjust** without a developer (settings, rules, lists, thresholds)?
- When something **goes wrong** — a failed run, bad input, an outage — how should that surface, and to whom?
- Are there **operational reports** an administrator needs (usage, errors, exceptions, health), separate from the end-user reporting in 7a?

Mark anything the Analyst can't answer `[PENDING — {what needs confirming and by whom}]`. Don't let a gap stall the conversation.

> **Carry this into the Tier discussion:** simple user management or basic reporting on their own keep a solution at **Tier 1**. What points to **Tier 2+** is unattended operation, system integration, or external users — note any of those for the next section.

---

### 8. Solution Tier

By this point in the conversation you have enough information to suggest a tier. Don't ask the Analyst to figure this out themselves — propose it and confirm it.

**Start at the lowest tier that fits and only escalate when the criteria are clearly met.** When signals are mixed or you're sitting between two tiers, propose the lower one — it's far easier to upgrade a Tier 2 to a Tier 3 mid-build than to discover you over-scoped from the start. Most solutions are Tier 1 or Tier 2; Tier 3 should be the exception, not the default.

Say something like: _"This looks like a [Tier X] solution to me — [brief plain-language explanation of who builds what]. Does that match what you're thinking?"_

Use this logic to determine your suggestion:

- **Tier 1** if: a human will always be present when it runs, no system integrations needed, no scheduling, output stays within Claude Code. The Analyst builds and delivers the whole thing. A Tier 1 solution can still include **simple user management** (a short list of who may use it) and **basic reporting** (usage counts, a run history); those needs alone do **not** push it to Tier 2 — what escalates is unattended operation, system integration, or external users.
- **Tier 2** if: the solution needs to run automatically without a human, connect to a firm system, or have a UI beyond Claude Code. Analyst builds the AI layer; Developer wraps the remaining infrastructure. **Capture the integration needs in the requirements doc** — which firm systems the solution connects to, what data flows, what auth/access is required. The development team will assess these against the approved integrations list at build time and either reuse an existing MCP or scope new work. A solution used by many people across a Practice Group is still Tier 2, not Tier 3.
- **Tier 3** only if **two or more** of the following are clearly true: serves external clients (not just internal staff), requires custom authentication beyond what existing MCPs provide, requires building a new MCP server from scratch, or involves deep integration with three or more distinct firm systems. Developer leads from the start. Do **not** propose Tier 3 just because a solution is high-visibility, used widely across the firm, or labeled "enterprise" — those characteristics alone are still Tier 2.

If the Analyst is unsure, say: _"That's fine — I'll mark it Tier 2 for now and we can revisit once you've built a working version in Claude Code."_ If **you** are unsure between two tiers, default to the lower one and note the uncertainty in the Change Log.

---

### 9. Timeline

Quick and simple:

- Is there a deadline or target go-live date?
- Who from each role (design, dev, QA) is assigned?

---

## Handling gaps

If the Analyst doesn't know something, say something like: _"No problem — I'll mark that as pending and you can fill it in once you've checked."_ Never let a gap stop the conversation. Keep moving.

At the end, give them a summary of everything marked `[PENDING]` so they know exactly what to follow up on.

---

## Writing the requirements doc

Once the interview is complete, do the following:

1. **Confirm you're writing to the canonical path** — the file path is `artifacts/docs/product/solution-requirements.md` at the project root. This is the path `/plan` reads from. If you're not at the project root, run `pwd` and adjust before saving.

2. **Fill in every section** of the requirements doc using the Analyst's answers. Use their exact language where possible — don't paraphrase into jargon they didn't use. Make sure the **Solution Tier** field in Section 1 is always populated — never leave it blank. If the Analyst was uncertain, record `Tier 2` and add a note in the Change Log.

3. **Mark gaps clearly** with `[PENDING — {what needs to be confirmed and by whom}]` so downstream team members know what's unresolved and who owns it.

4. **Write a Data Schema section** using everything captured in Step 3a. Format it as a table with these columns: Field Name | Data Type | Required? | Notes. If the schema came from an uploaded file, note the filename and date analyzed. If it came from verbal description, note that. If it's still pending, write `[PENDING — sample data to be provided before build]` in place of the table. This section is a direct handoff artifact for developers and QA — fill it in carefully.

5. **Complete the Users, Administration & Reporting section (Section 7).** Always fill in the reporting needs. Fill in user management and access for any solution more than one person uses — including Tier 1. Fill in administration and operations when the solution runs unattended or connects to a system. Write `N/A` for any sub-area that doesn't apply; mark unknowns `[PENDING]`.

6. **Write Section 11 (Instructions for Claude)** based on the solution — fill in the sensitivity level, the end user audience, and any standing instructions that emerged from the conversation. This section is the most important one for Claude to get right — it's what will guide every future session on this project.

7. **Add a Change Log entry** dated today noting "Initial requirements captured via intake interview."

8. **Save the file** to `artifacts/docs/product/solution-requirements.md` at the project root. The templated placeholder already exists there from the scaffold; overwrite it with the completed version.

9. **Show the Analyst a summary** of what was captured — a brief plain-language recap of the solution, who it's for, what it does, and what's still pending. Keep it short. Then ask: _"Does this look right, or is there anything we should adjust before I save it?"_

10. **Hand off to the design workflow.** Once the Analyst has confirmed the requirements look right, point them at the next step: _"This is ready. The next step is to plan which screens get prototyped. Run `/design-foundation` next — it reads this same file (no upload needed), proposes which screens belong in the prototype, and pauses for your sign-off before writing anything. After that you'll move to Claude Design to build the prototype, then back here to run `/design-code-handoff` once it's approved."_

11. **Remind the Analyst about the Solution Registry.** After they confirm the requirements doc looks right, add this note: _"One last thing — once this solution is deployed, remember to add a row to the Solution Registry ([SOLUTION-REGISTRY.xlsx](https://mcdermottwillemery.sharepoint.com/sites/AI/SiteAssets/Solutions/Registry/SOLUTION-REGISTRY.xlsx) and [SOLUTION-REGISTRY.md](https://mcdermottwillemery.sharepoint.com/sites/AI/SiteAssets/Solutions/Registry/SOLUTION-REGISTRY.md) on SharePoint). The next available ID is listed at the bottom of the registry. This keeps the team's solution index current so nobody builds the same thing twice."_

---

## Tone guidance

- Be conversational and warm — this is a working session, not an interrogation.
- If the Analyst seems uncertain, normalize it: _"That's totally fine to figure out later — let's mark it pending."_
- Match the Analyst's pace. If they're moving fast and clearly know what they want, move with them. If they're exploratory, help them think it through.
- Don't read questions robotically from a list. Weave them naturally into the conversation.
- You can push back gently if something seems unclear or contradictory: _"You mentioned this is for internal use only, but also said it might go to clients — can you help me understand that?"_
