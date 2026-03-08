#!/usr/bin/env node

/**
 * Manual test suite for camel-pad notifications
 *
 * Sends real notifications to the device via WebSocket, exactly as Claude Code would.
 * Usage:
 *   node scripts/test-notifications.js          # interactive menu
 *   node scripts/test-notifications.js all      # run all tests sequentially
 *   node scripts/test-notifications.js <n>      # run test number n
 */

import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { randomUUID } from 'crypto';
import yaml from 'yaml';

// ── Config ────────────────────────────────────────────────────────────────────

function getConfigPath() {
  let base;
  if (process.platform === 'darwin') {
    base = path.join(os.homedir(), 'Library', 'Application Support', 'camel-pad');
  } else if (process.platform === 'win32') {
    base = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'camel-pad');
  } else {
    base = path.join(os.homedir(), '.config', 'camel-pad');
  }
  return path.join(base, 'config.yaml');
}

function loadConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    console.error(`No config found at ${configPath}. Run camel-pad first to create it.`);
    process.exit(1);
  }
  const content = fs.readFileSync(configPath, 'utf8');
  const config = yaml.parse(content);
  const endpoint = `ws://${config.server?.host || 'localhost'}:${config.server?.port || 52914}`;
  const timeoutMs = config.defaults?.timeoutMs || 30000;
  return { endpoint, timeoutMs };
}

// ── WebSocket send/receive ────────────────────────────────────────────────────

function sendNotification(endpoint, notification, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint);
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        ws.close();
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify(notification));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === notification.id) {
          if (!done) {
            done = true;
            clearTimeout(timer);
            ws.close();
            resolve(msg);
          }
        }
      } catch (_) {}
    });

    ws.on('error', (err) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(new Error(`WebSocket error: ${err.message}`));
      }
    });

    ws.on('close', () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(new Error('Connection closed before response'));
      }
    });
  });
}

// ── Test scenarios ────────────────────────────────────────────────────────────

const TESTS = [
  {
    name: 'AskUserQuestion — Yes/No (approve a file edit)',
    notification: {
      type: 'notification',
      text: 'Claude wants to edit src/main.cpp. Allow this change?',
      category: 'ask_user_question',
    },
  },
  {
    name: 'AskUserQuestion — Yes/No (run a shell command)',
    notification: {
      type: 'notification',
      text: 'Run: rm -rf dist/ && bun run build',
      category: 'ask_user_question',
    },
  },
  {
    name: 'AskUserQuestion — clarification needed',
    notification: {
      type: 'notification',
      text: 'Should I update the firmware or just the bridge?',
      category: 'ask_user_question',
    },
  },
  {
    name: 'Generic notification — task complete',
    notification: {
      type: 'notification',
      text: 'Build succeeded. 0 errors, 2 warnings.',
      category: 'generic',
    },
  },
  {
    name: 'Generic notification — error',
    notification: {
      type: 'notification',
      text: 'Tests failed: 3 of 12 assertions failed in gesture_test.ts',
      category: 'generic',
    },
  },
  {
    name: 'Long text — truncation test',
    notification: {
      type: 'notification',
      text: 'This is a very long notification message that tests how the display handles overflow. It contains many words and should wrap or truncate gracefully on the 820x320 display.',
      category: 'generic',
    },
  },
  {
    name: 'Permission request — bash tool',
    notification: {
      type: 'notification',
      text: 'Claude wants to run a bash command: platformio run --target upload',
      category: 'ask_user_question',
    },
  },
  {
    name: 'Permission request — write file',
    notification: {
      type: 'notification',
      text: 'Claude wants to write to firmware/src/display/display_manager.cpp',
      category: 'ask_user_question',
    },
  },
  {
    name: 'Queue test — 3 rapid notifications',
    multi: true,
    notifications: [
      { type: 'notification', text: 'Notification 1 of 3: Allow git push to main?', category: 'ask_user_question' },
      { type: 'notification', text: 'Notification 2 of 3: Delete 4 temp files?', category: 'ask_user_question' },
      { type: 'notification', text: 'Notification 3 of 3: Open browser for settings?', category: 'ask_user_question' },
    ],
  },
  {
    name: 'Special characters — unicode and symbols',
    notification: {
      type: 'notification',
      text: 'Commit message: "fix: handle ✓ checksum & \u00e9\u00e0\u00fc in serial frames"',
      category: 'generic',
    },
  },
];

// ── Output helpers ────────────────────────────────────────────────────────────

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';

function printResult(response) {
  if (response.type === 'response') {
    console.log(`  ${GREEN}Response:${RESET} action=${BOLD}${response.action}${RESET} label=${BOLD}${response.label || '(none)'}${RESET}`);
  } else if (response.type === 'error') {
    console.log(`  ${RED}Error:${RESET} ${response.error}`);
  } else {
    console.log(`  ${DIM}Unknown response:${RESET}`, JSON.stringify(response));
  }
}

// ── Test runner ───────────────────────────────────────────────────────────────

async function runTest(index, config) {
  const test = TESTS[index];
  console.log(`\n${CYAN}[${index + 1}] ${test.name}${RESET}`);

  if (test.multi) {
    // Send all in parallel, report each result as it arrives
    const promises = test.notifications.map((n) => {
      const notification = { ...n, id: randomUUID() };
      console.log(`  ${DIM}Sending:${RESET} ${notification.text}`);
      return sendNotification(config.endpoint, notification, config.timeoutMs)
        .then((resp) => {
          console.log(`  ${DIM}[${notification.text.slice(0, 40)}...]${RESET}`);
          printResult(resp);
        })
        .catch((err) => {
          console.log(`  ${RED}Error: ${err.message}${RESET}`);
        });
    });
    await Promise.all(promises);
  } else {
    const notification = { ...test.notification, id: randomUUID() };
    console.log(`  ${DIM}Text:${RESET}     ${notification.text}`);
    console.log(`  ${DIM}Category:${RESET} ${notification.category}`);
    try {
      const response = await sendNotification(config.endpoint, notification, config.timeoutMs);
      printResult(response);
    } catch (err) {
      console.log(`  ${RED}Error: ${err.message}${RESET}`);
    }
  }
}

async function runAll(config) {
  console.log(`\n${BOLD}Running all ${TESTS.length} tests sequentially...${RESET}`);
  for (let i = 0; i < TESTS.length; i++) {
    await runTest(i, config);
  }
  console.log(`\n${GREEN}Done.${RESET}`);
}

// ── Interactive menu ──────────────────────────────────────────────────────────

function printMenu() {
  console.log(`\n${BOLD}camel-pad notification tests${RESET}\n`);
  TESTS.forEach((t, i) => {
    const tag = t.multi ? ` ${DIM}[multi]${RESET}` : '';
    console.log(`  ${YELLOW}${i + 1}.${RESET} ${t.name}${tag}`);
  });
  console.log(`  ${YELLOW}a.${RESET} Run all`);
  console.log(`  ${YELLOW}q.${RESET} Quit`);
  console.log('');
}

async function interactiveMenu(config) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  printMenu();

  while (true) {
    const answer = (await ask('Select: ')).trim().toLowerCase();

    if (answer === 'q' || answer === 'quit') {
      rl.close();
      break;
    }

    if (answer === 'a' || answer === 'all') {
      await runAll(config);
      printMenu();
      continue;
    }

    const n = parseInt(answer, 10);
    if (!isNaN(n) && n >= 1 && n <= TESTS.length) {
      await runTest(n - 1, config);
    } else {
      console.log(`${RED}Invalid selection.${RESET}`);
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const config = loadConfig();
  console.log(`${DIM}Connecting to ${config.endpoint}${RESET}`);

  const arg = process.argv[2];

  if (!arg) {
    await interactiveMenu(config);
    return;
  }

  if (arg === 'all') {
    await runAll(config);
    return;
  }

  const n = parseInt(arg, 10);
  if (!isNaN(n) && n >= 1 && n <= TESTS.length) {
    await runTest(n - 1, config);
  } else {
    console.error(`Unknown argument: ${arg}`);
    console.error(`Usage: node scripts/test-notifications.js [all | 1-${TESTS.length}]`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
