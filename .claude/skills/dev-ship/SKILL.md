---
name: dev-ship
description: Ship a slice or fix into `dev` (the integration branch — what gets demoed). Gates on tests + reviews via /dev-review-and-remediate, commits directly on the slice or fix branch, merges into `dev` locally with race-handling, pushes `dev`. No pull requests.
version: "0.3"
---

# /dev-ship — Ship a slice or fix into `dev`

Takes the work in the current slice or fix worktree, gates it on the
slice-completion checks, commits it, merges it into `dev` (the
integration branch — what gets demoed), pushes `dev`. No pull request,
no GitHub round-trip. If the change breaks `dev`, the user runs `/dev-undo`
to revert.

`/dev-ship` is the **only** path to a commit in this workflow — direct
`git commit` is blocked by a PreToolUse hook. The commit happens
in-skill at Step 5, after the test gate clears.

The user does not see worktrees, branches, merges, or pushes — they see
"shipping" and "shipped." Speak in plain English alongside git terms per
[rules/dev/git-workflow.md](../../rules/dev/git-workflow.md).

## Flags

- `--verbose` — opt-in plumbing view. When present in `$ARGUMENTS`,
  strip the flag and then print `[verbose] git <command and args>` on a
  line of its own *before* each git invocation in steps 1–7 (including
  any `git -C <worktree>`). Verbose is additive — keep the
  plain-English narration. See
  [rules/dev/git-workflow.md](../../rules/dev/git-workflow.md) §
  `--verbose` for the full contract.

## Steps

### 1. Branch guard

- Run `git branch --show-current`.
- If the current branch is `dev`, `main`, or `master`:
  - **STOP** with a plain-English message: *"You're on the integration
    branch (the one we ship completed work to). `/ship` only runs when
    you're working on a slice or a fix. Start a new piece of work first
    and try again."*

### 2. Silent cleanup of leftovers

- Invoke `bash .claude/hooks/cleanup-merged-worktrees.sh --silent` to
  sweep any previously-merged slice or fix workspaces. Silent on
  success.
- Best-effort. If it fails, write to stderr and continue.

### 3. Show what will be shipped

- Run `git status` to show all changed and untracked files in the
  current worktree.
- Run `git diff --stat` for a summary of changes.
- If there are no changes to commit, report in plain English and
  **STOP**.

### 4. Test gate — require a valid clean-run cache for the current diff

`/dev-ship` will not let an untested change reach `dev`. The
slice-completion gate (`/dev-review-and-remediate`) runs the full
unit-test suite as Phase 0 and writes `reviews/.last-clean-run.json`
only when status is `CLEAN`. That cache is the test gate.

Check `reviews/.last-clean-run.json`. Treat the cache as **valid** only
when **all** of these are true:

1. The file exists and parses as valid JSON.
2. `head_sha` matches `git rev-parse HEAD`.
3. `diff_hash` matches the SHA-256 of `git diff HEAD`:
   ```bash
   git diff HEAD | shasum -a 256 | awk '{print $1}'
   ```
   If `git diff HEAD` is empty, the stored hash is the SHA-256 of an
   empty string —
   `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` —
   and that still counts as a match.
4. `completed_at` is within the last 60 minutes (compare against current
   UTC time).
5. **Evidence manifest present when applicable.** When `phases_run`
   contains `"design-fidelity-web"`, the cache MUST also contain a
   non-empty `evidence_manifest` object AND a `coverage_disclosure`
   block. A cache that lacks either is treated as **invalid** —
   re-invoke `/dev-review-and-remediate` rather than ship from it.
   This prevents a CLEAN verdict produced from partial work from being
   skipped over.
6. **Manifest matches current screen set.** When the evidence manifest
   is required (per check 5), run the manifest hook with **both**
   arguments — the project root AND the dev-tree cache path. The
   hook's defaults match the analyst workspace shape
   (`artifacts/docs/dev/reviews/.last-clean-run.json`), which is NOT
   where the dev workflow's cache lives. Failing to pass the explicit
   cache path will produce `MANIFEST: NO_CACHE` even when the cache
   exists and is valid.
   ```bash
   node .claude/hooks/verify-design-fidelity-manifest.mjs . reviews/.last-clean-run.json
   ```
   The hook re-runs `enumerate-blueprint-screens.sh` against the
   current blueprint and asserts every **Prototype-tagged** screen
   plus the `APP` and `SHELL` buckets is present in `evidence_manifest`,
   each with its comparison record (Save-for-/build screens are allowed
   but not required). It must print `MANIFEST: VALID` and exit 0. Any
   other outcome (`STALE`, `MISSING`, `NO_SHELL`, `NO_APP`, `NO_CACHE`,
   or `BAD_ROW` — the validator is pure Node, so a malformed cache
   reports `STALE (JSON parse failed)`, not a jq error)
   means the screen set has changed since the cache was written, the
   cache is incomplete, or the cache is malformed — treat as **stale**
   and re-invoke `/dev-review-and-remediate`.

If the cache is **valid** → proceed to step 5.

If the cache is **missing, stale, or for a different diff** → invoke
`/dev-review-and-remediate` with no arguments. It runs unit tests + code
review + security review, auto-remediates mechanical findings, and
prompts the developer for any architectural decisions. On `CLEAN` it
rewrites `.last-clean-run.json`.

After `/dev-review-and-remediate` returns:

- Final status **`CLEAN`** → re-validate the cache using the four checks
  above, then proceed to step 5.
- Final status **`UNRESOLVED-STUCK`** or **`UNRESOLVED-CAP`** → **STOP**.
  Plain English: *"There are issues I couldn't fix on my own. Shipping
  is paused until they're sorted."*
- Developer interrupted `/dev-review-and-remediate` (e.g. left an
  architectural decision unanswered) → **STOP**. Plain English:
  *"Shipping is paused — running `/ship` again will pick up where we
  left off."*

### 5. Commit on the slice or fix branch

The test gate at step 4 has already cleared this diff (or it has been
cleared within the cache's 60-minute window). No additional reviews
run here — `/dev-ship` commits directly.

**5a. Stage changes.**

- Run `git status` once more to confirm what's about to be staged.
- Stage with `git add -A`, but never include `.env`, credential files,
  or generated artifacts (PDFs, coverage reports, build output). If
  `git status` shows any of those, unstage them with `git reset HEAD --
  <path>` before continuing.
- Run `git diff --cached --stat` to confirm the staged set matches the
  test-gated diff.
- If staging produces no changes, **STOP** with a plain-English message:
  *"Nothing to ship — the working tree is clean."*

**5b. Generate the commit message.**

- Analyze the staged diff and write a concise, imperative
  Conventional-Commits-style message:
  - `feat:` new behaviour, `fix:` bug fix, `refactor:` no behaviour
    change, `test:` tests only, `docs:` docs only, `chore:` tooling.
  - First line ≤ 72 chars. Optional body explains the *why*, not the
    *what*.
- Append the Co-Authored-By footer:
  `Co-Authored-By: Claude <noreply@anthropic.com>`

**5c. Commit through the PreToolUse gate.**

Direct `git commit` is blocked by `.claude/hooks/block-git-commit.sh`.
`/dev-ship` is the authorised path, so it unlocks the gate for exactly
one commit using a one-shot token at `.claude/.commit-allowed`.

The unlock and commit MUST run inside a single `bash -c` invocation with
a `trap ... EXIT` so the token is cleaned up even if the commit aborts
between steps:

```bash
bash -c '
  trap "rm -f .claude/.commit-allowed" EXIT
  mkdir -p .claude
  touch .claude/.commit-allowed
  git commit -m "<subject>" -m "<body if any>" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
'
```

Notes:

- The hook self-deletes `.claude/.commit-allowed` the moment it reads
  the file, making the token one-shot at the hook layer as well. The
  `trap` is defence-in-depth.
- Never `touch .claude/.commit-allowed` outside this atomic block —
  leaving the file on disk between turns would let a subsequent raw
  `git commit` slip past the gate.
- The commit lands on the current slice or fix branch — still local,
  never pushed. Step 6 handles the merge into `dev` and the push.

### 6. Merge into `dev` and push

All git operations target the **primary worktree** — the one whose
branch is `dev`. Resolve its path:

```bash
PRIMARY="$(git worktree list --porcelain | awk '
  /^worktree / { p=$2 }
  /^branch refs\/heads\/dev$/ { print p; exit }
')"
```

The current slice or fix worktree:

```bash
SLICE_WT="$(git rev-parse --show-toplevel)"
SLICE_BR="$(git branch --show-current)"
```

If `PRIMARY` is empty, the project is missing the `dev` branch locally.
**STOP**. Plain English: *"This project doesn't have a `dev` branch
(the integration branch). That's a setup problem, not something you
caused — let me know and we'll fix it."*

Run this loop, up to 3 attempts:

```bash
git -C "$PRIMARY" fetch origin dev
git -C "$PRIMARY" checkout dev
git -C "$PRIMARY" reset --hard origin/dev      # local dev == remote dev

# Replay the slice's commits on top of the fresh dev.
if ! git -C "$SLICE_WT" rebase origin/dev; then
  git -C "$SLICE_WT" rebase --abort
  # STOP — see "Rebase conflict" below.
fi

git -C "$PRIMARY" merge --no-ff "$SLICE_BR" -m "ship: $SLICE_BR"

if ! git -C "$PRIMARY" push origin dev; then
  continue   # someone landed between our fetch and push — retry
fi

break        # success
```

`--no-ff` is deliberate: every ship is one merge commit on `dev`, so
`/dev-undo` can revert it cleanly with `git revert -m 1 HEAD` even when the
slice has several commits.

Failure modes:

- **Rebase conflict** — *"Your change overlaps with something else that
  landed on `dev` while you were working — I need your help merging the
  two together (this is called resolving a conflict). Files affected:
  [list from `git -C "$SLICE_WT" diff --name-only --diff-filter=U`]."*
  The abort already ran, so the slice worktree is back to its
  pre-rebase state. **STOP**.
- **Push rejected after 3 retries** — *"Something keeps landing on
  `dev` faster than I can push (this is called a push rejection). Try
  `/ship` again in a moment."* **STOP**.
- **Any other git failure** — translate to plain English, surface the
  underlying error to stderr for debugging, and **STOP**.

### 7. Worktree cleanup

- Invoke `bash .claude/hooks/cleanup-merged-worktrees.sh --silent`.
- The just-shipped slice or fix worktree will be skipped because the
  user is still cwd'd inside it. The next session-start sweep removes
  it. Silent on success.

### 8. Report success

One short, plain-English sentence:

> *"Shipped — `<derived slice or fix name>` is now on `dev` (the
> integration branch) and pushed. If more slices remain in
> `slice-plan.md`, run `/dev-build-application` to continue with the
> next one. Run `/dev-undo` if anything broke."*

Derive the name from `SLICE_BR` by stripping the `slice/` or `fix/`
prefix and replacing hyphens with spaces.

## Prerequisites

- Project has a `dev` branch locally and on `origin`. The project
  bootstrap creates this; missing `dev` is a setup bug.
- User is on a slice or fix branch in a worktree under
  `.claude/worktrees/`. Step 1 enforces this.
- `git` is authenticated against `origin` (push access to `dev`).

## Important

- Step 4 is the **test gate**. Step 5 commits. Step 6 merges and
  pushes. Do not reorder.
- This skill is the **only authorised path to a commit**. Direct
  `git commit` is blocked by `.claude/hooks/block-git-commit.sh`. Step
  5c uses a one-shot unlock token (`.claude/.commit-allowed`) to pass
  through the gate.
- Always create and remove `.claude/.commit-allowed` inside a single
  `bash -c` invocation with `trap ... EXIT`. The hook self-deletes the
  file on read as a second line of defence. Never leave the token on
  disk between turns.
- This skill never opens a pull request. Pull requests are not part of
  the workflow for projects generated by this CLI.
- Never force-push `dev`. The retry loop in step 6 only handles
  fast-forwardable pushes.
- Speak in plain English alongside git terms per
  [rules/dev/git-workflow.md](../../rules/dev/git-workflow.md). Never
  surface a bare git error message to the user.
- The slice or fix worktree the user is in survives step 7 (they're
  cwd'd inside it). That's fine — the next session-start sweep cleans
  it.
