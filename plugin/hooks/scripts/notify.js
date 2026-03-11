#!/usr/bin/env node

/**
 * WebSocket client for camel-pad notifications
 *
 * Reads notification JSON from stdin, sends to camel-pad via WebSocket,
 * waits for response, and outputs result JSON to stdout.
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const yaml = require('yaml');
const logger = require('./logger');

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

/**
 * Parse config.yaml
 */
function parseConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = yaml.parse(content);

    if (!config || !config.server) {
      return null;
    }

    // Extract settings needed for WebSocket connection
    const endpoint = `ws://${config.server.host || 'localhost'}:${config.server.port || 52914}`;
    const timeout = config.defaults?.timeoutMs ? Math.floor(config.defaults.timeoutMs / 1000) : 30;

    return { endpoint, timeout };
  } catch (err) {
    logger.error('Error parsing config:', err.message);
    return null;
  }
}

async function main(hookInput) {
  const { getConfigPath } = require('./config-path');
  const configPath = getConfigPath();

  const config = parseConfig(configPath);
  if (!config) {
    // No config, silently pass through (not configured)
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  if (!config.endpoint) {
    logger.error('No endpoint configured');
    process.exit(2);
  }

  if (!config.timeout) {
    logger.error('No timeout configured');
    process.exit(2);
  }

  // Extract notification info from hook input
  const notificationText = hookInput.notification_text || hookInput.message || '';
  const notificationCategory = hookInput.notification_category || hookInput.category || 'unknown';

  // AskUserQuestion fires a 'permission_prompt' notification, but it's already
  // handled by the PreToolUse hook (ask-user-question.js). Skip it here to avoid
  // a duplicate notification on the device requiring a second button press.
  if (notificationCategory === 'permission_prompt') {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Connect to WebSocket and send notification
  const messageId = randomUUID();
  const ws = new WebSocket(config.endpoint);

  const timeoutMs = config.timeout * 1000;
  let timeoutId;
  let resolved = false;

  const result = await new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(new Error(`Timeout waiting for response after ${config.timeout}s`));
      }
    }, timeoutMs);

    ws.on('open', () => {
      const msg = {
        type: 'notification',
        id: messageId,
        text: notificationText,
        category: notificationCategory
      };
      logger.send(msg);
      ws.send(JSON.stringify(msg));
    });

    ws.on('message', (data) => {
      logger.recv(data.toString());
      try {
        const response = JSON.parse(data.toString());
        if (response.type === 'response' && response.id === messageId) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            ws.close();
            resolve(response);
          }
        }
      } catch (e) {
        logger.error('recv parse error:', e.message);
      }
    });

    ws.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        reject(new Error(`WebSocket error: ${err.message}`));
      }
    });

    ws.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        reject(new Error('WebSocket closed before receiving response'));
      }
    });
  });

  // Return the response to Claude Code
  console.log(JSON.stringify({
    continue: true,
    systemMessage: `User responded via camel-pad: ${result.action} (${result.label || ''})`,
    hookSpecificOutput: {
      action: result.action,
      label: result.label
    }
  }));
}
