const fetch = require('node-fetch');

// --- System Prompts ---
const GEMINI_SYSTEM_PROMPT_CONTEXT = [
    {
        role: 'user',
        parts: [{ text: `You are RansGPT, a helpful and friendly AI assistant.
- Creator: Ransara Devnath.
- Objective: Provide accurate, helpful, and concise responses.
- Capabilities: You can analyze images and answer questions in detail.
- Formatting: Always use Markdown for code, lists, and headings.
- Language: You can understand and speak Sinhala and English fluently.` }]
    },
    {
        role: 'model',
        parts: [{ text: "Understood. I am RansGPT, created by Ransara Devnath. I am ready to help you with anything!" }]
    }
];

// --- Helper function to call Google Gemini API ---
async function callGeminiApi(history, apiKey) {
    // FIX: Switched to gemini-2.5-flash. This is currently the most stable model that supports vision (images) and is widely available without specific 1.5 restrictions.
    const model = 'gemini-2.5-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    console.log(`Calling Google Gemini API: ${model}`);

    // Map history to Gemini format
    const contents = history.map(msg => {
        if (msg.sender === 'user') {
            const parts = [{ text: msg.text || " " }]; 
            
            // If message has an image
            if (msg.file && msg.file.url) {
                const base64Data = msg.file.url.split(',')[1];
                const mimeType = msg.file.type || 'image/jpeg';
                
                parts.push({
                    inline_data: {
                        mime_type: mimeType,
                        data: base64Data
                    }
                });
            }
            return { role: 'user', parts: parts };
        } else {
            return { role: 'model', parts: [{ text: msg.text || " " }] };
        }
    });

    // Combine system prompt with conversation history
    const finalContents = [...GEMINI_SYSTEM_PROMPT_CONTEXT, ...contents];

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: finalContents,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2048
                }
            })
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("API Error from Google Gemini:", JSON.stringify(errorBody, null, 2));
            throw new Error(`Google Gemini API error: ${errorBody.error?.message || response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content?.parts) {
            return "I'm having trouble thinking of a response right now. Please try again.";
        }
        
        return data.candidates[0].content.parts[0].text;

    } catch (error) {
        console.error("Fetch Error details:", error);
        throw error;
    }
}

// --- Main Handler ---
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const history = body.history;
        const { GEMINI_API_KEY } = process.env;

        if (!GEMINI_API_KEY) {
            console.error("GEMINI_API_KEY missing in Netlify Env Vars");
            return { statusCode: 500, body: JSON.stringify({ error: "Server configuration error. (API Key missing)" }) };
        }

        if (!history || !Array.isArray(history)) {
            return { statusCode: 400, body: JSON.stringify({ error: "Invalid chat history." }) };
        }

        const reply = await callGeminiApi(history, GEMINI_API_KEY);

        return { 
            statusCode: 200, 
            body: JSON.stringify({ reply }) 
        };

    } catch (error) {
        console.error("Fatal Error in Function:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Something went wrong processing your request." }) 
        };
    }
};