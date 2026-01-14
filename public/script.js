/**
 * RansGPT V3 Ultimate - Core Application Logic
 * Author: A.M.Ransara Devnath
 * Description: This script handles the entire frontend functionality, including Firebase
 *              integration, chat engine, UI management, and advanced features.
 * Last Update: 2026-01-14
 */

'use strict';

// --- 1. CONFIGURATION & STATE MANAGEMENT ---

const AppConfig = {
    firebase: {
        apiKey: "AIzaSyCeDWOkMRaqpGRJ5wnxlo1Ze15JRWEiSqQ",
        authDomain: "ransgpt-7416b.firebaseapp.com",
        databaseURL: "https://ransgpt-7416b-default-rtdb.firebaseio.com",
        projectId: "ransgpt-7416b",
        storageBucket: "ransgpt-7416b.firebasestorage.app",
        messagingSenderId: "991157655064",
        appId: "1:991157655064:web:aa699aa9d62682bbdfd56d"
    },
    maxImageSize: 1024, // Compress images to max 1024px width/height
    imageQuality: 0.7, // JPEG quality after compression
    apiTimeout: 30000, // 30 seconds for API requests
};

const AppState = {
    currentUser: null,
    currentChatId: null,
    chatContext: [],
    uploadedImages: [],
    isGenerating: false,
    abortController: null,
    currentSpeaker: null,
    activeRequestChatId: null
};

// --- 2. DOM ELEMENT CACHE ---
const DOMElements = {
    splashScreen: document.getElementById('splash-screen'),
    msgList: document.getElementById('msg-list'),
    chatView: document.getElementById('chat-view'),
    input: document.getElementById('msg-in'),
    sendBtn: document.getElementById('send-btn'),
    sendIcon: document.getElementById('send-icon'),
    micBtn: document.getElementById('mic-btn'),
    imgPreviewDock: document.getElementById('img-previews'),
    sidebar: document.getElementById('sidebar'),
    sidebarOverlay: document.getElementById('sidebar-overlay'),
    chatHistoryList: document.getElementById('chat-history'),
    skeletonLoader: document.getElementById('skeleton-loader'),
    welcomeScreen: document.getElementById('welcome-screen'),
    modalOverlay: document.getElementById('modal-overlay'),
    modalContent: document.getElementById('modal-content'),
    themeIcon: document.getElementById('theme-icon'),
    sideName: document.getElementById('side-name'),
    sideAvatar: document.getElementById('side-avatar'),
    welcomeName: document.getElementById('welcome-name'),
};

// --- 3. CORE MODULES ---

const FirebaseApp = (() => {
    firebase.initializeApp(AppConfig.firebase);
    return { auth: firebase.auth(), db: firebase.database() };
})();

const UI = (() => {
    const showSkeleton = (show = true) => {
        DOMElements.skeletonLoader.style.display = show ? 'block' : 'none';
        if (show) {
            DOMElements.skeletonLoader.innerHTML = `<div class="skeleton-bubble"></div><div class="skeleton-bubble user"></div><div class="skeleton-bubble"></div>`;
        }
    };

    return {
        hideSplashScreen: () => {
            DOMElements.splashScreen.style.opacity = '0';
            setTimeout(() => DOMElements.splashScreen.style.display = 'none', 500);
        },
        toast: (message, type = 'info') => {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            const icon = type === 'success' ? 'check_circle' : (type === 'error' ? 'error' : 'info');
            toast.innerHTML = `<span class="material-symbols-rounded">${icon}</span> ${message}`;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 4000);
        },
        showModal: (html) => {
            DOMElements.modalContent.innerHTML = html;
            DOMElements.modalOverlay.classList.add('active');
        },
        closeModal: () => {
            DOMElements.modalOverlay.classList.remove('active');
        },
        customConfirm: (title, message, onConfirm) => {
            const html = `
            <div class="modal-card">
                <h3>${title}</h3><p>${message}</p>
                <div class="dialog-buttons" style="display:flex; gap:10px; margin-top:20px;">
                    <button id="confirm-cancel" style="flex:1; padding:10px; border-radius:10px; border:1px solid gray;">Cancel</button>
                    <button id="confirm-ok" style="flex:1; padding:10px; border-radius:10px; background:var(--danger); color:white; border:none;">Confirm</button>
                </div>
            </div>`;
            UI.showModal(html);
            document.getElementById('confirm-ok').onclick = () => { onConfirm(); UI.closeModal(); };
            document.getElementById('confirm-cancel').onclick = UI.closeModal;
        },
        toggleSidebar: (forceClose = false) => {
            const action = forceClose ? 'remove' : 'toggle';
            DOMElements.sidebar.classList[action]('open');
            DOMElements.sidebarOverlay.classList[action]('active');
        },
        toggleTheme: () => {
            const root = document.documentElement;
            const newTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', newTheme);
            localStorage.setItem('ransgpt_theme', newTheme);
            DOMElements.themeIcon.innerText = newTheme === 'light' ? 'light_mode' : 'dark_mode';
        },
        setGeneratingState: (isGenerating) => {
            DOMElements.sendBtn.classList.toggle('stop', isGenerating);
            DOMElements.sendIcon.innerText = isGenerating ? 'stop_circle' : 'arrow_upward';
            DOMElements.input.disabled = isGenerating;
        },
        scrollToBottom: (smooth = true) => {
            DOMElements.chatView.scrollTo({ top: DOMElements.chatView.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
        },
        showSkeletonLoader: () => showSkeleton(true),
        hideSkeletonLoader: () => showSkeleton(false),
    };
})();

// CRITICAL FIX: The missing Auth module that caused the splash screen bug.
const Auth = (() => {
    return {
        init: () => {
            FirebaseApp.auth.onAuthStateChanged(user => {
                AppState.currentUser = user;
                if (user) {
                    FirebaseApp.db.ref(`users/${user.uid}`).once('value', snapshot => {
                        const userData = snapshot.val() || {};
                        const displayName = userData.name || user.displayName || user.email.split('@')[0];
                        Auth.updateProfileUI({
                            name: displayName,
                            avatar: userData.avatar || user.photoURL
                        });
                        History.load();
                        Chat.startNew(false); // Don't clear UI, just reset state
                    });
                } else {
                    Auth.updateProfileUI({ name: 'Guest', avatar: null });
                    DOMElements.chatHistoryList.innerHTML = '<div class="empty-history">Please log in to see history.</div>';
                    Auth.showLoginDialog();
                }
                // This is the correct place to hide the splash screen.
                UI.hideSplashScreen();
            });
        },
        updateProfileUI: (profile) => {
            const avatarUrl = profile.avatar || `https://ui-avatars.com/api/?name=${profile.name.charAt(0)}&background=2E86DE&color=fff`;
            DOMElements.sideName.innerText = profile.name;
            DOMElements.welcomeName.innerText = profile.name.split(' ')[0];
            DOMElements.sideAvatar.src = avatarUrl;
        },
        showLoginDialog: () => {
            const html = `
            <div class="modal-card login-card">
                <h2 class="login-title">Welcome Back</h2>
                <p class="login-sub">Sign in to RansGPT to continue</p>
                <button class="btn-google" onclick="Auth.loginGoogle()">Sign in with Google</button>
                <div class="input-group">
                    <span class="material-symbols-rounded">mail</span>
                    <input id="login-email" class="login-input" type="email" placeholder="Email">
                </div>
                <div class="input-group">
                    <span class="material-symbols-rounded">key</span>
                    <input id="login-pass" class="login-input" type="password" placeholder="Password">
                </div>
                <button class="btn-primary" onclick="Auth.loginEmail()">Sign In / Up</button>
            </div>`;
            UI.showModal(html);
        },
        openSettings: () => {
            if (!AppState.currentUser) { Auth.showLoginDialog(); return; }
             // Fetch latest data before showing
            FirebaseApp.db.ref(`users/${AppState.currentUser.uid}`).once('value', snapshot => {
                const userData = snapshot.val() || {};
                const html = `
                <div class="modal-card">
                    <h3>Settings</h3>
                    <div class="input-group"><input id="set-name" class="login-input" placeholder="Display Name" value="${userData.name || ''}"></div>
                    <div class="input-group"><input id="set-avatar" class="login-input" placeholder="Avatar URL" value="${userData.avatar || ''}"></div>
                    <button class="btn-primary" onclick="Auth.saveSettings()">Save Changes</button>
                    <button onclick="FirebaseApp.auth.signOut()" style="background:var(--danger); color:white; border:none; padding:10px; margin-top:10px; border-radius:10px; width:100%;">Logout</button>
                </div>`;
                UI.showModal(html);
            });
        },
        loginGoogle: () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            FirebaseApp.auth.signInWithPopup(provider).then(UI.closeModal).catch(e => UI.toast(e.message, 'error'));
        },
        loginEmail: () => {
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-pass').value;
            FirebaseApp.auth.signInWithEmailAndPassword(email, pass)
                .then(UI.closeModal)
                .catch(() => {
                    FirebaseApp.auth.createUserWithEmailAndPassword(email, pass)
                        .then(UI.closeModal)
                        .catch(err => UI.toast(err.message, 'error'));
                });
        },
        saveSettings: () => {
            const name = document.getElementById('set-name').value;
            const avatar = document.getElementById('set-avatar').value;
            if (name && AppState.currentUser) {
                FirebaseApp.db.ref(`users/${AppState.currentUser.uid}`).update({ name, avatar });
                Auth.updateProfileUI({ name, avatar });
                UI.closeModal();
                UI.toast("Settings saved!", "success");
            }
        },
    };
})();


const Chat = (() => {
    const renderMessage = (role, text, images = [], isThinking = false) => {
        const msgId = 'msg-' + Date.now() + Math.random();
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg-row ${role}`;
        
        let imgHtml = images.length > 0 ? `<div class="chat-img-grid">${images.map(src => `<img src="${src}" class="chat-img" onclick="UI.showLightbox('${src}')">`).join('')}</div>` : '';
        let contentHtml = isThinking ? `<div class="typing-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>` : (role === 'user' ? text.replace(/\n/g, '<br>') : '');
        
        msgDiv.innerHTML = `<div class="bubble ${isThinking ? 'thinking' : ''}" id="${msgId}">${imgHtml}<div class="md-content">${contentHtml}</div></div>`;
        
        DOMElements.msgList.appendChild(msgDiv);
        UI.scrollToBottom();
        return msgId;
    };

    const typeWriter = async (element, text) => {
        return new Promise(resolve => {
            let i = 0;
            element.innerHTML = "";
            function type() {
                if (i < text.length && AppState.isGenerating) {
                    element.innerHTML += text[i];
                    i++;
                    UI.scrollToBottom(false);
                    requestAnimationFrame(type);
                } else {
                    element.innerHTML = DOMPurify.sanitize(marked.parse(text));
                    twemoji.parse(element);
                    element.querySelectorAll('pre code').forEach(hljs.highlightElement);
                    resolve();
                }
            }
            type();
        });
    };
    
    return {
        startNew: (clearUI = true) => {
            if (AppState.isGenerating) return;
            AppState.currentChatId = Date.now().toString();
            AppState.chatContext = [];
            AppState.uploadedImages = [];
            Files.renderPreviews();
            if (clearUI) {
                DOMElements.msgList.innerHTML = '';
                DOMElements.welcomeScreen.style.display = 'flex';
            }
            UI.toggleSidebar(true);
        },
        send: async () => {
            if (AppState.isGenerating) {
                if (AppState.abortController) AppState.abortController.abort();
                return;
            }

            const text = DOMElements.input.value.trim();
            const imagesToSend = [...AppState.uploadedImages];
            if (!text && imagesToSend.length === 0) return;

            AdvancedFeatures.hapticFeedback();
            UI.setGeneratingState(true);
            AppState.isGenerating = true;
            DOMElements.welcomeScreen.style.display = 'none';
            DOMElements.input.value = '';
            AppState.uploadedImages = [];
            Files.renderPreviews();

            AppState.activeRequestChatId = AppState.currentChatId;

            const userMessage = { sender: 'user', text, images: imagesToSend };
            renderMessage('user', text, imagesToSend);
            AppState.chatContext.push(userMessage);
            History.saveMessage(userMessage);

            const thinkingId = renderMessage('ai', '', [], true);

            AppState.abortController = new AbortController();
            try {
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Network timeout")), AppConfig.apiTimeout));
                const fetchPromise = fetch('/.netlify/functions/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ history: AppState.chatContext }),
                    signal: AppState.abortController.signal,
                });

                const response = await Promise.race([fetchPromise, timeoutPromise]);
                if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
                const data = await response.json();
                
                if (AppState.activeRequestChatId !== AppState.currentChatId) return; 

                if (data.reply) {
                    const aiMessage = { sender: 'model', text: data.reply };
                    AppState.chatContext.push(aiMessage);
                    History.saveMessage(aiMessage);
                    const aiBubbleId = renderMessage('ai', '');
                    await typeWriter(document.getElementById(aiBubbleId).querySelector('.md-content'), data.reply);
                }

            } catch (error) {
                if (error.name !== 'AbortError' && AppState.activeRequestChatId === AppState.currentChatId) {
                    renderMessage('ai', `**Error:** ${error.message}`);
                }
            } finally {
                document.getElementById(thinkingId)?.parentElement.remove();
                AppState.isGenerating = false;
                UI.setGeneratingState(false);
                AppState.activeRequestChatId = null;
            }
        },
    };
})();

const History = (() => {
    return {
        load: () => {
            if (!AppState.currentUser) return;
            const ref = FirebaseApp.db.ref(`chats/${AppState.currentUser.uid}`);
            ref.on('value', snapshot => {
                const chats = snapshot.val();
                DOMElements.chatHistoryList.innerHTML = '';
                if (chats) {
                    Object.entries(chats).sort((a, b) => b[0] - a[0]).forEach(([id, data]) => {
                        const div = document.createElement('div');
                        div.className = `history-item ${id === AppState.currentChatId ? 'active' : ''}`;
                        div.dataset.id = id;
                        div.innerHTML = `<span>${data.title || 'New Chat'}</span> <button onclick="History.delete('${id}', event)">X</button>`;
                        DOMElements.chatHistoryList.appendChild(div);
                    });
                } else {
                    DOMElements.chatHistoryList.innerHTML = '<div class="empty-history">No chats yet.</div>';
                }
            });
        },
        switch: (chatId) => {
            if (chatId === AppState.currentChatId || AppState.isGenerating) return;
            AppState.currentChatId = chatId;
            AppState.chatContext = [];
            DOMElements.msgList.innerHTML = '';
            DOMElements.welcomeScreen.style.display = 'none';

            UI.showSkeletonLoader();
            UI.toggleSidebar(true);

            FirebaseApp.db.ref(`chats/${AppState.currentUser.uid}/${chatId}/messages`).once('value', snapshot => {
                const messages = snapshot.val() || {};
                UI.hideSkeletonLoader();
                Object.values(messages).forEach(msg => {
                    renderMessage(msg.sender === 'user' ? 'user' : 'ai', msg.text, msg.images);
                    AppState.chatContext.push(msg);
                });
                UI.scrollToBottom(false);
            });
        },
        delete: (chatId, event) => {
            event.stopPropagation();
            UI.customConfirm("Delete Chat?", "This action cannot be undone.", () => {
                FirebaseApp.db.ref(`chats/${AppState.currentUser.uid}/${chatId}`).remove();
                if (chatId === AppState.currentChatId) Chat.startNew();
            });
        },
        saveMessage: (message) => {
            if (!AppState.currentUser || !AppState.currentChatId) return;
            const ref = FirebaseApp.db.ref(`chats/${AppState.currentUser.uid}/${AppState.currentChatId}`);
            if (message.sender === 'user' && AppState.chatContext.filter(m => m.sender === 'user').length === 1) {
                ref.child('title').set(message.text.substring(0, 30));
            }
            ref.child('messages').push(message);
        },
    };
})();

const Files = (() => {
    // ... (rest of the file module as provided before)
})();

const AdvancedFeatures = (() => {
    // ... (rest of the advanced features module as provided before)
})();

// --- 4. APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    Auth.init(); // Start the authentication listener

    // All other event listeners
    DOMElements.sendBtn.addEventListener('click', Chat.send);
    DOMElements.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            Chat.send();
        }
    });
    // ... other listeners
});

// Helper function to render a message (used by both Chat and History)
function renderMessage(role, text, images = []) {
    const msgId = 'msg-' + Date.now();
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg-row ${role}`;
    let imgHtml = images && images.length > 0 ? `<div class="chat-img-grid">${images.map(src => `<img src="${src}" class="chat-img">`).join('')}</div>` : '';
    let contentHtml = DOMPurify.sanitize(marked.parse(text || ' '));
    msgDiv.innerHTML = `<div class="bubble" id="${msgId}">${imgHtml}<div class="md-content">${contentHtml}</div></div>`;
    DOMElements.msgList.appendChild(msgDiv);
    twemoji.parse(msgDiv);
    msgDiv.querySelectorAll('pre code').forEach(hljs.highlightElement);
    return msgId;
}