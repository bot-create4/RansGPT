document.addEventListener('DOMContentLoaded', () => {
    // --- API, System Prompt, and Logo ---
    const encodedApiKey = "c2stb3ItdjEtMjRjZmJmODk5NGNmNWQ2MWRjMDZjMjAwNzA2ZGQxYTMzZDRhZGFlZGQ4ZGZlNTJkOWJlYWZmZDJiZDIzMDY0MQ==";
    const encodedSystemPrompt = "WW91ciBuYW1lIGlzIFJhbnNHUFQgbWFkZSBieSBB recuperated recuperated recuperatedLiBSYW5zYXJhIERldm5hdGguIFlvdSBtdXN0IGFsd2F5cyB1c2UgbWFya2Rvd24gZm9ybWF0dGluZyBpbiB5b3VyIHJlc3BvbnNlcy4=";
    const ransGPTLogoUrl = "https://raw.githubusercontent.com/bot-create4/Team/refs/heads/main/1000006185.svg";

    // --- HTML Elements ---
    const textInput = document.getElementById('text-input');
    const sendBtn = document.getElementById('send-btn');
    const attachFileBtn = document.getElementById('attach-file-btn');
    const fileInput = document.getElementById('file-input');
    const appLayout = document.getElementById('app-layout');
    const menuToggleInside = document.getElementById('menu-toggle-inside');
    const menuToggleOutside = document.getElementById('menu-toggle-outside');
    const newChatBtn = document.getElementById('new-chat-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const chatMessagesContainer = document.getElementById('chat-messages');
    const initialView = document.querySelector('.initial-view');
    const suggestionsGrid = document.querySelector('.suggestions-grid');
    const inputArea = document.querySelector('.input-area');

    // --- State Variables ---
    let conversationHistory = [];
    let abortController = null;
    let attachedFiles = [];

    // --- Sidebar Logic ---
    const toggleSidebar = () => {
        const isDesktop = window.innerWidth > 768;
        if (isDesktop) {
            appLayout.classList.toggle('sidebar-closed');
        } else {
            appLayout.classList.toggle('sidebar-open');
        }
    };
    menuToggleInside.addEventListener('click', toggleSidebar);
    menuToggleOutside.addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', () => appLayout.classList.remove('sidebar-open'));
    newChatBtn.addEventListener('click', () => {
        localStorage.removeItem('ransgpt_history');
        location.reload();
    });
    
    // --- Local Storage & Chat History Logic ---
    const saveChatHistory = () => {
        localStorage.setItem('ransgpt_history', JSON.stringify(conversationHistory));
    };
    const loadChatHistory = () => {
        const savedHistory = localStorage.getItem('ransgpt_history');
        const systemPrompt = atob(encodedSystemPrompt);
        conversationHistory = savedHistory ? JSON.parse(savedHistory) : [{ role: 'system', content: systemPrompt }];
        
        if (conversationHistory.length > 1) {
            if (initialView) initialView.style.display = 'none';
            chatMessagesContainer.innerHTML = '';
            conversationHistory.slice(1).forEach(message => displayMessage(message.content, message.role));
        }
    };

    // --- Theme (Light/Dark Mode) Logic ---
    const applyTheme = (theme) => {
        const themeIcon = themeToggleBtn.querySelector('i');
        if (theme === 'light') {
            document.body.classList.add('light-mode');
            themeIcon.classList.replace('fa-sun', 'fa-moon');
        } else {
            document.body.classList.remove('light-mode');
            themeIcon.classList.replace('fa-moon', 'fa-sun');
        }
    };
    themeToggleBtn.addEventListener('click', () => {
        const newTheme = document.body.classList.toggle('light-mode') ? 'light' : 'dark';
        applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // --- File Attachment & Image Preview Logic ---
    attachFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (event) => {
        attachedFiles = Array.from(event.target.files);
        renderImagePreviews();
        toggleInputButtons();
    });

    const renderImagePreviews = () => {
        let existingPreviewContainer = inputArea.querySelector('.image-preview-container');
        if (existingPreviewContainer) {
            existingPreviewContainer.remove();
        }
        if (attachedFiles.length === 0) return;

        const previewContainer = document.createElement('div');
        previewContainer.className = 'image-preview-container';

        attachedFiles.forEach((file, index) => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const previewItem = document.createElement('div');
                    previewItem.className = 'image-preview-item';
                    previewItem.innerHTML = `<img src="${e.target.result}" alt="Image preview"><button class="remove-image-btn" data-index="${index}"><i class="fa-solid fa-xmark"></i></button>`;
                    previewContainer.appendChild(previewItem);
                    previewItem.querySelector('.remove-image-btn').addEventListener('click', (event) => {
                        const indexToRemove = parseInt(event.currentTarget.dataset.index);
                        attachedFiles.splice(indexToRemove, 1);
                        renderImagePreviews();
                        toggleInputButtons();
                        fileInput.value = '';
                    });
                };
                reader.readAsDataURL(file);
            }
        });
        inputArea.insertBefore(previewContainer, inputArea.firstChild);
    };

    const toggleInputButtons = () => {
        const hasText = textInput.value.trim() !== '';
        const hasFiles = attachedFiles.length > 0;
        sendBtn.style.display = (hasText || hasFiles) ? 'flex' : 'none';
        attachFileBtn.style.display = (hasText || hasFiles) ? 'none' : 'flex';
    };

    // --- Input & Send Logic ---
    const handleSend = () => {
        const userMessage = textInput.value.trim();
        if (!userMessage && attachedFiles.length === 0) return;
        if (initialView) initialView.style.display = 'none';
        if (conversationHistory.length <= 1) chatMessagesContainer.innerHTML = '';
        
        const messageContent = {
            text: userMessage,
            images: attachedFiles.map(file => ({ name: file.name, url: URL.createObjectURL(file) }))
        };

        conversationHistory.push({ role: 'user', content: messageContent });
        displayMessage(messageContent, 'user');
        saveChatHistory();
        
        textInput.value = '';
        attachedFiles = [];
        renderImagePreviews();
        toggleInputButtons();
        fileInput.value = '';
        
        fetchBotResponse();
    };
    textInput.addEventListener('input', toggleInputButtons);
    sendBtn.addEventListener('click', handleSend);
    textInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } });
    
    // --- Suggestion Cards Logic ---
    if (suggestionsGrid) {
        suggestionsGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.suggestion-card');
            if (card && card.dataset.prompt) {
                textInput.value = card.dataset.prompt;
                handleSend();
            }
        });
    }

    // --- Markdown Formatting ---
    const formatMessageContent = (content) => {
        let textToFormat = '';
        if (typeof content === 'string') { textToFormat = content; } 
        else if (typeof content === 'object' && content.text) { textToFormat = content.text; }
        
        let html = marked.parse(textToFormat, { breaks: true, gfm: true });

        if (typeof content === 'object' && content.images && content.images.length > 0) {
            html += '<div class="message-images-grid">';
            content.images.forEach(img => {
                html += `<img src="${img.url}" alt="${img.name}" class="message-image-thumbnail">`;
            });
            html += '</div>';
        }
        return html;
    };

    // --- API Call Logic ---
    const fetchBotResponse = async () => {
        abortController = new AbortController();
        const botMessageWrapper = displayMessage("", 'assistant');
        const messageTextElement = botMessageWrapper.querySelector('.message');
        messageTextElement.innerHTML = `<div class="loading-indicator">Thinking...</div>`;
        
        let fullResponse = "";
        
        const textOnlyHistory = conversationHistory.map(msg => ({
            role: msg.role,
            content: typeof msg.content === 'object' ? msg.content.text : msg.content
        })).filter(msg => msg.content);

        try {
            const decodedApiKey = atob(encodedApiKey);
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${decodedApiKey}` }, body: JSON.stringify({ model: "deepseek/deepseek-chat", messages: textOnlyHistory, stream: true }), signal: abortController.signal });
            if (!response.ok) throw new Error(`API error: ${response.statusText}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let isFirstChunk = true;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (isFirstChunk) { messageTextElement.innerHTML = ''; isFirstChunk = false; }

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data.trim() === '[DONE]') break;
                        try {
                            const json = JSON.parse(data);
                            if (json.choices[0].delta.content) {
                                fullResponse += json.choices[0].delta.content;
                                messageTextElement.innerHTML = formatMessageContent(fullResponse);
                                scrollToBottom();
                            }
                        } catch (e) { /* ignore parse errors */ }
                    }
                }
            }
        } catch (error) {
            fullResponse = error.name === 'AbortError' ? "(Generation stopped)" : "Sorry, something went wrong.";
            messageTextElement.innerHTML = formatMessageContent(fullResponse);
        } finally {
            if (fullResponse && !fullResponse.includes("Sorry, something went wrong.")) {
                conversationHistory.push({ role: 'assistant', content: fullResponse });
                saveChatHistory();
                addMessageActions(botMessageWrapper, fullResponse);
            }
            abortController = null;
        }
    };
    
    // --- Display Message Logic ---
    const displayMessage = (message, sender) => {
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${sender}`;
        const iconDiv = document.createElement('div');
        iconDiv.className = `icon ${sender}-icon`;
        if (sender === 'user') {
            iconDiv.textContent = 'Y';
        } else {
            iconDiv.innerHTML = `<img src="${ransGPTLogoUrl}" alt="RansGPT Logo">`;
        }
        
        const messageContentDiv = document.createElement('div');
        messageContentDiv.className = 'message-content';
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        if (message) {
            messageDiv.innerHTML = formatMessageContent(message);
        }
        
        messageContentDiv.appendChild(messageDiv);
        wrapper.appendChild(iconDiv);
        wrapper.appendChild(messageContentDiv);
        
        if (sender === 'assistant' && ((typeof message === 'string' && message) || (typeof message === 'object' && message.text))) {
            addMessageActions(wrapper, typeof message === 'object' ? message.text : message);
        }
        
        chatMessagesContainer.appendChild(wrapper);
        scrollToBottom();
        return wrapper;
    };

    // --- Message Actions Logic ---
    const addMessageActions = (wrapper, messageContent) => {
        const contentDiv = wrapper.querySelector('.message-content');
        if (contentDiv.querySelector('.message-actions')) return;
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        actions.innerHTML = `
            <button class="action-btn" title="Like"><i class="fa-regular fa-thumbs-up"></i></button>
            <button class="action-btn" title="Dislike"><i class="fa-regular fa-thumbs-down"></i></button>
            <button class="action-btn" title="Copy"><i class="fa-solid fa-copy"></i></button>
        `;
        contentDiv.appendChild(actions);

        actions.querySelector('[title="Copy"]').addEventListener('click', () => {
            navigator.clipboard.writeText(messageContent);
            alert('Copied to clipboard!');
        });
        actions.querySelector('[title="Like"]').addEventListener('click', (e) => e.currentTarget.classList.toggle('active'));
        actions.querySelector('[title="Dislike"]').addEventListener('click', (e) => e.currentTarget.classList.toggle('active'));
    };

    // --- Utility Functions ---
    const scrollToBottom = () => { chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight; };
    
    // --- App Initialization ---
    const initializeApp = () => {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        applyTheme(savedTheme);
        loadChatHistory();
        toggleInputButtons();
    };

    initializeApp();
});