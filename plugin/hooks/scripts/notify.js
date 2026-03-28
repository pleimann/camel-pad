#!/usr/bin/env node

/**
 * WebSocket client for camel-pad notifications
 *
 * Reads notification JSON from stdin, sends to camel-pad via WebSocket,
 * waits for response, and outputs result JSON to stdout.
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
      timeout: config.defaults?.timeoutMs ? Math.floor(config.defaults.timeoutMs / 1000) : 30,
    };
  } catch (err) {
    logger.error('Error parsing config:', err.message);
    return null;
  }
}

async function main(hookInput) {
  logger.log('notification category:', hookInput.notification_category, 'text:', (hookInput.notification_text || '').slice(0, 80));

  const config = parseConfig(getConfigPath());
  if (!config) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  if (!config.endpoint || !config.timeout) {
    logger.error('Incomplete config');
    process.exit(2);
  }

  const notificationText = hookInput.notification_text || hookInput.message || '';
  const notificationCategory = hookInput.notification_category || hookInput.category || 'unknown';

  // Skip notifications that are handled by more specific hooks:
  // - permission_prompt / tool_use: handled by PreToolUse hook (ask-user-question.js)
  //   or by the channel permission relay
  // - The generic "needs your attention" text accompanies tool-use prompts that
  //   the PreToolUse hook or channel permission relay already display with full context.
  if (notificationCategory === 'permission_prompt' || notificationCategory === 'tool_use') {
    logger.log('Skipping notification (category:', notificationCategory, ')');
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const messageId = randomUUID();
  const ws = new WebSocket(config.endpoint);
  const timeoutMs = config.timeout * 1000;
  let resolved = false;

  const result = await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(new Error(`Timeout waiting for response after ${config.timeout}s`));
      }
    }, timeoutMs);

    ws.on('open', () => {
      const msg = { type: 'notification', id: messageId, text: notificationText, category: notificationCategory };
      logger.send(msg);
      ws.send(JSON.stringify(msg));
    });

    ws.on('message', (data) => {
      logger.recv(data.toString());
      try {
        const response = JSON.parse(data.toString());
        if (response.type === 'response' && response.id === messageId && !resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          ws.close();
          resolve(response);
        }
      } catch (e) {
        logger.error('recv parse error:', e.message);
      }
    });

    ws.on('error', (err) => {
      if (!resolved) { resolved = true; clearTimeout(timeoutId); reject(new Error(`WebSocket error: ${err.message}`)); }
    });

    ws.on('close', () => {
      if (!resolved) { resolved = true; clearTimeout(timeoutId); reject(new Error('WebSocket closed before receiving response')); }
    });
  });

  console.log(JSON.stringify({
    continue: true,
    systemMessage: `User responded via camel-pad: ${result.action} (${result.label || ''})`,
    hookSpecificOutput: { action: result.action, label: result.label },
  }));
}

// Read stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', async () => {
  try {
    await main(JSON.parse(input));
  } catch (err) {
    logger.error(err.message);
    process.exit(2);
  }
});
