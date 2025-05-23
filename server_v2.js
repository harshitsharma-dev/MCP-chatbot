// server_v2.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const { createChatChain, cleanup } = require('./langchain_chat_v2');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Validate environment variables
if (!process.env.GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is missing');
  process.exit(1);
}

let chatChain = null;

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ArangoDB MCP server is running' });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!chatChain) {
      console.log('Initializing chat chain...');
      chatChain = await createChatChain();
    }

    const response = await chatChain.invoke(message);
    res.json({ response });

  } catch (error) {
    console.error('Error processing chat request:', error);
    res.status(500).json({ 
      error: 'Error processing request',
      details: error.message
    });
  }
});

// Handle cleanup on shutdown
const handleShutdown = () => {
  console.log('\nShutting down server...');
  cleanup();
  process.exit(0);
};

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
