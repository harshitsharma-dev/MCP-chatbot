// test_chat.js
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

console.log('[Test] Starting MCP server...');
const mcp = spawn('node', [path.join('mcp-server-arangodb', 'build', 'index.js')], {
  env,
  stdio: ['pipe', 'pipe', 'pipe']
});

mcp.stderr.on('data', data => {
  console.error('[MCP stderr]', data.toString());
});

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
        // Not complete JSON yet, keep buffering
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
        // Not complete JSON yet, continue buffering
        console.log('[Test] Buffering:', data);
      }
    };

    mcp.stdout.on('data', responseHandler);
    mcp.stdin.write(JSON.stringify(req) + '\n');
  });
}

async function main() {
  try {
    // Wait for MCP server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
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
      parameters: tool.inputSchema || tool.parameters || { type: "object", properties: {} }
    }));

    // System prompt with tool descriptions
    const systemPrompt = new SystemMessage(
      "You are an AI assistant with access to the following tools:\n" +
      tools.map(t => `Tool: ${t.name}\nDescription: ${t.description}\nParameters: ${JSON.stringify(t.parameters)}`).join("\n\n") +
      "\nUse tools when needed. If a tool requires parameters, ask the user or infer from context."
    );

    // Test with request for 5 recent articles
    const userInput = "Get me 5 recent articles with their authors and categories";
    console.log('\n[Test] User request:', userInput);

    const messages = {
      messages: [systemPrompt, new HumanMessage(userInput)]
    };

    // Get tool call from ChatGPT
    console.log('[Test] Sending request to ChatGPT...');
    const result = await llm.bind({
      functions,
      function_call: "auto"
    })(messages);

    console.log('[Test] ChatGPT response:', result);

    // Execute tool call if requested
    if (result.additional_kwargs.function_call) {
      const { name, arguments: argsStr } = result.additional_kwargs.function_call;
      const args = JSON.parse(argsStr);
      console.log(`[Test] ChatGPT wants to call ${name} with args:`, args);

      // Call the tool
      const toolResult = await callMcpTool(name, args);
      console.log('[Test] Tool result:', JSON.stringify(toolResult, null, 2));

      // Let ChatGPT summarize the result
      const summary = await llm.invoke([
        systemPrompt,
        new HumanMessage(`Tool: ${name}\nInput: ${argsStr}\nOutput: ${JSON.stringify(toolResult)}\nSummarize this result for the user.`)
      ]);

      console.log('[Test] Summary:', summary.content);
    } else {
      console.log('[Test] ChatGPT direct response:', result.content);
    }
  } catch (error) {
    console.error('[Test] Error:', error);
  } finally {
    // Clean up
    mcp.kill();
    process.exit(0);
  }
}

process.on('unhandledRejection', error => {
  console.error('Unhandled Promise Rejection:', error);
  mcp.kill();
  process.exit(1);
});

main();
