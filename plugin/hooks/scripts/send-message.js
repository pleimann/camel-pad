#!/usr/bin/env node

/**
 * Send a custom message to camel-pad and wait for response
 * Usage: node send-message.js "Your message here"
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

const message = process.argv.slice(2).join(' ');

if (!message) {
  console.log(JSON.stringify({ success: false, error: 'No message provided' }));
  process.exit(1);
}

async function main() {
  const config = parseConfig(getConfigPath());

  if (!config) {
    console.log(JSON.stringify({ success: false, error: 'No configuration found. Run /camel-pad:configure first.' }));
    process.exit(1);
  }

  if (!config.endpoint || !config.timeout) {
    console.log(JSON.stringify({ success: false, error: 'Incomplete configuration' }));
    process.exit(1);
  }

  const timeout = config.timeout * 1000;
  const messageId = randomUUID();

  try {
    const ws = new WebSocket(config.endpoint);

    const result = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        ws.close();
        reject(new Error(`Timeout waiting for response after ${config.timeout}s`));
      }, timeout);

      ws.on('open', () => {
        const msg = { type: 'message', id: messageId, text: message, category: 'custom' };
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
        clearTimeout(timeoutId);
        reject(err);
      });
    });

    console.log(JSON.stringify({
      success: true,
      message,
      response: { action: result.action, label: result.label },
    }));
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: err.message }));
    process.exit(1);
  }
}

main();
