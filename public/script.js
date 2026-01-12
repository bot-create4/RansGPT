/* =========================================
   RansGPT V15 - CORE LOGIC ENGINE
   Author: A.M.Ransara Devnath
   ========================================= */

// --- 1. CONFIGURATION & SETUP ---
const K_ENC = "QUl6YVN5Q2VEV09rTVJhcXBHUko1d254bG8xWmUxNUpSV0VpU3FR"; 
const API_KEY_FIREBASE = atob(K_ENC);

const firebaseConfig = {
    apiKey: API_KEY_FIREBASE,
    authDomain: "ransgpt-7416b.firebaseapp.com",
    projectId: "ransgpt-7416b",
    storageBucket: "ransgpt-7416b.firebasestorage.app",
    messagingSenderId: "991157655064",
    appId: "1:991157655064:web:aa699aa9d62682bbdfd56d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// --- 2. STATE MANAGEMENT ---
let currentUser = null;
let currentChatId = null;
let chatContext = []; // Stores conversation memory
let uploadedImages = []; // Stores Base64 images
let isGenerating = false;
let abortController = null;
let userSettings = { name: "Guest", avatar: "" };

// --- 3. MARKDOWN CONFIGURATION (FIXED LINKS) ---
const renderer = new marked.Renderer();

// Fix 1: Open Links in New Tab
renderer.link = function(href, title, text) {
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline;">${text}</a>`;
};

// Fix 2: Code Blocks with Copy/Download
renderer.code = function(code, language) {
    const validLang = language && hljs.getLanguage(language) ? language : 'plaintext';
    const highlighted = hljs.highlight(code, { language: validLang }).value;
    return `
    <pre><div class="code-header">
        <span class="code-lang">${validLang}</span>
        <div class="code-actions">
            <button class="action-btn" onclick="copyCode(this)">
                <span class="material-symbols-rounded" style="font-size:14px">content_copy</span> Copy
            </button>
            <button class="action-btn" onclick="downloadCode(this, '${validLang}')">
                <span class="material-symbols-rounded" style="font-size:14px">download</span>
            </button>
        </div>
    </div><code class="language-${validLang}">${highlighted}</code></pre>`;
};

marked.setOptions({ renderer: renderer, breaks: true });

// --- 4. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Load Theme
    const savedTheme = localStorage.getItem('rans_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('theme-icon').innerText = savedTheme === 'light' ? 'light_mode' : 'dark_mode';
    
    // Draft Recovery
    const draft = localStorage.getItem('rans_draft');
    if(draft) {
        const el = document.getElementById('msg-in');
        el.value = draft;
        adjustHeight(el);
    }

    // Initialize Chat
    startNewChat(false);
});

// Auth Listener
auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
        // Fetch User Profile
        db.ref(`users/${user.uid}`).once('value', s => {
            const val = s.val();
            if (val && val.name) {
                userSettings = val;
            } else {
                // First time setup
                const defaultName = user.displayName || user.email.split('@')[0];
                userSettings = { name: defaultName, avatar: user.photoURL || "" };
                showNamePrompt(); // Ask for name
            }
            updateProfileUI();
        });
        loadChatHistory();
        toast(`Welcome back, ${user.displayName || 'User'}`);
    } else {
        // Guest Mode
        userSettings = { name: "Guest", avatar: "" };
        updateProfileUI();
        document.getElementById('chat-history').innerHTML = 
            '<div style="padding:20px;text-align:center;font-size:13px;opacity:0.6;">Login to save history</div>';
    }
});

function updateProfileUI() {
    document.getElementById('side-name').innerText = userSettings.name;
    document.getElementById('welcome-name').innerText = userSettings.name.split(' ')[0];
    
    const avatarUrl = userSettings.avatar || 
        `https://ui-avatars.com/api/?name=${userSettings.name}&background=2E86DE&color=fff`;
    
    document.getElementById('side-avatar').src = avatarUrl;
    document.getElementById('side-status').innerText = currentUser ? 'Online' : 'Tap for Settings';
}

// --- 5. CHAT ENGINE (THE BRAIN) ---

// Handle Enter Key
function handleEnter(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMsg();
    }
}

// Set Prompt from Suggestions
function setPrompt(txt) {
    const el = document.getElementById('msg-in');
    el.value = txt;
    adjustHeight(el);
    sendMsg();
}

// Main Send Function
async function sendMsg() {
    const inputEl = document.getElementById('msg-in');
    const text = inputEl.value.trim();

    // STOP GENERATION LOGIC
    if (isGenerating) {
        if (abortController) abortController.abort();
        isGenerating = false;
        setUIState(false);
        addBubble('ai', '**Generation stopped by user.**', [], false);
        return;
    }

    if (!text && uploadedImages.length === 0) return;

    // Reset UI
    inputEl.value = '';
    adjustHeight(inputEl);
    localStorage.removeItem('rans_draft');
    document.getElementById('welcome').style.display = 'none';

    // Prepare Images
    const currentImages = [...uploadedImages];
    uploadedImages = [];
    renderPreviews();

    // 1. Add User Bubble
    addBubble('user', text, currentImages);

    // 2. Update Context Memory
    const newMessage = { 
        sender: 'user', 
        text: text, 
        images: currentImages 
    };
    chatContext.push(newMessage);
    
    // 3. Show Loading
    const loadingId = addBubble('ai', '', [], true); // Thinking state
    isGenerating = true;
    setUIState(true);
    abortController = new AbortController();

    try {
        // Call Netlify Backend (V3 System)
        const response = await fetch('/.netlify/functions/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history: chatContext }),
            signal: abortController.signal
        });

        const data = await response.json();
        
        // Remove Loading Bubble
        const loadEl = document.getElementById(loadingId);
        if(loadEl) loadEl.remove();

        if (data.reply) {
            // 4. Start Typing Effect
            const aiMsgId = addBubble('ai', '', [], false); // Empty bubble
            await typeWriter(data.reply, aiMsgId);
            
            // Add AI response to memory
            chatContext.push({ sender: 'model', text: data.reply });
        } else {
            addBubble('ai', "Error: No response from brain. (Check Backend Logs)");
        }

    } catch (error) {
        const loadEl = document.getElementById(loadingId);
        if(loadEl) loadEl.remove();
        
        if (error.name !== 'AbortError') {
            addBubble('ai', "Connection Error. Please check your internet.");
            console.error(error);
        }
    } finally {
        if (!abortController || !abortController.signal.aborted) {
            isGenerating = false;
            setUIState(false);
        }
    }
}

// Typewriter Effect
function typeWriter(text, elementId) {
    return new Promise(resolve => {
        const element = document.getElementById(elementId).querySelector('.md-content');
        let i = 0;
        const speed = 8; // Typing speed (ms)
        const chatView = document.getElementById('chat-view');
        
        // Add cursor
        element.innerHTML = '<span class="cursor"></span>';
        chatView.classList.add('typing-active');

        function type() {
            if (i < text.length) {
                if (!isGenerating && i > 0) { resolve(); return; } // Stop if aborted

                // Type chunks for better performance on mobile
                const chunk = text.slice(i, i + 3); 
                i += 3;
                
                element.innerHTML = text.substring(0, i) + '<span class="cursor"></span>';
                
                // Smart Auto Scroll
                chatView.scrollTop = chatView.scrollHeight;
                
                requestAnimationFrame(() => setTimeout(type, speed));
            } else {
                finalizeMessage(text, element, elementId);
                resolve();
            }
        }
        type();
    });
}

function finalizeMessage(text, element, msgId) {
    // 1. Render Markdown
    element.innerHTML = DOMPurify.sanitize(marked.parse(text));
    
    // 2. Syntax Highlight
    document.getElementById(msgId).querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });

    // 3. Remove Typing State
    document.getElementById('chat-view').classList.remove('typing-active');
    
    // 4. Save to Firebase
    if (currentUser && currentChatId) {
        db.ref(`chats/${currentUser.uid}/${currentChatId}/messages`).push({
            role: 'ai',
            text: text
        });
    }
}

function setUIState(generating) {
    const btn = document.getElementById('send-btn');
    const icon = document.getElementById('send-icon');
    
    if (generating) {
        btn.classList.add('stop');
        icon.innerText = 'stop_circle';
    } else {
        btn.classList.remove('stop');
        icon.innerText = 'arrow_upward';
    }
}

// --- 6. UI RENDERING ---

function addBubble(role, text, images = [], thinking = false) {
    const list = document.getElementById('msg-list');
    const div = document.createElement('div');
    div.className = `msg-row ${role}`;
    const id = 'msg-' + Date.now() + Math.random().toString(36).substr(2, 5);

    // Image Grid
    let imgHtml = '';
    if (images && images.length > 0) {
        imgHtml = `<div class="chat-img-grid" data-count="${images.length}">
            ${images.map(src => `<img src="${src}" class="chat-img" onclick="viewImage('${src}')">`).join('')}
        </div>`;
    }

    // Content
    let content = thinking 
        ? `<div class="typing-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>` 
        : (role === 'ai' ? '' : text.replace(/\n/g, '<br>')); 

    div.innerHTML = `
        <div class="bubble ${thinking ? 'thinking' : ''}" id="${id}">
            ${imgHtml}
            <div class="md-content">${content}</div>
        </div>`;

    list.appendChild(div);
    scrollToBottom();

    // User Message Save Logic
    if (role === 'user' && !thinking && currentUser) {
        if (!currentChatId) currentChatId = Date.now().toString();
        
        // Set Title if first msg
        db.ref(`chats/${currentUser.uid}/${currentChatId}/title`).transaction(curr => {
            return curr || text.substring(0, 30);
        });

        db.ref(`chats/${currentUser.uid}/${currentChatId}/messages`).push({
            role: 'user',
            text: text,
            images: images
        });
    }

    // Immediate Render for History (Bot)
    if (role === 'ai' && !thinking && text) {
        const el = div.querySelector('.md-content');
        el.innerHTML = DOMPurify.sanitize(marked.parse(text));
        div.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
    }

    return id;
}

// --- 7. FILE HANDLING ---

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        if (!file.type.startsWith('image/')) return;
        
        const reader = new FileReader();
        reader.onload = evt => {
            if (uploadedImages.length < 4) {
                uploadedImages.push(evt.target.result);
                renderPreviews();
            } else {
                toast("Max 4 images allowed");
            }
        };
        reader.readAsDataURL(file);
    });
    e.target.value = '';
}

function renderPreviews() {
    const dock = document.getElementById('img-previews');
    dock.innerHTML = '';
    
    uploadedImages.forEach((img, idx) => {
        dock.innerHTML += `
            <div class="thumb-box">
                <img src="${img}" onclick="viewImage('${img}')">
                <button onclick="removeImage(${idx})"><span class="material-symbols-rounded">close</span></button>
            </div>`;
    });
}

function removeImage(idx) { uploadedImages.splice(idx, 1); renderPreviews(); }

function viewImage(src) {
    const w = window.open("", "_blank");
    if(w) {
        w.document.write(`
            <body style="margin:0;background:#050505;display:flex;align-items:center;justify-content:center;height:100vh;">
                <img src="${src}" style="max-width:100%;max-height:100%;object-fit:contain;">
            </body>
        `);
    } else {
        toast("Popup blocked! Allow popups to view images.");
    }
}

// --- 8. HISTORY & SESSION ---

function loadChatHistory() {
    db.ref(`chats/${currentUser.uid}`).on('value', snap => {
        const container = document.getElementById('chat-history');
        container.innerHTML = '';
        
        const chats = [];
        snap.forEach(c => chats.push({ id: c.key, ...c.val() }));
        
        chats.sort((a, b) => b.id - a.id).forEach(chat => {
            const div = document.createElement('div');
            div.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
            div.innerHTML = `
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;">${chat.title || 'New Chat'}</span>
                <span class="material-symbols-rounded del-btn" onclick="deleteChat('${chat.id}', event)">delete</span>
            `;
            div.onclick = () => loadSession(chat.id);
            container.appendChild(div);
        });
    });
}

function loadSession(id) {
    currentChatId = id;
    chatContext = []; // Reset context
    
    document.getElementById('welcome').style.display = 'none';
    document.getElementById('msg-list').innerHTML = '';
    closeSidebar();

    db.ref(`chats/${currentUser.uid}/${id}/messages`).once('value', snap => {
        snap.forEach(msgSnap => {
            const m = msgSnap.val();
            addBubble(m.role, m.text, m.images, false);
            
            chatContext.push({
                sender: m.role === 'user' ? 'user' : 'model',
                text: m.text,
                images: m.images || []
            });
        });
        scrollToBottom();
    });
}

function startNewChat(clear = true) {
    currentChatId = Date.now().toString();
    chatContext = [];
    uploadedImages = [];
    renderPreviews();
    
    if (clear) {
        document.getElementById('msg-list').innerHTML = '';
        document.getElementById('welcome').style.display = 'flex';
        document.getElementById('msg-in').focus();
        closeSidebar();
    }
}

function deleteChat(id, e) {
    e.stopPropagation();
    if (confirm("Delete this chat permanently?")) {
        db.ref(`chats/${currentUser.uid}/${id}`).remove();
        if (id === currentChatId) startNewChat();
    }
}

// --- 9. UTILS & MODALS ---

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
}

function toggleTheme() {
    const root = document.documentElement;
    const newTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', newTheme);
    localStorage.setItem('rans_theme', newTheme);
    document.getElementById('theme-icon').innerText = newTheme === 'light' ? 'light_mode' : 'dark_mode';
}

function adjustHeight(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    localStorage.setItem('rans_draft', el.value);
}

function scrollToBottom() {
    const view = document.getElementById('chat-view');
    view.scrollTop = view.scrollHeight;
}

function toast(msg) {
    const box = document.getElementById('toast-box');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span class="material-symbols-rounded">info</span> ${msg}`;
    box.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function showModal(html) {
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal-overlay').classList.add('active');
}
function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}

// --- 10. AUTH & ACTIONS ---

function showLoginDialog() {
    const html = `
        <div class="login-card">
            <button onclick="closeModal()" style="position:absolute; top:15px; right:15px; background:none; border:none; color:var(--text-muted); cursor:pointer;"><span class="material-symbols-rounded">close</span></button>
            <div class="login-icon"><span class="material-symbols-rounded">lock_person</span></div>
            <div class="login-title">Welcome Back</div>
            <div class="login-sub">Sign in to RansGPT</div>
            
            <button class="btn-google" onclick="loginGoogle()">
                <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Google Login
            </button>

            <div class="divider"><span>OR EMAIL</span></div>

            <div class="input-group">
                <span class="material-symbols-rounded">mail</span>
                <input id="login-email" class="login-input" placeholder="Email">
            </div>
            <div class="input-group">
                <span class="material-symbols-rounded">key</span>
                <input id="login-pass" class="login-input" type="password" placeholder="Password">
            </div>
            <button class="btn-primary" onclick="loginEmail()">Sign In / Up</button>
        </div>`;
    showModal(html);
}

function openSettings() {
    if (!currentUser) { showLoginDialog(); return; }
    const html = `
        <div class="login-card">
            <button onclick="closeModal()" style="position:absolute; top:15px; right:15px; background:none; border:none; color:var(--text-muted); cursor:pointer;"><span class="material-symbols-rounded">close</span></button>
            <div class="login-title">Settings</div>
            <div class="login-sub">Update Profile</div>
            <div class="input-group"><span class="material-symbols-rounded">badge</span><input id="set-name" class="login-input" placeholder="Name" value="${userSettings.name}"></div>
            <div class="input-group"><span class="material-symbols-rounded">image</span><input id="set-avatar" class="login-input" placeholder="Avatar URL" value="${userSettings.avatar || ''}"></div>
            <button class="btn-primary" onclick="saveSettings()">Save</button>
            <button onclick="auth.signOut();closeModal()" style="width:100%;margin-top:10px;padding:12px;background:rgba(255,59,48,0.1);color:var(--danger);border:1px solid var(--danger);border-radius:12px;cursor:pointer;">Logout</button>
        </div>`;
    showModal(html);
}

function showNamePrompt() {
    const html = `
        <div class="login-card">
            <div class="login-title">Hello!</div>
            <div class="login-sub">What should we call you?</div>
            <div class="input-group"><span class="material-symbols-rounded">badge</span><input id="prompt-name" class="login-input" placeholder="Your Name" value="${userSettings.name}"></div>
            <button class="btn-primary" onclick="saveNamePrompt()">Continue</button>
        </div>`;
    showModal(html);
}

function loginGoogle() { auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then(closeModal).catch(e => toast(e.message)); }
function loginEmail() {
    const e = document.getElementById('login-email').value;
    const p = document.getElementById('login-pass').value;
    auth.signInWithEmailAndPassword(e, p).then(closeModal).catch(() => auth.createUserWithEmailAndPassword(e, p).then(closeModal).catch(err => toast(err.message)));
}
function saveSettings() {
    const name = document.getElementById('set-name').value;
    const avatar = document.getElementById('set-avatar').value;
    if (name) { userSettings = { name, avatar }; db.ref(`users/${currentUser.uid}`).update(userSettings); updateProfileUI(); closeModal(); }
}
function saveNamePrompt() {
    const name = document.getElementById('prompt-name').value;
    if (name) { db.ref(`users/${currentUser.uid}`).update({ name }); updateProfileUI(); closeModal(); }
}

function copyCode(btn) {
    const code = btn.closest('pre').querySelector('code').innerText;
    navigator.clipboard.writeText(code).then(() => {
        const original = btn.innerHTML;
        btn.innerHTML = `<span class="material-symbols-rounded" style="font-size:14px">check</span> Copied`;
        setTimeout(() => btn.innerHTML = original, 2000);
    });
}

function downloadCode(btn, lang) {
    const code = btn.closest('pre').querySelector('code').innerText;
    const ext = lang === 'javascript' ? 'js' : (lang === 'python' ? 'py' : 'txt');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
    a.download = `code.${ext}`;
    a.click();
}