import fetch from 'node-fetch';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// knowledge.json file eka read kara ganeema
const knowledgePath = resolve(process.cwd(), 'knowledge.json');
const knowledge = JSON.parse(readFileSync(knowledgePath, 'utf-8'));

export const handler = async (event) => {
    // POST request vitharak accept karanna
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const { query } = JSON.parse(event.body);
        const lowerCaseQuery = query.toLowerCase().trim();

        // 1. Mulimma ape danuma (knowledge.json) eke balanna
        const trainedAnswer = knowledge.find(item => item.question.toLowerCase() === lowerCaseQuery);
        if (trainedAnswer) {
            return { statusCode: 200, body: JSON.stringify({ reply: trainedAnswer.answer }) };
        }

        // 2. Eke nethnam, OpenRouter API ekata call karanna
        const { OPENROUTER_API_KEY } = process.env; // Netlify walin API Key eka ganna
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

        if (!response.ok) throw new Error(`API call failed: ${response.status}`);
        
        const data = await response.json();
        const reply = data.choices[0].message.content;
        return { statusCode: 200, body: JSON.stringify({ reply }) };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Something went wrong.' }) };
    }
};
