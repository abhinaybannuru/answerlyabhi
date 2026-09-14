// ============================================================
// MY AI - COMPLETE FRONTEND JAVASCRIPT
// ============================================================

"use strict";

// ============================================================
// CONFIGURATION
// ============================================================

const API = "http://192.168.6.109:8000";

// ============================================================
// GLOBAL STATE
// ============================================================

let currentChatId = null;
let currentController = null;
let isGenerating = false;

// ============================================================
// DOM ELEMENTS
// ============================================================

const messageInput = document.getElementById("message");
const sendButton = document.getElementById("send");
const stopButton = document.getElementById("stop");
const chat = document.getElementById("chat");
const newChatButton = document.getElementById("new-chat");
const chatList = document.getElementById("chat-list");
const pdfInput = document.getElementById("pdf");

// ============================================================
// INITIAL DOM CHECK
// ============================================================

console.log("=================================");
console.log("MY AI FRONTEND LOADED");
console.log("API:", API);
console.log("=================================");

console.log("DOM elements:", {
    messageInput: !!messageInput,
    sendButton: !!sendButton,
    stopButton: !!stopButton,
    chat: !!chat,
    newChatButton: !!newChatButton,
    chatList: !!chatList,
    pdfInput: !!pdfInput
});

// ============================================================
// SHOW ERROR IN CHAT
// ============================================================

function showError(message) {
    if (!chat) {
        alert(message);
        return;
    }

    const errorElement = document.createElement("div");
    errorElement.className = "message ai error-message";
    errorElement.innerHTML = `<strong>Error:</strong><br>${escapeHtml(message)}`;

    chat.appendChild(errorElement);
    chat.scrollTop = chat.scrollHeight;
}

// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
}

// ============================================================
// MARKDOWN RENDERING
// ============================================================

function renderMarkdown(element, text) {
    if (!element) return;

    try {
        if (typeof marked !== "undefined" && typeof marked.parse === "function") {
            element.innerHTML = marked.parse(text);
        } else {
            element.textContent = text;
        }

        // Syntax Highlighting
        if (typeof hljs !== "undefined") {
            element.querySelectorAll("pre code").forEach(codeBlock => {
                try {
                    hljs.highlightElement(codeBlock);
                } catch (error) {
                    console.warn("Highlight error:", error);
                }
            });
        }
    } catch (error) {
        console.error("Markdown rendering error:", error);
        element.textContent = text;
    }
}

// ============================================================
// ADD MESSAGE
// ============================================================

function addMessage(text, type) {
    if (!chat) {
        console.error("Chat container not found.");
        return null;
    }

    const element = document.createElement("div");
    element.className = `message ${type}`;

    if (type === "ai") {
        renderMarkdown(element, text);
    } else {
        element.textContent = text;
    }

    chat.appendChild(element);
    chat.scrollTop = chat.scrollHeight;

    return element;
}

// ============================================================
// RESET CHAT SCREEN
// ============================================================

function resetChatScreen() {
    if (!chat) return;

    chat.innerHTML = `
        <div class="welcome">
            <h2>How can I help you?</h2>
            <p>Ask me anything.</p>
        </div>
    `;
}

// ============================================================
// CREATE NEW CHAT
// ============================================================

async function createNewChat() {
    console.log("Creating new chat...");

    try {
        const response = await fetch(`${API}/new-chat`, {
            method: "POST"
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`New chat failed (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        if (!data || !data.chat_id) {
            throw new Error("Backend did not return a chat_id.");
        }

        currentChatId = data.chat_id;
        console.log("Current chat ID:", currentChatId);

        resetChatScreen();
        await loadChats();

        if (messageInput) messageInput.focus();

        return currentChatId;

    } catch (error) {
        console.error("Create chat error:", error);
        showError("Could not create a new chat session.\n\n" + error.message);
        return null;
    }
}

// ============================================================
// LOAD CHAT LIST
// ============================================================

async function loadChats() {
    if (!chatList) return;

    try {
        const response = await fetch(`${API}/chats`);

        if (!response.ok) {
            throw new Error(`Chats request failed: ${response.status}`);
        }

        const data = await response.json();
        chatList.innerHTML = "";

        if (!Array.isArray(data)) {
            console.warn("Expected an array from /chats.");
            return;
        }

        if (data.length === 0) {
            const empty = document.createElement("div");
            empty.textContent = "No chats yet.";
            empty.style.padding = "15px";
            empty.style.color = "#777";
            chatList.appendChild(empty);
            return;
        }

        data.forEach(item => {
            if (!item.id) return;

            const chatItem = document.createElement("div");
            chatItem.className = "chat-item";

            if (String(item.id) === String(currentChatId)) {
                chatItem.classList.add("active");
            }

            const title = document.createElement("span");
            title.className = "chat-title";
            title.textContent = item.title || `Chat ${item.id}`;

            const deleteButton = document.createElement("button");
            deleteButton.className = "delete-chat";
            deleteButton.textContent = "×";

            title.addEventListener("click", () => openChat(item.id));
            deleteButton.addEventListener("click", (e) => {
                e.stopPropagation();
                deleteChat(item.id);
            });

            chatItem.appendChild(title);
            chatItem.appendChild(deleteButton);
            chatList.appendChild(chatItem);
        });

    } catch (error) {
        console.error("Load chats error:", error);
    }
}

// ============================================================
// OPEN CHAT
// ============================================================

async function openChat(chatId) {
    if (!chatId || isGenerating) return;

    console.log("Opening chat:", chatId);
    currentChatId = chatId;

    resetChatScreen();

    // Fetch existing messages if supported by backend
    try {
        const response = await fetch(`${API}/chats/${encodeURIComponent(chatId)}`);
        if (response.ok) {
            const history = await response.json();
            if (Array.isArray(history) && history.length > 0) {
                const welcome = chat.querySelector(".welcome");
                if (welcome) welcome.remove();

                history.forEach(msg => {
                    addMessage(msg.content || msg.text, msg.role || msg.type);
                });
            }
        }
    } catch (err) {
        console.warn("Could not load chat history:", err);
    }

    await loadChats();
    if (messageInput) messageInput.focus();
}

// ============================================================
// DELETE CHAT
// ============================================================

async function deleteChat(chatId) {
    if (!chatId) return;

    const confirmed = window.confirm("Delete this chat?");
    if (!confirmed) return;

    try {
        const response = await fetch(`${API}/chats/${encodeURIComponent(chatId)}`, {
            method: "DELETE"
        });

        if (response.ok) {
            if (currentChatId === chatId) {
                currentChatId = null;
                resetChatScreen();
            }
            await loadChats();
        } else {
            alert("Chat deletion is not implemented or failed on backend.");
        }
    } catch (error) {
        console.error("Delete chat error:", error);
        alert("Failed to delete chat: " + error.message);
    }
}

// ============================================================
// SEND MESSAGE
// ============================================================

async function sendMessage() {
    if (!messageInput) return;

    const message = messageInput.value.trim();
    if (!message || isGenerating) return;

    if (!currentChatId) {
        const newChatId = await createNewChat();
        if (!newChatId) return;
    }

    // Clear Welcome UI
    if (chat) {
        const welcome = chat.querySelector(".welcome");
        if (welcome) welcome.remove();
    }

    addMessage(message, "user");
    messageInput.value = "";

    const aiMessage = addMessage("", "ai");
    if (!aiMessage) return;

    aiMessage.textContent = "Thinking...";

    // UI State Update
    isGenerating = true;
    if (sendButton) sendButton.disabled = true;
    if (stopButton) stopButton.style.display = "inline-block";
    if (newChatButton) newChatButton.disabled = true;

    currentController = new AbortController();

    try {
        const url = `${API}/chat?chat_id=${encodeURIComponent(currentChatId)}&message=${encodeURIComponent(message)}`;

        const response = await fetch(url, {
            method: "POST",
            signal: currentController.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        if (!response.body) {
            throw new Error("The server returned an empty response body.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullReply = "";

        aiMessage.innerHTML = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullReply += chunk;

            renderMarkdown(aiMessage, fullReply);
            if (chat) chat.scrollTop = chat.scrollHeight;
        }

        const remaining = decoder.decode();
        if (remaining) {
            fullReply += remaining;
        }

        renderMarkdown(aiMessage, fullReply);

        if (!fullReply.trim()) {
            aiMessage.textContent = "The AI returned an empty response.";
        }

    } catch (error) {
        if (error.name === "AbortError") {
            if (!aiMessage.textContent.trim()) {
                aiMessage.textContent = "Generation stopped.";
            }
        } else {
            console.error("SEND ERROR:", error);
            aiMessage.innerHTML = `<strong>Error</strong><br>${escapeHtml(error.message)}`;
        }
    } finally {
        isGenerating = false;
        currentController = null;

        if (sendButton) sendButton.disabled = false;
        if (stopButton) stopButton.style.display = "none";
        if (newChatButton) newChatButton.disabled = false;
        if (messageInput) messageInput.focus();
    }
}

// ============================================================
// STOP GENERATING
// ============================================================

function stopGenerating() {
    if (currentController) {
        currentController.abort();
    }
    isGenerating = false;
    currentController = null;

    if (stopButton) stopButton.style.display = "none";
    if (sendButton) sendButton.disabled = false;
    if (newChatButton) newChatButton.disabled = false;
    if (messageInput) messageInput.focus();
}

// ============================================================
// PDF UPLOAD
// ============================================================

async function uploadPDF() {
    if (!pdfInput) return;

    const file = pdfInput.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
        alert("Please select a valid PDF file.");
        pdfInput.value = "";
        return;
    }

    if (!currentChatId) {
        const newChatId = await createNewChat();
        if (!newChatId) return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch(`${API}/upload-pdf?chat_id=${encodeURIComponent(currentChatId)}`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        addMessage(`Uploaded PDF: ${file.name}`, "user");
        pdfInput.value = "";
        alert("PDF uploaded successfully.");

    } catch (error) {
        console.error("PDF upload error:", error);
        alert("PDF upload failed.\n\n" + error.message);
    }
}

// ============================================================
// EVENT LISTENERS
// ============================================================

if (sendButton) {
    sendButton.addEventListener("click", sendMessage);
} else {
    console.error("SEND BUTTON NOT FOUND!");
}

if (stopButton) {
    stopButton.addEventListener("click", stopGenerating);
}

if (messageInput) {
    messageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });
}

if (newChatButton) {
    newChatButton.addEventListener("click", () => {
        if (!isGenerating) createNewChat();
    });
}

if (pdfInput) {
    pdfInput.addEventListener("change", uploadPDF);
}

// ============================================================
// TEST BACKEND
// ============================================================

async function testBackend() {
    try {
        const response = await fetch(`${API}/`, { method: "GET" });
        return response.ok;
    } catch (error) {
        console.error("Backend connection failed:", error);
        return false;
    }
}

// ============================================================
// START APPLICATION
// ============================================================

async function startApp() {
    const backendOK = await testBackend();

    if (!backendOK) {
        alert(
            "Cannot connect to the My AI backend.\n\n" +
            "Make sure your FastAPI server is running:\n" +
            "python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000"
        );
        return;
    }

    await loadChats();

    if (!currentChatId) {
        await createNewChat();
    }

    if (messageInput) messageInput.focus();
}

// Execute
startApp();