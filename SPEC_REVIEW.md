# Spec Review Process

> **The specification is the source of truth.**
> Tickets, designs, and code derive from it — not the other way around.

This document defines how to keep `stories.yaml` in sync with the Babylon Vault webapp as it evolves.

---

## Story Lifecycle

```
not-implemented → in-progress → implemented → (stale, if superseded)
```

| Status | Meaning |
|---|---|
| `not-implemented` | Story is defined; no code or tests exist yet |
| `in-progress` | Tests written and/or feature partially built; not yet shipped |
| `implemented` | All acceptance criteria verified (CI green, deterministic test_refs pass) |
| `stale` | Story superseded by product change; kept for historical reference |

---

## When to Update the Spec

### Before implementation begins
When a new feature is scoped, add its stories to `stories.yaml` **before** writing code.
Each story needs:
- A unique `story_id` (next in sequence, e.g. `BT-24`)
- A clear `title` and `section`
- `acceptance_criteria` — specific, testable, observable conditions
- `test_refs` — file paths and test identifiers once tests are written
- `status: not-implemented`

### When scope changes mid-implementation
Update the story first, then the code. The spec is the source of truth.
Never change code to match a stale spec silently — update the spec explicitly.

### When code diverges from the spec
Treat as a **bug**, not a spec update. Either:
1. Fix the code to match the spec, or
2. Raise a new story to revise the spec (with explicit justification), then update the code

### After shipping a feature
Run a coverage audit (see below) and mark stories as `implemented`.
A story is only `implemented` when:
- All acceptance criteria are met
- The corresponding `test_refs` tests are passing in CI

### When a story is superseded
Mark it `stale` with a `notes` field explaining what replaced it. Do not delete it.

---

## Coverage Audit (how to run)

The CI spec-audit workflow (`.github/workflows/spec-audit.yml`) runs automatically on every PR.
It uses [locus-audit-action](https://github.com/jonybur/locus-audit-action) to compare the PR diff
against `stories.yaml` and posts a coverage comment.

**To run locally:**

```bash
# Check which test_refs files exist
grep -A2 "test_refs:" stories.yaml | grep ".spec.ts" | while read line; do
  file=$(echo $line | sed 's/.*- "//' | sed 's/#.*//' | tr -d '"')
  [ -f "$file" ] && echo "✓ $file" || echo "✗ MISSING: $file"
done

# Count stories by status
grep "status:" stories.yaml | sort | uniq -c
```

**To manually audit coverage after shipping:**

1. For each `in-progress` story, confirm its `test_refs` tests are passing
2. If all acceptance criteria are verified by tests, update `status` to `implemented`
3. Commit the updated `stories.yaml` with message: `spec: mark BT-XX implemented`

---

## Commit Message Convention

| Change | Commit prefix |
|---|---|
| New story added | `spec: add BT-XX <title>` |
| Story status updated | `spec: mark BT-XX in-progress/implemented/stale` |
| Acceptance criteria revised | `spec: revise BT-XX acceptance criteria` |
| Multiple stories | `spec: post-ship coverage audit — BT-01..10 implemented` |

---

## PR Checklist (for any feature PR)

- [ ] Does this PR implement a story? If yes, is `status` updated in `stories.yaml`?
- [ ] Are new acceptance criteria reflected in `test_refs`?
- [ ] Did the spec-audit CI check pass? (informational — check the PR comment)
- [ ] If scope changed: was the spec updated *before* or *alongside* the code?

---

## Story Coverage Summary (as of 2026-05-05)

| Section | Stories | Status |
|---|---|---|
| Wallet Connection (BT-01–03) | 3 | `in-progress` — tests written |
| Deposit Flow (BT-04–10) | 7 | `in-progress` — tests written |
| Vault Lifecycle (BT-11–12) | 2 | `in-progress` — tests written |
| Aave Integration (BT-13–15) | 3 | `in-progress` — tests written |
| Position Monitoring (BT-16–17) | 2 | `in-progress` — tests written |
| Withdrawal (BT-18–19) | 2 | `not-implemented` |
| Activity Log (BT-20) | 1 | `not-implemented` |
| Compliance (BT-21–22) | 2 | `in-progress` — tests written |
| Application Selection (BT-23) | 1 | `not-implemented` |

**19 of 23 stories have tests written; 4 remain not-implemented.**
Next: Withdrawal and Pegout Monitoring (BT-18–19) — initiate withdrawal and monitor pegout status.
