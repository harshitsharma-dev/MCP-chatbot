// mcp_test_v3.js
const { spawn } = require('child_process');
const path = require('path');

// Create an async wrapper for better control
async function runTest() {
  console.log('[Test] Starting MCP server from build directory...');
  
  const mcp = spawn('node', ['index.js'], {
    cwd: path.join(__dirname, 'mcp-server-arangodb', 'build'),
    env: {
      ...process.env,
      ARANGO_URL: "http://lsdiedb39c.pagekite.me",
      ARANGO_DB: "newsDB2022",
      ARANGO_USERNAME: "root",
      ARANGO_PASSWORD: "i-0172f1f969c7548c4"
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Promise to wait for server ready
  await new Promise((resolve, reject) => {
    let isReady = false;
    const timeout = setTimeout(() => {
      if (!isReady) reject(new Error('Server startup timeout'));
    }, 5000);

    mcp.stderr.on('data', (data) => {
      const output = data.toString();
      console.log('[MCP stderr]', output);
      if (output.includes('Successfully connected to ArangoDB')) {
        isReady = true;
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  console.log('[Test] Server ready, sending test request...');
  
  // Test get_system_time
  const timeReq = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'get_system_time',
      arguments: {}
    },
    id: 1
  };

  let response = await new Promise((resolve, reject) => {
    let data = '';
    const timeoutId = setTimeout(() => reject(new Error('Response timeout')), 5000);
    
    const responseHandler = chunk => {
      data += chunk.toString();
      try {
        const resp = JSON.parse(data);
        clearTimeout(timeoutId);
        mcp.stdout.removeListener('data', responseHandler);
        resolve(resp);
      } catch (e) {
        // Not complete JSON yet
        console.log('[Test] Buffering:', data);
      }
    };

    mcp.stdout.on('data', responseHandler);
    console.log('[Test] Sending request:', JSON.stringify(timeReq, null, 2));
    mcp.stdin.write(JSON.stringify(timeReq) + '\n');
  });

  console.log('[Test] Response:', JSON.stringify(response, null, 2));

  // Now test flexible_recent_articles
  const articlesReq = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'flexible_recent_articles',
      arguments: {
        limit: 2,
        detail: 'summary',
        withRelated: ['authors', 'categories']
      }
    },
    id: 2
  };

  response = await new Promise((resolve, reject) => {
    let data = '';
    const timeoutId = setTimeout(() => reject(new Error('Response timeout')), 5000);
    
    const responseHandler = chunk => {
      data += chunk.toString();
      try {
        const resp = JSON.parse(data);
        clearTimeout(timeoutId);
        mcp.stdout.removeListener('data', responseHandler);
        resolve(resp);
      } catch (e) {
        // Not complete JSON yet
        console.log('[Test] Buffering:', data);
      }
    };

    mcp.stdout.on('data', responseHandler);
    console.log('[Test] Sending request:', JSON.stringify(articlesReq, null, 2));
    mcp.stdin.write(JSON.stringify(articlesReq) + '\n');
  });

  console.log('[Test] Response:', JSON.stringify(response, null, 2));

  console.log('[Test] Tests complete, shutting down...');
  mcp.kill();
  process.exit(0);
}

// Run the test with proper error handling
runTest().catch(error => {
  console.error('[Test] Error:', error);
  process.exit(1);
});
