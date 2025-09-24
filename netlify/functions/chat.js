const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
    // POST request vitharak accept karanna
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        // --- THIS PART IS NOW CORRECTED ---
        // We get 'history' if it exists, or 'query' for older requests
        const body = JSON.parse(event.body);
        const history = body.history;
        const query = body.query || (history && history.length > 0 ? history[history.length - 1].text : null);

        if (!query) {
            throw new Error("No query or history found in the request.");
        }
        // --- END CORRECTION ---

        const lowerCaseQuery = query.toLowerCase().trim();

        // 1. Mulimma ape danuma (knowledge.json) eke balanna
        const knowledgePath = path.resolve(process.cwd(), 'knowledge.json');
        const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf-8'));
        const trainedAnswer = knowledge.find(item => item.question.toLowerCase() === lowerCaseQuery);
        
        if (trainedAnswer) {
            return { statusCode: 200, body: JSON.stringify({ reply: trainedAnswer.answer }) };
        }
        
        // 2. Eke nethnam, OpenRouter API ekata call karanna
        const { OPENROUTER_API_KEY } = process.env;

        if (!OPENROUTER_API_KEY) {
            throw new Error("API Key NOT FOUND in Netlify environment variables!");
        }
        
        let messagesForApi = [];

        // Check if history exists to build the conversation
        if (history && history.length > 0) {
             messagesForApi = history.map(message => {
                return {
                    role: message.sender === 'user' ? 'user' : 'assistant',
                    content: message.text
                };
            });
        } else {
            // If no history, create a simple message array
            messagesForApi.push({ role: 'user', content: query });
        }


        // System prompt eka mulata ekathu karanna
        const finalMessages = [
            { 
                "role": "system", 
                "content": "You are RansGPT, an expert AI programmer and full-stack developer assistant created and trained by Ransara Devnath. Your primary goal is to help users by providing complete, functional, and well-explained code. When a user asks for a website, a tool, or a code snippet, you must provide all the necessary code (HTML, CSS, JavaScript) in a single, copy-paste ready block. For web pages, always combine everything into a single index.html file. Always use ```html, ```css, ```javascript markdown blocks to wrap your code. Explain each part of the code clearly and professionally after providing the full code block. Your name is RansGPT." 
            },
            ...messagesForApi
        ];

        const response = await fetch("[https://openrouter.ai/api/v1/chat/completions](https://openrouter.ai/api/v1/chat/completions)", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "deepseek/deepseek-chat",
                messages: finalMessages 
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("API Error from OpenRouter:", { status: response.status, body: errorBody });
            throw new Error(`API call failed with status: ${response.status}`);
        }
        
        const data = await response.json();
        const reply = data.choices[0].message.content;
        return { statusCode: 200, body: JSON.stringify({ reply }) };

    } catch (error) {
        console.error("Error in function execution:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Something went wrong.' }) };
    }
};