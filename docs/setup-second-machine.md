# Working on Trifecta from a second Mac

Use this when you need to keep building Trifecta from a machine that isn't your iMac — e.g. your MacBook Air while traveling. The model is *git as source of truth + AirDrop two small files for the secrets*. No cloud sync required; no risk of mid-flight iCloud conflicts.

This was written 2026-05-25 for travel from 5/27 to 6/20.

---

## What "synced" actually means here

| Lives where | What is it | How it gets to the laptop |
|---|---|---|
| GitHub | All code, migrations, spec, planning docs | `git clone` — single command |
| Supabase (cloud) | The database itself, schema, RLS, your seed rows | Already in the cloud. Nothing to copy. Same project, both machines. |
| iMac only — `.env.local` | Supabase URL + anon key + service_role key | AirDrop the file from iMac to MacBook (or re-copy from Supabase dashboard) |
| iMac only — `~/.claude/projects/.../memory/` | The memory notes Claude Code built up about you and the project | AirDrop the folder (optional — Claude Code can rebuild context from `docs/`, but this saves time) |
| iMac only — `node_modules/` | npm-installed dependencies | **Don't copy.** Reinstall with `npm install` on the laptop (it's deterministic via `package-lock.json`). |

The asymmetric trick: **all the *code* travels via git, and you only need to manually move *two things* (`.env.local` and the memory folder).**

---

## Before you leave (on the iMac, ~5 min)

### 1. Push any uncommitted work

```
cd "/Users/imrankarim/Documents/Claude/Projects/Project Trifecta"
git status
```

If `git status` shows untracked files or "Changes not staged for commit," commit and push them. If it says "nothing to commit, working tree clean," you're set.

### 2. AirDrop two things to your MacBook

Open Finder, navigate to the project folder. Right-click each of these → Share → AirDrop → pick your MacBook:

1. **`.env.local`** — at the project root. It's hidden; press **Cmd+Shift+.** in Finder to show hidden files.
2. **The Claude Code memory folder** (optional but recommended):
   - Path: `~/.claude/projects/-Users-imrankarim-Documents-Claude-Projects-Project-Trifecta/memory/`
   - Open Finder, press **Cmd+Shift+G**, paste that path, hit Enter
   - AirDrop the *whole* `memory` folder

If AirDrop is fussy, you can also just put both items in a private iCloud Drive folder or email them to yourself.

---

## On the MacBook Air (first-time setup, ~15 min)

Do these in order. Anything you skip will bite later.

### 1. Install the prereqs

| Tool | How |
|---|---|
| **Claude Code** | Download from claude.ai/code, install, sign in with your Anthropic account |
| **Node.js (LTS or 24)** | https://nodejs.org/en/download → macOS Installer (.pkg) → arm64 |
| **GitHub CLI (gh)** | https://github.com/cli/cli/releases/latest → download `gh_X.Y.Z_macOS_arm64.pkg` (not the .zip — the .pkg auto-installs) |

After installing all three, **quit and reopen Terminal** so your shell picks up the new tools.

### 2. Authenticate to GitHub

```
gh auth login
```

Walk through: GitHub.com → HTTPS → Yes (authenticate Git) → Login with web browser → paste the code → authorize. Done when it says *"Logged in as imrankarim"*.

### 3. Set your git identity

```
git config --global user.name "Imran Karim"
git config --global user.email "270459977+imrankarim@users.noreply.github.com"
```

(Same values as on the iMac. The email is your GitHub no-reply address — commits attribute to your GitHub profile.)

### 4. Clone the repo

Put it at the *same path* as on the iMac. This matters because Claude Code's per-project memory is keyed by directory path — using the same path lets memory carry over.

```
mkdir -p "$HOME/Documents/Claude/Projects"
cd "$HOME/Documents/Claude/Projects"
gh repo clone imrankarim/trifecta-portal "Project Trifecta"
cd "Project Trifecta"
```

### 5. Install dependencies

```
npm install
```

Takes ~30 sec. Pulls everything from `package-lock.json` — produces an identical `node_modules` to your iMac.

### 6. Drop in the AirDropped files

- Move the AirDropped **`.env.local`** into the project root: `/Users/imrankarim/Documents/Claude/Projects/Project Trifecta/.env.local`
- (Optional) Move the AirDropped **`memory` folder** into: `~/.claude/projects/-Users-imrankarim-Documents-Claude-Projects-Project-Trifecta/`
  - If the parent folder doesn't exist yet on the laptop, create it with `mkdir -p`

### 7. Sanity check — run the dev server

```
npm run dev
```

Open http://localhost:3000 in your browser. You should see the Next.js welcome page. **If you see it, your laptop setup is complete.**

Hit **Ctrl+C** in Terminal to stop the dev server.

---

## Daily workflow with two machines

Two rules, that's it:

1. **Before you start working on either machine: `git pull`**
2. **Before you switch machines: commit and push (`git add → git commit → git push`)**

If you forget rule 2 and then start working on the other machine, you'll create a merge conflict. Not fatal — Claude Code can resolve it — but annoying.

If you forget rule 1, your local copy will be stale. You'll write code against the old version, and `git push` will fail with a "rejected — non-fast-forward" message. Run `git pull` then push again.

### What if I make a change on the laptop and forget to push?

Two paths:
- **Best:** make sure to push before closing the laptop for the day.
- **Backup:** when you get back to the iMac, AirDrop or otherwise transfer the changed files, then push from the iMac.

There's nothing in this project (so far) where you'd lose anything by simply *not* working on it for a day if you forgot to push. Worst case is you delay the next session.

### What about `.env.local` if I rotate Supabase keys?

The Supabase keys we put in `.env.local` don't change unless you explicitly rotate them in the Supabase dashboard (which we won't need to do in Phase 1). So `.env.local` is a *one-time* AirDrop. If you ever do rotate keys, you'd update both machines' `.env.local` files manually.

---

## What gets weird (and how to handle it)

- **Two Claude Code memory stores:** memory you build on the laptop is local to the laptop. When you get back to the iMac, you can AirDrop the laptop's memory folder back to overwrite the iMac's, or just rely on `session_state.md` style notes in `docs/` to keep both machines in sync.
- **Vercel deploys** (when we set them up in Step 3): every `git push` triggers a Vercel preview deploy. This works regardless of which machine pushed.
- **`npm install` differences:** if you `npm install <something>` on the laptop, commit the `package.json` and `package-lock.json` changes immediately. When you next open the iMac, run `git pull` *and* `npm install` to sync.
- **Node version mismatch:** if the laptop ends up on a different Node major version, things usually still work (the project doesn't pin a Node version), but if you see weird build errors, that's the first place to look.

---

## TL;DR

```
# On iMac, today
git status && git push          # make sure everything is up to date
# AirDrop .env.local and ~/.claude/.../memory/ to MacBook

# On MacBook, before you leave
install Claude Code, Node.js (.pkg), gh CLI (.pkg)
gh auth login
git config --global user.name "Imran Karim"
git config --global user.email "270459977+imrankarim@users.noreply.github.com"
mkdir -p ~/Documents/Claude/Projects && cd ~/Documents/Claude/Projects
gh repo clone imrankarim/trifecta-portal "Project Trifecta"
cd "Project Trifecta"
npm install
# drop the AirDropped .env.local into the project root
# drop the AirDropped memory folder into ~/.claude/projects/-Users-imrankarim-.../
npm run dev   # confirm http://localhost:3000 loads
```

Done.
