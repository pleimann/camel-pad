import { readFileSync } from 'fs';
import { parse } from 'yaml';
import type { Config } from '../types.js';

const DEFAULT_CONFIG: Config = {
  device: {
    vendorId: 0x1234,
    productId: 0x5678,
  },
  server: {
    port: 52914,
    host: 'localhost',
  },
  gestures: {
    longPressMs: 500,
    doublePressMs: 300,
  },
  keys: {},
  defaults: {
    timeoutMs: 30000,
  },
};

export function loadConfig(path: string): Config {
  try {
    const content = readFileSync(path, 'utf8');
    const parsed = parse(content) as Partial<Config>;
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`Config file not found: ${path}, using defaults`);
      return DEFAULT_CONFIG;
    }
    throw err;
  }
}

function mergeConfig(defaults: Config, overrides: Partial<Config>): Config {
  return {
    device: {
      ...defaults.device,
      ...overrides.device,
    },
    server: {
      ...defaults.server,
      ...overrides.server,
    },
    gestures: {
      ...defaults.gestures,
      ...overrides.gestures,
    },
    keys: overrides.keys || defaults.keys,
    defaults: {
      ...defaults.defaults,
      ...overrides.defaults,
    },
  };
}

export function validateConfig(config: Config): string[] {
  const errors: string[] = [];

  if (!config.device.vendorId || config.device.vendorId <= 0) {
    errors.push('device.vendorId must be a positive number');
  }
  if (!config.device.productId || config.device.productId <= 0) {
    errors.push('device.productId must be a positive number');
  }
  if (!config.server.port || config.server.port <= 0 || config.server.port > 65535) {
    errors.push('server.port must be between 1 and 65535');
  }
  if (config.gestures.longPressMs <= 0) {
    errors.push('gestures.longPressMs must be positive');
  }
  if (config.gestures.doublePressMs <= 0) {
    errors.push('gestures.doublePressMs must be positive');
  }

  return errors;
}
