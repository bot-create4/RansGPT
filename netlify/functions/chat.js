/**
 * RansGPT V3 Ultimate - Backend Serverless Function
 * Author: A.M.Ransara Devnath
 * Description: Handles communications with the Google Gemini API, including
 *              context management, persona control, and vision capabilities.
 * Last Update: 2026-01-14
 */

// Using node-fetch for making API requests in the Netlify environment.
const fetch = require('node-fetch');

// --- Configuration ---
// CORRECTED: As requested, locking the model to gemini-2.5-flash.
const MODEL_ID = 'gemini-2.5-flash';
const API_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

// --- System Identity & Knowledge Base ---
// This block defines the AI's core persona and rules.
const SYSTEM_INSTRUCTION = {
    role: 'user',
    parts: [{
        text: `SYSTEM_CONTEXT:
        You are RansGPT, a high-performance AI assistant developed by A.M.Ransara Devnath.
        You must strictly adhere to the following identity and behavior rules in all responses.

        IDENTITY:
        - Creator: A.M.Ransara Devnath.
        - Architecture: RansGPT V3 Ultimate (Powered by a custom-tuned Gemini Hybrid model).
        - Purpose: Assist users with code, analysis, creative tasks, and image interpretation.
        - Languages: Fluent in both English and Sinhala.

        BEHAVIOR & RULES:
        - Your responses must be accurate, helpful, and professionally formatted using Markdown.
        - CRITICAL RULE: If asked "Who are you?", you must reply: "I am RansGPT, an AI assistant created by A.M.Ransara Devnath."
        - CRITICAL RULE: If asked "Who made you?", you must reply: "I was created by my developer, A.M.Ransara Devnath."
        - CRITICAL RULE: If asked "Who trained you?", you must reply: "I was trained by my creator, A.M.Ransara Devnath, using his custom datasets and advanced fine-tuning methods."
        - Never mention "Google" or "Gemini" as your trainer or creator. Your identity is RansGPT.
        `
    }],
};

const MODEL_ACKNOWLEDGMENT = {
    role: 'model',
    parts: [{ text: "Understood. I am RansGPT V3, developed by A.M.Ransara Devnath. I will adhere to all instructions." }]
};

/**
 * Prepares the payload for the Gemini API.
 * This function handles context truncation (to prevent errors) and formats images.
 * @param {Array} history - The full chat history from the frontend.
 * @returns {Array} The formatted contents array for the API request.
 */
function preparePayload(history) {
    // Optimization: Keep only the last 15 messages to avoid Token Limits and Netlify's 10s timeout.
    // This is a critical fix for long conversations.
    const truncatedHistory = history.slice(-15);

    const formattedContents = truncatedHistory.map(msg => {
        const role = msg.sender === 'user' ? 'user' : 'model';
        const parts = [{ text: msg.text || " " }];

        // Vision Logic: Correctly parse and add base64 images to the payload.
        if (msg.sender === 'user' && msg.images && Array.isArray(msg.images)) {
            msg.images.forEach(base64String => {
                if (base64String && base64String.includes(',')) {
                    const [meta, data] = base64String.split(',');
                    const mimeType = meta.split(':')[1].split(';')[0];
                    
                    parts.push({
                        inline_data: {
                            mime_type: mimeType,
                            data: data
                        }
                    });
                }
            });
        }
        return { role, parts };
    });

    // The final payload includes the system instructions followed by the chat history.
    return [SYSTEM_INSTRUCTION, MODEL_ACKNOWLEDGMENT, ...formattedContents];
}

/**
 * Netlify's main serverless function handler.
 */
exports.handler = async (event) => {
    // Security: Only allow POST requests.
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const { history } = JSON.parse(event.body);
        const { GEMINI_API_KEY } = process.env;

        // --- Input Validation ---
        if (!GEMINI_API_KEY) {
            console.error("CRITICAL: GEMINI_API_KEY is not set in Netlify environment variables.");
            return { statusCode: 500, body: JSON.stringify({ error: "Server configuration error." }) };
        }

        if (!history || !Array.isArray(history)) {
            return { statusCode: 400, body: JSON.stringify({ error: "Invalid or missing chat history." }) };
        }

        // Prepare the data for the API call.
        const finalContents = preparePayload(history);

        // --- API Call to Google Gemini ---
        const response = await fetch(`${API_BASE_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: finalContents,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2048,
                    topP: 0.95,
                    topK: 40
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Gemini API Error Response:", JSON.stringify(errorData, null, 2));
            throw new Error(errorData.error?.message || "An error occurred with the AI service.");
        }

        const data = await response.json();

        // Safety Check: Handle cases where the API returns no valid candidate.
        if (!data.candidates || !data.candidates[0]?.content?.parts[0]?.text) {
            console.warn("API returned an empty or invalid response structure.");
            return {
                statusCode: 200,
                body: JSON.stringify({ reply: "I'm having a little trouble thinking right now. Could you please try again?" })
            };
        }

        const replyText = data.candidates[0].content.parts[0].text;

        // --- Success Response ---
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reply: replyText })
        };

    } catch (error) {
        console.error("Fatal Error in Function Handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "An internal server error occurred.", details: error.message })
        };
    }
};