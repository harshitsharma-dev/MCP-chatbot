// test_openai.js
require('dotenv').config();
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage } = require("@langchain/core/messages");

async function main() {
  try {
    console.log('Starting test...');
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment');
    }
    console.log('API Key length:', process.env.OPENAI_API_KEY.length);
    
    console.log('Initializing ChatOpenAI...');
    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      model: "gpt-3.5-turbo",
      temperature: 0,
    });

    console.log('Testing OpenAI connection...');
    const result = await llm.invoke([
      new HumanMessage("Say hello!")
    ]);

    console.log('Response:', result);  } catch (error) {
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

console.log('Starting main...');
main().catch(error => {
  console.error('Top level error:', error);
  process.exit(1);
});
