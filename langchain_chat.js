const { ChatOpenAI } = require("@langchain/openai");
const { RunnableSequence } = require("@langchain/core/runnables");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Helper to get MCP tools
async function getMcpTools() {
  console.log('[LangChain] Fetching MCP tools...');
  try {
    const res = await fetch("http://localhost:3001/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "tools/list", params: {} })
    });
    console.log('[LangChain] MCP tools response status:', res.status);
    const text = await res.text();
    console.log('[LangChain] MCP tools raw response:', text);
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error('[LangChain] Error parsing MCP tools JSON:', err);
      return [];
    }
    if (!data || !data.result || !Array.isArray(data.result.tools)) {
      console.error('[LangChain] MCP tools response missing or malformed:', data);
      return [];
    }
    console.log('[LangChain] MCP tools fetched:', data.result.tools);
    return data.result.tools || [];
  } catch (err) {
    console.error('[LangChain] Error fetching MCP tools:', err);
    return [];
  }
}

// Helper to call an MCP tool
async function callMcpTool(toolName, toolArgs) {
  console.log(`[LangChain] Calling MCP tool: ${toolName} with args:`, toolArgs);
  try {
    const res = await fetch("http://localhost:3001/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "tools/call", params: { name: toolName, arguments: toolArgs } })
    });
    const data = await res.json();
    console.log(`[LangChain] MCP tool result for ${toolName}:`, data.result);
    return data.result;
  } catch (err) {
    console.error(`[LangChain] Error calling MCP tool ${toolName}:`, err);
    return { error: 'Failed to call MCP tool', details: err.message };
  }
}

async function createChatChain() {
  const tools = await getMcpTools();
  if (!tools.length) {
    console.error('[LangChain] No MCP tools available.');
  }
  const openAIFunctions = tools.map(tool => ({
    name: tool.name,
    description: tool.description || "",
    parameters: tool.inputSchema || tool.parameters || { type: "object", properties: {} }
  }));

  const llm = new ChatOpenAI({
    openAIApiKey: OPENAI_API_KEY,
    model: "gpt-3.5-turbo-1106",
    temperature: 0,
  });

  // System prompt with tool descriptions
  const systemPrompt = [
    new SystemMessage(
      "You are an AI assistant with access to the following tools:\n" +
      tools.map(t => `Tool: ${t.name}\nDescription: ${t.description}\nParameters: ${JSON.stringify(t.parameters)}`).join("\n\n") +
      "\nUse tools when needed. If a tool requires parameters, ask the user or infer from context. Always confirm with the user before running a tool."
    )
  ];

  // The chain: user input → LLM (function call) → tool call (if needed) → LLM (summarize result)
  const chain = RunnableSequence.from([
    async (input) => {
      console.log('[LangChain] User input:', input);
      return {
        messages: [
          ...systemPrompt,
          new HumanMessage(input)
        ]
      };
    },
    async (input) => {
      console.log('[LangChain] Sending to OpenAI (function call):', input);
      try {
        const result = await llm.bind({
          functions: openAIFunctions,
          function_call: "auto"
        })(input);
        console.log('[LangChain] OpenAI function call result:', result);
        return result;
      } catch (err) {
        console.error('[LangChain] Error calling OpenAI function:', err);
        return { content: '[Error calling OpenAI function]', error: err.message };
      }
    },
    async (llmResult) => {
      if (llmResult.additional_kwargs && llmResult.additional_kwargs.function_call) {
        const { name, arguments: argStr } = llmResult.additional_kwargs.function_call;
        let args = {};
        try { args = JSON.parse(argStr); } catch {}
        console.log(`[LangChain] OpenAI requested tool: ${name} with args:`, args);
        const toolResult = await callMcpTool(name, args);
        if (toolResult && toolResult.error) {
          return `[Tool Error] ${toolResult.error}: ${toolResult.details || ''}`;
        }
        console.log(`[LangChain] Sending tool result to OpenAI for summarization. Tool: ${name}, Input:`, args, 'Output:', toolResult);
        try {
          const summary = await llm.invoke([
            ...systemPrompt,
            new HumanMessage(`Tool: ${name}\nInput: ${JSON.stringify(args)}\nOutput: ${JSON.stringify(toolResult)}\nSummarize or explain this for the user.`)
          ]);
          console.log('[LangChain] OpenAI summary result:', summary.content);
          return summary.content;
        } catch (err) {
          console.error('[LangChain] Error summarizing tool result:', err);
          return `[Tool Output] ${JSON.stringify(toolResult)}`;
        }
      }
      console.log('[LangChain] OpenAI direct response:', llmResult.content);
      return llmResult.content;
    }
  ]);

  return chain;
}

module.exports = { createChatChain };
