const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const { history, regenerate = false } = JSON.parse(event.body);

        let lastMessage = history[history.length - 1];
        if (!lastMessage || lastMessage.sender !== 'user') {
            throw new Error("Invalid history format.");
        }
        
        let query = lastMessage.text || "";
        const attachedFile = lastMessage.file;
        const isImageQuery = attachedFile && attachedFile.type.startsWith('image/');
        
        let selectedModel;
        let systemPrompt;

        // --- UPDATED: Model Selection Logic ---

        const trimmedQuery = query.trim().toLowerCase();
        
        // Determine the last used model from history for regeneration logic
        const lastBotMessage = history.filter(m => m.sender === 'bot').pop();
        const lastUsedModel = lastBotMessage ? lastBotMessage.modelUsed : null;

        if (isImageQuery) {
            selectedModel = "google/gemini-flash-1.5";
            systemPrompt = "You are RansGPT, a helpful AI assistant with vision capabilities, created by Ransara Devnath. Analyze the image and answer the user's query.";
            console.log("Image detected: Forcing Google Gemini Flash");

        } else if (regenerate) {
            // On regenerate, switch the model
            if (lastUsedModel && lastUsedModel.includes('deepseek')) {
                selectedModel = "google/gemini-flash-1.5";
                systemPrompt = "You are RansGPT, a helpful AI assistant created by Ransara Devnath, powered by Google's Gemini Flash model.";
                console.log("Regenerating: Switching from DeepSeek to Gemini");
            } else {
                // Default to Deepseek if last was Gemini or unknown
                selectedModel = "deepseek/deepseek-chat";
                systemPrompt = "You are RansGPT, an expert AI programmer created by Ransara Devnath, powered by the DeepSeek Chat model.";
                console.log("Regenerating: Switching from Gemini to DeepSeek");
            }
        }
        // ... (rest of your command and random logic remains the same)
        else if (trimmedQuery.startsWith('/g ')) {
            selectedModel = "google/gemini-flash-1.5";
            query = query.substring(3).trim();
            systemPrompt = "You are RansGPT, a helpful AI assistant created by Ransara Devnath, powered by Google's Gemini Flash model.";
            console.log("Command Override: Using Google Gemini Flash");
        } else if (trimmedQuery.startsWith('/d ')) {
            selectedModel = "deepseek/deepseek-chat";
            query = query.substring(3).trim();
            systemPrompt = "You are RansGPT, an expert AI programmer created by Ransara Devnath, powered by the DeepSeek Chat model.";
            console.log("Command Override: Using DeepSeek Chat");
        } else {
            // Default random selection
            if (Math.random() < 0.5) {
                selectedModel = "google/gemini-flash-1.5";
                systemPrompt = "You are RansGPT, a helpful AI assistant created by Ransara Devnath, powered by Google's Gemini Flash model.";
                console.log("Random Selection: Using Google Gemini Flash");
            } else {
                selectedModel = "deepseek/deepseek-chat";
                systemPrompt = "You are RansGPT, an expert AI programmer created by Ransara Devnath, powered by the DeepSeek Chat model.";
                console.log("Random Selection: Using DeepSeek Chat");
            }
        }
        
        // Update query in the last message if it was changed by a command
        history[history.length - 1].text = query;

        // --- Knowledge base check ---
        if (!attachedFile && query) {
            const knowledgePath = path.resolve(process.cwd(), 'knowledge.json');
            const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf-8'));
            const trainedAnswer = knowledge.find(item => item.question.toLowerCase() === query.toLowerCase());
            if (trainedAnswer) {
                return { statusCode: 200, body: JSON.stringify({ reply: trainedAnswer.answer, model: 'local-knowledge' }) };
            }
        }
        
        // Acknowledge non-image files if they exist
        if (attachedFile && !isImageQuery) {
            const reply = `I see you have attached a file named "${attachedFile.name}". While I cannot read its contents, I'm ready to discuss it with you. What would you like to know or do with it?`;
            return { statusCode: 200, body: JSON.stringify({ reply: reply, model: 'local-file-handler' }) };
        }

        // --- API Call Logic ---
        const { OPENROUTER_API_KEY } = process.env;
        if (!OPENROUTER_API_KEY) throw new Error("API Key NOT FOUND!");

        const messagesForApi = history.map(message => {
            if (message.sender === 'user' && message.file && message.file.type.startsWith('image/')) {
                const content = [{ type: "text", text: message.text || "Describe this image." }];
                content.push({ type: "image_url", image_url: { url: message.file.url } });
                return { role: 'user', content: content };
            }
            return {
                role: message.sender === 'user' ? 'user' : 'assistant',
                content: message.text
            };
        });

        const finalMessages = [{ "role": "system", "content": systemPrompt }, ...messagesForApi];

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ model: selectedModel, messages: finalMessages })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API call failed: ${response.status} ${errorBody}`);
        }
        
        const data = await response.json();
        const reply = data.choices[0].message.content;
        return { statusCode: 200, body: JSON.stringify({ reply, model: selectedModel }) };

    } catch (error) {
        console.error("Error in function execution:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Something went wrong.' }) };
    }
};