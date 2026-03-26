#!/usr/bin/env node

/**
 * Test WebSocket connectivity to camel-pad
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
    console.error('Error parsing config:', err.message);
    return null;
  }
}

async function main() {
  const config = parseConfig(getConfigPath()) || { endpoint: 'ws://localhost:52914', timeout: 10 };
  const timeout = (config.timeout || 10) * 1000;
  const messageId = randomUUID();

  try {
    const ws = new WebSocket(config.endpoint);

    const result = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timeout'));
      }, timeout);

      ws.on('open', () => {
        const msg = { type: 'test', id: messageId, text: 'This is a test message from Claude. Press any Key', category: 'test' };
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
        if (err.code === 'ECONNREFUSED') {
          reject(new Error('Connection refused — is the Camel Pad app running?'));
        } else {
          reject(err);
        }
      });
    });

    console.log(JSON.stringify({ success: true, endpoint: config.endpoint, response: result }));
  } catch (err) {
    console.log(JSON.stringify({ success: false, endpoint: config.endpoint, error: err.message }));
    process.exit(1);
  }
}

main();
