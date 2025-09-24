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
const profileIconContainer = document.getElementById('profile-icon-container');
const accountModalOverlay = document.getElementById('account-modal-overlay');
const accountModal = document.getElementById('account-modal');
const userNameInput = document.getElementById('user-name-input');
const avatarSelectionContainer = document.getElementById('avatar-selection');
const saveAccountBtn = document.getElementById('save-account-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');
const greetingH1 = document.querySelector('.greeting h1');

// --- State Management ---
let currentChat = [];
let allChats = {};
let currentChatId = null;
let lastUserMessage = '';
let currentMessageText = '';
let apiRequestController;
const avatarOptions = ["icon", "https://files.catbox.moe/6j6s3e.png", "https://files.catbox.moe/x9w3tq.png", "https://files.catbox.moe/q3f3a5.png"];
let tempSelectedAvatar = "icon";


// --- NEW HELPER FUNCTION: To find URLs and convert to links ---
function linkifyText(text) {
    const urlPattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlPattern, function(url) {
        const startsWithWww = url.toLowerCase().startsWith('www.');
        const href = startsWithWww ? 'http://' + url : url;
        return `<a href="${href}" target="_blank" class="chat-link">${url}</a>`;
    });
}


// --- UI Update & User Account Logic ---
function updateUI(user) {
    profileIconContainer.innerHTML = ''; 
    const userAvatarSrc = user ? (user.user_metadata.avatar || 'icon') : 'icon';
    let profileIcon;
    if (userAvatarSrc === 'icon') {
        profileIcon = document.createElement('div');
        profileIcon.classList.add('profile-icon');
        profileIcon.innerHTML = `<i class="fas fa-user"></i>`;
    } else {
        profileIcon = document.createElement('img');
        profileIcon.classList.add('profile-icon');
        profileIcon.src = userAvatarSrc;
    }
    profileIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleProfileDropdown(user);
    });
    profileIconContainer.appendChild(profileIcon);
    
    if (user) {
        greetingH1.textContent = `Hello, ${user.user_metadata.full_name || user.user_metadata.name || user.email.split('@')[0]}`;
        loadUserSpecificData(user);
    } else {
        showWelcomeView();
        greetingH1.textContent = `Hello, Guest`;
        recentChatsList.innerHTML = '';
    }
}

function toggleProfileDropdown(user) {
    let dropdown = document.getElementById('profile-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'profile-dropdown';
        dropdown.classList.add('profile-dropdown');
        profileIconContainer.appendChild(dropdown);
    }
    const ul = document.createElement('ul');
    if (user) {
        ul.innerHTML = `
            <li id="settings-btn"><i class="fas fa-cog"></i> Settings</li>
            <li id="logout-btn" class="danger"><i class="fas fa-sign-out-alt"></i> Logout</li>
        `;
    } else {
        ul.innerHTML = `<li id="login-btn"><i class="fas fa-sign-in-alt"></i> Login / Sign Up</li>`;
    }
    dropdown.innerHTML = '';
    dropdown.appendChild(ul);
    if (user) {
        dropdown.querySelector('#settings-btn').addEventListener('click', openAccountModal);
        dropdown.querySelector('#logout-btn').addEventListener('click', () => { netlifyIdentity.logout(); dropdown.classList.remove('show'); });
    } else {
        dropdown.querySelector('#login-btn').addEventListener('click', () => { netlifyIdentity.open(); dropdown.classList.remove('show'); });
    }
    dropdown.classList.toggle('show');
}

function openAccountModal() {
    const user = netlifyIdentity.currentUser();
    if (!user) return;
    userNameInput.value = user.user_metadata.name || user.user_metadata.full_name || '';
    tempSelectedAvatar = user.user_metadata.avatar || 'icon';
    avatarSelectionContainer.innerHTML = '';
    avatarOptions.forEach(avatarSrc => {
        let avatarChoice = (avatarSrc === 'icon') ? document.createElement('div') : document.createElement('img');
        if (avatarSrc === 'icon') {
            avatarChoice.classList.add('avatar-choice', 'profile-icon');
            avatarChoice.innerHTML = `<i class="fas fa-user"></i>`;
        } else {
            avatarChoice.classList.add('avatar-choice');
            avatarChoice.src = avatarSrc;
        }
        avatarChoice.dataset.src = avatarSrc;
        if (avatarSrc === tempSelectedAvatar) { avatarChoice.classList.add('selected'); }
        avatarChoice.addEventListener('click', () => {
            document.querySelectorAll('.avatar-choice').forEach(el => el.classList.remove('selected'));
            avatarChoice.classList.add('selected');
            tempSelectedAvatar = avatarSrc;
        });
        avatarSelectionContainer.appendChild(avatarChoice);
    });
    accountModal.style.display = 'block';
    accountModalOverlay.style.display = 'block';
}

function closeAccountModal() {
    accountModal.style.display = 'none';
    accountModalOverlay.style.display = 'none';
}

function saveAccountSettings() {
    const user = netlifyIdentity.currentUser();
    const newName = userNameInput.value.trim();
    user.update({ data: { name: newName, avatar: tempSelectedAvatar } })
        .then(updatedUser => {
            updateUI(updatedUser);
            showToast("Settings saved successfully!");
            closeAccountModal();
            if (currentChat.length > 0) { loadChat(currentChatId); }
        })
        .catch(error => { console.error("Error updating user data:", error); showToast("Failed to save settings."); });
}

function deleteAccount() {
    const isConfirmed = confirm("Are you sure? This will delete your Netlify account and all your chat history permanently.");
    if (isConfirmed) {
        const user = netlifyIdentity.currentUser();
        localStorage.removeItem(`ransgpt_chats_${user.id}`);
        user.delete().then(() => { showToast("Account deleted successfully."); })
            .catch(error => { console.error("Error deleting account:", error); showToast("Failed to delete account."); });
    }
}

function loadUserSpecificData(user) {
    const savedChats = localStorage.getItem(`ransgpt_chats_${user.id}`);
    allChats = savedChats ? JSON.parse(savedChats) : {};
    updateRecentChatsList(user.id);
    const savedTheme = localStorage.getItem('ransgpt_theme') || 'dark';
    setTheme(savedTheme);
}

netlifyIdentity.on('init', user => updateUI(user));
netlifyIdentity.on('login', user => { updateUI(user); netlifyIdentity.close(); });
netlifyIdentity.on('logout', () => updateUI(null));

function saveCurrentChat() {
    const user = netlifyIdentity.currentUser();
    if (!user || currentChat.length === 0) return;
    if (!currentChatId) { currentChatId = 'chat-' + Date.now(); }
    const title = currentChat[0].text.split(' ').slice(0, 5).join(' ');
    allChats[currentChatId] = { title: title, messages: currentChat };
    localStorage.setItem(`ransgpt_chats_${user.id}`, JSON.stringify(allChats));
    updateRecentChatsList(user.id);
}

function loadChat(chatId) {
    const user = netlifyIdentity.currentUser();
    if (!user || !allChats[chatId]) return;
    currentChatId = chatId;
    currentChat = allChats[chatId].messages;
    chatBox.innerHTML = '';
    showChatView(true);
    currentChat.forEach(msg => addMessage(msg.text, msg.sender));
    updateRecentChatsList(user.id);
    if (sidebar.classList.contains('open')) { toggleSidebar(); }
}

function updateRecentChatsList(userId) {
    recentChatsList.innerHTML = '';
    if (!userId) return;
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
    const user = netlifyIdentity.currentUser();
    if (!user) { netlifyIdentity.open(); return; }
    currentChat = [];
    currentChatId = null;
    showWelcomeView();
    updateRecentChatsList(user.id);
    if (sidebar.classList.contains('open')) { toggleSidebar(); }
}

// --- MODIFIED: addMessage function to use the linkify function ---
function addMessage(message, sender, isThinking = false) {
    showChatView();
    const user = netlifyIdentity.currentUser();
    const messageId = 'msg-' + Date.now();
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender);
    messageElement.id = messageId;
    let avatar;
    if (sender === 'user') {
        const userAvatarSrc = user?.user_metadata?.avatar || 'icon';
        if (userAvatarSrc === 'icon') {
            avatar = document.createElement('div');
            avatar.classList.add('avatar');
            avatar.innerHTML = `<i class="fas fa-user"></i>`;
        } else {
            avatar = document.createElement('img');
            avatar.classList.add('avatar');
            avatar.src = userAvatarSrc;
        }
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
        messageContent.innerHTML = `<div class="thinking-animation"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
    } else {
        const p = document.createElement('p');
        if (sender === 'bot') {
            const linkedText = linkifyText(message); // First, convert URLs to links
            const dirtyHtml = marked.parse(linkedText); // Then, parse Markdown
            // Sanitize the final HTML, allowing target="_blank" for links
            p.innerHTML = DOMPurify.sanitize(dirtyHtml, { ADD_ATTR: ['target'] });
        } else {
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

async function sendMessage(queryText) {
    if (sendBtn.classList.contains('is-stopping')) {
        if(apiRequestController) { apiRequestController.abort(); }
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
        const response = await fetch('/.netlify/functions/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query }), signal: apiRequestController.signal });
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

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ransgpt_theme', theme);
    themeToggle.checked = theme === 'dark';
}

function showOptionsMenu(messageText) { currentMessageText = messageText; optionsMenuOverlay.style.display = 'block'; optionsMenu.classList.add('show'); }
function hideOptionsMenu() { optionsMenuOverlay.style.display = 'none'; optionsMenu.classList.remove('show'); }

function toggleSidebar() { sidebar.classList.toggle('open'); sidebarOverlay.classList.toggle('open'); }

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

themeToggle.addEventListener('change', () => {
    setTheme(themeToggle.checked ? 'dark' : 'light');
});

saveAccountBtn.addEventListener('click', saveAccountSettings);
deleteAccountBtn.addEventListener('click', deleteAccount);
accountModalOverlay.addEventListener('click', closeAccountModal);

window.addEventListener('click', () => {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown && dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
    }
});