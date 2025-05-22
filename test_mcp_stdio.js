#!/usr/bin/env node
// test_mcp_stdio.js
// Minimal script to test MCP server stdio JSON-RPC

const { spawn } = require('child_process');

// Set your environment variables here
const env = {
  ...process.env,
  ARANGO_URL: "http://lsdiedb39c.pagekite.me",
  ARANGO_DB: "newsDB2022",
  ARANGO_USERNAME: "root",
  ARANGO_PASSWORD: "i-0172f1f969c7548c4"
};

const mcp = spawn('node', ['mcp-server-arangodb/build/index.js'], {
  env,
  stdio: ['pipe', 'pipe', process.platform === 'win32' ? 'pipe' : 'inherit'] // capture stderr on Windows
});

if (mcp.stderr) {
  mcp.stderr.on('data', chunk => {
    console.error('[Test][STDERR]', chunk.toString());
  });
}

// Test requesting 5 recent articles
const req = {
  jsonrpc: '2.0',
  method: 'tools/call',
  params: {
    name: 'flexible_recent_articles',
    arguments: {
      limit: 5,
      detail: 'summary',
      withRelated: ['authors', 'categories'],
      sortBy: 'default.epoch_time',
      sortOrder: 'desc'
    }
  },
  id: 1
};

console.log('[Test] Sending to MCP server:', JSON.stringify(req, null, 2));
mcp.stdin.write(JSON.stringify(req) + '\n');

let data = '';
mcp.stdout.on('data', chunk => {
  data += chunk.toString();
  // Try to parse JSON-RPC response
  try {
    const resp = JSON.parse(data);
    console.log('[Test] MCP server response:', JSON.stringify(resp, null, 2));
    setTimeout(() => process.exit(0), 100); // Give time for output to flush
  } catch (e) {
    // Not a complete JSON yet, keep buffering
    console.log('[Test] Buffering data:', data);
  }
});

// Add timeout
setTimeout(() => {
  console.error('[Test] Timeout waiting for response');
  process.exit(1);
}, 5000);

mcp.on('error', error => {
  console.error('[Test] MCP server error:', error);
  process.exit(1);
});

mcp.on('exit', code => {
  console.log('[Test] MCP server exited with code', code);
  if (code !== 0) process.exit(code);
});
