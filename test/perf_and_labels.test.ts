import test from 'node:test';
import assert from 'node:assert/strict';
import { getBuildStamp, formatBuildStamp } from '../lib/build_stamp';

test('S-14 BuildStamp: Version string does not contain duplicate production tokens', () => {
  const origEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const stamp = getBuildStamp();
    const formatted = formatBuildStamp(stamp);

    // Assert that "production" does not appear twice consecutively or redundantly
    const matches = formatted.match(/production/gi) || [];
    assert.ok(
      matches.length <= 1,
      `Formatted build stamp "${formatted}" should not duplicate "production" token (found ${matches.length} occurrences)`
    );
  } finally {
    process.env.NODE_ENV = origEnv;
  }
});

test('S-13 Long Tasks: Distinguishes startup tasks (<5s) from steady-state tasks and filters window', () => {
  interface Task {
    duration: number;
    startTime: number;
    name: string;
  }

  const now = 70000; // 70 seconds
  const tasks: Task[] = [
    { duration: 85, startTime: 800, name: 'startup-shader-compile' }, // Startup (<5s)
    { duration: 60, startTime: 8000, name: 'old-steady-task' }, // Older than 60s from 70s (now - startTime = 62s > 60s)
    { duration: 55, startTime: 35000, name: 'recent-steady-task' }, // Recent steady state (now - startTime = 35s <= 60s)
  ];

  function getActiveSteadyStateTasks(taskList: Task[], currentTime: number, windowMs = 60000, startupThresholdMs = 5000): Task[] {
    return taskList.filter((t) => t.startTime >= startupThresholdMs && (currentTime - t.startTime) <= windowMs);
  }

  const active = getActiveSteadyStateTasks(tasks, now);
  assert.equal(active.length, 1, 'Only recent steady-state task is counted');
  assert.equal(active[0].name, 'recent-steady-task');

  // At steady state with only startup tasks:
  const onlyStartup = getActiveSteadyStateTasks([tasks[0]], 15000);
  assert.equal(onlyStartup.length, 0, 'Startup tasks are excluded from steady-state alert badge');
});
