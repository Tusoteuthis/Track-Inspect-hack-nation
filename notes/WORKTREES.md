# Parallel agents in git worktrees: shared conventions

The rules every workstream (WS3–WS7) follows so that several coding agents can work at the same time without overwriting each other's changes, and so that every branch can be merged later. The per-workstream guides (`notes/ws*-sprints/`) add sprint-specific detail on top of this.

`<repo>` = `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`

## Layout

| What | Where |
|---|---|
| Main checkout (human only, integration) | `<repo>`, branch `voice` |
| Agent worktrees | `<repo>/.claude/worktrees/<folder>`, one per workstream or sprint |
| Branch naming | `worktree-<folder>`, e.g. folder `ws05-sprint-1` → branch `worktree-ws05-sprint-1` |

`.claude/worktrees/` is in `.gitignore`. Never commit it: the folders are nested git worktrees, and `git add .` in the main checkout would otherwise record them as broken embedded repos.

## Integration branch

- **`voice` is the integration branch.** Every worktree branches off `voice`, and every finished branch merges back into `voice` (`--no-ff`), from the main checkout, by the human.
- `main` gets `voice` only at milestones (e.g. a demo-ready state): `git switch main && git merge --no-ff voice && git push`.
- Push `voice` after every merge (`git -C <repo> push origin voice`) so integrated work is backed up.
- Long-running worktrees regularly merge `voice` into their branch so conflicts surface early and small.

## Dev-server ports

Each worktree runs its own `npm run dev`, so ports must not collide.

| Workstream | Ports |
|---|---|
| Main checkout (human) | 3000 (Next.js default) |
| WS3 expert interaction, sprints 1–4 | 3101–3104 |
| WS5 knowledge & tutor, sprints 1–4 | 3501–3504 |
| WS6 backend | 3006 |
| WS7 frontend, sprints 0–4 | 3700–3704 (sprint N → 370N) |

Never run a dev server with the default port from inside a worktree.

## Things all worktrees share (and how to stay safe)

| Shared thing | Rule |
|---|---|
| `git stash` stack | Don't use a bare `git stash` or `git stash pop`. Make a WIP commit on your own branch instead. |
| Branches | A branch can only be checked out in one worktree at a time. Never `git checkout` or `git switch` another workstream's branch. |
| `.env` (gitignored) | Not copied into new worktrees. After `git worktree add`, run `cp <repo>/web/.env <worktree>/web/.env`. |
| `node_modules` | Separate in each worktree. Run `npm install` in `<worktree>/web` once. |
| Shared files (`web/package.json`, `agents/manifest.json`, `agents/probes.json`) | Expect merge conflicts. Resolve them by keeping both sides. Never drop another workstream's entries. |

## Lifecycle

```bash
REPO=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
NAME=ws05-sprint-1                      # folder name
WT=$REPO/.claude/worktrees/$NAME

# create
git -C "$REPO" worktree add -b "worktree-$NAME" "$WT" voice
cp "$REPO/web/.env" "$WT/web/.env"
cd "$WT" && claude                      # start the agent INSIDE the worktree

# integrate (main checkout, when no agent is mid-commit)
git -C "$REPO" status --short           # must be clean
git -C "$REPO" merge --no-ff "worktree-$NAME"
git -C "$REPO" push origin voice

# clean up
git -C "$REPO" worktree remove "$WT"
git -C "$REPO" branch -d "worktree-$NAME"
```

A sprint worktree that branched off a workstream base worktree (e.g. `ws7-sprint-0` off `ws07-frontend`) merges back into that base branch, or straight into `voice`. Either way, remove it after merging so there is only one live worktree per line of work.
