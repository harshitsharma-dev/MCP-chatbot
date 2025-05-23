// langchain_chat_v2.js
const { RunnableSequence } = require("@langchain/core/runnables");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { GeminiWrapper } = require('./gemini_wrapper');
const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();

let mcpProcess = null;
let mcpReady = false;

// Helper to ensure MCP server is running
async function ensureMcpServer() {
    if (mcpProcess && mcpReady) return;

    return new Promise((resolve, reject) => {
        console.log('[LangChain] Starting MCP server...');
        mcpProcess = spawn('node', [path.join('mcp-server-arangodb', 'build', 'index.js')], {
            env: {
                ...process.env,
                ARANGO_URL: "http://lsdiedb39c.pagekite.me",
                ARANGO_DB: "newsDB2022",
                ARANGO_USERNAME: "root",
                ARANGO_PASSWORD: "i-0172f1f969c7548c4"
            },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const timeout = setTimeout(() => {
            reject(new Error('MCP server startup timeout'));
        }, 5000);

        mcpProcess.stderr.once('data', (data) => {
            if (data.toString().includes('ArangoDB MCP server running')) {
                mcpReady = true;
                clearTimeout(timeout);
                resolve();
            }
        });

        mcpProcess.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        mcpProcess.stderr.on('data', data => {
            console.log('[MCP stderr]', data.toString());
        });

        mcpProcess.stdout.on('data', data => {
            console.log('[MCP stdout]', data.toString());
        });
    });
}

// Helper to call MCP tool via stdio
async function callMcpTool(toolName, toolArgs) {
    if (!mcpProcess || !mcpReady) {
        await ensureMcpServer();
    }

    return new Promise((resolve, reject) => {
        const req = {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name: toolName, arguments: toolArgs },
            id: Date.now()
        };

        console.log(`[LangChain] Calling MCP tool: ${toolName}`, JSON.stringify(toolArgs, null, 2));

        let data = '';
        const responseHandler = chunk => {
            data += chunk.toString();
            try {
                const resp = JSON.parse(data);
                mcpProcess.stdout.removeListener('data', responseHandler);
                if (resp.error) {
                    reject(new Error(resp.error.message || 'Unknown MCP error'));
                } else {
                    resolve(resp.result);
                }
            } catch (e) {
                // Not complete JSON yet
            }
        };

        mcpProcess.stdout.on('data', responseHandler);
        mcpProcess.stdin.write(JSON.stringify(req) + '\n');
    });
}

// Helper to get MCP tools
async function getMcpTools() {
    if (!mcpProcess || !mcpReady) {
        await ensureMcpServer();
    }

    return new Promise((resolve, reject) => {
        const req = {
            jsonrpc: '2.0',
            method: 'tools/list',
            params: {},
            id: Date.now()
        };

        console.log('[LangChain] Getting MCP tools...');

        let data = '';
        const responseHandler = chunk => {
            data += chunk.toString();
            try {
                const resp = JSON.parse(data);
                mcpProcess.stdout.removeListener('data', responseHandler);
                if (resp.error) {
                    reject(new Error(resp.error.message || 'Unknown MCP error'));
                } else {
                    resolve(resp.result.tools || []);
                }
            } catch (e) {
                // Not complete JSON yet
            }
        };

        mcpProcess.stdout.on('data', responseHandler);
        mcpProcess.stdin.write(JSON.stringify(req) + '\n');
    });
}

async function createChatChain() {
    // Get available tools
    const tools = await getMcpTools();
    console.log('[LangChain] Available tools:', tools.length);

    // Initialize Gemini 
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not found in environment');
    }
    const llm = new GeminiWrapper(process.env.GEMINI_API_KEY);

    // Convert tools to function format
    const functions = tools.map(tool => ({
        name: tool.name,
        description: tool.description || "",
        parameters: tool.parameters || { type: "object", properties: {} }
    }));

    // System prompt with tool descriptions
    const systemPrompt = [
        new SystemMessage(
            "You are an AI assistant with access to news database tools. Here are the available tools:\n\n" +
            tools.map(t => `Tool: ${t.name}\nDescription: ${t.description || 'No description'}\nParameters: ${JSON.stringify(t.parameters || {})}`).join("\n\n") +
            "\n\nUse tools when needed. For articles, always use the flexible_recent_articles tool and include authors in withRelated."
        )
    ];

    // The chain: user input → LLM (function call) → tool call → LLM (summarize result)
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
            console.log('[LangChain] Sending to Gemini:', input);
            try {
                const result = await llm.invoke(input.messages, {
                    functions
                });
                console.log('[LangChain] Gemini response:', result);
                return result;
            } catch (err) {
                console.error('[LangChain] Gemini error:', err);
                throw err;
            }
        },
        async (llmResult) => {
            if (llmResult.additional_kwargs?.function_call) {
                const { name, arguments: argsStr } = llmResult.additional_kwargs.function_call;
                let args = {};
                try {
                    args = JSON.parse(argsStr);
                } catch (e) {
                    console.error('[LangChain] Error parsing tool args:', e);
                }

                console.log(`[LangChain] Calling tool: ${name}`, args);
                const toolResult = await callMcpTool(name, args);

                // Let Gemini summarize the result
                const summary = await llm.invoke([
                    ...systemPrompt,
                    new HumanMessage(
                        `Tool: ${name}\nInput: ${argsStr}\nOutput: ${JSON.stringify(toolResult)}\n` +
                        `Please summarize this information in a clear and concise way.`
                    )
                ], { functions: [] }); // No functions needed for summarization
                return summary.content;
            }
            return llmResult.content;
        }
    ]);

    return chain;
}

// Cleanup function
function cleanup() {
    if (mcpProcess) {
        console.log('[LangChain] Shutting down MCP server...');
        mcpProcess.kill();
        mcpProcess = null;
        mcpReady = false;
    }
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

module.exports = { createChatChain, cleanup };
