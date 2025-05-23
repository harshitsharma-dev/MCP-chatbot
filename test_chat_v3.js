// test_chat_v3.js
require('dotenv').config();
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { spawn } = require('child_process');
const path = require('path');

// Start MCP server
const env = {
  ...process.env,
  ARANGO_URL: "http://lsdiedb39c.pagekite.me",
  ARANGO_DB: "newsDB2022",
  ARANGO_USERNAME: "root",
  ARANGO_PASSWORD: "i-0172f1f969c7548c4"
};

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
    
    console.log('[Test] Calling MCP tool:', JSON.stringify(req, null, 2));
    let data = '';
    
    const responseHandler = chunk => {
      data += chunk.toString();
      try {
        const resp = JSON.parse(data);
        mcp.stdout.removeListener('data', responseHandler);
        resolve(resp.result);
      } catch (e) {
        // Not complete JSON yet
        console.log('[Test] Buffering tool response:', data);
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
    
    console.log('[Test] Getting MCP tools:', JSON.stringify(req, null, 2));
    let data = '';
    
    const responseHandler = chunk => {
      data += chunk.toString();
      try {
        const resp = JSON.parse(data);
        mcp.stdout.removeListener('data', responseHandler);
        resolve(resp.result.tools || []);
      } catch (e) {
        // Not complete JSON yet
        console.log('[Test] Buffering tools response:', data);
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
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    mcp.stderr.on('data', data => {
      console.error('[MCP stderr]', data.toString());
    });

    // Wait for server to start
    await new Promise((resolve, reject) => {
      mcp.stderr.once('data', (data) => {
        if (data.toString().includes('ArangoDB MCP server running')) {
          resolve();
        }
      });
      setTimeout(() => reject(new Error('Timeout waiting for MCP server')), 5000);
    });

    // Get available tools
    console.log('[Test] Fetching available tools...');
    const tools = await getMcpTools();
    console.log('[Test] Available tools:', tools.length);
    
    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      model: "gpt-3.5-turbo-1106",
      temperature: 0,
    });

    // Convert tools to OpenAI functions
    const functions = tools.map(tool => ({
      name: tool.name,
      description: tool.description || "",
      parameters: tool.parameters || { type: "object", properties: {} }
    }));

    // Test with request for 5 recent articles
    const userInput = "Get me 5 recent articles with their authors and categories";
    console.log('\n[Test] User request:', userInput);

    // First test - direct tool call to verify MCP communication
    console.log('\n[Test] Step 1: Direct MCP tool call...');
    const directResult = await callMcpTool('flexible_recent_articles', {
      limit: 5,
      detail: 'summary',
      withRelated: ['authors', 'categories']
    });
    console.log('[Test] Direct tool result:', JSON.stringify(directResult, null, 2));

    // Now test ChatGPT integration
    console.log('\n[Test] Step 2: Testing ChatGPT integration...');
    const messages = [
      {
        role: 'system',
        content: 'You are an AI assistant with access to ArangoDB MCP tools. Use the flexible_recent_articles tool to get recent articles.'
      },
      {
        role: 'user',
        content: userInput
      }
    ];

    const result = await llm.call(messages, {
      functions: [{
        name: "flexible_recent_articles",
        description: "Return articles with full flexibility: pagination, sorting, detail, related data, etc.",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of articles to return",
              default: 10
            },
            detail: {
              type: "string",
              enum: ["minimal", "summary", "full"],
              default: "summary",
              description: "Level of detail"
            },
            withRelated: {
              type: "array",
              items: { type: "string" },
              description: "Related data to include",
              optional: true
            }
          }
        }
      }],
      function_call: { name: "flexible_recent_articles" }
    });

    console.log('[Test] ChatGPT response:', JSON.stringify(result, null, 2));

    // Execute tool call
    if (result.additional_kwargs?.function_call) {
      const { name, arguments: argsStr } = result.additional_kwargs.function_call;
      const args = JSON.parse(argsStr);
      console.log(`[Test] ChatGPT wants to call ${name} with args:`, args);

      // Call the tool
      const toolResult = await callMcpTool(name, args);
      console.log('[Test] Tool result:', JSON.stringify(toolResult, null, 2));

      // Let ChatGPT summarize the result
      const summary = await llm.invoke([
        new SystemMessage('You are a helpful assistant. Summarize the article information in a clear way.'),
        new HumanMessage(`Here are the recent articles: ${JSON.stringify(toolResult)}\nPlease summarize them briefly.`)
      ]);

      console.log('[Test] Summary:', summary.content);
    } else {
      console.log('[Test] ChatGPT direct response:', result.content);
    }
  } catch (error) {
    console.error('[Test] Error:', error);
    console.error(error.stack);
  } finally {
    if (mcp) {
      mcp.kill();
    }
    process.exit(0);
  }
}

process.on('unhandledRejection', error => {
  console.error('Unhandled Promise Rejection:', error);
  console.error(error.stack);
  if (mcp) {
    mcp.kill();
  }
  process.exit(1);
});

// Start the test
main();
