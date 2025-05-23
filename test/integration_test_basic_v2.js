import { GoogleGenerativeAI } from "@google/generative-ai";
import { Database } from 'arangojs';
import dotenv from 'dotenv';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createToolDefinitions } from '../mcp-server-arangodb/build/tools.js';
import * as handlers from '../mcp-server-arangodb/build/handlers.js';

// Get tool definitions from MCP server
const toolDefinitions = createToolDefinitions();

// For MCP Request handling
class McpRequest {
  constructor({ name, parameters }) {
    this.name = name;
    this.parameters = parameters;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY not found in environment');
}

// Initialize Google AI
const MODEL_NAME = "gemini-2.0-flash";
console.log('Using Gemini model:', MODEL_NAME);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const GEMINI_TIMEOUT = 10000;

const MODEL_OPTIONS = {
  temperature: 0.1,
  maxOutputTokens: 1024,
  topP: 0.8,
  topK: 40
};

class SystemMessage {
  constructor(content) {
    this.content = content;
    this.role = 'system';
  }
}

class HumanMessage {
  constructor(content) {
    this.content = content;
    this.role = 'user';
  }
}

class GeminiWrapper {
  constructor(model) {
    this.model = model;
  }

  async invoke(messages, options) {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Gemini request timed out')), GEMINI_TIMEOUT);
      });

      let prompt = '';

      prompt += "IMPORTANT RULES FOR TOOL SELECTION:\n";
      prompt += "1. You must include ALL required parameters in your response\n";
      prompt += "2. Use default values for optional parameters unless user specifies otherwise\n";
      prompt += "3. Return a valid JSON object with exactly these fields:\n";
      prompt += "   - name: The selected tool name\n";
      prompt += "   - arguments: An object containing ALL required parameters\n\n";

      for (const msg of messages) {
        if (msg.role === 'system') {
          prompt += "SYSTEM INSTRUCTIONS:\n" + msg.content + "\n\n";
        }
      }

      prompt += "AVAILABLE TOOLS:\n";
      for (const fn of options.functions) {
        prompt += `\nTool: ${fn.name}\n`;
        prompt += `Description: ${fn.description}\n`;
        prompt += "Parameters:\n";

        const params = fn.parameters.properties;
        const required = fn.parameters.required || [];

        for (const [name, details] of Object.entries(params)) {
          const isRequired = required.includes(name);
          const defaultVal = details.default ? ` (default: ${details.default})` : '';
          prompt += `  - ${name}: ${details.description}\n`;
          prompt += `    Type: ${details.type}${defaultVal}\n`;
          prompt += `    Status: ${isRequired ? 'REQUIRED' : 'Optional'}\n`;
        }
      }

      for (const msg of messages) {
        if (msg.role === 'user') {
          prompt += "\nUSER REQUEST:\n" + msg.content + "\n";
        }
      }

      prompt += "\nRESPONSE REQUIREMENTS:\n";
      prompt += "1. Return ONLY a JSON object\n";
      prompt += "2. No additional text before or after the JSON\n";
      prompt += "3. Include all required parameters\n";
      prompt += "4. Use default values unless specified\n";
      prompt += "Example format:\n";
      prompt += '{\n  "name": "tool_name",\n  "arguments": {\n    "param1": "value1"\n  }\n}';

      const result = await Promise.race([
        (async () => {
          console.log('Making Gemini API call...');
          const response = await this.model.generateContent({
            contents: [{ parts: [{ text: prompt }] }]
          });
          console.log('Got response from Gemini');
          return response;
        })(),
        timeoutPromise
      ]);

      if (!result) throw new Error('No response from Gemini');

      const response = await result.response;
      const text = response.text();

      let parsedResponse;
      try {
        parsedResponse = JSON.parse(text);
      } catch (e) {
        const jsonMatch = text.match(/({[\s\S]*})/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Could not parse Gemini response as JSON');
        }
      }

      if (!parsedResponse.name || !parsedResponse.arguments) {
        throw new Error('Invalid response format from Gemini - missing name or arguments');
      }

      return {
        content: text,
        additional_kwargs: {
          function_call: {
            name: parsedResponse.name,
            arguments: JSON.stringify(parsedResponse.arguments)
          }
        }
      };
    } catch (error) {
      console.error('Gemini Error:', error.message);
      throw error;
    }
  }
}

// Initialize ArangoDB connection
const db = new Database({
  url: process.env.ARANGO_URL || 'http://localhost:8529',
  databaseName: process.env.ARANGO_DB || 'newsDB2022',
  auth: {
    username: process.env.ARANGO_USER || 'root',
    password: process.env.ARANGO_PASSWORD || ''
  }
});

// Validate database connection and MCP setup
async function validateMcpSetup() {
  console.log('🔍 Validating MCP setup...');
  
  try {
    // Check database connection
    console.log('   Testing database connection...');
    const dbInfo = await db.get();
    console.log('   ✅ Database connection successful');
    console.log(`   Connected to: ${dbInfo.name} (version ${dbInfo.version})`);

    // Check if collections exist
    console.log('   Checking required collections...');
    const collections = await db.listCollections();
    const collectionNames = collections.map(c => c.name);
    const requiredCollections = ['Article', 'Document', 'Entity', 'places', 'closeness'];
    
    const missingCollections = requiredCollections.filter(name => !collectionNames.includes(name));
    if (missingCollections.length > 0) {
      console.log('   ⚠️ Warning: Some required collections are missing:', missingCollections.join(', '));
    } else {
      console.log('   ✅ All required collections exist');
    }

    // Validate handlers setup
    console.log('   Validating MCP handlers...');
    const testHandler = new handlers.ToolHandlers(db, toolDefinitions, async () => {});
    if (!testHandler.handleCallTool) {
      throw new Error('Handler initialization failed - handleCallTool method not found');
    }
    console.log('   ✅ MCP handlers initialized successfully');

    // Log available tools
    console.log('\n📋 Available MCP tools:');
    toolDefinitions.forEach(tool => {
      const requiredParams = tool.inputSchema.required || [];
      console.log(`   - ${tool.name}`);
      console.log(`     Required params: ${requiredParams.length ? requiredParams.join(', ') : 'none'}`);
    });

    console.log('\n✅ MCP setup validation complete - all systems operational');
    return true;

  } catch (error) {
    console.error('\n❌ MCP setup validation failed:', error.message);
    return false;
  }
}

async function executeToolCall(toolName, args) {
  try {
    // Ensure MCP is set up and validated first
    await validateMcpSetup();
    
    console.log(`\n🔧 Executing tool: ${toolName}`);
    console.log('   Arguments:', JSON.stringify(args, null, 2));

    // Create MCP request and handler
    const request = {
      jsonrpc: '2.0',
      method: 'callTool',
      params: {
        name: toolName,
        arguments: args
      }
    };

    const toolHandler = new handlers.ToolHandlers(db, toolDefinitions, async () => {});
    console.log('   Calling handler...');
    const result = await toolHandler.handleCallTool(request);
    console.log('   ✅ Tool execution successful\n');

    // Enhanced response handling
    if (!result) return null;

    // If result is a primitive type, return as is
    if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
      return result;
    }

    // Handle content property which is common in tool responses
    if (result.content) {
      // If content is a primitive type, return it directly
      if (typeof result.content === 'string' || typeof result.content === 'number' || typeof result.content === 'boolean') {
        return result.content;
      }

      // Handle array responses
      if (Array.isArray(result.content)) {
        // Empty array case
        if (result.content.length === 0) return [];

        // Handle array of objects with text property (common format)
        if (result.content[0]?.text) {
          try {
            // Try to parse as JSON first
            return JSON.parse(result.content[0].text);
          } catch (e) {
            // If not valid JSON, return the text as is
            return result.content[0].text;
          }
        }

        // Return first element for single-item arrays
        return result.content[0];
      }

      // Handle object responses
      if (typeof result.content === 'object') {
        return result.content;
      }
    }

    // If no content property but result is an object, return it
    if (typeof result === 'object') {
      return result;
    }

    // Fallback case
    return null;
  } catch (error) {
    console.error('❌ Tool execution failed:', error.message);
    throw error;
  }
}

// Add this helper function before main()
function formatObjectOutput(obj, level = 0) {
  // Common fields to display first if they exist
  const priorityFields = ['title', 'name', 'description', 'content', 'text', 'author', 'date', 'date_added', 'category', 'url'];
  
  // Handle null/undefined
  if (!obj) {
    console.log('null');
    return;
  }

  // First display priority fields
  priorityFields.forEach(field => {
    if (obj[field] !== undefined) {
      console.log(`${' '.repeat(level * 2)}${field}: ${obj[field]}`);
    }
  });

  // Then display remaining fields
  Object.entries(obj)
    .filter(([key]) => !priorityFields.includes(key))
    .forEach(([key, value]) => {
      // Skip internal/technical fields
      if (key.startsWith('_') || key === 'type') return;

      const indent = ' '.repeat(level * 2);
      if (Array.isArray(value)) {
        console.log(`${indent}${key}:`);
        value.forEach((item, i) => {
          if (typeof item === 'object') {
            console.log(`${indent}  [${i + 1}]:`);
            formatObjectOutput(item, level + 2);
          } else {
            console.log(`${indent}  [${i + 1}] ${item}`);
          }
        });
      } else if (typeof value === 'object' && value !== null) {
        console.log(`${indent}${key}:`);
        formatObjectOutput(value, level + 1);
      } else {
        console.log(`${indent}${key}: ${value}`);
      }
    });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  const model = new GeminiWrapper(genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: MODEL_OPTIONS
  }));

  const systemPrompt = new SystemMessage(
    "You are an AI assistant with access to a news database (newsDB2022) via MCP tools. " +
    "The database contains various collections:\n" +
    "- Article: Main news articles with metadata and content summary\n" +
    "- Document: Detailed articles with full content\n" +
    "- Entity: Named entities (people, organizations)\n" +
    "- places: Location data\n" +
    "- closeness: Similarity links between articles\n\n" +
    "Use the appropriate tool based on the user's request. " +
    "Articles have attributes like author, category, subcategory, date_added, title, description, " +
    "url, source, and tags. Documents contain full article content."
  );

  // Convert MCP tool definitions to Gemini-compatible format
  const functions = toolDefinitions.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: "object",
      properties: tool.inputSchema.properties,
      required: tool.inputSchema.required || []
    }
  }));

  async function askQuestion() {
    try {
      const query = await new Promise(resolve => {
        rl.question("\nAsk a query (or type 'exit' to quit): ", resolve);
      });

      if (query.toLowerCase() === 'exit') {
        console.log('Goodbye! 👋');
        rl.close();
        return;
      }

      const userMessage = new HumanMessage(query);
      const result = await model.invoke([systemPrompt, userMessage], { functions });
      
      const toolCall = result.additional_kwargs?.function_call;
      if (!toolCall) {
        console.log('❌ No tool selected by Gemini');
      } else {
        const toolArgs = JSON.parse(toolCall.arguments);
        console.log('\n✅ Tool Selected:', toolCall.name);
        console.log('📦 Tool Arguments:', JSON.stringify(toolArgs, null, 2));

        // Execute the tool and display results
        console.log('\n⏳ Executing tool...');
        const executionResult = await executeToolCall(toolCall.name, toolArgs);
        
        if (executionResult === null) {
          console.log('❌ Tool execution failed');
        } else {
          console.log('\n📊 Results:');
          
          // Handle primitive types
          if (typeof executionResult === 'string' || typeof executionResult === 'number' || typeof executionResult === 'boolean') {
            console.log(executionResult);
          } 
          // Handle arrays
          else if (Array.isArray(executionResult)) {
            console.log(`Found ${executionResult.length} items`);
            executionResult.forEach((item, index) => {
              console.log(`\n[${index + 1}]`);
              if (typeof item === 'object') {
                formatObjectOutput(item);
              } else {
                console.log(item);
              }
            });
          } 
          // Handle objects
          else if (typeof executionResult === 'object') {
            formatObjectOutput(executionResult);
          } 
          // Fallback for unknown types
          else {
            console.log(executionResult);
          }
        }
      }

      // Continue with next question
      await askQuestion();
    } catch (error) {
      console.error('❌ Error:', error.message);
      // Continue with next question even after error
      await askQuestion();
    }
  }

  // Start the question loop
  await askQuestion();
}

main();
