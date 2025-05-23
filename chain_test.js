// chain_test.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { spawn } = require('child_process');
const path = require('path');

async function sendMcpRequest(mcpProcess, method, params) {
    return new Promise((resolve, reject) => {
        const req = {
            jsonrpc: '2.0',
            method,
            params,
            id: Date.now()
        };
        
        let data = '';
        const responseHandler = chunk => {
            data += chunk.toString();
            try {
                const resp = JSON.parse(data);
                mcpProcess.stdout.removeListener('data', responseHandler);
                resolve(resp);
            } catch (e) {
                // Not complete JSON yet
            }
        };

        mcpProcess.stdout.on('data', responseHandler);
        mcpProcess.stdin.write(JSON.stringify(req) + '\n');
    });
}

async function main() {
    console.log('\n[Test] Starting direct MCP chain test...');
    
    // Start MCP server
    const mcpProcess = spawn('node', [
        path.join('mcp-server-arangodb', 'build', 'index.js')
    ], {
        env: {
            ...process.env,
            ARANGO_URL: "http://lsdiedb39c.pagekite.me",
            ARANGO_DB: "newsDB2022",
            ARANGO_USERNAME: "root",
            ARANGO_PASSWORD: "i-0172f1f969c7548c4"
        },
        stdio: ['pipe', 'pipe', 'pipe']
    });

    mcpProcess.stderr.on('data', data => {
        console.error('[MCP stderr]', data.toString());
    });

    try {
        // Wait for MCP server to start
        await new Promise(resolve => {
            mcpProcess.stderr.once('data', () => {
                console.log('[Test] MCP server started');
                resolve();
            });
        });

        // 1. List available tools
        console.log('\n[Test] Step 1: Getting available tools...');
        const toolsResponse = await sendMcpRequest(mcpProcess, 'tools/list', {});
        const tools = toolsResponse.result.tools || [];
        console.log('[Test] Available tools:', tools.length);

        // 2. Call the tool directly
        console.log('\n[Test] Step 2: Calling flexible_recent_articles...');
        const callResponse = await sendMcpRequest(mcpProcess, 'tools/call', {
            name: 'flexible_recent_articles',
            arguments: {
                limit: 5,
                detail: 'summary',
                withRelated: ['authors', 'categories'],
                sortBy: 'default.epoch_time',
                sortOrder: 'desc'
            }
        });

        console.log('\n[Test] Step 3: Tool response received');
        console.log(JSON.stringify(callResponse.result, null, 2));

    } catch (error) {
        console.error('\n[Test] Error:', error);
    } finally {
        mcpProcess.kill();
    }
}

main().catch(error => {
    console.error('[Test] Unhandled error:', error);
    process.exit(1);
});