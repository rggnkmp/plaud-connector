# Official GitHub fork relationship (why git alone is not enough)

Git stores commits; **GitHub’s “forked from …” link is metadata on GitHub’s side.**  
There is **no** `git` command that turns an existing standalone repo into a fork in GitHub’s network graph.

**What works (guaranteed fork badge + PR UX):**

1. On **[github.com/sergivalverde/plaud](https://github.com/sergivalverde/plaud)** click **Fork** (under your account **rggnkmp**).  
   GitHub creates e.g. **`rggnkmp/plaud`** — this repo **has** the parent/fork relation.

2. **Resolve name clash** if you already use **`rggnkmp/plaud-connector`** without fork metadata:
   - **Option A (recommended):** In the **old** repo → *Settings → General → Repository name* → rename to e.g. `plaud-connector-legacy` (or archive it).  
   - Then in the **new fork** → rename **`plaud` → `plaud-connector`**.  
     Renaming a fork **keeps** the “forked from sergivalverde/plaud” relationship.

3. **Point your local clone** at the fork URL (after final name):

   ```bash
   git remote set-url origin https://github.com/rggnkmp/plaud-connector.git
   git remote add upstream https://github.com/sergivalverde/plaud.git   # if not already present
   ```

4. **Push your work** (commit or stash uncommitted changes first):

   ```bash
   git fetch upstream
   git push -u origin main
   ```

   If GitHub’s fork `main` already has commits and you need to align histories, compare with `git log origin/main` / `git log main` and only then consider `git pull --rebase` or a careful merge — **do not** blind `--force` without checking.

**Alternative:** Some teams open a ticket with **GitHub Support** asking to attach an existing repository to a fork network. Not documented as guaranteed; the fork-button path above is reliable.

**What you already have locally:** `origin` + `upstream` remotes match good practice; they **do not** create the GitHub fork badge by themselves — only step **1–2** does.
