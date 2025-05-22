// chain_test.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function main() {
    try {
        // The user request we want to test
        const userRequest = "Get me 5 recent articles with their authors and categories";
        
        console.log('\n[Test] Sending request:', userRequest);
        
        // Send request to chat endpoint
        const response = await fetch('http://localhost:3001/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{
                    content: userRequest
                }]
            })
        });
        
        const result = await response.json();
        console.log('\n[Test] Response received:', JSON.stringify(result, null, 2));

        if (result.reply) {
            console.log('\n[Test] ChatGPT reply:', result.reply);
        } else {
            console.error('\n[Test] No reply received from ChatGPT');
        }
    } catch (error) {
        console.error('\n[Test] Error:', error);
    }
}

main();