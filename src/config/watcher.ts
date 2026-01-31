import { EventEmitter } from 'events';
import { watch, type FSWatcher } from 'chokidar';
import { loadConfig, validateConfig } from './loader.js';
import type { Config } from '../types.js';

export class ConfigWatcher extends EventEmitter {
  private path: string;
  private watcher: FSWatcher | null = null;
  private config: Config;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 100;

  constructor(path: string) {
    super();
    this.path = path;
    this.config = loadConfig(path);
  }

  getConfig(): Config {
    return this.config;
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = watch(this.path, {
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on('change', () => this.handleChange());
    this.watcher.on('error', (err) => {
      console.error('Config watcher error:', err);
    });

    console.log(`Watching config file: ${this.path}`);
  }

  private handleChange(): void {
    // Debounce rapid changes
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.reload();
    }, this.DEBOUNCE_MS);
  }

  private reload(): void {
    try {
      const newConfig = loadConfig(this.path);
      const errors = validateConfig(newConfig);

      if (errors.length > 0) {
        console.error('Config validation errors:', errors);
        return;
      }

      const oldConfig = this.config;
      this.config = newConfig;

      console.log('Config reloaded');
      this.emit('reload', newConfig, oldConfig);
    } catch (err) {
      console.error('Failed to reload config:', err);
    }
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
