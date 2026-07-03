---
name: dev-undo
description: Undo the most recent ship on `dev` (the integration branch — what gets demoed) by creating a revert commit and pushing it. Operates against the primary worktree so the user does not need to leave their current slice or fix. Asks plain-English confirmation before pushing. Offers to keep the reverted slice's workspace alive for a retry.
version: "0.1"
---

# /dev-undo — Undo the most recent ship on `dev`

The user shipped something. It broke `dev`. They run `/undo`. We create a
revert commit on `dev` (this is called a `git revert` — a new commit that
reverses the effect of the previous one, while keeping its history) and
push it. The user does not need to leave whatever workspace they are in —
everything happens against the primary worktree via `git -C`.

Speak in plain English alongside git terms per
[rules/dev/git-workflow.md](../../rules/dev/git-workflow.md). Never surface
a bare git error message.

## Flags

- `--verbose` — opt-in plumbing view. When present in `$ARGUMENTS`,
  strip the flag and then print `[verbose] git <command and args>` on a
  line of its own *before* each git invocation in the steps below
  (including any `git -C <worktree>`). Verbose is additive — keep the
  plain-English narration. See
  [rules/dev/git-workflow.md](../../rules/dev/git-workflow.md) §
  `--verbose` for the full contract.

## Steps

### 1. Resolve the primary worktree

```bash
PRIMARY="$(git worktree list --porcelain | awk '
  /^worktree / { p=$2 }
  /^branch refs\/heads\/dev$/ { print p; exit }
')"
```

If `PRIMARY` is empty, the project is missing the `dev` branch locally.
**STOP**: *"This project doesn't have a `dev` branch (the integration
branch). That's a setup problem, not something you caused."*

### 2. Refresh `dev`

```bash
git -C "$PRIMARY" fetch origin dev
git -C "$PRIMARY" checkout dev
```

If the primary worktree's `dev` has uncommitted changes
(`git -C "$PRIMARY" status --porcelain` non-empty) → **STOP**: *"There are
uncommitted edits on `dev` (the integration branch). That's unusual — let
me show you what's there before going further."* Then show the user.

Otherwise:

```bash
git -C "$PRIMARY" reset --hard origin/dev
```

### 3. Identify what's being undone

```bash
LAST_SHA="$(git -C "$PRIMARY" rev-parse HEAD)"
LAST_SUBJECT="$(git -C "$PRIMARY" log -1 --pretty=%s)"
PARENT_COUNT="$(git -C "$PRIMARY" rev-list --parents -n 1 HEAD | awk '{print NF-1}')"
```

If there is nothing to revert (`LAST_SHA` is the initial commit, or `dev`
is empty) → **STOP**: *"There's nothing on `dev` to undo yet."*

If `LAST_SUBJECT` begins with `Revert "` — the last thing on `dev` is
itself a revert. Warn in plain English: *"The last change on `dev` is
already an undo (the previous ship was undone). Want to undo that too?"*
Wait for confirmation; only proceed on an affirmative reply.

### 4. Confirm with the user

Show the commit subject and ask, in plain English, before doing anything
destructive:

> *"The last change merged into `dev` was: **`<LAST_SUBJECT>`**. Undoing
> it creates a new commit (called a revert) that reverses those changes.
> The original commit stays in history — nothing is deleted. After the
> revert is pushed, `dev` will no longer show those changes. OK to
> proceed?"*

Wait for an explicit yes. On no, **STOP**.

### 5. Create the revert

If the last commit is a merge (`PARENT_COUNT == 2`):

```bash
git -C "$PRIMARY" revert -m 1 "$LAST_SHA" --no-edit
```

Otherwise:

```bash
git -C "$PRIMARY" revert "$LAST_SHA" --no-edit
```

If the revert fails (rare — would only happen if the working tree is
suddenly dirty), surface the failure in plain English and **STOP**.

### 6. Push, with one retry

```bash
if ! git -C "$PRIMARY" push origin dev; then
  git -C "$PRIMARY" fetch origin dev
  git -C "$PRIMARY" rebase origin/dev      # rebase our revert onto whatever landed
  git -C "$PRIMARY" push origin dev || {
    # STOP — see failure surface.
  }
fi
```

Failure surface for push rejection after the retry: *"Something else
landed on `dev` while I was undoing — try `/undo` again in a moment."*
**STOP**.

If the rebase in the retry has conflicts: *"The thing I'm undoing
overlaps with something that just landed. I can't undo this cleanly
without help — show me which is more important and I'll work with you on
it."* **STOP**.

### 7. Offer to keep the reverted slice's workspace alive

Derive the reverted slice or fix branch name from the merge commit's
message (the ship commit was `ship: <branch-name>`):

```bash
REVERTED_BR="$(echo "$LAST_SUBJECT" | sed -n 's/^ship: //p')"
```

If `REVERTED_BR` is non-empty and a worktree for it still exists
(`git worktree list --porcelain` shows it):

> *"Want me to keep your `<derived feature name>` work around so you can
> fix and re-ship it? If yes, I'll mark it to skip the automatic
> cleanup."*

On yes:

```bash
mkdir -p "$PRIMARY/.claude"
KEEPALIVE="$PRIMARY/.claude/.undo-keepalive"
# Append the branch name if not already present.
if ! grep -Fxq "$REVERTED_BR" "$KEEPALIVE" 2>/dev/null; then
  echo "$REVERTED_BR" >> "$KEEPALIVE"
fi
```

On no, do nothing — the next session-start sweep will remove the
worktree, because the branch still counts as merged into `dev` (the
original commits stay reachable through the merge that was reverted).

If `REVERTED_BR` is empty (the ship message wasn't in the expected
format, e.g. an older or hand-crafted commit), skip this step silently.

### 8. Report

One short, plain-English sentence:

> *"Undone — the last change on `dev` has been reversed (this is called a
> revert) and pushed. `dev` is back to where it was before that ship."*

If step 7 kept the workspace alive, add:

> *"Your `<derived feature name>` workspace is still there — keep
> working in it and `/ship` when you're ready."*

## Prerequisites

- Project has a `dev` branch locally and on `origin`.
- `git` is authenticated against `origin` (push access to `dev`).

## Important

- `/undo` only ever reverts **the single most recent commit on `dev`**.
  It does not look further back, and it does not chain multiple reverts
  in one invocation. If the user wants to undo two ships, they run
  `/undo` twice.
- The reverted commit stays in history. Nothing is deleted. This is
  intentional — it lets the user see what happened and re-ship a fixed
  version cleanly.
- Never force-push. The retry path in step 6 rebases our revert onto
  whatever landed and pushes normally.
- The keepalive file (`.claude/.undo-keepalive`) is honored by
  `hooks/cleanup-merged-worktrees.sh` — listed branches are never
  removed automatically.
- This skill does not run reviews or tests. The revert itself is a
  trivial diff; gating it on `/dev-review-and-remediate` would block
  recovery from a bad ship, which is the opposite of what `/undo` is
  for.
