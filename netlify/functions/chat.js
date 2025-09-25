const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const { history } = JSON.parse(event.body);

        let lastMessage = history[history.length - 1];
        if (!lastMessage || lastMessage.sender !== 'user') {
            throw new Error("Invalid history format or last message is not from user.");
        }
        
        let query = lastMessage.text;
        let selectedModel;
        let systemPrompt;

        // --- NEW: Command-based Model Selection Logic ---

        const trimmedQuery = query.trim().toLowerCase();
        
        if (trimmedQuery.startsWith('/g ')) {
            selectedModel = "google/gemini-flash-1.5";
            systemPrompt = "You are RansGPT, a helpful AI assistant. Your creator, who integrated you into this application, is Ransara Devnath. You are powered by Google's Gemini Flash model to provide intelligent and fast responses. Your name is RansGPT.";
            query = query.substring(3).trim(); // Remove '/g ' from the query
            console.log("Command Override: Using Google Gemini Flash");

        } else if (trimmedQuery.startsWith('/d ')) {
            selectedModel = "deepseek/deepseek-chat";
            systemPrompt = "You are RansGPT, an expert AI programmer and full-stack developer assistant created and trained by Ransara Devnath. You are powered by the DeepSeek Chat model. Your primary goal is to help users by providing complete, functional, and well-explained code. Your name is RansGPT.";
            query = query.substring(3).trim(); // Remove '/d ' from the query
            console.log("Command Override: Using DeepSeek Chat");

        } else {
            // Default 50/50 random selection
            if (Math.random() < 0.5) {
                selectedModel = "google/gemini-flash-1.5";
                systemPrompt = "You are RansGPT, a helpful AI assistant. Your creator, who integrated you into this application, is Ransara Devnath. You are powered by Google's Gemini Flash model to provide intelligent and fast responses. Your name is RansGPT.";
                console.log("Random Selection: Using Google Gemini Flash");
            } else {
                selectedModel = "deepseek/deepseek-chat";
                systemPrompt = "You are RansGPT, an expert AI programmer and full-stack developer assistant created and trained by Ransara Devnath. You are powered by the DeepSeek Chat model. Your primary goal is to help users by providing complete, functional, and well-explained code. Your name is RansGPT.";
                console.log("Random Selection: Using DeepSeek Chat");
            }
        }
        
        // --- END: Model Selection Logic ---

        const lowerCaseQuery = query.toLowerCase().trim();
        const knowledgePath = path.resolve(process.cwd(), 'knowledge.json');
        const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf-8'));
        const trainedAnswer = knowledge.find(item => item.question.toLowerCase() === lowerCaseQuery);
        
        if (trainedAnswer) {
            return { statusCode: 200, body: JSON.stringify({ reply: trainedAnswer.answer }) };
        }
        
        const { OPENROUTER_API_KEY } = process.env;

        if (!OPENROUTER_API_KEY) {
            throw new Error("API Key NOT FOUND in Netlify environment variables!");
        }
        
        // Update the last message in history to remove the command before sending to AI
        history[history.length - 1].text = query;

        const messagesForApi = history.map(message => {
            return {
                role: message.sender === 'user' ? 'user' : 'assistant',
                content: message.text
            };
        });

        const finalMessages = [
            { "role": "system", "content": systemPrompt },
            ...messagesForApi
        ];

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: selectedModel,
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