const express = require('express');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const path = require('path');
const { createChatChain, cleanup } = require('./langchain_chat_v2');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.static('public'));
app.use(bodyParser.json());

// Handle chat requests
app.post('/api/chat', async (req, res) => {
    try {
        if (!chatChainPromise) {
            chatChainPromise = createChatChain();
        }
        
        const chatChain = await chatChainPromise;
        const { messages } = req.body;
        const userInput = messages[messages.length - 1]?.content || '';
        
        console.log('[Server] Chat request:', userInput);
        const reply = await chatChain.invoke(userInput);
        console.log('[Server] Chat response:', reply);
        
        res.json({ reply });
    } catch (err) {
        console.error('[Server] Chat error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
});

// Cleanup on shutdown
process.on('SIGINT', () => {
    cleanup();
    process.exit();
});

process.on('SIGTERM', () => {
    cleanup();
    process.exit();
});

function startMcpServer() {
  console.log('[Server] Starting MCP server...');
  mcpProcess = spawn('node', [
    path.join(__dirname, 'mcp-server-arangodb', 'build', 'index.js')
  ], {
    env: {
      ...process.env,
      ARANGO_URL: 'http://lsdiedb39c.pagekite.me',
      ARANGO_DB: 'newsDB2022',
      ARANGO_USERNAME: 'root',
      ARANGO_PASSWORD: 'i-0172f1f969c7548c4'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  mcpProcess.stderr.on('data', data => {
    console.log('[MCP stderr]', data.toString());
  });

  mcpProcess.stdout.on('data', data => {
    console.log('[MCP stdout]', data.toString());
  });

  mcpProcess.on('exit', (code) => {
    console.log('[MCP] Server exited with code:', code);
    if (code !== 0) {
      console.log('[MCP] Restarting server...');
      startMcpServer();
    }
  });

  return new Promise((resolve) => {
    mcpProcess.stderr.once('data', () => {
      console.log('[MCP] Server started');
      resolve();
    });
  });
}

// Send request to MCP server
function sendMcpRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = mcpId++;
    const req = JSON.stringify({ jsonrpc: '2.0', method, params, id }) + '\n';
    let data = '';
    
    const responseHandler = chunk => {
      data += chunk.toString();
      try {
        const resp = JSON.parse(data);
        if (resp.id === id) {
          mcpProcess.stdout.removeListener('data', responseHandler);
          if (resp.error) {
            reject(new Error(resp.error.message));
          } else {
            resolve(resp.result);
          }
        }
      } catch (e) {
        // Not complete JSON yet, continue buffering
      }
    };

    mcpProcess.stdout.on('data', responseHandler);
    mcpProcess.stdin.write(req);
    console.log('[MCP] Request sent:', method, JSON.stringify(params));
  });
}

// Initialize chat chain
let chatChainPromise = null;

// Handle chat requests
app.post('/api/chat', async (req, res) => {
  try {
    if (!chatChainPromise) {
      await startMcpServer();
      chatChainPromise = createChatChain();
    }
    
    const chatChain = await chatChainPromise;
    const { messages } = req.body;
    const userInput = messages[messages.length - 1]?.content || '';
    
    console.log('[Server] Chat request:', userInput);
    const reply = await chatChain.invoke(userInput);
    console.log('[Server] Chat response:', reply);
    
    res.json({ reply });
  } catch (err) {
    console.error('[Server] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Handle MCP tool requests
app.post('/api/mcp', async (req, res) => {
  try {
    const { method, params } = req.body;
    console.log('[Server] MCP request:', method, params);
    const result = await sendMcpRequest(method, params);
    res.json({ result });
  } catch (err) {
    console.error('[Server] MCP error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, async () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  try {
    await startMcpServer();
    console.log('[Server] MCP server initialized');
  } catch (err) {
    console.error('[Server] Failed to start MCP server:', err);
  }
});
