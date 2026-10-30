---
name: reward-sandbox-test
description: Automated test harness for verifying sandbox isolation, execution timeouts, and component summation of generated reward scripts.
---

# Reward Sandbox Test Procedure

## Purpose
Evaluates candidate `reward.py` code across 3 standard trajectories (stalled, goal-seeking, boundary-hugging) to verify finite outputs, component summation, and AST sandboxing.

## Execution
Run `npx tsx test/reward_sandbox.test.ts`.
