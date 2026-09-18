// ============================================================
// AnswerlyAbhi - Frontend JavaScript
// ============================================================

// =========================
// API
// =========================

const API =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
        ? "http://127.0.0.1:8000"
        : "https://answerlyabhi.onrender.com";


// =========================
// PRIVATE USER ID
// =========================

function getUserId() {
    let userId = localStorage.getItem("answerlyabhi-user-id");

    if (!userId) {
        userId =
            typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : "user-" +
                  Date.now() +
                  "-" +
                  Math.random().toString(36).slice(2);

        localStorage.setItem("answerlyabhi-user-id", userId);
    }

    return userId;
}

const USER_ID = getUserId();


// =========================
// STATE
// =========================

let currentChatId = null;
let currentController = null;
let isGenerating = false;


// =========================
// DOM ELEMENTS
// =========================

const messageInput = document.getElementById("message");
const sendButton = document.getElementById("send");
const stopButton = document.getElementById("stop");
const chat = document.getElementById("chat");

const newChatButton = document.getElementById("new-chat");
const chatList = document.getElementById("chat-list");

const pdfInput = document.getElementById("pdf");
const uploadButton = document.getElementById("upload-pdf");
const fileStatus = document.getElementById("file-status");

const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const menuButton = document.getElementById("menu");

const themeButton = document.getElementById("theme");
const clearButton = document.getElementById("clear");
const searchInput = document.getElementById("search");


// =========================
// SAFETY CHECK
// =========================

console.log("AnswerlyAbhi frontend loaded");
console.log("API:", API);
console.log("USER_ID:", USER_ID);


// =========================
// ESCAPE HTML
// =========================

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}


// =========================
// SCROLL
// =========================

function scrollToBottom() {
    if (chat) {
        chat.scrollTop = chat.scrollHeight;
    }
}


// =========================
// ERROR MESSAGE
// =========================

function showError(message) {
    console.error(message);

    addMessage(
        "❌ " + escapeHtml(message),
        "ai"
    );
}


// =========================
// MARKDOWN RENDERING
// =========================

function renderMarkdown(text) {
    if (!text) {
        return "";
    }

    let html = escapeHtml(text);

    // Code blocks
    html = html.replace(
        /```([\w+-]*)\n?([\s\S]*?)```/g,
        function (_, language, code) {
            const lang = language || "";
            return `
                <pre class="code-block">
                    <code class="language-${escapeHtml(lang)}">${code.trim()}</code>
                </pre>
            `;
        }
    );

    // Inline code
    html = html.replace(
        /`([^`]+)`/g,
        "<code>$1</code>"
    );

    // Bold
    html = html.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
    );

    // Italic
    html = html.replace(
        /(?<!\*)\*(?!\*)(.*?)\*(?!\*)/g,
        "<em>$1</em>"
    );

    // Links
    html = html.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // Headings
    html = html.replace(
        /^### (.*)$/gm,
        "<h4>$1</h4>"
    );

    html = html.replace(
        /^## (.*)$/gm,
        "<h3>$1</h3>"
    );

    html = html.replace(
        /^# (.*)$/gm,
        "<h2>$1</h2>"
    );

    // Unordered lists
    html = html.replace(
        /^\s*[-*] (.*)$/gm,
        "<li>$1</li>"
    );

    html = html.replace(
        /(<li>.*<\/li>)/gs,
        "<ul>$1</ul>"
    );

    // Numbered lists
    html = html.replace(
        /^\s*\d+\.\s+(.*)$/gm,
        "<li>$1</li>"
    );

    // Line breaks
    html = html.replace(
        /\n/g,
        "<br>"
    );

    return html;
}


// =========================
// CODE COPY BUTTONS
// =========================

function addCopyButtons(container) {
    if (!container) {
        return;
    }

    const blocks = container.querySelectorAll("pre.code-block");

    blocks.forEach((block) => {
        if (block.querySelector(".copy-code")) {
            return;
        }

        const button = document.createElement("button");

        button.className = "copy-code";
        button.textContent = "Copy";

        button.addEventListener("click", async () => {
            const code = block.querySelector("code");

            if (!code) {
                return;
            }

            try {
                await navigator.clipboard.writeText(
                    code.innerText
                );

                button.textContent = "Copied!";

                setTimeout(() => {
                    button.textContent = "Copy";
                }, 1500);

            } catch (error) {
                console.error(
                    "COPY ERROR:",
                    error
                );
            }
        });

        block.appendChild(button);
    });
}


// =========================
// ADD MESSAGE
// =========================

function addMessage(content, role, returnElement = false) {
    if (!chat) {
        return null;
    }

    const messageElement = document.createElement("div");

    messageElement.className =
        role === "user"
            ? "message user-message"
            : "message ai-message";

    const bubble = document.createElement("div");

    bubble.className = "message-bubble";

    if (role === "ai") {
        bubble.innerHTML = renderMarkdown(content);
    } else {
        bubble.innerHTML = escapeHtml(content);
    }

    messageElement.appendChild(bubble);

    chat.appendChild(messageElement);

    scrollToBottom();

    addCopyButtons(messageElement);

    if (returnElement) {
        return messageElement;
    }

    return null;
}


// =========================
// RESET CHAT SCREEN
// =========================

function resetChatScreen() {
    if (!chat) {
        return;
    }

    chat.innerHTML = `
        <div class="welcome">
            <h1>Hello! I'm AnswerlyAbhi</h1>
            <p>Your personal AI assistant. How can I help you today?</p>
        </div>
    `;
}


// =========================
// CREATE NEW CHAT
// =========================

async function createNewChat() {
    try {
        console.log("Creating new chat...");

        const response = await fetch(
            `${API}/new-chat?user_id=${encodeURIComponent(USER_ID)}`,
            {
                method: "POST"
            }
        );

        console.log(
            "NEW CHAT STATUS:",
            response.status
        );

        if (!response.ok) {
            const errorText = await response.text();

            throw new Error(
                `Server returned ${response.status}: ${errorText}`
            );
        }

        const data = await response.json();

        console.log(
            "NEW CHAT RESPONSE:",
            data
        );

        if (!data.chat_id) {
            throw new Error(
                "Server did not return a chat ID."
            );
        }

        currentChatId = data.chat_id;

        resetChatScreen();

        await loadChats();

        if (messageInput) {
            messageInput.focus();
        }

        console.log(
            "CURRENT CHAT ID:",
            currentChatId
        );

        // IMPORTANT
        return currentChatId;

    } catch (error) {
        console.error(
            "CREATE CHAT ERROR:",
            error
        );

        alert(
            "Could not create a new chat.\n\n" +
            (error.message || "Please try again.")
        );

        return null;
    }
}


// =========================
// LOAD CHAT LIST
// =========================

async function loadChats() {
    if (!chatList) {
        return;
    }

    try {
        const response = await fetch(
            `${API}/chats?user_id=${encodeURIComponent(USER_ID)}`
        );

        if (!response.ok) {
            throw new Error(
                `Server returned ${response.status}`
            );
        }

        const chats = await response.json();

        chatList.innerHTML = "";

        if (!Array.isArray(chats) || chats.length === 0) {
            chatList.innerHTML = `
                <div class="no-chats">
                    No chats yet
                </div>
            `;
            return;
        }

        chats.forEach((item) => {
            const chatItem = document.createElement("div");

            chatItem.className =
                "chat-item" +
                (item.id === currentChatId
                    ? " active"
                    : "");

            chatItem.dataset.chatId = item.id;

            const title =
                item.title ||
                "New Chat";

            chatItem.innerHTML = `
                <span class="chat-title">
                    ${escapeHtml(title)}
                </span>

                <button
                    class="delete-chat"
                    title="Delete chat"
                    type="button"
                >
                    ×
                </button>
            `;

            const deleteButton =
                chatItem.querySelector(
                    ".delete-chat"
                );

            deleteButton.addEventListener(
                "click",
                async (event) => {
                    event.stopPropagation();

                    await deleteChat(item.id);
                }
            );

            chatItem.addEventListener(
                "click",
                () => {
                    openChat(item.id);
                }
            );

            chatList.appendChild(chatItem);
        });

    } catch (error) {
        console.error(
            "LOAD CHATS ERROR:",
            error
        );
    }
}


// =========================
// OPEN CHAT
// =========================

async function openChat(chatId) {
    if (!chatId) {
        return;
    }

    try {
        const response = await fetch(
            `${API}/messages?user_id=${encodeURIComponent(USER_ID)}&chat_id=${encodeURIComponent(chatId)}`
        );

        if (!response.ok) {
            throw new Error(
                `Server returned ${response.status}`
            );
        }

        const messages = await response.json();

        currentChatId = chatId;

        if (chat) {
            chat.innerHTML = "";
        }

        if (
            !Array.isArray(messages) ||
            messages.length === 0
        ) {
            resetChatScreen();
        } else {
            messages.forEach((item) => {
                addMessage(
                    item.content || "",
                    item.role === "user"
                        ? "user"
                        : "ai"
                );
            });
        }

        await loadChats();

        closeSidebar();

        if (messageInput) {
            messageInput.focus();
        }

    } catch (error) {
        console.error(
            "OPEN CHAT ERROR:",
            error
        );

        alert(
            "Could not open this chat.\n\n" +
            (error.message || "Please try again.")
        );
    }
}


// =========================
// DELETE CHAT
// =========================

async function deleteChat(chatId) {
    if (!chatId) {
        return;
    }

    const confirmed = confirm(
        "Delete this chat?"
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(
            `${API}/chat/${encodeURIComponent(chatId)}?user_id=${encodeURIComponent(USER_ID)}`,
            {
                method: "DELETE"
            }
        );

        if (!response.ok) {
            throw new Error(
                `Server returned ${response.status}`
            );
        }

        if (currentChatId === chatId) {
            currentChatId = null;

            resetChatScreen();

            await createNewChat();
        } else {
            await loadChats();
        }

    } catch (error) {
        console.error(
            "DELETE CHAT ERROR:",
            error
        );

        alert(
            "Could not delete the chat.\n\n" +
            (error.message || "Please try again.")
        );
    }
}


// =========================
// SEND MESSAGE
// =========================

async function sendMessage() {
    if (isGenerating) {
        return;
    }

    if (!messageInput) {
        console.error(
            "Message input not found."
        );
        return;
    }

    const message =
        messageInput.value.trim();

    if (!message) {
        return;
    }

    console.log(
        "SEND MESSAGE:",
        message
    );

    // ==========================================
    // IMPORTANT FIX:
    // Create a chat if none exists.
    // Do NOT depend on a returned variable.
    // ==========================================

    if (!currentChatId) {
        console.log(
            "No current chat. Creating one..."
        );

        const newChatId =
            await createNewChat();

        if (!newChatId) {
            console.error(
                "Could not create chat."
            );
            return;
        }
    }

    console.log(
        "Using chat:",
        currentChatId
    );

    // Add user message
    addMessage(
        message,
        "user"
    );

    // Clear input
    messageInput.value = "";

    messageInput.style.height = "auto";

    isGenerating = true;

    currentController =
        new AbortController();

    // UI state
    if (sendButton) {
        sendButton.disabled = true;
    }

    if (newChatButton) {
        newChatButton.disabled = true;
    }

    if (stopButton) {
        stopButton.style.display = "inline-flex";
    }

    // Create AI message container
    const aiMessage =
        addMessage(
            "",
            "ai",
            true
        );

    const aiBubble =
        aiMessage
            ? aiMessage.querySelector(
                  ".message-bubble"
              )
            : null;

    if (aiBubble) {
        aiBubble.innerHTML =
            "<span>Thinking...</span>";
    }

    scrollToBottom();

    try {
        const url =
            `${API}/chat` +
            `?user_id=${encodeURIComponent(USER_ID)}` +
            `&chat_id=${encodeURIComponent(currentChatId)}` +
            `&message=${encodeURIComponent(message)}`;

        console.log(
            "CHAT REQUEST:",
            url
        );

        const response =
            await fetch(
                url,
                {
                    method: "POST",
                    signal:
                        currentController.signal
                }
            );

        console.log(
            "CHAT STATUS:",
            response.status
        );

        if (!response.ok) {
            const errorText =
                await response.text();

            throw new Error(
                `Server returned ${response.status}: ${errorText}`
            );
        }

        if (!response.body) {
            throw new Error(
                "The server returned no response body."
            );
        }

        const reader =
            response.body.getReader();

        const decoder =
            new TextDecoder();

        let fullResponse = "";

        let firstChunk = true;

        while (true) {
            const {
                value,
                done
            } = await reader.read();

            if (done) {
                break;
            }

            const chunk =
                decoder.decode(
                    value,
                    {
                        stream: true
                    }
                );

            if (!chunk) {
                continue;
            }

            fullResponse += chunk;

            if (
                aiBubble &&
                firstChunk
            ) {
                aiBubble.innerHTML = "";
                firstChunk = false;
            }

            if (aiBubble) {
                aiBubble.innerHTML =
                    renderMarkdown(
                        fullResponse
                    );

                addCopyButtons(
                    aiMessage
                );
            }

            scrollToBottom();
        }

        // Flush decoder
        const remaining =
            decoder.decode();

        if (remaining) {
            fullResponse +=
                remaining;

            if (aiBubble) {
                aiBubble.innerHTML =
                    renderMarkdown(
                        fullResponse
                    );

                addCopyButtons(
                    aiMessage
                );
            }
        }

        if (!fullResponse.trim()) {
            throw new Error(
                "The AI returned an empty response."
            );
        }

        console.log(
            "AI RESPONSE COMPLETE"
        );

    } catch (error) {
        console.error(
            "SEND MESSAGE ERROR:",
            error
        );

        if (
            error.name ===
            "AbortError"
        ) {
            console.log(
                "Generation stopped by user."
            );

            if (
                aiBubble &&
                !aiBubble.innerHTML.trim()
            ) {
                aiBubble.innerHTML =
                    "<em>Generation stopped.</em>";
            }

        } else {
            if (aiBubble) {
                aiBubble.innerHTML =
                    `<div class="error-message">
                        ❌ Unable to get a response.
                        <br>
                        <small>${escapeHtml(
                            error.message ||
                                "Unknown error"
                        )}</small>
                    </div>`;
            } else {
                showError(
                    "Unable to get a response."
                );
            }
        }

    } finally {
        isGenerating = false;

        currentController = null;

        if (sendButton) {
            sendButton.disabled = false;
        }

        if (newChatButton) {
            newChatButton.disabled = false;
        }

        if (stopButton) {
            stopButton.style.display =
                "none";
        }

        if (messageInput) {
            messageInput.focus();
        }

        scrollToBottom();
    }
}


// =========================
// STOP GENERATION
// =========================

function stopGeneration() {
    if (
        currentController &&
        isGenerating
    ) {
        console.log(
            "Stopping generation..."
        );

        currentController.abort();
    }
}


// =========================
// UPLOAD PDF
// =========================

async function uploadPDF() {
    if (!pdfInput) {
        return;
    }

    const file =
        pdfInput.files &&
        pdfInput.files[0];

    if (!file) {
        alert(
            "Please select a PDF first."
        );
        return;
    }

    if (
        !file.name
            .toLowerCase()
            .endsWith(".pdf")
    ) {
        alert(
            "Please select a PDF file."
        );
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

    if (uploadButton) {
        uploadButton.disabled = true;
    }

    if (fileStatus) {
        fileStatus.textContent =
            "Uploading PDF...";
    }

    try {
        const response =
            await fetch(
                `${API}/upload-pdf?user_id=${encodeURIComponent(USER_ID)}&chat_id=${encodeURIComponent(currentChatId)}`,
                {
                    method: "POST",
                    body: formData
                }
            );

        if (!response.ok) {
            const errorText =
                await response.text();

            throw new Error(
                `Server returned ${response.status}: ${errorText}`
            );
        }

        const data =
            await response.json();

        console.log(
            "PDF UPLOAD RESPONSE:",
            data
        );

        if (fileStatus) {
            fileStatus.textContent =
                `✅ ${file.name} uploaded successfully`;
        }

        addMessage(
            `📄 PDF uploaded: **${file.name}**\n\nYou can now ask questions about the document.`,
            "ai"
        );

        pdfInput.value = "";

    } catch (error) {
        console.error(
            "PDF UPLOAD ERROR:",
            error
        );

        if (fileStatus) {
            fileStatus.textContent =
                "❌ PDF upload failed";
        }

        alert(
            "Could not upload the PDF.\n\n" +
            (error.message ||
                "Please try again.")
        );

    } finally {
        if (uploadButton) {
            uploadButton.disabled =
                false;
        }
    }
}


// =========================
// SIDEBAR
// =========================

function openSidebar() {
    if (sidebar) {
        sidebar.classList.add(
            "open"
        );
    }

    if (sidebarOverlay) {
        sidebarOverlay.classList.add(
            "show"
        );
    }
}

function closeSidebar() {
    if (sidebar) {
        sidebar.classList.remove(
            "open"
        );
    }

    if (sidebarOverlay) {
        sidebarOverlay.classList.remove(
            "show"
        );
    }
}


// =========================
// SEARCH CHATS
// =========================

function searchChats() {
    if (!chatList || !searchInput) {
        return;
    }

    const query =
        searchInput.value
            .trim()
            .toLowerCase();

    const items =
        chatList.querySelectorAll(
            ".chat-item"
        );

    items.forEach((item) => {
        const title =
            item
                .querySelector(
                    ".chat-title"
                )
                ?.textContent
                .toLowerCase() || "";

        if (
            !query ||
            title.includes(query)
        ) {
            item.style.display = "";
        } else {
            item.style.display =
                "none";
        }
    });
}


// =========================
// THEME
// =========================

function toggleTheme() {
    const isDark =
        document.body.classList.toggle(
            "dark"
        );

    localStorage.setItem(
        "answerlyabhi-theme",
        isDark
            ? "dark"
            : "light"
    );
}

function loadTheme() {
    const savedTheme =
        localStorage.getItem(
            "answerlyabhi-theme"
        );

    if (savedTheme === "dark") {
        document.body.classList.add(
            "dark"
        );
    }
}


// =========================
// CLEAR CURRENT SCREEN
// =========================

function clearCurrentScreen() {
    resetChatScreen();

    if (messageInput) {
        messageInput.value = "";
        messageInput.style.height =
            "auto";
        messageInput.focus();
    }
}


// =========================
// TEXTAREA AUTO RESIZE
// =========================

function autoResizeTextarea() {
    if (!messageInput) {
        return;
    }

    messageInput.style.height =
        "auto";

    messageInput.style.height =
        Math.min(
            messageInput.scrollHeight,
            180
        ) + "px";
}


// =========================
// SUGGESTIONS
// =========================

function setupSuggestions() {
    const suggestions =
        document.querySelectorAll(
            ".suggestion"
        );

    suggestions.forEach(
        (suggestion) => {
            suggestion.addEventListener(
                "click",
                () => {
                    if (!messageInput) {
                        return;
                    }

                    messageInput.value =
                        suggestion.textContent.trim();

                    autoResizeTextarea();

                    messageInput.focus();
                }
            );
        }
    );
}


// =========================
// MOBILE KEYBOARD FIX
// =========================

function setupMobileKeyboard() {
    if (!window.visualViewport) {
        return;
    }

    const updateViewport =
        () => {
            document.documentElement.style.setProperty(
                "--viewport-height",
                `${window.visualViewport.height}px`
            );
        };

    window.visualViewport.addEventListener(
        "resize",
        updateViewport
    );

    updateViewport();
}


// =========================
// EVENT LISTENERS
// =========================

if (sendButton) {
    sendButton.addEventListener(
        "click",
        sendMessage
    );
}

if (stopButton) {
    stopButton.addEventListener(
        "click",
        stopGeneration
    );
}

if (newChatButton) {
    newChatButton.addEventListener(
        "click",
        async () => {
            if (isGenerating) {
                return;
            }

            await createNewChat();
        }
    );
}

if (uploadButton) {
    uploadButton.addEventListener(
        "click",
        uploadPDF
    );
}

if (themeButton) {
    themeButton.addEventListener(
        "click",
        toggleTheme
    );
}

if (clearButton) {
    clearButton.addEventListener(
        "click",
        clearCurrentScreen
    );
}

if (menuButton) {
    menuButton.addEventListener(
        "click",
        openSidebar
    );
}

if (sidebarOverlay) {
    sidebarOverlay.addEventListener(
        "click",
        closeSidebar
    );
}

if (searchInput) {
    searchInput.addEventListener(
        "input",
        searchChats
    );
}

if (messageInput) {
    messageInput.addEventListener(
        "input",
        autoResizeTextarea
    );

    messageInput.addEventListener(
        "keydown",
        (event) => {
            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {
                event.preventDefault();

                if (
                    !isGenerating
                ) {
                    sendMessage();
                }
            }
        }
    );
}


// =========================
// START APP
// =========================

async function startApp() {
    console.log(
        "Starting AnswerlyAbhi..."
    );

    loadTheme();

    setupSuggestions();

    setupMobileKeyboard();

    await loadChats();

    // Create first chat automatically
    if (!currentChatId) {
        await createNewChat();
    }

    console.log(
        "AnswerlyAbhi ready."
    );
}


// =========================
// HEALTH CHECK
// =========================

async function testServer() {
    try {
        const response =
            await fetch(
                `${API}/health`
            );

        const data =
            await response.json();

        console.log(
            "SERVER HEALTH:",
            data
        );

    } catch (error) {
        console.error(
            "SERVER HEALTH ERROR:",
            error
        );
    }
}


// =========================
// START
// =========================

startApp();

testServer();