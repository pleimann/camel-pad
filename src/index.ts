#!/usr/bin/env bun

import { resolve } from 'path';
import { listPorts } from './serial/discovery.js';
import { startBridge } from './bridge.js';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

// Handle commands
if (command === 'list-devices') {
  console.log('Available serial ports:');
  const ports = await listPorts();
  for (const port of ports) {
    const vid = port.vendorId ? `0x${port.vendorId}` : '----';
    const pid = port.productId ? `0x${port.productId}` : '----';
    console.log(`  ${port.path}  Vendor: ${vid}  Product: ${pid}`);
  }
  process.exit(0);
}

const configPath = resolve(command || 'config.yaml');

console.log('camel-pad starting...');
console.log(`Config: ${configPath}`);

const bridge = await startBridge(configPath);

console.log('Ready. Press Ctrl+C to exit.');

function shutdown(): void {
  console.log('\nShutting down...');
  bridge.shutdown();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
