/**
 * Centralized logger for camel-pad plugin scripts.
 * All output goes to stderr so it doesn't interfere with JSON on stdout.
 * Every line is prefixed with [camel-pad] for easy grepping in Claude debug logs.
 */

const PREFIX = '[camel-pad]';

const logger = {
  log(...args) {
    console.error(PREFIX, ...args);
  },
  error(...args) {
    console.error(PREFIX, '[error]', ...args);
  },
  send(msg) {
    console.error(PREFIX, '[send]', typeof msg === 'string' ? msg : JSON.stringify(msg));
  },
  recv(msg) {
    console.error(PREFIX, '[recv]', typeof msg === 'string' ? msg : JSON.stringify(msg));
  },
};

export default logger;
