// integration_test.js
const fs = require('fs');
const path = require('path');
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { spawn } = require('child_process');

// Global MCP process handle
let mcp;

// Helper to call MCP tool
async function callMcpTool(toolName, toolArgs) {
  return new Promise((resolve, reject) => {
    const req = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: toolArgs },
      id: Date.now()
    };
    
    console.error('[Test] Calling MCP tool:', JSON.stringify(req, null, 2));
    let data = '';
    
    const responseHandler = chunk => {
      data += chunk.toString();
      try {
        const resp = JSON.parse(data);
        mcp.stdout.removeListener('data', responseHandler);
        resolve(resp.result);
      } catch (e) {
        // Not complete JSON yet
        console.error('[Test] Buffering tool response:', data);
      }
    };

    mcp.stdout.on('data', responseHandler);
    mcp.stdin.write(JSON.stringify(req) + '\n');
  });
}

// Helper to get MCP tools
async function getMcpTools() {
  return new Promise((resolve, reject) => {
    const req = {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: Date.now()
    };
    
    console.error('[Test] Getting MCP tools:', JSON.stringify(req, null, 2));
    let data = '';
    
    const responseHandler = chunk => {
      data += chunk.toString();
      try {
        const resp = JSON.parse(data);
        mcp.stdout.removeListener('data', responseHandler);
        resolve(resp.result.tools || []);
      } catch (e) {
        // Not complete JSON yet
        console.error('[Test] Buffering tools response:', data);
      }
    };

    mcp.stdout.on('data', responseHandler);
    mcp.stdin.write(JSON.stringify(req) + '\n');
  });
}

async function startMcpServer() {
  console.error('[Test] Starting MCP server...');
  
  const env = {
    ...process.env,
    ARANGO_URL: "http://lsdiedb39c.pagekite.me",
    ARANGO_DB: "newsDB2022",
    ARANGO_USERNAME: "root",
    ARANGO_PASSWORD: "i-0172f1f969c7548c4"
  };

  mcp = spawn('node', [path.join('mcp-server-arangodb', 'build', 'index.js')], {
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  });

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
        resolve();
      }
    });
  });
}

async function testDirectMcp() {
  console.error('\n[Test] Testing direct MCP communication...');
  
  // Get tools list
  const tools = await getMcpTools();
  console.error('[Test] Available tools:', tools.length);
  
  // Test get_system_time tool
  console.error('\n[Test] Testing get_system_time...');
  const timeResult = await callMcpTool('get_system_time', {});
  console.error('[Test] System time:', timeResult);
  
  // Test flexible_recent_articles tool
  console.error('\n[Test] Testing flexible_recent_articles...');
  const articlesResult = await callMcpTool('flexible_recent_articles', {
    limit: 2,
    detail: 'summary',
    withRelated: ['authors', 'categories']
  });
  console.error('[Test] Recent articles:', JSON.stringify(articlesResult, null, 2));

  return tools;
}

async function testChatGptIntegration(tools) {
  console.error('\n[Test] Testing ChatGPT integration...');
  
  // Load API key
  const apiKeyPath = path.join(__dirname, 'openai_key.txt');
  if (!fs.existsSync(apiKeyPath)) {
    throw new Error('OpenAI API key file not found. Please create openai_key.txt with your API key.');
  }
  const apiKey = fs.readFileSync(apiKeyPath, 'utf8').trim();
  
  // Initialize ChatGPT
  const llm = new ChatOpenAI({
    openAIApiKey: apiKey,
    model: "gpt-3.5-turbo",
    temperature: 0
  });

  // Convert tools to OpenAI functions
  const functions = tools.map(tool => ({
    name: tool.name,
    description: tool.description || "",
    parameters: tool.parameters || { type: "object", properties: {} }
  }));

  // Test query
  const query = "Get me 2 recent articles with their authors";
  console.error('\n[Test] Testing query:', query);

  const systemPrompt = new SystemMessage(
    "You are an AI assistant with access to a news database via MCP tools. " +
    "Use the flexible_recent_articles tool to fetch articles. " +
    "Always include authors in your requests by adding 'authors' to withRelated."
  );

  const result = await llm.invoke([systemPrompt, new HumanMessage(query)], {
    functions,
    function_call: { name: "flexible_recent_articles" }
  });

  console.error('\n[Test] ChatGPT response:', JSON.stringify(result, null, 2));

  // Execute tool call if requested
  if (result.additional_kwargs?.function_call) {
    const { name, arguments: argsStr } = result.additional_kwargs.function_call;
    const args = JSON.parse(argsStr);
    console.error(`\n[Test] ChatGPT wants to call ${name} with args:`, args);

    const toolResult = await callMcpTool(name, args);
    console.error('\n[Test] Tool result:', JSON.stringify(toolResult, null, 2));

    // Let ChatGPT summarize the result
    const summary = await llm.invoke([
      systemPrompt,
      new HumanMessage(`Here are the articles: ${JSON.stringify(toolResult)}\nPlease summarize them briefly.`)
    ]);

    console.error('\n[Test] Summary:', summary.content);
  }
}

async function main() {
  try {
    // Start MCP server
    await startMcpServer();

    // Test direct MCP communication
    const tools = await testDirectMcp();

    // Test ChatGPT integration
    await testChatGptIntegration(tools);

  } catch (error) {
    console.error('\n[Test] Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    if (mcp) {
      mcp.kill();
    }
    process.exit(0);
  }
}

process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
  console.error('Stack:', error.stack);
  if (mcp) {
    mcp.kill();
  }
  process.exit(1);
});

// Start the integration test
main();
