#!/usr/bin/env node

/**
 * Stop hook for camel-pad.
 *
 * When Claude ends a turn with a plain-text question, this hook displays it
 * on the camel-pad device and waits for a button press. The response is
 * returned as a block reason so Claude continues with the user's answer.
 *
 * Falls back with {continue: true} if:
 *   - stop_hook_active is true (prevents infinite loops)
 *   - No question is found in the last assistant message
 *   - The bridge is not reachable
 *   - The device times out
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

/**
 * Extract the last question sentence from a block of text.
 * Returns null if no question is found.
 */
function extractLastQuestion(text) {
  if (!text) return null;
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i].trim();
    if (s.endsWith('?')) return s;
  }
  return null;
}

async function main(hookInput) {
  if (hookInput.stop_hook_active) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const question = extractLastQuestion(hookInput.last_assistant_message);
  if (!question) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const config = parseConfig(getConfigPath());
  if (!config) {
    logger.log('No config found, falling back to terminal');
    console.log(JSON.stringify({ continue: true }));
    return;
  }

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
      const msg = { type: 'notification', id: messageId, text: question, category: 'question' };
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

  if (!result || result.action === 'cancel') {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const label = result.label || result.action || 'approve';
  const reason = `User answered via camel-pad: ${label}`;
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
