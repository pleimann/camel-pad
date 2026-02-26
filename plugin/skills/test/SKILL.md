---
description: Use this skill when the user asks to "test camel-pad", "check camel-pad connection", "verify macropad connectivity", or wants to test that the camel-pad bridge is working correctly.
---

# Test camel-pad Bridge Connectivity

Send a test message to the camel-pad device to verify WebSocket connectivity.

## Instructions

1. Use Bash to run the test script:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/test-connection.js
   ```

2. Report the result:
   - **Success**: "Connected to camel-pad at [endpoint]. Response received: [action]"
   - **Connection failure**: "Could not connect to camel-pad. Make sure the Camel Pad app is running."
   - **Other failure**: "Failed to connect to camel-pad: [error message]"

## Tips

- Ensure the Camel Pad app is running with the WebSocket API enabled
- Default port is 52914
