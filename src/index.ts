#!/usr/bin/env bun

import { resolve } from 'path';
import { HIDDevice } from './hid/device.js';
import { listDevices } from './hid/discovery.js';
import { GestureDetector } from './gesture/detector.js';
import { ConfigWatcher } from './config/watcher.js';
import { NotificationServer } from './websocket/server.js';
import { validateConfig } from './config/loader.js';
import type { NotificationMessage } from './types.js';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

// Handle commands
if (command === 'list-devices') {
  console.log('Available HID devices:');
  const devices = listDevices();
  for (const device of devices) {
    const usagePage = device.usagePage !== undefined ? `0x${device.usagePage.toString(16).padStart(4, '0')}` : '----';
    const usage = device.usage !== undefined ? `0x${device.usage.toString(16).padStart(2, '0')}` : '--';
    const accessible = device.usagePage && device.usagePage >= 0xFF00 ? ' [accessible]' : '';
    console.log(`  Vendor: 0x${device.vendorId.toString(16).padStart(4, '0')} Product: 0x${device.productId.toString(16).padStart(4, '0')} UsagePage: ${usagePage} Usage: ${usage} - ${device.product || 'Unknown'}${accessible}`);
  }
  process.exit(0);
}

const configPath = resolve(command || 'config.yaml');

// Load and validate config
const configWatcher = new ConfigWatcher(configPath);
const config = configWatcher.getConfig();

const errors = validateConfig(config);
if (errors.length > 0) {
  console.error('Configuration errors:');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log('camel-pad starting...');
console.log(`Config: ${configPath}`);
console.log(`Device: vendor=0x${config.device.vendorId.toString(16)} product=0x${config.device.productId.toString(16)}`);
console.log(`Server: ws://${config.server.host}:${config.server.port}`);

// Initialize components
const hidDevice = new HIDDevice({
  vendorId: config.device.vendorId,
  productId: config.device.productId,
});

const gestureDetector = new GestureDetector({
  longPressMs: config.gestures.longPressMs,
  doublePressMs: config.gestures.doublePressMs,
});

const notificationServer = new NotificationServer(config);

// Wire up events

// HID button events → Gesture detector
hidDevice.on('button', ({ buttonId, pressed }) => {
  gestureDetector.handleButton(buttonId, pressed);
});

// Gesture events → Notification server
gestureDetector.on('gesture', ({ buttonId, gesture }) => {
  console.log(`Gesture: ${buttonId} ${gesture}`);
  const handled = notificationServer.handleGesture(buttonId, gesture);
  if (!handled && !notificationServer.hasPending()) {
    console.log('No pending notifications');
  }
});

// Notification events → HID display
notificationServer.on('notification', (message: NotificationMessage) => {
  console.log(`Notification: ${message.text}`);
  hidDevice.sendText(message.text);
});

// Config reload events
configWatcher.on('reload', (newConfig) => {
  console.log('Applying new configuration...');

  gestureDetector.updateConfig({
    longPressMs: newConfig.gestures.longPressMs,
    doublePressMs: newConfig.gestures.doublePressMs,
  });

  notificationServer.updateConfig(newConfig);
});

// Graceful shutdown
function shutdown(): void {
  console.log('\nShutting down...');
  configWatcher.stop();
  notificationServer.stop();
  hidDevice.disconnect();
  gestureDetector.reset();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start services
configWatcher.start();
notificationServer.start();
hidDevice.connect();

console.log('Ready. Press Ctrl+C to exit.');
