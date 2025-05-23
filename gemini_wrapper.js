const { GoogleGenerativeAI } = require("@google/generative-ai");

// Model configuration
const MODEL_NAME = "gemini-pro";
const MODEL_OPTIONS = {
  temperature: 0.1,
  maxOutputTokens: 1024,
  topP: 0.8,
  topK: 40
};

// Add timeout for Gemini requests
const GEMINI_TIMEOUT = 30000; // 30 seconds

class GeminiWrapper {
  constructor(apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ 
      model: MODEL_NAME,
      ...MODEL_OPTIONS
    });
  }

  async invoke(messages, options) {
    try {
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Gemini request timed out')), GEMINI_TIMEOUT);
      });

      // Format messages for Gemini with clear parameter requirements
      let prompt = '';
      
      // Add parameter reminder header
      prompt += "IMPORTANT RULES FOR TOOL SELECTION:\n";
      prompt += "1. You must include ALL required parameters in your response\n";
      prompt += "2. Use default values for optional parameters unless user specifies otherwise\n";
      prompt += "3. Return a valid JSON object with exactly these fields:\n";
      prompt += "   - name: The selected tool name\n";
      prompt += "   - arguments: An object containing ALL required parameters\n\n";
      
      // Add system instructions and available tools
      for (const msg of messages) {
        if (msg.role === 'system') {
          prompt += "SYSTEM INSTRUCTIONS:\n" + msg.content + "\n\n";
        }
      }

      // Add available functions with clear parameter requirements
      if (options.functions) {
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
      }

      // Add user query
      for (const msg of messages) {
        if (msg.role === 'user') {
          prompt += "\nUSER REQUEST:\n" + msg.content + "\n";
        }
      }

      // Add response format reminder
      prompt += "\nRESPONSE REQUIREMENTS:\n";
      prompt += "1. Return ONLY a JSON object\n";
      prompt += "2. No additional text before or after the JSON\n";
      prompt += "3. Include all required parameters\n";
      prompt += "4. Use default values unless specified\n";
      prompt += "Example format:\n";
      prompt += '{\n  "name": "tool_name",\n  "arguments": {\n    "param1": "value1"\n  }\n}';

      // Make the API call
      const result = await Promise.race([
        (async () => {
          try {
            const response = await this.model.generateContent({
              contents: [{
                parts: [{ text: prompt }]
              }]
            });
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
      };

    } catch (error) {
      if (error.message === 'Gemini request timed out') {
        console.error('Gemini request timed out after', GEMINI_TIMEOUT/1000, 'seconds');
      } else {
        console.error('Gemini Error:', error);
      }
      throw error;
    }
  }
}

module.exports = { GeminiWrapper };
