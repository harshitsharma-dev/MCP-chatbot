// mcp_basic_test.js
const { spawn } = require('child_process');
const path = require('path');

// Start MCP server
console.log('[Test] Starting MCP server...');
const mcp = spawn('node', [path.join('mcp-server-arangodb', 'build', 'index.js')], {
  env: {
    ...process.env,
    ARANGO_URL: "http://lsdiedb39c.pagekite.me",
    ARANGO_DB: "newsDB2022",
    ARANGO_USERNAME: "root",
    ARANGO_PASSWORD: "i-0172f1f969c7548c4"
  },
  stdio: ['pipe', 'pipe', 'pipe']
});

// Handle all output explicitly
mcp.stdout.on('data', (data) => {
  console.log('[MCP stdout]', data.toString());
});

mcp.stderr.on('data', (data) => {
  console.log('[MCP stderr]', data.toString());
  
  // When server is ready, send a test request
  if (data.toString().includes('ArangoDB MCP server running')) {
    console.log('[Test] Server ready, sending test request...');
    const req = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'get_system_time',
        arguments: {}
      },
      id: 1
    };
    mcp.stdin.write(JSON.stringify(req) + '\n');
  }
});

mcp.on('error', (err) => {
  console.error('[MCP error]', err);
});

mcp.on('close', (code) => {
  console.log('[MCP close] code:', code);
});

// Clean up after 10 seconds
setTimeout(() => {
  console.log('[Test] Test complete, shutting down...');
  mcp.kill();
  process.exit(0);
}, 10000);
