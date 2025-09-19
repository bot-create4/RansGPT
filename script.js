document.addEventListener('DOMContentLoaded', () => {
    const encodedApiKey = "c2stb3ItdjEtMjRjZmJmODk5NGNmNWQ2MWRjMDZjMjAwNzA2ZGQxYTMzZDRhZGFlZGQ4ZGZlNTJkOWJlYWZmZDJiZDIzMDY0MQ==";
    const systemPrompt = "Your name is RansGPT made by A.M.Ransara Devnath";

    // --- HTML Elements ---
    const textInput = document.getElementById('text-input');
    const sendBtn = document.getElementById('send-btn');
    const attachFileBtn = document.getElementById('attach-file-btn');
    const fileInput = document.getElementById('file-input');
    const appLayout = document.getElementById('app-layout');
    const menuToggle = document.getElementById('menu-toggle');
    const newChatBtn = document.getElementById('new-chat-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = themeToggleBtn.querySelector('i');
    const chatMessagesContainer = document.getElementById('chat-messages');
    const initialView = document.querySelector('.initial-view');
    const feedbackPopup = document.getElementById('feedback-popup');
    const defaultButtons = document.querySelector('.buttons-default');

    // --- State Variables ---
    let conversationHistory = [];
    let abortController = null;

    // --- Sidebar ක්‍රියාකාරීත්වය ---
    const closeSidebar = () => appLayout.classList.remove('sidebar-open');
    menuToggle.addEventListener('click', (e) => { e.stopPropagation(); appLayout.classList.toggle('sidebar-open'); });
    sidebarCloseBtn.addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);
    newChatBtn.addEventListener('click', () => { localStorage.removeItem('ransgpt_history'); location.reload(); });
    
    // --- Local Storage සහ Chat History ---
    const saveChatHistory = () => { localStorage.setItem('ransgpt_history', JSON.stringify(conversationHistory)); };
    const loadChatHistory = () => { const savedHistory = localStorage.getItem('ransgpt_history'); conversationHistory = savedHistory ? JSON.parse(savedHistory) : [{ role: 'system', content: systemPrompt }]; if (conversationHistory.length > 1) { if (initialView) initialView.style.display = 'none'; conversationHistory.slice(1).forEach(message => displayMessage(message.content, message.role)); } };

    // --- Theme (Dark/Light Mode) ක්‍රියාකාරීත්වය ---
    const applyTheme = (theme) => { if (theme === 'light') { document.body.classList.add('light-mode'); themeIcon.classList.replace('fa-sun', 'fa-moon'); } else { document.body.classList.remove('light-mode'); themeIcon.classList.replace('fa-moon', 'fa-sun'); } };
    themeToggleBtn.addEventListener('click', () => { const isLight = document.body.classList.toggle('light-mode'); const newTheme = isLight ? 'light' : 'dark'; applyTheme(newTheme); localStorage.setItem('theme', newTheme); });

    // --- File Attachment ක්‍රියාකාරීත්වය ---
    attachFileBtn.addEventListener('click', () => { fileInput.click(); });
    fileInput.addEventListener('change', (event) => { const files = event.target.files; if (files.length > 0) { console.log("Files selected:", files); alert(`${files.length} file(s) selected. Check the console.`); } });

    // --- Input Field සහ Send Button ---
    const handleSend = () => { const userMessage = textInput.value.trim(); if (!userMessage) return; if (initialView) initialView.style.display = 'none'; conversationHistory.push({ role: 'user', content: userMessage }); displayMessage(userMessage, 'user'); saveChatHistory(); textInput.value = ''; textInput.dispatchEvent(new Event('input')); fetchBotResponse(); };
    textInput.addEventListener('input', () => { if (textInput.value.trim() !== '') { sendBtn.style.display = 'flex'; defaultButtons.style.display = 'none'; } else { sendBtn.style.display = 'none'; defaultButtons.style.display = 'flex'; } });
    sendBtn.addEventListener('click', handleSend);
    textInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSend(); } });

    // --- Code Formatting Function ---
    const formatMessageContent = (text) => {
        let safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        safeText = safeText.replace(/```([\s\S]*?)```/g, (match, code) => `<pre><code>${code.trim()}</code></pre>`);
        safeText = safeText.replace(/`([^`]+)`/g, (match, code) => `<code>${code}</code>`);
        return safeText;
    };

    // --- API වෙතින් පිළිතුර ලබාගැනීම ---
    const fetchBotResponse = async () => {
        abortController = new AbortController();
        toggleButtonsForLoading(true);
        const botMessageWrapper = displayMessage("", 'assistant');
        const messageTextElement = botMessageWrapper.querySelector('.message');
        let fullResponse = "";
        let responseEnded = false;
        const cursor = document.createElement('span');
        cursor.className = 'typing-cursor';
        messageTextElement.appendChild(cursor);
        try {
            const decodedApiKey = atob(encodedApiKey);
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${decodedApiKey}` }, body: JSON.stringify({ model: "deepseek/deepseek-chat", messages: conversationHistory, stream: true }), signal: abortController.signal });
            if (!response.ok) throw new Error(`API error: ${response.statusText}`);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) { responseEnded = true; break; }
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data.trim() === '[DONE]') { responseEnded = true; break; }
                        try {
                            const json = JSON.parse(data);
                            if (json.choices[0].delta.content) {
                                const contentChunk = json.choices[0].delta.content;
                                fullResponse += contentChunk;
                                cursor.before(document.createTextNode(contentChunk));
                                scrollToBottom();
                            }
                        } catch (e) { /* ignore */ }
                    }
                }
                if (responseEnded) break;
            }
        } catch (error) {
            responseEnded = true;
            if (error.name === 'AbortError') { fullResponse += "\n\n(Generation stopped)"; } 
            else { fullResponse = "Sorry, something went wrong. Please check your API key and try again."; }
        } finally {
            cursor.remove();
            messageTextElement.innerHTML = formatMessageContent(fullResponse);
            if (fullResponse && !fullResponse.includes("Sorry, something went wrong.")) { conversationHistory.push({ role: 'assistant', content: fullResponse }); saveChatHistory(); }
            toggleButtonsForLoading(false);
            abortController = null;
        }
    };
    
    // --- පණිවිඩ තිරයේ පෙන්වීම ---
    const displayMessage = (message, sender) => {
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${sender}`;
        const iconDiv = document.createElement('div');
        iconDiv.className = `icon ${sender}-icon`;
        if (sender === 'user') { iconDiv.textContent = 'Y'; } 
        else { iconDiv.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>'; }
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        messageDiv.innerHTML = formatMessageContent(message);
        wrapper.appendChild(iconDiv);
        wrapper.appendChild(messageDiv);
        chatMessagesContainer.appendChild(wrapper);
        if (sender === 'assistant') { setupFeedbackEvents(wrapper, messageDiv); }
        scrollToBottom();
        return wrapper;
    };

    // --- අනෙකුත් Functions (Feedback, Stop, Scrolling etc.) ---
    const stopBtn = document.getElementById('stop-btn');
    stopBtn.addEventListener('click', () => { if (abortController) abortController.abort(); });
    const scrollToBottom = () => { chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight; };
    const toggleButtonsForLoading = (isLoading) => {
        const textInput = document.getElementById('text-input');
        const sendBtn = document.getElementById('send-btn');
        const defaultButtons = document.querySelector('.buttons-default');
        const stopBtn = document.getElementById('stop-btn');
        textInput.disabled = isLoading;
        if (isLoading) {
            sendBtn.style.display = 'none';
            defaultButtons.style.display = 'none';
            stopBtn.style.display = 'flex';
        } else {
            stopBtn.style.display = 'none';
            if (textInput.value.trim() !== '') {
                sendBtn.style.display = 'flex';
            } else {
                defaultButtons.style.display = 'flex';
            }
        }
    };
    const setupFeedbackEvents = (wrapper, messageDiv) => { /* Placeholder for unchanged function */ };
    document.addEventListener('click', (e) => { const feedbackPopup = document.getElementById('feedback-popup'); if (feedbackPopup.classList.contains('show') && !feedbackPopup.contains(e.target) && !e.target.closest('.message-wrapper')) { feedbackPopup.classList.remove('show'); } });
    
    // --- යෙදුම ආරම්භ කිරීම ---
    const initializeApp = () => {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        applyTheme(savedTheme);
        loadChatHistory();
    };

    initializeApp();
});