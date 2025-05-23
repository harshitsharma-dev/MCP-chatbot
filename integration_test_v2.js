// integration_test_v2.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Global MCP process handle
let mcp;

// Helper to call MCP tool with timeout
async function callMcpTool(toolName, toolArgs, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout calling tool ${toolName}`));
    }, timeout);

    const req = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: toolArgs },
      id: Date.now()
    };
    
    console.log('\n[Test] Calling MCP tool:', JSON.stringify(req, null, 2));
    let data = '';
    
    const responseHandler = chunk => {
      data += chunk.toString();
      try {
        const resp = JSON.parse(data);
        clearTimeout(timeoutId);
        mcp.stdout.removeListener('data', responseHandler);
        resolve(resp.result);
      } catch (e) {
        // Not complete JSON yet, keep buffering
        console.log('[Test] Buffering:', data);
      }
    };

    mcp.stdout.on('data', responseHandler);
    mcp.stdin.write(JSON.stringify(req) + '\n');
  });
}

async function main() {
  try {
    // Start MCP server
    console.log('[Test] Starting MCP server...');
    mcp = spawn('node', [path.join('mcp-server-arangodb', 'build', 'index.js')], {
      env: {
        ...process.env,
        ARANGO_URL: "http://lsdiedb39c.pagekite.me",
        ARANGO_DB: "newsDB2022",
        ARANGO_USERNAME: "root",
        ARANGO_PASSWORD: "i-0172f1f969c7548c4"
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Handle server output
    mcp.stderr.on('data', data => {
      console.error('[MCP stderr]', data.toString());
    });

    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for MCP server'));
      }, 5000);

      mcp.stderr.once('data', (data) => {
        if (data.toString().includes('ArangoDB MCP server running')) {
          clearTimeout(timeout);
          setTimeout(resolve, 1000); // Give a second for server to fully initialize
        }
      });
    });

    // Test get_system_time first (simple test)
    console.log('\n[Test] Testing get_system_time...');
    const timeResult = await callMcpTool('get_system_time', {});
    console.log('[Test] System time:', timeResult);

    // Test flexible_recent_articles
    console.log('\n[Test] Testing flexible_recent_articles...');
    const articlesResult = await callMcpTool('flexible_recent_articles', {
      limit: 2,
      detail: 'summary',
      withRelated: ['authors', 'categories']
    });
    console.log('[Test] Recent articles:', JSON.stringify(articlesResult, null, 2));

  } catch (error) {
    console.error('\n[Test] Error:', error);
    console.error(error.stack);
  } finally {
    if (mcp) {
      console.log('\n[Test] Shutting down MCP server...');
      mcp.kill();
    }
    process.exit(0);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', error => {
  console.error('\n[Test] Unhandled rejection:', error);
  if (mcp) {
    mcp.kill();
  }
  process.exit(1);
});

// Start the test
console.log('[Test] Starting integration test...');
main();
