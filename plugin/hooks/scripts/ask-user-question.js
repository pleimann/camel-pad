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

const WebSocket = require('ws');
const fs = require('fs');
const { randomUUID } = require('crypto');
const yaml = require('yaml');
const logger = require('./logger');

function parseConfig(configPath) {
  if (!fs.existsSync(configPath)) return null;
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = yaml.parse(content);
    if (!config?.server) return null;
    return {
      endpoint: `ws://${config.server.host || 'localhost'}:${config.server.port || 52914}`,
      timeoutMs: config.defaults?.timeoutMs ?? 30000,
    };
  } catch {
    return null;
  }
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', async () => {
  try {
    await main(JSON.parse(input));
  } catch (err) {
    logger.error(err.message);
    // On any error, let the terminal handle it
    console.log(JSON.stringify({ continue: true }));
  }
});

async function main(hookInput) {
  const { getConfigPath } = require('./config-path');
  const config = parseConfig(getConfigPath());

  if (!config) {
    logger.log('No config found, falling back to terminal');
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const firstQuestion = hookInput.tool_input?.questions?.[0];
  if (!firstQuestion?.question) {
    logger.log('No question found in tool_input.questions[0], falling back to terminal');
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const question = firstQuestion.question;
  const options = firstQuestion.options || [];
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
      // Send question text and options separately — the bridge handles
      // selection display with highlight and navigation labels.
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
    // Bridge unavailable or timed out — let the terminal show the question
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Cancel → fall back to terminal
  if (result.action === 'cancel') {
    logger.log('User cancelled via camel-pad, falling back to terminal');
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Build a descriptive answer Claude can interpret as the user's response
  let selectedLabel;
  if (result.selectedIndex !== undefined && options.length > 0) {
    selectedLabel = options[result.selectedIndex]?.label || result.label || String(result.selectedIndex + 1);
  } else {
    selectedLabel = result.label || result.action || 'approve';
  }
  const reason = `User answered via camel-pad: ${selectedLabel}`;
  logger.log(reason);
  console.log(JSON.stringify({
    decision: 'block',
    reason,
  }));
}
