#!/usr/bin/env node

/**
 * PreToolUse hook for AskUserQuestion.
 *
 * Intercepts AskUserQuestion tool calls, displays the full question on the
 * camel-pad device, waits for a button press, and returns the result as the
 * tool output — bypassing the terminal prompt entirely.
 *
 * Falls back with {continue: true} if the bridge is not reachable, so the
 * question appears in the terminal as normal.
 */

import WebSocket from 'ws';
import fs from 'fs';
import { randomUUID } from 'crypto';
import YAML from 'yaml';
import logger from './logger.js';
import { getConfigPath } from './config-path.js';

function parseConfig(configPath) {
  if (!fs.existsSync(configPath)) return null;
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = YAML.parse(content);
    if (!config?.server) return null;
    return {
      endpoint: `ws://${config.server.host || 'localhost'}:${config.server.port || 52914}`,
      timeoutMs: config.defaults?.timeoutMs ?? 30000,
    };
  } catch {
    return null;
  }
}

async function main(hookInput) {
  // Log the full input so we can diagnose format issues
  logger.log('hookInput keys:', Object.keys(hookInput).join(', '));
  logger.log('hookInput.tool_input:', JSON.stringify(hookInput.tool_input, null, 2)?.slice(0, 500));

  const config = parseConfig(getConfigPath());

  if (!config) {
    logger.log('No config found, falling back to terminal');
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Try multiple paths to extract the question — the hook input format may vary
  const firstQuestion = hookInput.tool_input?.questions?.[0];
  const question = firstQuestion?.question
    || hookInput.tool_input?.question   // alternate flat format
    || hookInput.tool_input?.text       // alternate field name
    || null;

  if (!question) {
    logger.log('No question found in hookInput, falling back to terminal');
    logger.log('tool_input:', JSON.stringify(hookInput.tool_input)?.slice(0, 300));
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const options = firstQuestion?.options || hookInput.tool_input?.options || [];
  logger.log('Sending question to device:', question.slice(0, 80));

  const messageId = randomUUID();
  let ws;

  const result = await new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      logger.log('Timeout waiting for button press — falling back to terminal');
      ws?.close();
      resolve(null);
    }, config.timeoutMs);

    try {
      ws = new WebSocket(config.endpoint);
    } catch (err) {
      clearTimeout(timeoutId);
      resolve(null);
      return;
    }

    ws.on('open', () => {
      const optionLabels = options.map(o => o.label);
      const msg = {
        type: 'notification',
        id: messageId,
        text: question,
        category: 'question',
        ...(optionLabels.length > 0 && { options: optionLabels }),
      };
      logger.send(msg);
      ws.send(JSON.stringify(msg));
    });

    ws.on('message', (data) => {
      logger.recv(data.toString());
      try {
        const response = JSON.parse(data.toString());
        if (response.id === messageId) {
          clearTimeout(timeoutId);
          ws.close();
          resolve(response);
        }
      } catch (e) {
        logger.error('recv parse error:', e.message);
      }
    });

    ws.on('error', (err) => {
      logger.log('WebSocket error — falling back to terminal:', err.message);
      clearTimeout(timeoutId);
      resolve(null);
    });

    ws.on('close', () => {
      // Resolved elsewhere; timeout will fire if not
    });
  });

  if (!result) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  if (result.action === 'cancel') {
    logger.log('User cancelled via camel-pad, falling back to terminal');
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  let selectedLabel;
  if (result.selectedIndex !== undefined && options.length > 0) {
    selectedLabel = options[result.selectedIndex]?.label || result.label || String(result.selectedIndex + 1);
  } else {
    selectedLabel = result.label || result.action || 'approve';
  }
  const reason = `User answered via camel-pad: ${selectedLabel}`;
  logger.log(reason);
  console.log(JSON.stringify({ decision: 'block', reason }));
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', async () => {
  try {
    await main(JSON.parse(input));
  } catch (err) {
    logger.error(err.message);
    console.log(JSON.stringify({ continue: true }));
  }
});
