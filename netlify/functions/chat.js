import fetch from 'node-fetch';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export const handler = async (event) => {
    console.log("--- RansGPT Function Log: Start ---");

    if (event.httpMethod !== 'POST') {
        console.error("Error: Received a non-POST request.");
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { query } = JSON.parse(event.body);
        console.log("Step 1: Received query from user ->", query);

        const lowerCaseQuery = query.toLowerCase().trim();
        
        console.log("Step 2: Checking local knowledge base (knowledge.json)...");
        const knowledgePath = resolve(process.cwd(), 'knowledge.json');
        const knowledge = JSON.parse(readFileSync(knowledgePath, 'utf-8'));
        const trainedAnswer = knowledge.find(item => item.question.toLowerCase() === lowerCaseQuery);
        
        if (trainedAnswer) {
            console.log("Success: Found answer in knowledge base.");
            return { statusCode: 200, body: JSON.stringify({ reply: trainedAnswer.answer }) };
        }
        
        console.log("Step 3: No local answer found. Preparing to call OpenRouter API.");

        const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

        if (OPENROUTER_API_KEY) {
            console.log("Step 4: API Key successfully loaded from Netlify environment.");
            // To be safe, let's not log the full key, just that it exists.
            console.log("API Key starts with:", OPENROUTER_API_KEY.substring(0, 5) + "...");
        } else {
            console.error("FATAL ERROR: API Key NOT FOUND in Netlify environment variables!");
            throw new Error("OPENROUTER_API_KEY is not defined.");
        }
        
        console.log("Step 5: Making the fetch call to OpenRouter...");
        
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "deepseek/chat",
                messages: [
                    { "role": "system", "content": "Your name is RansGPT, made by Ransara Devnath, train by Ransara Devnath." },
                    { "role": "user", "content": query }
                ]
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("API Error: OpenRouter returned a non-200 status.", { status: response.status, body: errorBody });
            throw new Error(`API call failed with status: ${response.status}`);
        }
        
        console.log("Step 6: API call successful. Parsing response...");
        const data = await response.json();
        const reply = data.choices[0].message.content;
        
        console.log("--- RansGPT Function Log: End (Success) ---");
        return { statusCode: 200, body: JSON.stringify({ reply }) };

    } catch (error) {
        console.error("--- RansGPT Function Log: End (Caught an Error) ---");
        console.error("Full Error Details:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Something went wrong.' }) };
    }
};
