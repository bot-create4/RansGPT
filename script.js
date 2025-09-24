// --- DOM Elements ---
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const menuIcon = document.getElementById('menu-icon');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const welcomeContainer = document.getElementById('welcome-container');
const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const suggestionCards = document.querySelectorAll('.card');
const plusBtn = document.getElementById('plus-btn');
const optionsMenuOverlay = document.getElementById('options-menu-overlay');
const optionsMenu = document.getElementById('options-menu');
const toast = document.getElementById('toast');
const themeToggle = document.getElementById('theme-toggle');
const recentChatsList = document.getElementById('recent-chats-list');
const newChatBtn = document.getElementById('new-chat-btn');

// --- State Management ---
let currentChat = [];
let allChats = {};
let currentChatId = null;
let lastUserMessage = '';
let currentMessageText = '';
let apiRequestController; 

// --- Core Functions ---
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

function showChatView(isNewChat = false) {
    if (isNewChat || welcomeContainer.style.display !== 'none') {
        welcomeContainer.style.display = 'none';
        chatBox.style.display = 'flex';
        chatBox.style.flexDirection = 'column';
    }
}

function showWelcomeView() {
    welcomeContainer.style.display = 'block';
    chatBox.style.display = 'none';
    chatBox.innerHTML = '';
}

// --- MODIFIED: addMessage function to render Markdown ---
function addMessage(message, sender, isThinking = false) {
    showChatView();
    const messageId = 'msg-' + Date.now();
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender);
    messageElement.id = messageId;
    
    let avatar;
    if (sender === 'user') {
        avatar = document.createElement('div');
        avatar.classList.add('avatar');
        avatar.innerHTML = `<i class="fas fa-user"></i>`;
    } else { 
        avatar = document.createElement('img');
        avatar.classList.add('avatar');
        avatar.src = 'https://files.catbox.moe/fj08ro.jpg';
        avatar.alt = 'RansGPT Logo';
    }
    messageElement.appendChild(avatar);

    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    if (isThinking) {
        messageContent.innerHTML = `
            <div class="thinking-animation">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>`;
    } else {
        const p = document.createElement('p');
        
        if (sender === 'bot') {
            // Convert Markdown to safe HTML for bot messages
            const dirtyHtml = marked.parse(message);
            p.innerHTML = DOMPurify.sanitize(dirtyHtml);
        } else {
            // For user messages, just display plain text for security
            p.textContent = message;
        }

        messageContent.appendChild(p);
        if (sender === 'bot') {
            const optionsContainer = document.createElement('div');
            optionsContainer.classList.add('message-options');
            optionsContainer.innerHTML = `<i class="fas fa-ellipsis-h options-icon"></i>`;
            optionsContainer.querySelector('.options-icon').addEventListener('click', () => showOptionsMenu(message));
            messageContent.appendChild(optionsContainer);
        }
    }
    messageElement.appendChild(messageContent);
    chatBox.appendChild(messageElement);
    chatBox.parentElement.parentElement.scrollTop = chatBox.parentElement.parentElement.scrollHeight;
    return messageId;
}
// --- END MODIFICATION ---

async function sendMessage(queryText) {
    if (sendBtn.classList.contains('is-stopping')) {
        if(apiRequestController) {
            apiRequestController.abort();
        }
        return;
    }

    const query = queryText || userInput.value.trim();
    if (query === '') return;

    addMessage(query, 'user');
    currentChat.push({ sender: 'user', text: query });
    lastUserMessage = query;
    userInput.value = '';
    
    toggleSendButton(true);

    const thinkingMessageId = addMessage('', 'bot', true);
    
    apiRequestController = new AbortController();

    try {
        const response = await fetch('/.netlify/functions/chat', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ query: query }),
            signal: apiRequestController.signal
        });

        if (!response.ok) throw new Error('Network response error');
        
        const data = await response.json();
        document.getElementById(thinkingMessageId)?.remove();
        addMessage(data.reply, 'bot');
        currentChat.push({ sender: 'bot', text: data.reply });
        saveCurrentChat();

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Fetch aborted by user.');
            document.getElementById(thinkingMessageId)?.remove();
            addMessage("Response stopped.", "bot");
        } else {
            document.getElementById(thinkingMessageId)?.remove();
            addMessage('Sorry, something went wrong.', 'bot');
            console.error('Error:', error);
        }
    } finally {
        toggleSendButton(false); 
        apiRequestController = null;
    }
}

function toggleSendButton(isSending = false) {
    const hasText = userInput.value.trim() !== '';
    if (isSending) {
        micBtn.style.display = 'none';
        sendBtn.style.display = 'flex';
        sendBtn.classList.add('is-stopping');
        sendBtn.innerHTML = `<i class="fas fa-stop"></i>`;
    } else {
        sendBtn.classList.remove('is-stopping');
        sendBtn.innerHTML = `<i class="fas fa-arrow-up"></i>`;
        if (hasText) {
            micBtn.style.display = 'none';
            sendBtn.style.display = 'flex';
        } else {
            micBtn.style.display = 'flex';
            sendBtn.style.display = 'none';
        }
    }
}


function toggleSidebar() { sidebar.classList.toggle('open'); sidebarOverlay.classList.toggle('open'); }
function saveCurrentChat() {
    if (currentChat.length === 0) return;
    if (!currentChatId) { currentChatId = 'chat-' + Date.now(); }
    const title = currentChat[0].text.split(' ').slice(0, 5).join(' ');
    allChats[currentChatId] = { title: title, messages: currentChat };
    localStorage.setItem('ransgpt_chats', JSON.stringify(allChats));
    updateRecentChatsList();
}
function loadChat(chatId) {
    if (!allChats[chatId]) return;
    currentChatId = chatId;
    currentChat = allChats[chatId].messages;
    chatBox.innerHTML = '';
    showChatView(true);
    currentChat.forEach(msg => addMessage(msg.text, msg.sender));
    updateRecentChatsList();
    toggleSidebar();
}
function updateRecentChatsList() {
    recentChatsList.innerHTML = '';
    const chatIds = Object.keys(allChats).reverse();
    chatIds.forEach(chatId => {
        const chat = allChats[chatId];
        const li = document.createElement('li');
        li.innerHTML = `<i class="far fa-comment-alt"></i> ${chat.title}`;
        if (chatId === currentChatId) { li.classList.add('active'); }
        li.addEventListener('click', () => loadChat(chatId));
        recentChatsList.appendChild(li);
    });
}
function startNewChat() {
    currentChat = [];
    currentChatId = null;
    showWelcomeView();
    updateRecentChatsList();
    if (sidebar.classList.contains('open')) { toggleSidebar(); }
}
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ransgpt_theme', theme);
    themeToggle.checked = theme === 'dark';
}
function showOptionsMenu(messageText) { currentMessageText = messageText; optionsMenuOverlay.style.display = 'block'; optionsMenu.classList.add('show'); }
function hideOptionsMenu() { optionsMenuOverlay.style.display = 'none'; optionsMenu.classList.remove('show'); }

// --- Event Listeners ---
menuIcon.addEventListener('click', toggleSidebar);
closeSidebarBtn.addEventListener('click', toggleSidebar);
sidebarOverlay.addEventListener('click', toggleSidebar);
newChatBtn.addEventListener('click', startNewChat);

sendBtn.addEventListener('click', () => sendMessage());
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
userInput.addEventListener('input', () => toggleSendButton(false));
suggestionCards.forEach(card => card.addEventListener('click', () => sendMessage(card.getAttribute('data-prompt'))));
plusBtn.addEventListener('click', () => { showToast('File upload is coming soon!'); });
micBtn.addEventListener('click', () => { showToast('Voice input is coming soon!'); });

optionsMenuOverlay.addEventListener('click', hideOptionsMenu);
document.getElementById('redo-btn').addEventListener('click', () => { hideOptionsMenu(); sendMessage(lastUserMessage); });
document.getElementById('good-btn').addEventListener('click', () => { showToast('Thank you for your feedback!'); hideOptionsMenu(); });
document.getElementById('bad-btn').addEventListener('click', () => { showToast('Feedback received. We will improve.'); hideOptionsMenu(); });
document.getElementById('read-btn').addEventListener('click', () => {
    if ('speechSynthesis' in window) { window.speechSynthesis.speak(new SpeechSynthesisUtterance(currentMessageText)); } else { showToast('Text-to-speech is not supported.'); }
    hideOptionsMenu();
});
document.getElementById('copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(currentMessageText).then(() => { showToast('Copied to clipboard!'); hideOptionsMenu(); }).catch(err => { showToast('Failed to copy text.'); });
});
document.getElementById('share-btn').addEventListener('click', () => { showToast('Share feature is coming soon!'); hideOptionsMenu(); });
document.getElementById('export-btn').addEventListener('click', () => { showToast('Export feature is coming soon!'); hideOptionsMenu(); });

themeToggle.addEventListener('change', () => { setTheme(themeToggle.checked ? 'dark' : 'light'); });

document.addEventListener('DOMContentLoaded', () => {
    const savedChats = localStorage.getItem('ransgpt_chats');
    if (savedChats) { allChats = JSON.parse(savedChats); updateRecentChatsList(); }
    const savedTheme = localStorage.getItem('ransgpt_theme') || 'dark';
    setTheme(savedTheme);
});