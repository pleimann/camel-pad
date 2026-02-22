import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync } from 'fs';

/**
 * Returns the path to the tray app's config file, creating the directory
 * if it doesn't exist.
 *
 * macOS: ~/Library/Application Support/camel-pad/config.yaml
 * Windows: %APPDATA%\camel-pad\config.yaml
 * Linux/other: ~/.config/camel-pad/config.yaml
 */
export function getTrayConfigPath(): string {
  let base: string;
  if (process.platform === 'darwin') {
    base = join(homedir(), 'Library', 'Application Support', 'camel-pad');
  } else if (process.platform === 'win32') {
    base = join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'camel-pad');
  } else {
    base = join(homedir(), '.config', 'camel-pad');
  }

  mkdirSync(base, { recursive: true });
  return join(base, 'config.yaml');
}
