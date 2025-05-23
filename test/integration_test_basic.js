// integration_test_basic.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Google AI
// Configure Gemini AI with API key
const MODEL_NAME = "gemini-pro"; // Updated to use the standard model
console.log('Using Gemini model:', MODEL_NAME);
const genAI = new GoogleGenerativeAI("AIzaSyDEXDtpmdlMgX_bpGaFoQnWn06T0tPDfjo");

// Add timeout for Gemini requests
const GEMINI_TIMEOUT = 30000; // 30 seconds

// Message class wrappers for compatibility
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

// Wrapper class for Gemini to match our interface
class GeminiWrapper {
  constructor(model) {
    this.model = model;
  }
  async invoke(messages, options) {
    try {
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Gemini request timed out')), GEMINI_TIMEOUT);
      });

      // Create a standardized function description with parameter requirements
      const functionDescriptions = options.functions.map(f => {
        const params = f.parameters.properties;
        const required = f.parameters.required || [];
        return {
          name: f.name,
          description: f.description,
          parameters: Object.entries(params).map(([name, details]) => ({
            name,
            description: details.description,
            required: required.includes(name),
            default: details.default,
            type: details.type
          }))
        };
      });

      // Format messages for Gemini - all messages go into a single content object
      let prompt = '';
      
      for (const msg of messages) {
        if (msg.role === 'system') {        prompt += "Instructions:\n" + msg.content + "\n\n";
        } else {
          prompt += "User: " + msg.content + "\n\n";
        }
      }

      // Create function calling prompt with clear parameter requirementsconst functionPrompt = `Based on the user's request above, select ONE of these functions to call.

For each function, I've listed its parameters and whether they are required or optional. Default values will be used if optional parameters are not specified.

Available functions:
${options.functions.map(f => {
  const params = f.parameters.properties;
  const requiredParams = f.parameters.required || [];
  const paramDetails = Object.entries(params).map(([name, details]) => {
    const isRequired = requiredParams.includes(name);
    const defaultVal = details.default ? ` (default: ${details.default})` : '';
    return `  - ${name}: ${details.description} [${isRequired ? 'REQUIRED' : 'optional'}]${defaultVal}`;
  }).join('\n');
  
  return `${f.name}: ${f.description}
Parameters:
${paramDetails}`;
}).join('\n\n')}

Return ONLY a JSON object in this exact format (no other text):
{
  "name": "function_name",
  "arguments": {
    // Include values for ALL required parameters and any relevant optional parameters
  }
}`;
      
      // Combine prompts
      const fullPrompt = prompt + '\n\n' + functionPrompt;
        // Generate response with timeout      console.log('Sending prompt to Gemini:', fullPrompt);
        console.log('Sending request to Gemini...');
      
      // Generate response with timeout
      const result = await Promise.race([
        (async () => {
          try {
            console.log('Making API call...');
            const response = await this.model.generateContent({
              contents: [{
                parts: [{ text: fullPrompt }]
              }]
            });
            console.log('Got response from Gemini');
            return response;
          } catch (err) {
            console.error('Gemini API error:', err);
            throw err;
          }
        })(),
        timeoutPromise
      ]);

      if (!result) {
        throw new Error('No response from Gemini');
      }

      const response = await result.response;
      const text = response.text();
      
      // Parse the JSON response
      let parsedResponse;
      try {
        // First try to parse the entire response as JSON
        parsedResponse = JSON.parse(text);
      } catch (e) {
        // If that fails, try to extract JSON from the text
        const jsonMatch = text.match(/({[\s\S]*})/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Could not parse Gemini response as JSON');
        }
      }

      // Validate the response format
      if (!parsedResponse.name || !parsedResponse.arguments) {
        throw new Error('Invalid response format from Gemini - missing name or arguments');
      }

      // Convert to expected format
      return {
        content: text,
        additional_kwargs: {
          function_call: {
            name: parsedResponse.name,
            arguments: JSON.stringify(parsedResponse.arguments)
          }
        }
      };} catch (error) {
      if (error.message === 'Gemini request timed out') {
        console.error('Gemini request timed out after', GEMINI_TIMEOUT/1000, 'seconds');
      } else {
        console.error('Gemini Error:', error);
      }
      throw error;
    }
  }
}

// Mock ChatGPT for testing tool selection logic
class MockChatGPT {
  invoke(messages, options) {
    const query = messages[1].content;
    const queryLower = query.toLowerCase();
    
    // Parse the query to determine which tool to use and what arguments to pass
    if (this._isSpecificArticleQuery(queryLower)) {
      const key = this._extractArticleKey(query);
      
      return {
        additional_kwargs: {
          function_call: {
            name: "f1e_flexible_article_by_key",
            arguments: JSON.stringify({
              key: key,
              detail: queryLower.includes("complete") || queryLower.includes("full") ? "full" : "summary",
              withRelated: this._parseRelations(queryLower)
            })
          }
        }
      };
    } else {
      // Recent articles query
      const limit = this._extractLimit(query);
      
      return {
        additional_kwargs: {
          function_call: {
            name: "f1e_flexible_recent_articles",
            arguments: JSON.stringify({
              limit: limit,
              detail: queryLower.includes("complete") || queryLower.includes("full") ? "full" : "summary",
              withRelated: this._parseRelations(queryLower)
            })
          }
        }
      };
    }
  }

  _isSpecificArticleQuery(query) {
    return query.includes("article") && (
      // Various ways to identify a specific article query
      query.includes("key") ||
      query.includes("specific") ||
      query.includes("details of article") ||
      /article [A-Z0-9]+/.test(query)
    );
  }
  _extractArticleKey(query) {
    // Try different patterns to find the key
    const patterns = [
      /key\s+([A-Z0-9]+)(?:\s|$)/i,  // matches "key ABC123" followed by space or end
      /article\s+([A-Z0-9]+)(?:\s|$)/i,  // matches "article XYZ789" followed by space or end
      /details of article\s+([A-Z0-9]+)(?:\s|$)/i  // matches "details of article DEF456" followed by space or end
    ];
    
    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return undefined;
  }
  
  _extractLimit(query) {
    const limitMatch = query.match(/(\d+)/);
    return limitMatch ? parseInt(limitMatch[1]) : 10;
  }

  _parseRelations(query) {
    const relations = [];
    if (query.includes("author")) relations.push("authors");
    if (query.includes("categor")) relations.push("categories");
    return relations.length > 0 ? relations : undefined;
  }
}

// Mock MCP tools for testing purposes
const mockTools = [
  {
    name: "f1e_flexible_article_by_key",
    description: "Fetch a single article by its key or _id, with full flexibility: detail, related data, projection, etc.",
    parameters: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Article _key or _id"
        },
        detail: {
          type: "string",
          enum: ["minimal", "summary", "full"],
          default: "full",
          description: "Level of detail"
        },
        withRelated: {
          type: "array",
          items: { type: "string" },
          description: "Related data to include",
          optional: true
        },
        projection: {
          type: "array",
          items: { type: "string" },
          description: "Fields to include in result",
          optional: true
        }
      },
      required: ["key"]
    }
  },
  {
    name: "f1e_flexible_recent_articles", 
    description: "Return articles with full flexibility: pagination, sorting, detail, related data, etc.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          default: 10,
          description: "Maximum number of articles to return"
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
        },
        sortBy: {
          type: "string",
          default: "default.epoch_time",
          description: "Field to sort by"
        },
        sortOrder: {
          type: "string",
          enum: ["asc", "desc"],
          default: "desc",
          description: "Sort order"
        }
      }
    }
  }
];

// Test cases
const testCases = [
  {
    description: "Simple recent articles query",
    query: "Show me 5 recent articles",
    expectedTool: "f1e_flexible_recent_articles",
    expectedArgs: {
      limit: 5,
      detail: "summary"
    }
  },
  {
    description: "Fetch specific article",
    query: "Get the full article with key ABC123 including author and category info",
    expectedTool: "f1e_flexible_article_by_key",
    expectedArgs: {
      key: "ABC123",
      detail: "full",
      withRelated: ["authors", "categories"]
    }
  },
  {
    description: "Recent articles with relations",
    query: "Get 10 recent articles with their authors and categories",
    expectedTool: "f1e_flexible_recent_articles",
    expectedArgs: {
      limit: 10,
      detail: "summary",
      withRelated: ["authors", "categories"]
    }
  },
  {
    description: "Specific article with full detail",
    query: "Show me the complete details of article XYZ789",
    expectedTool: "f1e_flexible_article_by_key",
    expectedArgs: {
      key: "XYZ789",
      detail: "full"
    }
  },
  {
    description: "Recent articles with only author info",
    query: "Get the latest 3 articles with author information",
    expectedTool: "f1e_flexible_recent_articles",
    expectedArgs: {
      limit: 3,
      detail: "summary",
      withRelated: ["authors"]
    }
  },
  {
    description: "Recent articles with only categories",
    query: "Find 7 recent articles and include their categories",
    expectedTool: "f1e_flexible_recent_articles",
    expectedArgs: {
      limit: 7,
      detail: "summary",
      withRelated: ["categories"]
    }
  }
];

async function runTest() {  try {
    // Initialize both mock and real models
    const mockGpt = new MockChatGPT();
    const realModel = new GeminiWrapper(genAI.getGenerativeModel({ 
      model: MODEL_NAME,
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE"
        }
      ]
    }));

    // Convert tools to function format
    const functions = mockTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));    // Create system prompt    const systemPrompt = new SystemMessage(
      "You are an AI assistant with access to a news database via MCP tools. For each tool, you MUST include all required parameters and appropriate default values for optional parameters. Here are the available tools:\n\n" +
      mockTools.map(t => {
        const params = t.parameters.properties;
        const requiredParams = t.parameters.required || [];
        const paramList = Object.entries(params).map(([name, details]) => {
          const isRequired = requiredParams.includes(name);
          const defaultStr = details.default ? ` (default: ${details.default})` : '';
          return `  - ${name}: ${details.description} [${isRequired ? 'REQUIRED' : 'Optional'}]${defaultStr}`;
        }).join('\n');

        return `Tool: ${t.name}\nDescription: ${t.description}\nParameters:\n${paramList}`;
      }).join("\n\n") +
      "\n\nIMPORTANT: When calling a tool, you must:\n1. Include ALL required parameters\n2. Use default values for optional parameters unless specified\n3. Format your response as a valid JSON object with 'name' and 'arguments'"
    );

    console.log('Starting tests with model_name: gemini-1.0-pro');

    // Run test cases
    for (const testCase of testCases) {
      console.log('\nTesting:', testCase.description);
      console.log('Query:', testCase.query);

      // Get mock response
      console.log('\nMock Response:');
      const mockResult = await mockGpt.invoke([systemPrompt, new HumanMessage(testCase.query)], {
        functions,
        function_call: "auto"
      });

      if (!mockResult.additional_kwargs?.function_call) {
        console.log('❌ Mock test failed: No function call returned');
        continue;
      }

      const mockToolCall = mockResult.additional_kwargs.function_call;
      const mockArgs = JSON.parse(mockToolCall.arguments);

      console.log('Selected tool:', mockToolCall.name);
      console.log('Tool arguments:', JSON.stringify(mockArgs, null, 2));

      // Get Gemini response
      console.log('\nGemini Response:');
      try {
        const realResult = await realModel.invoke([systemPrompt, new HumanMessage(testCase.query)], {
          functions,
          function_call: "auto"
        });

        if (!realResult.additional_kwargs?.function_call) {
          console.log('❌ Gemini test failed: No function call returned');
          continue;
        }

        const realToolCall = realResult.additional_kwargs.function_call;
        const realArgs = JSON.parse(realToolCall.arguments);

        console.log('Selected tool:', realToolCall.name);
        console.log('Tool arguments:', JSON.stringify(realArgs, null, 2));

        // Compare mock vs Gemini responses
        console.log('\nComparison:');
        if (mockToolCall.name === realToolCall.name) {
          console.log('✅ Both selected same tool');
        } else {
          console.log('❌ Tool selection mismatch:');
          console.log('  Mock:', mockToolCall.name);
          console.log('  Gemini:', realToolCall.name);
        }

        // Compare arguments
        const allArgKeys = new Set([...Object.keys(mockArgs), ...Object.keys(realArgs)]);
        let argsMatch = true;
        for (const key of allArgKeys) {
          if (JSON.stringify(mockArgs[key]) !== JSON.stringify(realArgs[key])) {
            console.log(`❌ Argument '${key}' mismatch:`);
            console.log('  Mock:', mockArgs[key]);
            console.log('  Gemini:', realArgs[key]);
            argsMatch = false;
          }
        }
        if (argsMatch) {
          console.log('✅ Arguments match exactly');
        }
      } catch (error) {
        console.log('❌ Gemini error:', error.message);
      }

      // Validate against expected values
      console.log('\nValidation against expected:');
      if (mockToolCall.name === testCase.expectedTool) {
        console.log('✅ Mock: Correct tool selected');
      } else {
        console.log('❌ Mock: Wrong tool selected. Expected:', testCase.expectedTool);
      }

      // Validate required arguments
      let argsValid = true;
      for (const [key, value] of Object.entries(testCase.expectedArgs)) {
        if (JSON.stringify(mockArgs[key]) !== JSON.stringify(value)) {
          console.log(`❌ Mock: Argument mismatch for ${key}:`);
          console.log('  Expected:', value);
          console.log('  Got:', mockArgs[key]);
          argsValid = false;
        }
      }
      if (argsValid) {
        console.log('✅ Mock: Arguments match expected values');
      }
    }
  } catch (error) {
    console.error('Test error:', error);
    process.exit(1);
  }
}

// Run tests
console.log('Starting MCP tool selection tests...');
runTest();