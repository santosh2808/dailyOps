# DailyOps release process

Every change goes to **TEST first**. Production only deploys after QA passes and Santosh approves.

| Environment | Branch | Website |
|---|---|---|
| TEST | `test-deploy` | URL in repo variable `TEST_FRONTEND_URL` (Settings → Secrets and variables → Actions → Variables) |
| Production | `main` | URL in repo variable `FRONTEND_URL` |

## Daily work

1. Start every fix from `test-deploy`, never from `main`:
   ```bash
   git checkout test-deploy && git pull
   git checkout -b fix/<short-name>
   ```
2. When the fix is ready, merge it into `test-deploy`. TEST redeploys automatically (~10 min).
3. Someone **other than the developer** tests it on TEST.
4. Bugs are GitHub Issues labelled `Critical`, `High`, `Medium` or `Low`. Link fixes with "Fixes #12".

## Release day

1. One of the team (**not Santosh** — nobody can approve their own PR) opens a PR **`test-deploy` → `main`**.
   The QA checklist appears automatically.
2. QA ticks every box once it is true.
3. Santosh: **Files changed → Review changes → Approve**.
4. The **Release check** on the PR turns green when all rules pass.
5. Merge with **"Create a merge commit"**. **Do not delete the `test-deploy` branch.**
6. Production deploys. Its first job, **Release quality gate**, re-checks every rule.
7. Sync `main` back into `test-deploy`:
   ```bash
   git checkout test-deploy && git pull
   git merge origin/main && git push origin test-deploy
   ```

## Rules the gate checks

| Rule | If it fails |
|---|---|
| Code came through a PR from `test-deploy` | Never push directly to `main` |
| Santosh approved the **latest** commit | Pushed after approval? Ask him to approve again |
| Every checklist box ticked | Tick the remaining boxes (only if true) |
| That exact commit passed Deploy to TEST | Wait for / fix the TEST pipeline |
| `test-deploy` includes everything on `main` | Do the sync step, let TEST redeploy, re-test |
| No open Critical/High issues | Fix or re-label them |

If the gate blocks, production is **not touched** — the live site keeps running the previous version.

## Never

- Push directly to `main`
- Delete the `test-deploy` branch
- Change `.github/workflows/deploy.yml` without Santosh reviewing it
