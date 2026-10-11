---
name: plan-review
description: Have an external reviewer (Codex or Claude CLI) review a plan file in plans/, then address or reject each finding and send it back, looping until the reviewer declares the plan ready to implement. Use when the user says "start a review loop for plan X" (X is the plan file), or asks to review, vet, or harden a plan.
---

# Plan review loop

Drives an adversarial review of a plan in `plans/` by a separate model process. You are the plan's author: you triage every finding (fix or reject with a reason), then send it back until the reviewer says it is ready.

## 1. Setup

1. Identify the plan file from the trigger ("start a review loop for plan X" → `plans/X.md`, or the exact path given). If the user didn't name one, ask. Never create a plan file.
2. **Always ask which reviewer to use** (AskUserQuestion: `codex` or `claude`), even if you think the answer is obvious. Ask every invocation; do not reuse an earlier answer.
3. Make a working dir in the scratchpad: `<scratchpad>/plan-review-<plan-name>/`. Round files go there, not in the repo.
4. Read the plan and the "Plan Review" and "Plans" sections of `AGENTS.md` yourself so you can triage knowledgeably.

## 2. Reviewer prompt

Write `round-N-prompt.md` in the working dir. Contents:

- The plan's repo-relative path; tell the reviewer to read it and `AGENTS.md` (the "Plans" and "Plan Review" sections define the criteria) and to verify claims against the actual code. It may read any file; it must not modify anything.
- Round 1: the review criteria from AGENTS.md "Plan Review" (incoherence, over-engineering, vague requirements, axiomatic structure, expectations, design independence, module structure, documentation scope, unjustified constants).
- Round 2+: the full prior history (every earlier finding, and your fix or rejection-with-reason for each), the instruction to check that fixes actually resolve the finding, to accept well-reasoned rejections, and to raise only genuinely new issues or unresolved ones. Do not let it relitigate accepted rejections.
- Required output format:
  - Findings as a numbered list, each: `[blocker|major|minor] <title>` — location in the plan, what is wrong, and a concrete suggested fix.
  - Final line, exactly one of: `VERDICT: READY` (no blocker or major findings remain) or `VERDICT: REVISE`.
- Tell it to be concise and not pad with praise or restating the plan.

## 3. Running the reviewer

Run from the repo root, foreground, with a long timeout (up to 600000 ms); if it may exceed that, use `run_in_background` and wait for the completion notification. Pipe the prompt via stdin so Windows quoting can't mangle it. Output goes to `round-N-review.md`.

Models are fixed: Codex uses `sol-6.1`, Claude uses `claude-sonnet-5-5`. Do not substitute others.

Codex (read-only sandbox):

```bash
codex exec -m sol-6.1 -s read-only --skip-git-repo-check -C . -o "<dir>/round-N-review.md" - < "<dir>/round-N-prompt.md"
```

Claude (read-only tools, headless):

```bash
claude -p --model claude-sonnet-5-5 --tools "Read,Grep,Glob" --permission-mode dontAsk < "<dir>/round-N-prompt.md" > "<dir>/round-N-review.md"
```

If the command fails or the output has no `VERDICT:` line, report the error to the user rather than guessing; retry once at most.

## 4. Triage

Read `round-N-review.md`. For **every** finding, decide:

- **Accept**: edit the plan to fix it. Keep fixes minimal and consistent with the rest of the plan (re-check the FR/DP/matrix/verification mappings if you changed one section). Constants must carry a value and a citation.
- **Reject**: only with a concrete reason grounded in the code, the plan's stated scope, or AGENTS.md. "Out of scope" or "disagree" without evidence is not enough. If you're unsure, verify against the code first.

Append to `round-N-response.md`: for each finding, `#<n> accepted — <what changed>` or `#<n> rejected — <reason>`. Keep this file; the next round's prompt includes it.

Do not argue a finding down just to reach READY, and don't accept one blindly: check that the reviewer's claim is true.

## 5. Loop

- `VERDICT: READY` → stop. Summarize for the user: rounds taken, what changed, what was rejected and why, and the plan path. Do not start implementing unless asked.
- `VERDICT: REVISE` → triage, then run round N+1.
- Cap at 5 rounds. If still not READY, stop and show the user the unresolved findings and your positions so they can decide.
- If the reviewer repeats a finding you rejected with a sound reason, say so in the response file once; if it still insists after two rounds, escalate to the user instead of looping.

## Notes

- Only the plan file is edited by this skill. Don't touch source code, and follow AGENTS.md's parallel-agent rules (no stash/checkout/reset).
- Both reviewers get the same prompt so results are comparable across runs.
