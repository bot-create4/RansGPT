document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------------
    // --- API සහ System Prompt සැකසුම් ---
    // -------------------------------------------------------------------
    const encodedApiKey = "c2stb3ItdjEtMjRjZmJmODk5NGNmNWQ2MWRjMDZjMjAwNzA2ZGQxYTMzZDRhZGFlZGQ4ZGZlNTJkOWJlYWZmZDJiZDIzMDY0MQ==";
    const systemPrompt = "Your name is RansGPT made by A.M.Ransara Devnath";
    // -------------------------------------------------------------------

    // --- HTML Elements ---
    const textInput = document.getElementById('text-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const defaultButtons = document.querySelector('.buttons-default');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = themeToggleBtn.querySelector('i');
    const chatMessagesContainer = document.getElementById('chat-messages');
    const initialView = document.querySelector('.initial-view');
    const feedbackPopup = document.getElementById('feedback-popup');
    
    // Sidebar Elements
    const appLayout = document.getElementById('app-layout');
    const menuToggle = document.getElementById('menu-toggle');
    const newChatBtn = document.getElementById('new-chat-btn');

    // --- State Variables ---
    let conversationHistory = [];
    let abortController = null;
    let longPressTimer;
    let currentMessageContent = '';
    let currentMessageElement = null;

    // --- Sidebar ක්‍රියාකාරීත්වය ---
    menuToggle.addEventListener('click', () => {
        // Desktop සහ Mobile දෙකේදීම toggle class එකක් භාවිතා කරයි
        const isDesktop = window.innerWidth > 768;
        if (isDesktop) {
            appLayout.classList.toggle('sidebar-closed');
        } else {
            appLayout.classList.toggle('sidebar-open');
        }
    });

    newChatBtn.addEventListener('click', () => {
        // Local storage එකෙන් chat history එක ඉවත් කර, පිටුව refresh කිරීම
        localStorage.removeItem('ransgpt_history');
        location.reload();
    });
    
    const setInitialSidebarState = () => {
        const isDesktop = window.innerWidth > 768;
        if (isDesktop) {
            appLayout.classList.remove('sidebar-open', 'sidebar-closed');
        } else {
            appLayout.classList.remove('sidebar-open');
            appLayout.classList.add('sidebar-closed');
        }
    };
    

    // --- Local Storage ක්‍රියාකාරීත්වය ---
    const saveChatHistory = () => {
        localStorage.setItem('ransgpt_history', JSON.stringify(conversationHistory));
    };

    const loadChatHistory = () => {
        const savedHistory = localStorage.getItem('ransgpt_history');
        if (savedHistory) {
            conversationHistory = JSON.parse(savedHistory);
            // System prompt එක හැර අනෙක් පණිවිඩ නැවත පෙන්වීම
            if (conversationHistory.length > 1) {
                if (initialView) initialView.style.display = 'none';
                conversationHistory.slice(1).forEach(message => {
                    displayMessage(message.content, message.role);
                });
            } else {
                 // System prompt එක පමණක් තිබේනම්, history එක හිස් කරන්න
                conversationHistory = [{ role: 'system', content: systemPrompt }];
            }
        } else {
            // Local storage එකේ කිසිවක් නැත්නම්, system prompt එකෙන් ආරම්භ කරන්න
            conversationHistory = [{ role: 'system', content: systemPrompt }];
        }
    };
    

    // --- Input Field සහ Send Button ක්‍රියාකාරීත්වය ---
    textInput.addEventListener('input', () => {
        if (textInput.value.trim() !== '') {
            sendBtn.style.display = 'flex';
            defaultButtons.style.display = 'none';
        } else {
            sendBtn.style.display = 'none';
            defaultButtons.style.display = 'flex';
        }
    });

    const handleSend = () => {
        const userMessage = textInput.value.trim();
        if (!userMessage) return;

        if (initialView && initialView.style.display !== 'none') {
            initialView.style.display = 'none';
        }

        conversationHistory.push({ role: 'user', content: userMessage });
        displayMessage(userMessage, 'user');
        saveChatHistory(); // User message එක save කිරීම

        textInput.value = '';
        sendBtn.style.display = 'none';
        defaultButtons.style.display = 'flex';
        
        fetchBotResponse();
        hideFeedbackPopup();
    };
    
    sendBtn.addEventListener('click', handleSend);
    textInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleSend();
        }
    });

    // --- API වෙතින් පිළිතුර ලබාගැනීම ---
    const fetchBotResponse = async () => {
        abortController = new AbortController();
        toggleButtonsForLoading(true);

        const botMessageWrapper = displayMessage("", 'assistant'); // 'assistant' යනු bot ගේ role එකයි
        const messageTextElement = botMessageWrapper.querySelector('.message');
        if (messageTextElement) {
            messageTextElement.innerHTML = '<div class="loading-animation"></div>';
        }

        try {
            const decodedApiKey = atob(encodedApiKey);

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${decodedApiKey}`
                },
                body: JSON.stringify({
                    model: "deepseek/deepseek-chat",
                    messages: conversationHistory,
                    stream: true
                }),
                signal: abortController.signal
            });

            if (!response.ok) throw new Error(`API error: ${response.statusText}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = "";
            let isFirstChunk = true;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                if (isFirstChunk && messageTextElement) {
                    messageTextElement.innerHTML = '';
                    isFirstChunk = false;
                }

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data.trim() === '[DONE]') break;
                        try {
                            const json = JSON.parse(data);
                            if (json.choices[0].delta.content) {
                                const contentChunk = json.choices[0].delta.content;
                                fullResponse += contentChunk;
                                if (messageTextElement) {
                                    messageTextElement.textContent = fullResponse;
                                }
                                scrollToBottom();
                            }
                        } catch (e) { /* ignore parse errors */ }
                    }
                }
            }
            if (fullResponse) {
                conversationHistory.push({ role: 'assistant', content: fullResponse });
                saveChatHistory(); // Bot message එක සම්පූර්ණ වූ පසු save කිරීම
            }

        } catch (error) {
            if (messageTextElement && messageTextElement.innerHTML.includes('loading-animation')) {
                 messageTextElement.innerHTML = '';
            }
            if (error.name === 'AbortError') {
                 if (messageTextElement) messageTextElement.textContent += "\n(Generation stopped)";
            } else {
                 if (messageTextElement) messageTextElement.textContent = "Sorry, something went wrong.";
            }
        } finally {
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
        if (sender === 'user') {
            iconDiv.textContent = 'Y';
        } else {
            iconDiv.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        messageDiv.textContent = message;

        wrapper.appendChild(iconDiv);
        wrapper.appendChild(messageDiv);
        chatMessagesContainer.appendChild(wrapper);

        if (sender === 'assistant') {
            setupFeedbackEvents(wrapper, messageDiv);
        }
        
        scrollToBottom();
        return wrapper; // සම්පූර්ණ wrapper එක return කිරීම වඩා හොඳයි
    };
    
    // --- අනෙකුත් Functions (Feedback, Scrolling, Theme) ---
    // මෙම functions පෙර පරිදිම පවතී, කිසිදු වෙනසක් නැත
    const scrollToBottom = () => { chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight; };
    const toggleButtonsForLoading = (isLoading) => { /* ... පෙර කේතයම ... */ };
    const hideFeedbackPopup = () => { /* ... පෙර කේතයම ... */ };
    const showFeedbackPopup = (x, y, messageContent, messageElement) => { /* ... පෙර කේතයම ... */ };
    const setupFeedbackEvents = (wrapper, messageDiv) => { /* ... පෙර කේතයම ... */ };
    themeToggleBtn.addEventListener('click', () => { /* ... පෙර කේතයම ... */ });
    document.addEventListener('click', (e) => { if (feedbackPopup.classList.contains('show') && !feedbackPopup.contains(e.target) && !e.target.closest('.message-wrapper')) { hideFeedbackPopup(); } });

    
    // --- යෙදුම ආරම්භ කිරීම ---
    const initializeApp = () => {
        setInitialSidebarState();
        loadChatHistory();
    };

    initializeApp();
    window.addEventListener('resize', setInitialSidebarState);
});