---
name: design-foundation
description: >-
  Turns a requirements doc into a prototype plan (a staged brief for Claude Design + an architecture
  spec for Claude Code), and invokes the **`/generate-sitemap`** skill at the user checkpoint to
  produce a visual flowchart of the proposed selection. **Reads
  `artifacts/docs/product/solution-requirements.md`; writes `artifacts/docs/design/`** (blueprint,
  HANDOFF brief, sitemap). Presents the sitemap and HANDOFF brief as downloadable files. Use when
  the user wants a visual walkthrough before approving — non-technical users, or complex maps.
---

# design-foundation

A requirements doc describes a whole product, but you don't prototype the whole product. This skill picks which screens belong in the prototype, then hands clean deliverables to Claude Design and Claude Code. At the user checkpoint it calls the **`/generate-sitemap`** skill so the user reviews the selection as a visual flowchart instead of a text list. Use when the user is non-technical or when the screen map is complex. Keep the prototype small — Claude Design does its best work on a focused ask, and deferring is cheap.

## Inputs

- **Input:** `artifacts/docs/product/solution-requirements.md` (written by the requirements-gathering skill). The path is fixed; don't search for alternatives, don't ask the user to upload. If missing, ask the user to confirm they've run requirements-gathering before continuing.
- **Output:** `artifacts/docs/design/` — writes `full-design-blueprint.md`, `HANDOFF-design-brief.md`, and `sitemap.html`. Create the directory if it doesn't exist.

Extract from `solution-requirements.md`: product summary and primary value, user roles, features, user journeys, data entities, and any named screens/flows.

**At the end of every run:** present the **sitemap.html** and the **HANDOFF-design-brief.md** to the user as downloadable files. **Do not paste either file's contents into the conversation.** The user needs to save the actual files to their computer — the sitemap so they can open it, and the brief so they can upload it into Claude Design in the next step.

**Then state the next steps clearly so the user knows exactly what to do.** End with a short scannable numbered list — no preamble before it:

1. **Open the sitemap** to do a final visual review.
2. **Save the HANDOFF brief** from the download link above.
3. **Open Claude Design** — in the Claude Desktop app, or at claude.ai/design in your browser — and start a new product:
    - **Add the handoff file:** drag the HANDOFF brief into the chat box at the top-middle of the screen, *or* click the **"+"** button at the bottom-left of the chat to attach it.
    - **Select your McDermott design system** and the **'Prototype'** template.
    - **Click the orange up-arrow button** to run.
4. **Build screen 1**, then ask Claude Design to build screen 2, and continue through screens in flow order.
5. **Once the prototype is approved**, export it from Claude Design using the **"Project archive"** option (the full export, not HTML-only or a single screen), drop the archive into `artifacts/docs/design/` (the design-code-handoff skill will rename it to `project/` for you), and run the **design-code-handoff** skill to reconcile and finish the handoff.

## Procedure

Run in two phases with a **required checkpoint** between. Phase A proposes a selection; the user validates it against the visual sitemap; Phase B writes the final files. The gate exists because the selection decides what gets prototyped — a wrong selection wastes a whole Design pass. Never skip to Phase B without sign-off.

### Phase A — analyze and propose
1. **Build the Screen Map.** Enumerate every screen across all roles, including the unglamorous ones (auth, settings, admin, billing, empty/error states). For each: stable ID (`S1`…), name, role, platform, what it contains, what it connects to (by ID + the action), and a **Source** tag indicating where the screen came from:
    - `requirement` — named or clearly implied by the requirements.
    - `inferred-infrastructure` — needed for any real product (auth, settings, errors).
    - `inferred-feature` — needed to fulfill a requirement.
    - `suggested-enhancement` — proactive, not required.

    IDs are referenced everywhere downstream — keep them stable. Be conservative with `suggested-enhancement` — only add what feels essential, never pile on features the user didn't ask for.
2. **Score each screen 1–5** on **Value** (how central to the core value; would a demo touch it?) and **Uncertainty** (how novel/unclear the UX is, such that *prototyping it* would change a decision).
3. **Make the selection.** Tag a screen **Prototype** if **Value ≥4 OR Uncertainty ≥4** — this catches both the core-value screens and the ones that most need feedback. Then pull in any **connective screens** the happy path can't run without. Tag everything else **Save for /build**.
4. **Apply the budget.** The screen budget (default **6**) is a hard ceiling, not a suggestion — the main defense against overwhelming Claude Design. If more screens qualify, rank by combined score and draw the line at the budget; defer borderline screens rather than grow the ask. Note the screens just above/below the line for the checkpoint.
5. **Generate the sitemap.** Invoke the **`/generate-sitemap`** skill, passing it the product name, the list of screens (each with `id`, `name`, `role`, `tag`, `source`, `connects-to`), and the output path `artifacts/docs/design/sitemap.html`. That skill produces a self-contained HTML flowchart that color-codes screens (blue = in prototype, grey = save for /build, gold = suggested addition) — this is the visual the user reviews at the checkpoint. **Do not write the sitemap yourself**; delegate to `/generate-sitemap` so rendering stays consistent and other skills (e.g. `/design-code-handoff`) can regenerate the same file later.
6. **Hand the user the link and urge them to open it.** The sitemap is written to disk — do not launch it yourself. Do **not** run `open`, `xdg-open`, `start`, or any shell command to open a browser. Instead, present `artifacts/docs/design/sitemap.html` as a clickable file link and **actively encourage the user to open it now** — e.g. *"👉 Click to open your sitemap — give it a quick look before you sign off below."* Opening the sitemap is the whole point of this step; don't bury the link or treat it as optional. Repeat the link and the nudge at the checkpoint (next section). If the selection changes at the checkpoint and you re-run `generate-sitemap`, present the refreshed link again with the same encouragement to re-open it.

### Checkpoint — user signs off on the proposed selection (required, do not skip)

**Speak the user's language.** The Phase A scoring and tagging vocabulary (Value/Uncertainty scores, Source tags like `inferred-infrastructure`, `suggested-enhancement`, screen-budget mechanics) is Claude's internal decision toolkit — not vocabulary the user needs to think in. Translate every internal label into plain English at the checkpoint. The user is reviewing a strong proposal, not learning a methodology.

**Present the following, in order:**

1. **The sitemap (visual first).** Present `artifacts/docs/design/sitemap.html` as a clickable file link. Tell the user: *"Open this to see the proposed screens. **Blue = in the prototype. Grey = save for /build. Gold = I added this; confirm you want it.**"*

2. **In the prototype — N screens.** One-line reason per screen, **in plain English**. Lead with the role context if it helps place the screen. Examples of good reasons: *"Where employees see their requests"*, *"The form is the riskiest UX decision in this product"*, *"Manager's home base"*. Examples of bad reasons (do NOT use): *"V5 U4"*, *"high value and uncertainty"*, *"connective screen for the happy path"*. Use a compact table with columns **ID · Screen · Why it's first**.

3. **Save for /build — N screens.** Compact list of names only: *"S1 Sign In · S8 Profile · S9 Settings · …"*. No reasons needed; the user is reviewing the prototype scope, not the save for /build scope. If they want detail, they'll ask.

4. **Confirm what I added.** This is the only place the user actively reviews additions. Collapse the three Phase A Source categories into **two plain-English buckets**:
    - **Basics I filled in** — auth, profile, settings, dashboards inferred from the requirements. *"Most products need these. Usually safe to keep."* List screens compactly.
    - **🟠 Extra ideas I suggested** — proactive additions not in the requirements. **Surface these prominently.** Each one gets a one-line note on why Claude added it and a frank assessment: *"Most likely to cut."* These are the gold boxes on the sitemap.

5. **Close calls** (only include if relevant) — one line: *"S7 Manager Dashboard almost made the prototype — if you want both roles to feel equally polished, swap it in for [X]."* Skip the section entirely if there's nothing close.

**Hide entirely (do not mention to the user):**
- Value and Uncertainty scores.
- Source tags (`requirement`, `inferred-infrastructure`, etc.) — translate them, don't expose them.
- The screen-budget number and budget mechanics ("the budget is 6, this is under budget"). The user does not need to think about budgets.
- Skill settings, unless the user has asked to change them.

**End with a clear recommendation and a simple sign-off prompt.** Two options the user can pick: ✅ *"Looks good"* (proceed) or tell Claude what to change (*"drop S11"*, *"add S7 to the prototype"*, etc.). Do not present a blank menu — the user is signing off on Claude's recommendation, not deciding from scratch.

If the selection shifts, **re-invoke `generate-sitemap`** to refresh `sitemap.html`, then present the updated clickable file link so the user can open the refreshed map before Phase B.

### Phase B — generate the deliverables
Only after sign-off, write the two markdown output files: `full-design-blueprint.md` and `HANDOFF-design-brief.md` (described below). Both derive from the validated Screen Map and reflect the final selection — including any Claude additions the user kept or removed at the checkpoint. The `sitemap.html` is already on disk from Phase A; if the selection changed during the checkpoint, you should have already re-invoked `generate-sitemap` to refresh it.

After Phase B, this skill's job is done. The sibling **design-code-handoff** skill picks up from there once the prototype is approved.

## Output file names — use these exactly
Three files come out of this skill. When they reference each other, use these exact names so links stay live.

| Filename | Consumer | Purpose |
|----------|----------|---------|
| `full-design-blueprint.md` | Humans + Claude Code | The canonical plan: selection, scoring, full screen map, save for /build screen details, Skill settings, open questions, handoff |
| `HANDOFF-design-brief.md` | Claude Design | Staged prompt brief for the prototype screens |
| `sitemap.html` | Humans (browser) | Visual flowchart of the screen map; Prototype-tagged highlighted, Save for /build muted, arrows show connects-to |

## What each file contains
- **full-design-blueprint.md:** the single canonical planning document. Sections, in order: an at-a-glance summary (product, prototype count vs total, direction count, demo persona); the core flow as a numbered walkthrough; a *what's-in-and-why* table with scores; a brief "what's saved for /build" list pointing forward to the detailed section; Skill settings used; open questions for sign-off; the full screen map (master table with every screen — ID, name, role, platform, contains, connects-to, tag, value, uncertainty, source — plus the prototype navigation graph); save for /build screen details (role/access matrix and per-screen blocks of purpose, who uses it, content in plain language, business rules, connects-to); cross-cutting notes; and handoff steps. Humans read it top to bottom; Code reads the structured sections; design-code-handoff updates it after the prototype is approved. **No routes, endpoints, data schemas, or UI components** — those are Code's decisions.
- **HANDOFF-design-brief.md:** a short how-to (onboard the McDermott design system, paste the brief once, then build incrementally by steering through one screen per turn so each reuses the patterns the previous one established); an **Anchor** that orients Claude Design on the whole product (product, audience, tone, platforms, seeded-data/no-auth), a **"adhere to the onboarded McDermott design system" line** (the system is the source of truth for components, tokens, typography, and spacing — design decisions are guided by it), a **"larger product (context only — do not build)" paragraph** naming the broader product scope (admin, settings, user management, billing, notifications, reporting, etc.) so the prototyped screens reflect a real larger product without inviting hallucinated ones, a **"Future screens — context only, do not build" table** listing every Save for /build screen with its **ID, name, role, one-line purpose, and key connects-to** relationships — open the section verbatim with *"These screens are part of the larger product but are NOT in this prototype's scope. Use them only as context — to label navigation, to set role-appropriate stubs, to understand the product. Do not render, design, or treat them as buildable. If I later say 'now add screen X,' use this list as the spec."* — this lets prototyped screens stub their save for /build screen links accurately (Settings buttons, Profile links, etc.) AND lets the user later ask Claude Design in the same session to *"now add the Settings screen"* without having to re-derive its spec, a **"less is more" line** (prefer minimal components in service of each screen's purpose; no optional metadata or secondary controls), a **"no auto-tweaks panel" instruction** — verbatim: *"Don't create a 'tweaks' panel or set on your own. If I want tweaks, I'll add them myself — don't pre-populate one or suggest tweaks unprompted."* — keeps the prototype's UI clean and product-focused; the tweaks feature stays available for user-driven exploration but isn't pre-loaded with auto-generated controls, a **"theme toggle is a product feature" instruction** — verbatim: *"If the product needs dark and light mode, build the theme toggle as a real product control inside the prototype (not as your own preview switch). The user should interact with the same toggle the end user will, in the same place a real user would find it."* — keeps theming inside the product surface rather than as Claude Design preview chrome, a **changelog request** — verbatim: *"Can you keep a record of all the changes I make going forward in a `changelog.md` file?"* — so Claude Design maintains a running log of user-requested changes for traceability during iteration, the ordered prototype screen list, and a closing instruction to build screen 1 first and wait; one **screen block per prototype screen** in flow order, written as **purpose + primary action + link onward**, *not* a component list (★ the highest-uncertainty ones); a **scope guardrail** (one direction, no extra screens, variant note, *and* "do not build any Future screen from the context table unless I explicitly ask").
- **sitemap.html:** a self-contained HTML file with inline CSS + inline JS that renders the screen map as a responsive interactive flowchart. The inline JS lays out boxes by tier, routes arrows orthogonally, re-renders on resize, and powers a **Show flow arrows** toggle plus hover interactions (arrows darken and labels appear on hover; hovering a card highlights all its connected arrows). Includes a header with the product name, a legend explaining the tag colors (Prototype, Save for /build, Suggested addition), and the rendered diagram. No external dependencies — no CDN, no `<script src>`, no third-party libraries, no web fonts — works fully offline. See the *Sitemap rendering* section below for the exact structure.

## Sitemap rendering — delegated to the `/generate-sitemap` skill

This skill does not render the sitemap itself. Phase A step 5 invokes the `/generate-sitemap` skill with the Screen Map; see that skill's `SKILL.md` for its input contract and rendering spec. Re-invoke whenever the Screen Map changes — typically after the user makes changes at the checkpoint, before Phase B.

## Skill settings (defaults keep the prototype small and decisive)
- **screen_budget** — hard ceiling on prototype screens. Default **6**. Lower freely; raising is a conscious choice.
- **directions** — design directions per screen. Default **1** (one confident answer).
- **variant_exploration** — default **off**. When on, applies *only* to ★ high-uncertainty screens, one or two of them, two variants each — never across the board.
