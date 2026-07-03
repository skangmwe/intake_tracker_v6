# File identification protocol for design-code-handoff

This document describes how the skill normalizes the manually placed prototype archive at `artifacts/docs/design/` into the canonical `artifacts/docs/design/project/` path and inventories the screens inside it. The SKILL.md Step 1 invokes this protocol after the user confirms the archive is in place; everything below applies before the inventory build.

> **Note:** The user places the archive at `artifacts/docs/design/` before running the skill — typically by exporting the project from Claude Design and dropping the resulting `.zip` (or already-extracted folder) at that path. The protocol works on whatever's at the canonical path, regardless of which form the user dropped.

## Guiding principle: when in doubt, ask the user — in plain language

This protocol relies on judgment calls — *is this the project archive, is this a real screen or a utility page, are these two files the same screen.* When the call is clear, apply it silently and move on. **When you're uncertain, ask the user inline before deciding.**

**Phrase the question in language the user understands.** Avoid technical terms when talking to the user. Describe the situation in terms they can answer from their own knowledge — *"this file doesn't look like a real screen,"* *"there are two things here that could be the prototype,"* *"there's already a folder from a previous run."* Always show them the filenames so they don't have to guess which file you mean.

The user knows what they exported and can usually answer in one sentence. A small ask up front matters even more here than it used to: reconciliation now applies its findings silently, with no checkpoint to catch them — so a wrong "Added" or "Missing" finding gets written into the blueprint and requirements unreviewed. Getting the inventory right up front is the only place to prevent that.

**Example phrasings to use when asking:**

- *Multiple candidates at the folder level:* > *"I see a couple of things in your design folder that could be the project export from Claude Design: `[file 1]` and `[file 2]`. Which one is the prototype you want me to use?"*
- *Existing `project/` folder plus a new archive:* > *"There's already a `project/` folder from a previous run, and you've also placed `[new folder]` alongside it. Should I replace the old one with the new export, or stick with what's already there?"*
- *A file that might not be a real screen:* > *"I see `[file]` in the archive, but it doesn't look like a real product screen — it looks more like a navigation index, a styleguide, or something else. Should I include it as a screen, or skip it?"*
- *Two files that might be the same screen:* > *"I found two HTML files that look like they might be the same screen — `[file 1]` and `[file 2]`. Which one is correct?"*

## 1. Find the project archive at the folder level

**First, check for an already-canonical bundle from a previous run.** If a folder named `project/` already exists at `artifacts/docs/design/project/`, use it directly — no re-identification or renaming needed. If the user also placed a new archive alongside the existing `project/` (e.g., they re-ran after iterating in Claude Design), ask inline (see example phrasings).

**Otherwise, scan `artifacts/docs/design/` for candidates**:

- Exclude `full-design-blueprint.md`, `HANDOFF-design-brief.md`, loose images, and PDFs.
- Exclude **any single, loose `.html` file** at this folder level — Claude Design's share-for-review exports are loose single-file HTMLs, never the project archive. The project archive is always either a `.zip` file or an extracted folder containing multiple `.html` files (typically with a `README.md` at its root, which the skill will rename to `prototype-readme.md`).

- **Exactly one candidate** → use it.
- **Multiple candidates** → don't guess. Ask the user inline (see example phrasings).
- **Zero candidates** → tell the user no archive was found at `artifacts/docs/design/` and walk them through where to place the exported project from Claude Design.

## 2. Rename to the canonical path

Once identified, rename:
- The placed folder (e.g., `My Product/` or `Trip Approval Tracker/`) to `project/`.
- If the user placed a `.zip` file, unzip it first (the `unzip` command is available in the shell), then rename the extracted folder to `project/`.

The canonical bundle path is always `artifacts/docs/design/project/` after this step.

## 3. Find, rename, and read the prototype-readme

Claude Design ships a `README.md` at the root of every project archive. It's written specifically for the agent reading the archive and is the most reliable source of structural guidance for understanding the prototype. **As soon as you find it, rename it to `prototype-readme.md`** — this disambiguates it from build-side READMEs (especially `CLAUDE-CODE-README.md`) and makes the prototype-vs-build distinction explicit. Refer to it as the **prototype-readme** from this point forward.

Look for `README.md` at `artifacts/docs/design/project/README.md`. If the archive was extracted with an inner project-name folder (e.g., `project/my-product/README.md`), look one level deeper. Once found, rename it in place to `prototype-readme.md` before reading.

If the prototype-readme is found, extract:

- **The primary file path** — the prototype-readme will name a specific screen the user had open when they triggered the handoff (e.g., *"Read `my-product/project/MyProduct/Home.html` in full"*). This is the **focal screen** — the prototype's intended focus.
- **The Bundle contents list** — a high-level inventory of what's in the archive. Use this to know which folders contain screens versus which contain assets, components, or supporting files.
- **Any other guidance** — instructions on how to read the design (e.g., source-only, no rendering), what the design medium is (e.g., HTML/CSS/JS prototype rather than production code), etc.

**If no prototype-readme is found** (no `README.md` was at the archive root to begin with), fall back to scanning the HTMLs directly (see Step 4's fallback mode). Don't surface this as an error to the user — just shift modes silently.

## 4. Inventory the screens

**Skip non-screen content — do not open, read, or inventory it.** A Claude Design archive ships more than the product screens. When walking the archive, **ignore the following entirely** — never open them, read them, treat them as screens, or use them as evidence of the prototype's design:

- **Screenshots** — image renders of the screens (e.g. a `screenshots/` folder, or loose `.png` / `.jpg` / `.jpeg` / `.webp` files that picture a screen). These are pictures of the screens, not the screens themselves; the screen's source is the only authority. **Never read a screenshot to understand or inventory a screen.**
- **Uploads** — anything in an `uploads/` (or similarly named) folder. These are reference materials the user dropped into Claude Design during the session, not part of the product.
- **Design-system files** — the folder holding the onboarded design system (e.g. the McDermott design-system files bundled into the archive). The design system is defined elsewhere; inventory the prototype's own screens, not the bundled system definition. Reading the system files here pollutes the inventory.

Focus only on the prototype's own screen source (the screen files and the code/styles they pull in) plus the prototype-readme and changelog. Everything in the two modes below applies to that screen source only.

### Prototype-readme-driven mode (preferred — when a prototype-readme is found)

Use the prototype-readme's guidance to navigate the archive:

1. **Start at the primary file.** Open the file the prototype-readme names as the focal screen and inventory it.
2. **Follow its imports.** Open every file the focal screen pulls in via `<link>`, `<script src>`, and navigation `<a href>` to other HTMLs. Inventory each linked HTML as a screen; treat CSS, JS, and asset files as supporting context — not screens.
3. **Cross-reference against the Bundle contents.** If the prototype-readme lists a folder or file you haven't visited, check it. If you can't find a file the prototype-readme references, ask the user (see example phrasings).
4. **When uncertain about whether a file is a real screen** (e.g., it could be a utility page, styleguide, or shared component), ask the user inline.

### Fallback mode (no prototype-readme found)

If no prototype-readme is present in the archive:

1. List all `.html` files in `project/` (recursively).
2. Inventory each as a potential screen.
3. **When you encounter a file that doesn't look like a real product screen** (e.g., a navigation index, styleguide, or component reference), ask the user whether to include it as a screen in the inventory. If they say no, leave the file in place — it stays in the archive as supporting context for the build, just not in the inventory. Only flag it for `_skipped/` if the user explicitly tells you it shouldn't be in the archive at all.

## 5. Leave the archive as it arrived

**The default action is no action.** The archive stays intact — every file remains where it was placed. Screens get inventoried; everything else (CSS, JS, components, navigation indices, styleguides, asset folders, even OS junk files like `.DS_Store`) is left alone. The build can handle unused files itself; the skill doesn't need to police the archive.

**Do not create `project/_skipped/` unless absolutely necessary.** The folder exists for one narrow case: the user **explicitly tells you to remove a specific file** from the archive (e.g., *"that's an old version, get rid of it"*). In that case, move the file there and note it in a brief log alongside the run's findings. Otherwise — for every other file the skill encounters, screen or not, useful or seemingly extraneous — leave it in place.

If no `_skipped/` is created, no log entry is needed either. The cleanest outcome of a run is the archive untouched.

## 6. Error recovery

If the archive's HTML files are unreadable (empty, malformed, or lack any extractable content), and the prototype-readme (if present) doesn't help, surface this error inline:

> *"I can't read the prototype's screens — none of the HTML files in the placed archive have content I can use. To get past this:*
>
> *1. Open `artifacts/docs/design/` on your computer.*
> *2. Delete the current archive folder and any `project/` folder. Leave `full-design-blueprint.md` and `HANDOFF-design-brief.md` alone.*
> *3. Re-export the project from Claude Design, drop the fresh archive at `artifacts/docs/design/`, and run me again.*
> *4. If the same error happens after a fresh export, the archive may be corrupted at the source — try exporting in a different format (single-file HTML vs. folder) from Claude Design."*
