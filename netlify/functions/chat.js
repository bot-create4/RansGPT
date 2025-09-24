const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
    // POST request vitharak accept karanna
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const { history } = JSON.parse(event.body);

        // history eke anthima message eka thamai aluth query eka
        const lastMessage = history[history.length - 1];
        if (!lastMessage || lastMessage.sender !== 'user') {
            throw new Error("Invalid history format or last message is not from user.");
        }
        const query = lastMessage.text;
        const lowerCaseQuery = query.toLowerCase().trim();

        // 1. Mulimma ape danuma (knowledge.json) eke balanna
        const knowledgePath = path.resolve(process.cwd(), 'knowledge.json');
        const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf-8'));
        const trainedAnswer = knowledge.find(item => item.question.toLowerCase() === lowerCaseQuery);
        
        if (trainedAnswer) {
            return { statusCode: 200, body: JSON.stringify({ reply: trainedAnswer.answer }) };
        }
        
        // 2. Eke nethnam, OpenRouter API ekata call karanna
        const { OPENROUTER_API_KEY } = process.env; // Netlify walin API Key eka ganna

        if (!OPENROUTER_API_KEY) {
            throw new Error("API Key NOT FOUND in Netlify environment variables!");
        }
        
        // API ekata yawanna ona format ekata history eka hadaganna
        const messagesForApi = history.map(message => {
            return {
                role: message.sender === 'user' ? 'user' : 'assistant',
                content: message.text
            };
        });

        // System prompt eka mulata ekathu karanna
        const finalMessages = [
            { "role": "system", "content": "Your name is RansGPT, made by Ransara Devnath, train by Ransara Devnath." },
            ...messagesForApi
        ];

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "deepseek/deepseek-chat",
                messages: finalMessages // Sampurna chat history eka yawanna
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