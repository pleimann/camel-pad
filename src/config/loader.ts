import { readFileSync } from 'fs';
import { parse } from 'yaml';
import type { Config, ActionMapping, KeyMapping } from '../types.js';

const DEFAULT_CONFIG: Config = {
  device: {},
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
  handedness: 'right',
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

function normalizeActionMapping(raw: any): ActionMapping | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  // Already has explicit type
  if (raw.type === 'action') {
    return { type: 'action', action: raw.action || '', label: raw.label || '' };
  }
  if (raw.type === 'keybinding') {
    return { type: 'keybinding', keybinding: raw.keybinding || '', label: raw.label || '' };
  }
  if (raw.type === 'global') {
    return { type: 'global', keybinding: raw.keybinding || '', label: raw.label || '' };
  }

  // Legacy keys: ["ctrl+c"] format
  if (Array.isArray(raw.keys)) {
    return { type: 'global', keybinding: raw.keys.join(', '), label: raw.label || '' };
  }

  // Legacy { action, label } format (no type field)
  if (raw.action) {
    return { type: 'action', action: raw.action, label: raw.label || '' };
  }

  return undefined;
}

function normalizeKeys(keys: Record<string, any>): Record<string, KeyMapping> {
  const result: Record<string, KeyMapping> = {};
  const gestureFields = ['press', 'doublePress', 'double_press', 'longPress', 'long_press'] as const;
  const canonicalName: Record<string, keyof KeyMapping> = {
    press: 'press',
    doublePress: 'doublePress',
    double_press: 'doublePress',
    longPress: 'longPress',
    long_press: 'longPress',
  };

  for (const [keyId, rawMapping] of Object.entries(keys)) {
    if (!rawMapping || typeof rawMapping !== 'object') continue;
    const keyMapping: KeyMapping = {};
    for (const field of gestureFields) {
      if (rawMapping[field]) {
        const normalized = normalizeActionMapping(rawMapping[field]);
        if (normalized) {
          keyMapping[canonicalName[field]] = normalized;
        }
      }
    }
    result[keyId] = keyMapping;
  }
  return result;
}

function mergeConfig(defaults: Config, overrides: Partial<Config>): Config {
  const rawKeys = overrides.keys || defaults.keys;
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
    keys: normalizeKeys(rawKeys),
    defaults: {
      ...defaults.defaults,
      ...overrides.defaults,
    },
    handedness: overrides.handedness ?? defaults.handedness,
  };
}

export function validateConfig(config: Config): string[] {
  const errors: string[] = [];

  const hasPort = !!config.device.port;
  const hasIds = config.device.vendorId && config.device.vendorId > 0 &&
                 config.device.productId && config.device.productId > 0;
  if (!hasPort && !hasIds) {
    errors.push('device.port or both device.vendorId and device.productId must be set');
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
