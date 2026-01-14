/**
 * RansGPT V3 Ultimate - Core Application Logic
 * Author: A.M.Ransara Devnath
 * Description: This script handles the entire frontend functionality, including Firebase
 *              integration, chat engine, UI management, and advanced features.
 * Last Update: 2026-01-14
 */

// Strict mode helps catch common coding errors.
'use strict';

// --- 1. CONFIGURATION & STATE MANAGEMENT ---

const AppConfig = {
    // NOTE: This is the user-provided Firebase configuration.
    firebase: {
        apiKey: "AIzaSyCeDWOkMRaqpGRJ5wnxlo1Ze15JRWEiSqQ",
        authDomain: "ransgpt-7416b.firebaseapp.com",
        databaseURL: "https://ransgpt-7416b-default-rtdb.firebaseio.com",
        projectId: "ransgpt-7416b",
        storageBucket: "ransgpt-7416b.firebasestorage.app",
        messagingSenderId: "991157655064",
        appId: "1:991157655064:web:aa699aa9d62682bbdfd56d"
    },
    // Performance and safety limits
    maxImageSize: 1024, // Compress images to max 1024px width/height
    imageQuality: 0.7, // JPEG quality after compression
    apiTimeout: 30000, // 30 seconds for API requests
};

const AppState = {
    currentUser: null,
    currentChatId: null,
    chatContext: [], // In-memory conversation history
    uploadedImages: [], // Base64 strings of compressed images
    isGenerating: false,
    abortController: null, // To stop AI generation
    currentSpeaker: null, // For Text-to-Speech
    // A flag to prevent race conditions when switching chats
    activeRequestChatId: null 
};

// --- 2. DOM ELEMENT CACHE ---
// Caching elements for better performance.
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
    // ... add other frequently used elements here
};

// --- 3. CORE MODULES (Human-Readable Structure) ---

/**
 * Firebase Module: Handles all Firebase interactions.
 */
const FirebaseApp = (() => {
    firebase.initializeApp(AppConfig.firebase);
    const auth = firebase.auth();
    const db = firebase.database();
    return { auth, db };
})();

/**
 * UI Module: Manages all UI updates, modals, toasts, and animations.
 */
const UI = (() => {
    const showSkeleton = (show = true) => {
        DOMElements.skeletonLoader.style.display = show ? 'block' : 'none';
        if (show) {
            DOMElements.skeletonLoader.innerHTML = `
                <div class="skeleton-bubble"></div>
                <div class="skeleton-bubble user"></div>
                <div class="skeleton-bubble"></div>`;
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
            toast.innerHTML = `<span class="material-symbols-rounded">${type === 'success' ? 'check_circle' : 'info'}</span> ${message}`;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 4000);
        },
        showModal: (html) => {
            document.getElementById('modal-content').innerHTML = html;
            document.getElementById('modal-overlay').classList.add('active');
        },
        closeModal: () => {
            document.getElementById('modal-overlay').classList.remove('active');
        },
        customConfirm: (title, message, onConfirm) => {
            const html = `
            <div class="modal-card">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="dialog-buttons">
                    <button id="confirm-cancel" class="btn-secondary">Cancel</button>
                    <button id="confirm-ok" class="btn-danger">Confirm</button>
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
            document.getElementById('theme-icon').innerText = newTheme === 'light' ? 'light_mode' : 'dark_mode';
        },
        setGeneratingState: (isGenerating) => {
            DOMElements.sendBtn.classList.toggle('stop', isGenerating);
            DOMElements.sendIcon.innerText = isGenerating ? 'stop_circle' : 'arrow_upward';
            DOMElements.input.disabled = isGenerating;
        },
        scrollToBottom: () => {
            DOMElements.chatView.scrollTo({ top: DOMElements.chatView.scrollHeight, behavior: 'smooth' });
        },
        showSkeletonLoader: () => showSkeleton(true),
        hideSkeletonLoader: () => showSkeleton(false),
    };
})();

/**
 * Chat Module: The core engine for sending, receiving, and displaying messages.
 */
const Chat = (() => {
    const renderMessage = (role, text, images = []) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg-row ${role}`;
        const msgId = 'msg-' + Date.now();

        let imgHtml = '';
        if (images.length > 0) {
            imgHtml = `<div class="chat-img-grid">
                ${images.map(src => `<img src="${src}" class="chat-img" onclick="UI.showLightbox('${src}')">`).join('')}
            </div>`;
        }
        
        const speakerBtn = role === 'ai' ? `<button class="speaker-btn material-symbols-rounded" onclick="AdvancedFeatures.readAloud(this)">volume_up</button>` : '';

        msgDiv.innerHTML = `
            ${role === 'ai' ? speakerBtn : ''}
            <div class="bubble" id="${msgId}">
                ${imgHtml}
                <div class="md-content">${role === 'user' ? text.replace(/\n/g, '<br>') : ''}</div>
            </div>
        `;
        
        DOMElements.msgList.appendChild(msgDiv);
        UI.scrollToBottom();
        return msgId;
    };

    const typeWriter = async (element, text) => {
        return new Promise(resolve => {
            let i = 0;
            const speed = 10;
            element.innerHTML = "";

            function type() {
                if (i < text.length && AppState.isGenerating) {
                    const chunk = text.slice(i, i + 3);
                    i += 3;
                    element.innerHTML += chunk;
                    UI.scrollToBottom(); // Smart scroll
                    requestAnimationFrame(type);
                } else {
                    // Finalize and parse content
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
        startNew: () => {
            if (AppState.isGenerating) return;
            AppState.currentChatId = Date.now().toString();
            AppState.chatContext = [];
            AppState.uploadedImages = [];
            Files.renderPreviews();
            DOMElements.msgList.innerHTML = '';
            document.getElementById('welcome-screen').style.display = 'flex';
            UI.toggleSidebar(true);
        },
        setPrompt: (text) => {
            DOMElements.input.value = text;
            DOMElements.input.focus();
        },
        send: async () => {
            if (AppState.isGenerating) {
                // Handle "Stop Generating"
                if (AppState.abortController) AppState.abortController.abort();
                AdvancedFeatures.hapticFeedback();
                return;
            }

            const text = DOMElements.input.value.trim();
            const imagesToSend = [...AppState.uploadedImages];
            if (!text && imagesToSend.length === 0) return;

            AdvancedFeatures.hapticFeedback();
            UI.setGeneratingState(true);
            AppState.isGenerating = true;
            document.getElementById('welcome-screen').style.display = 'none';
            DOMElements.input.value = '';
            AppState.uploadedImages = [];
            Files.renderPreviews();

            // --- CRITICAL: Race Condition Fix ---
            // We lock the request to the currently active chat ID.
            AppState.activeRequestChatId = AppState.currentChatId;

            // 1. Add user message to UI and context
            renderMessage('user', text, imagesToSend);
            const userMessage = { sender: 'user', text, images: imagesToSend };
            AppState.chatContext.push(userMessage);
            History.saveMessage(userMessage);

            // 2. Show thinking bubble
            const thinkingId = renderMessage('ai', '', [], true);

            // 3. API Call with Timeout and Abort Controller
            AppState.abortController = new AbortController();
            try {
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Timeout: The request took too long.")), AppConfig.apiTimeout)
                );
                
                const fetchPromise = fetch('/.netlify/functions/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ history: AppState.chatContext }),
                    signal: AppState.abortController.signal,
                });

                const response = await Promise.race([fetchPromise, timeoutPromise]);
                
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                
                const data = await response.json();

                // --- CRITICAL: Race Condition Check ---
                // If the user switched chats while we were waiting, do not render the response.
                if (AppState.activeRequestChatId !== AppState.currentChatId) {
                    console.warn("Response received for an inactive chat. Discarding.");
                    return; 
                }

                if (data.reply) {
                    const aiMessage = { sender: 'model', text: data.reply };
                    AppState.chatContext.push(aiMessage);
                    History.saveMessage(aiMessage);
                    
                    const aiBubbleId = renderMessage('ai', '');
                    const bubbleContent = document.getElementById(aiBubbleId).querySelector('.md-content');
                    await typeWriter(bubbleContent, data.reply);
                } else {
                    throw new Error("Invalid response from server.");
                }

            } catch (error) {
                if (error.name !== 'AbortError') {
                    UI.toast(error.message, 'error');
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

/**
 * History Module: Manages loading, switching, and deleting chats from Firebase.
 */
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
                        div.innerHTML = `<span>${data.title || 'New Chat'}</span>`;
                        DOMElements.chatHistoryList.appendChild(div);
                    });
                } else {
                    // Empty State
                    DOMElements.chatHistoryList.innerHTML = '<div class="empty-history">No chats yet.</div>';
                }
            });
        },
        switch: (chatId) => {
            if (chatId === AppState.currentChatId || AppState.isGenerating) return;
            AppState.currentChatId = chatId;
            AppState.chatContext = [];
            DOMElements.msgList.innerHTML = '';
            document.getElementById('welcome-screen').style.display = 'none';

            UI.showSkeletonLoader();
            UI.toggleSidebar(true);

            FirebaseApp.db.ref(`chats/${AppState.currentUser.uid}/${chatId}/messages`).once('value', snapshot => {
                const messages = snapshot.val();
                UI.hideSkeletonLoader();
                if (messages) {
                    Object.values(messages).forEach(msg => {
                        const role = msg.sender === 'user' ? 'user' : 'model';
                        Chat.renderMessage(role, msg.text, msg.images);
                        AppState.chatContext.push(msg);
                    });
                }
            });
        },
        saveMessage: (message) => {
            if (!AppState.currentUser || !AppState.currentChatId) return;
            const ref = FirebaseApp.db.ref(`chats/${AppState.currentUser.uid}/${AppState.currentChatId}`);
            // Set title on first user message
            if (message.sender === 'user' && AppState.chatContext.length === 1) {
                ref.child('title').set(message.text.substring(0, 30));
            }
            ref.child('messages').push(message);
        },
    };
})();

/**
 * Files Module: Handles image selection and compression.
 */
const Files = (() => {
    const compress = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let { width, height } = img;
                    if (width > AppConfig.maxImageSize || height > AppConfig.maxImageSize) {
                        if (width > height) {
                            height *= AppConfig.maxImageSize / width;
                            width = AppConfig.maxImageSize;
                        } else {
                            width *= AppConfig.maxImageSize / height;
                            height = AppConfig.maxImageSize;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', AppConfig.imageQuality));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    return {
        handleSelect: async (event) => {
            const files = Array.from(event.target.files);
            for (const file of files) {
                if (AppState.uploadedImages.length >= 4) {
                    UI.toast("You can upload a maximum of 4 images.", 'error');
                    break;
                }
                if (file.type.startsWith('image/')) {
                    try {
                        const compressedData = await compress(file);
                        AppState.uploadedImages.push(compressedData);
                    } catch (error) {
                        UI.toast("Failed to process image.", 'error');
                    }
                }
            }
            Files.renderPreviews();
            event.target.value = ''; // Reset file input
        },
        renderPreviews: () => {
            DOMElements.imgPreviewDock.innerHTML = AppState.uploadedImages.map((src, i) => `
                <div class="thumb-box">
                    <img src="${src}" class="thumb-img">
                    <button class="thumb-remove" onclick="Files.remove(${i})">&times;</button>
                </div>
            `).join('');
        },
        remove: (index) => {
            AppState.uploadedImages.splice(index, 1);
            Files.renderPreviews();
        },
    };
})();

/**
 * AdvancedFeatures Module: Voice, Haptics, etc.
 */
const AdvancedFeatures = (() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            DOMElements.input.value = transcript;
            Chat.send();
        };
        recognition.onend = () => DOMElements.micBtn.classList.remove('recording');
        recognition.onerror = (e) => UI.toast(`Speech recognition error: ${e.error}`, 'error');
    }

    return {
        hapticFeedback: () => {
            if (navigator.vibrate) navigator.vibrate(50);
        },
        toggleVoice: () => {
            if (!recognition) return UI.toast("Voice recognition not supported on this browser.", "error");
            if (DOMElements.micBtn.classList.contains('recording')) {
                recognition.stop();
            } else {
                recognition.start();
                DOMElements.micBtn.classList.add('recording');
            }
        },
        readAloud: (element) => {
            const bubble = element.closest('.msg-row').querySelector('.md-content');
            if (speechSynthesis.speaking) {
                speechSynthesis.cancel();
                if (AppState.currentSpeaker === bubble) return;
            }
            const text = bubble.innerText;
            const utterance = new SpeechSynthesisUtterance(text);
            speechSynthesis.speak(utterance);
            AppState.currentSpeaker = bubble;
        },
    };
})();


// --- 4. APP INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    // Auth Listener
    FirebaseApp.auth.onAuthStateChanged(user => {
        AppState.currentUser = user;
        if (user) {
            // Logged In
            document.body.classList.remove('logged-out');
            document.getElementById('side-name').innerText = user.displayName || user.email;
            document.getElementById('side-avatar').src = user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || user.email}&background=2E86DE&color=fff`;
            History.load();
            if (!AppState.currentChatId) Chat.startNew();
        } else {
            // Logged Out
            document.body.classList.add('logged-out');
            AppState.currentChatId = null;
            AppState.chatContext = [];
            DOMElements.chatHistoryList.innerHTML = '<div class="empty-history">Please log in to see your history.</div>';
            UI.showModal(`...`); // Show Login Modal
        }
        UI.hideSplashScreen();
    });

    // Event Listeners
    DOMElements.sendBtn.addEventListener('click', Chat.send);
    DOMElements.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            Chat.send();
        }
    });
    DOMElements.micBtn.addEventListener('click', AdvancedFeatures.toggleVoice);
    DOMElements.chatHistoryList.addEventListener('click', (e) => {
        const item = e.target.closest('.history-item');
        if (item) History.switch(item.dataset.id);
    });

    // Initial UI setup
    document.getElementById('theme-icon').innerText = document.documentElement.getAttribute('data-theme') === 'light' ? 'light_mode' : 'dark_mode';
    Chat.startNew(); // Initialize a new chat session on load
});