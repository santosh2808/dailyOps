#!/usr/bin/env bash
# Release rules for test-deploy -> main. Run by release-check.yml (live status
# on the PR) and by deploy.yml's gate job (before production deploys).
set -uo pipefail

: "${REPO:?}" "${PR_NUMBER:?}" "${BASE_SHA:?}"
GATE_MODE="${GATE_MODE:-report}"
APPROVERS="${APPROVERS:-santosh2808}"
MIN_CHECKED="${MIN_CHECKED:-6}"
CHECK_ISSUES="${CHECK_ISSUES:-true}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

failures=0
pass() { echo "PASS: $1"; echo "- ✅ $1" >>"$SUMMARY"; }
fail() { echo "::error::$1"; echo "- ❌ $1" >>"$SUMMARY"; failures=$((failures + 1)); }
warn() { echo "::warning::$1"; echo "- ⚠️ $1" >>"$SUMMARY"; }

echo "### Release gate: PR #$PR_NUMBER (mode: $GATE_MODE)" >>"$SUMMARY"

pr_json=$(gh api "repos/$REPO/pulls/$PR_NUMBER") || { fail "Could not read PR #$PR_NUMBER"; pr_json='{}'; }
head_ref=$(jq -r '.head.ref // ""' <<<"$pr_json")
base_ref=$(jq -r '.base.ref // ""' <<<"$pr_json")
head_sha=$(jq -r '.head.sha // ""' <<<"$pr_json")
body=$(jq -r '.body // ""' <<<"$pr_json" | tr -d '\r')

# 1. Only release PRs from test-deploy may reach main
if [ "$head_ref" = "test-deploy" ] && [ "$base_ref" = "main" ]; then
  pass "PR is test-deploy → main"
else
  fail "PR must be test-deploy → main (this one is ${head_ref:-?} → ${base_ref:-?})"
fi

# 2. An approver approved the latest commit (an older approval does not count)
approved_by=""
for user in $APPROVERS; do
  last=$(gh api --paginate "repos/$REPO/pulls/$PR_NUMBER/reviews" \
    --jq ".[] | select(.user.login == \"$user\" and (.state == \"APPROVED\" or .state == \"CHANGES_REQUESTED\" or .state == \"DISMISSED\")) | \"\(.state) \(.commit_id)\"" \
    2>/dev/null | tail -n1)
  if [ -n "$head_sha" ] && [ "$last" = "APPROVED $head_sha" ]; then
    approved_by="$user"
    break
  fi
done
if [ -n "$approved_by" ]; then
  pass "Approved by $approved_by on the latest commit"
else
  fail "Needs an approval from $APPROVERS on the latest commit (${head_sha:0:7})"
fi

# 3. QA checklist in the PR description is fully ticked
unticked=$(grep -cE '^[[:space:]]*[-*] \[ \]' <<<"$body" || true)
ticked=$(grep -ciE '^[[:space:]]*[-*] \[x\]' <<<"$body" || true)
if [ "$unticked" -eq 0 ] && [ "$ticked" -ge "$MIN_CHECKED" ]; then
  pass "QA checklist complete ($ticked items ticked)"
else
  fail "QA checklist incomplete: $unticked unticked, $ticked ticked (need 0 unticked and at least $MIN_CHECKED ticked)"
fi

# 4. This exact commit passed the TEST pipeline
runs=$(gh api "repos/$REPO/actions/workflows/test-deploy.yml/runs?head_sha=$head_sha&status=success&per_page=1" \
  --jq '.total_count' 2>/dev/null || echo 0)
if [ -n "$head_sha" ] && [ "${runs:-0}" -ge 1 ]; then
  pass "Commit ${head_sha:0:7} passed Deploy to TEST"
else
  fail "Commit ${head_sha:0:7} has no successful Deploy to TEST run"
fi

# 5. test-deploy already contains everything on main, so after the merge
#    production gets exactly the code that was tested
if [ -n "$head_sha" ] && git merge-base --is-ancestor "$BASE_SHA" "$head_sha" 2>/dev/null; then
  pass "test-deploy includes everything on main: production gets exactly the tested code"
else
  fail "main has changes that are not in test-deploy. Merge main into test-deploy, let TEST redeploy, re-test"
fi

# 6. No open Critical/High bugs in GitHub Issues
if [ "$CHECK_ISSUES" = "true" ]; then
  open=0
  for label in Critical High; do
    n=$(gh api "repos/$REPO/issues?state=open&labels=$label&per_page=100" \
      --jq '[.[] | select(.pull_request == null)] | length' 2>/dev/null || echo 0)
    open=$((open + ${n:-0}))
  done
  if [ "$open" -eq 0 ]; then
    pass "No open Critical/High bug issues"
  else
    fail "$open open Critical/High bug issue(s)"
  fi
fi

if [ -n "$head_sha" ] && git diff --name-only "$BASE_SHA" "$head_sha" -- \
    .github/workflows/deploy.yml .github/scripts/release-gate.sh 2>/dev/null | grep -q .; then
  warn "This release changes the production pipeline or this gate. Reviewer must check those files carefully"
fi

if [ "$failures" -gt 0 ]; then
  if [ "$GATE_MODE" = "block" ]; then
    echo "**Result: BLOCKED. $failures check(s) failed.**" >>"$SUMMARY"
    exit 1
  fi
  echo "**Result: would be BLOCKED ($failures check(s) failed). Report-only mode, so the deploy continues.**" >>"$SUMMARY"
  warn "Report-only mode: $failures check(s) failed, deploy continues"
  exit 0
fi
echo "**Result: PASSED.**" >>"$SUMMARY"
