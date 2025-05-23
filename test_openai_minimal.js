// test_openai_minimal.js
const fs = require('fs');
const path = require('path');
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage } = require("@langchain/core/messages");

async function main() {
  try {
    // Load API key directly from filesystem
    const apiKey = fs.readFileSync(path.join(__dirname, 'openai_key.txt'), 'utf8').trim();    console.error('API Key loaded, length:', apiKey.length);

    console.error('Creating ChatOpenAI instance...');
    const llm = new ChatOpenAI({
      openAIApiKey: apiKey,
      model: "gpt-3.5-turbo",
      temperature: 0,
    });

    console.log('Testing OpenAI connection...');
    const result = await llm.invoke([
      new HumanMessage("Say hello!")
    ]);

    console.log('Response:', result);
  } catch (error) {
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Start test
main().catch(error => {
  console.error('Top level error:', error);
  process.exit(1);
});
