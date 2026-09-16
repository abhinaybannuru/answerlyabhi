"use strict";

// ============================================================
// ANSWERLYABHI FRONTEND
// ============================================================

// Automatically connects to the same PC/IP running FastAPI.
// Local PC: http://127.0.0.1:8000
// LAN/mobile: http://YOUR-PC-IP:8000
const API = "https://answerlyabhi.onrender.com";

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

console.log("=================================");
console.log("ANSWERLYABHI FRONTEND LOADED");
console.log("API:", API);
console.log("=================================");


// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
}


// ============================================================
// SHOW ERROR
// ============================================================

function showError(message) {
    if (!chat) {
        alert(message);
        return;
    }

    const errorElement = document.createElement("div");
    errorElement.className = "message ai error-message";

    errorElement.innerHTML =
        `<strong>Error:</strong><br>${escapeHtml(message)}`;

    chat.appendChild(errorElement);
    chat.scrollTop = chat.scrollHeight;
}


// ============================================================
// MARKDOWN
// ============================================================

function renderMarkdown(element, text) {
    if (!element) return;

    try {
        if (
            typeof marked !== "undefined" &&
            typeof marked.parse === "function"
        ) {
            element.innerHTML = marked.parse(text);
        } else {
            element.textContent = text;
        }

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
        console.error("Markdown error:", error);
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
            throw new Error(
                `New chat failed (${response.status}): ${errorText}`
            );
        }

        const data = await response.json();

        if (!data || !data.chat_id) {
            throw new Error("Backend did not return a chat_id.");
        }

        currentChatId = data.chat_id;

        console.log("Current chat ID:", currentChatId);

        resetChatScreen();

        await loadChats();

        if (messageInput) {
            messageInput.focus();
        }

        return currentChatId;

    } catch (error) {
        console.error("Create chat error:", error);

        showError(
            "Could not create a new chat session.\n\n" +
            error.message
        );

        return null;
    }
}


// ============================================================
// LOAD CHATS
// ============================================================

async function loadChats() {
    if (!chatList) return;

    try {
        const response = await fetch(`${API}/chats`);

        if (!response.ok) {
            throw new Error(
                `Chats request failed: ${response.status}`
            );
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
            title.textContent =
                item.title || `Chat ${item.id}`;

            const deleteButton =
                document.createElement("button");

            deleteButton.className = "delete-chat";
            deleteButton.textContent = "×";

            title.addEventListener("click", () => {
                openChat(item.id);
            });

            deleteButton.addEventListener("click", event => {
                event.stopPropagation();
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

    try {
        // IMPORTANT:
        // Backend uses /messages?chat_id=...
        const response = await fetch(
            `${API}/messages?chat_id=${encodeURIComponent(chatId)}`
        );

        if (!response.ok) {
            throw new Error(
                `Messages request failed: ${response.status}`
            );
        }

        const history = await response.json();

        if (Array.isArray(history) && history.length > 0) {
            const welcome = chat.querySelector(".welcome");

            if (welcome) {
                welcome.remove();
            }

            history.forEach(msg => {
                const type =
                    msg.role === "assistant"
                        ? "ai"
                        : "user";

                addMessage(
                    msg.content || "",
                    type
                );
            });
        }

    } catch (error) {
        console.error("Could not load chat history:", error);
    }

    await loadChats();

    if (messageInput) {
        messageInput.focus();
    }
}


// ============================================================
// DELETE CHAT
// ============================================================

async function deleteChat(chatId) {
    if (!chatId) return;

    const confirmed =
        window.confirm("Delete this chat?");

    if (!confirmed) return;

    try {
        // IMPORTANT:
        // Backend uses DELETE /chat/{chat_id}
        const response = await fetch(
            `${API}/chat/${encodeURIComponent(chatId)}`,
            {
                method: "DELETE"
            }
        );

        if (!response.ok) {
            const errorText = await response.text();

            throw new Error(
                `Delete failed (${response.status}): ${errorText}`
            );
        }

        if (String(currentChatId) === String(chatId)) {
            currentChatId = null;
            resetChatScreen();

            await createNewChat();
        }

        await loadChats();

    } catch (error) {
        console.error("Delete chat error:", error);

        alert(
            "Failed to delete chat:\n\n" +
            error.message
        );
    }
}


// ============================================================
// SEND MESSAGE
// ============================================================

async function sendMessage() {
    const message = messageInput.value.trim();

    if (!message || !currentChatId) return;

    addMessage(message, "user");
    messageInput.value = "";

    const aiMessage = addMessage("Thinking...", "ai");

    try {
        console.log("Sending to:", `${API}/chat`);

        const response = await fetch(
            `${API}/chat?chat_id=${encodeURIComponent(currentChatId)}&message=${encodeURIComponent(message)}`,
            {
                method: "POST"
            }
        );

        console.log("Response status:", response.status);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error ${response.status}: ${errorText}`);
        }

        // Get the complete response instead of browser streaming
        const reply = await response.text();

        console.log("AI reply:", reply);

        if (!reply.trim()) {
            throw new Error("Empty response from AI server");
        }

        addMessage(reply, "ai");;

    } catch (error) {
        console.error("AI ERROR:", error);

        aiMessage.innerHTML =
            `<span style="color:red;">AI server error: ${error.message}</span>`;
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

    if (stopButton) {
        stopButton.style.display = "none";
    }

    if (sendButton) {
        sendButton.disabled = false;
    }

    if (newChatButton) {
        newChatButton.disabled = false;
    }

    if (messageInput) {
        messageInput.focus();
    }
}


// ============================================================
// PDF UPLOAD
// ============================================================

async function uploadPDF() {

    if (!pdfInput) return;

    const file =
        pdfInput.files[0];

    if (!file) return;

    if (
        !file.name
            .toLowerCase()
            .endsWith(".pdf")
    ) {
        alert(
            "Please select a valid PDF file."
        );

        pdfInput.value = "";

        return;
    }

    // Create chat if necessary
    if (!currentChatId) {

        const newChatId =
            await createNewChat();

        if (!newChatId) {
            return;
        }
    }

    const formData =
        new FormData();

    formData.append(
        "file",
        file
    );

    try {

        const response =
            await fetch(
                `${API}/upload-pdf` +
                `?chat_id=${encodeURIComponent(currentChatId)}`,
                {
                    method: "POST",
                    body: formData
                }
            );

        if (!response.ok) {

            const errorText =
                await response.text();

            throw new Error(
                `HTTP ${response.status}: ${errorText}`
            );
        }

        const data =
            await response.json();

        console.log(
            "PDF upload:",
            data
        );

        if (data.error) {
            throw new Error(data.error);
        }

        addMessage(
            `📄 Uploaded PDF: ${file.name}`,
            "user"
        );

        pdfInput.value = "";

        alert(
            "PDF uploaded successfully!"
        );

    } catch (error) {

        console.error(
            "PDF upload error:",
            error
        );

        alert(
            "PDF upload failed.\n\n" +
            error.message
        );
    }
}


// ============================================================
// EVENT LISTENERS
// ============================================================

if (sendButton) {

    sendButton.addEventListener(
        "click",
        sendMessage
    );

} else {

    console.error(
        "SEND BUTTON NOT FOUND!"
    );
}


if (stopButton) {

    stopButton.addEventListener(
        "click",
        stopGenerating
    );
}


if (messageInput) {

    messageInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {
                event.preventDefault();

                sendMessage();
            }
        }
    );
}


if (newChatButton) {

    newChatButton.addEventListener(
        "click",
        () => {

            if (!isGenerating) {
                createNewChat();
            }

        }
    );
}


if (pdfInput) {

    pdfInput.addEventListener(
        "change",
        uploadPDF
    );
}


// ============================================================
// TEST BACKEND
// ============================================================

async function testBackend() {

    try {

        console.log(
            "Testing backend:",
            `${API}/`
        );

        const response =
            await fetch(
                `${API}/`,
                {
                    method: "GET"
                }
            );

        console.log(
            "Backend status:",
            response.status
        );

        return response.ok;

    } catch (error) {

        console.error(
            "Backend connection failed:",
            error
        );

        return false;
    }
}


// ============================================================
// START APPLICATION
// ============================================================

async function startApp() {

    console.log(
        "Starting AnswerlyAbhi..."
    );

    const backendOK =
        await testBackend();

    if (!backendOK) {

        alert(
            "Cannot connect to AnswerlyAbhi backend.\n\n" +
            "Make sure FastAPI is running on port 8000."
        );

        return;
    }

    console.log(
        "Backend connection successful!"
    );

    await loadChats();

    if (!currentChatId) {
        await createNewChat();
    }

    if (messageInput) {
        messageInput.focus();
    }
}


// ============================================================
// START
// ============================================================

startApp();