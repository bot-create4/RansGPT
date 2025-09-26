const fetch = require('node-fetch');

// --- System Prompts ---

const DEEPSEEK_SYSTEM_PROMPT = `You are RansGPT, an expert AI programmer and full-stack developer assistant.
- Your Creator: A.M.Ransara Devnath.
- Your Power Source: RansGPT Chat Model.
- Your Primary Goal: To provide complete, functional, and well-explained code to help users with their development tasks.
- Interaction Style: Be concise, accurate, and professional. When asked for code, provide it within a proper markdown block with the language specified. Prioritize providing helpful and harmless information. Do not refuse to answer technical questions unless they are related to harmful activities. Your name is always RansGPT.`;

const GEMINI_SYSTEM_PROMPT_CONTEXT = [
    {
        role: 'user',
        parts: [{ text: `You are RansGPT, a versatile and creative AI assistant.
- Your Creator: A.M.Ransara Devnath, who integrated you into this application.
- Your Power Source: RansGPT Pro & Pro Vision models.
- Your Capabilities: You can engage in insightful conversations on a wide range of topics, from creative writing to summarizing complex information. When an image is provided, your primary goal is to describe and analyze it based on the user's query.
- Interaction Style: Be friendly, approachable, and detailed in your explanations. Use markdown formatting like bolding, lists, and italics to make your answers easy to read.
- Your Name: Always identify yourself as RansGPT. Adhere to safety guidelines strictly.` }]
    },
    {
        role: 'model',
        parts: [{ text: "Understood. I am RansGPT, a versatile and creative AI assistant created by Ransara Devnath. I am ready to help with a wide range of tasks, including analyzing images. How can I assist you today?" }]
    }
];


// --- Helper function to call Google Gemini API ---
async function callGeminiApi(history, apiKey) {
    const lastUserMessage = history[history.length - 1];
    const isImageQuery = lastUserMessage.file && lastUserMessage.file.type.startsWith('image/');
    
    // Convert history to Gemini format
    const contents = history.map(msg => {
        if (msg.sender === 'user' && msg.file && msg.file.type.startsWith('image/')) {
            const base64Data = msg.file.url.split(',')[1];
            const mimeType = msg.file.type;
            return {
                role: 'user',
                parts: [
                    { text: msg.text || "Describe this image." },
                    { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
            };
        }
        return {
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text || "" }]
        };
    });
    
    // Prepend the system prompt context to the conversation history
    const finalContents = [...GEMINI_SYSTEM_PROMPT_CONTEXT, ...contents];

    const model = isImageQuery ? 'gemini-pro-vision' : 'gemini-pro';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    console.log(`Calling Direct Google Gemini API: ${model}`);

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: finalContents })
    });

    if (!response.ok) {
        const errorBody = await response.json();
        console.error("API Error from Google Gemini:", JSON.stringify(errorBody, null, 2));
        throw new Error(`Google Gemini API call failed: ${errorBody.error.message}`);
    }

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content?.parts) {
        console.warn("Gemini response was blocked or empty:", data);
        return "I am unable to provide a response to this prompt due to safety restrictions. Please try a different topic.";
    }
    return data.candidates[0].content.parts[0].text;
}

// --- Helper function to call DeepSeek via OpenRouter ---
async function callDeepseekApi(history, apiKey) {
    const messagesForApi = history.map(message => ({
        role: message.sender === 'user' ? 'user' : 'assistant',
        content: message.text
    }));

    const finalMessages = [{ "role": "system", "content": DEEPSEEK_SYSTEM_PROMPT }, ...messagesForApi];

    console.log("Calling DeepSeek API via OpenRouter");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "deepseek/deepseek-chat", messages: finalMessages })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("API Error from OpenRouter:", { status: response.status, body: errorBody });
        throw new Error(`OpenRouter API call failed with status: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// --- Main Handler ---
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const { history, regenerate = false, userStatus = 'flash' } = JSON.parse(event.body);
        const lastMessage = history[history.length - 1];
        if (!lastMessage || lastMessage.sender !== 'user') throw new Error("Invalid history format.");
        
        const isImageQuery = lastMessage.file && lastMessage.file.type.startsWith('image/');
        
        let modelFamily;
        const lastBotMessage = history.filter(m => m.sender === 'bot').pop();
        const lastUsedModel = lastBotMessage ? lastBotMessage.modelUsed : null;

        // Model selection logic
        if (isImageQuery) {
            modelFamily = 'gemini';
        } else if (userStatus === 'pro') {
            modelFamily = regenerate ? (lastUsedModel === 'deepseek' ? 'gemini' : 'deepseek') : (Math.random() < 0.7 ? 'gemini' : 'deepseek');
        } else { // Flash user
            modelFamily = (regenerate && lastUsedModel === 'deepseek') ? 'gemini' : 'deepseek';
        }

        let reply;
        const { GEMINI_API_KEY, OPENROUTER_API_KEY } = process.env;

        if (modelFamily === 'gemini') {
            if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set in Netlify!");
            reply = await callGeminiApi(history, GEMINI_API_KEY);
        } else { // 'deepseek'
            if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set in Netlify!");
            reply = await callDeepseekApi(history, OPENROUTER_API_KEY);
        }

        return { statusCode: 200, body: JSON.stringify({ reply, model: modelFamily }) };

    } catch (error) {
        console.error("Fatal Error in Netlify Function:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Something went wrong.' }) };
    }
};