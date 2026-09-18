"use strict";

/* =========================================================
   ANSWERLYABHI
   Gemini Streaming Frontend
   ========================================================= */


/* =========================================================
   BACKEND URL
   ========================================================= */

const API =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
        ? "http://127.0.0.1:8000"
        : "https://answerlyabhi.onrender.com";


/* =========================================================
   APPLICATION STATE
   ========================================================= */

let currentChatId = null;
let currentController = null;
let isGenerating = false;

/* =========================================================
   PRIVATE BROWSER / DEVICE USER ID
   ========================================================= */

function getUserId() {

    let userId =
        localStorage.getItem(
            "answerlyabhi-user-id"
        );

    if (!userId) {

        userId =
            crypto.randomUUID();

        localStorage.setItem(
            "answerlyabhi-user-id",
            userId
        );
    }

    return userId;
}

const USER_ID = getUserId();

console.log(
    "AnswerlyAbhi User ID:",
    USER_ID
);


/* =========================================================
   DOM ELEMENTS
   ========================================================= */

const messageInput =
    document.getElementById("message");

const sendButton =
    document.getElementById("send");

const stopButton =
    document.getElementById("stop");

const chat =
    document.getElementById("chat");

const newChatButton =
    document.getElementById("new-chat");

const chatList =
    document.getElementById("chat-list");

const pdfInput =
    document.getElementById("pdf");

const sidebar =
    document.getElementById("sidebar");

const sidebarOverlay =
    document.getElementById("sidebar-overlay");

const openSidebarButton =
    document.getElementById("open-sidebar");

const closeSidebarButton =
    document.getElementById("close-sidebar");

const themeToggle =
    document.getElementById("theme-toggle");

const clearChatButton =
    document.getElementById("clear-chat");

const chatSearch =
    document.getElementById("chat-search");

const fileStatus =
    document.getElementById("file-status");


console.log("=================================");
console.log("ANSWERLYABHI FRONTEND");
console.log("Backend:", API);
console.log("=================================");


/* =========================================================
   HTML ESCAPE
   ========================================================= */

function escapeHtml(text) {

    const div =
        document.createElement("div");

    div.textContent =
        String(text);

    return div.innerHTML;
}


/* =========================================================
   SCROLL
   ========================================================= */

function scrollToBottom() {

    if (!chat) return;

    requestAnimationFrame(() => {

        chat.scrollTop =
            chat.scrollHeight;

    });
}


/* =========================================================
   ERROR
   ========================================================= */

function showError(message) {

    if (!chat) {

        alert(message);

        return;
    }

    const errorElement =
        document.createElement("div");

    errorElement.className =
        "message ai error-message";

    errorElement.innerHTML = `
        <strong>Something went wrong</strong>
        <br>
        ${escapeHtml(message)}
    `;

    chat.appendChild(
        errorElement
    );

    scrollToBottom();
}


/* =========================================================
   MARKDOWN
   ========================================================= */

function renderMarkdown(
    element,
    text
) {

    if (!element) return;

    try {

        if (
            typeof marked !== "undefined" &&
            typeof marked.parse === "function"
        ) {

            element.innerHTML =
                marked.parse(text);

        } else {

            element.textContent =
                text;
        }


        /* Highlight code */

        if (
            typeof hljs !== "undefined"
        ) {

            element
                .querySelectorAll("pre code")
                .forEach(codeBlock => {

                    try {

                        hljs.highlightElement(
                            codeBlock
                        );

                    } catch (error) {

                        console.warn(
                            "Highlight error:",
                            error
                        );
                    }

                });
        }


        /* Copy buttons */

        addCopyButtons(element);

    } catch (error) {

        console.error(
            "Markdown error:",
            error
        );

        element.textContent =
            text;
    }
}


/* =========================================================
   COPY CODE BUTTONS
   ========================================================= */

function addCopyButtons(container) {

    if (!container) return;

    const codeBlocks =
        container.querySelectorAll("pre");

    codeBlocks.forEach(pre => {

        if (
            pre.querySelector(".copy-code")
        ) {

            return;
        }

        const button =
            document.createElement("button");

        button.type =
            "button";

        button.className =
            "copy-code";

        button.textContent =
            "Copy";

        button.addEventListener(
            "click",
            async () => {

                const code =
                    pre.querySelector("code");

                if (!code) return;

                try {

                    await navigator.clipboard.writeText(
                        code.innerText
                    );

                    button.textContent =
                        "Copied!";

                    setTimeout(() => {

                        button.textContent =
                            "Copy";

                    }, 1500);

                } catch (error) {

                    console.error(
                        "Copy failed:",
                        error
                    );

                }

            }
        );

        pre.appendChild(button);

    });
}


/* =========================================================
   ADD MESSAGE
   ========================================================= */

function addMessage(
    text,
    type
) {

    if (!chat) {

        console.error(
            "Chat container not found."
        );

        return null;
    }


    /* Remove welcome */

    const welcome =
        chat.querySelector(".welcome");

    if (welcome) {

        welcome.remove();
    }


    const element =
        document.createElement("div");

    element.className =
        `message ${type}`;


    if (type === "ai") {

        renderMarkdown(
            element,
            text
        );

    } else {

        element.textContent =
            text;
    }


    chat.appendChild(
        element
    );

    scrollToBottom();

    return element;
}


/* =========================================================
   RESET CHAT SCREEN
   ========================================================= */

function resetChatScreen() {

    if (!chat) return;

    chat.innerHTML = `

        <div
            class="welcome"
            id="welcome"
        >

            <div class="welcome-icon">
                ✦
            </div>

            <h2>
                How can I help you today?
            </h2>

            <p>
                Ask anything, learn something new,
                write code, or solve a problem.
            </p>

            <div class="suggestions">

                <button
                    type="button"
                    class="suggestion"
                    data-prompt="Explain artificial intelligence in simple words."
                >

                    <span>💡</span>

                    <div>

                        <strong>
                            Explain something
                        </strong>

                        <small>
                            Make a complex topic simple
                        </small>

                    </div>

                </button>


                <button
                    type="button"
                    class="suggestion"
                    data-prompt="Help me write a professional resume."
                >

                    <span>📝</span>

                    <div>

                        <strong>
                            Write something
                        </strong>

                        <small>
                            Create professional content
                        </small>

                    </div>

                </button>


                <button
                    type="button"
                    class="suggestion"
                    data-prompt="Help me debug this Python code."
                >

                    <span>💻</span>

                    <div>

                        <strong>
                            Write code
                        </strong>

                        <small>
                            Build or debug your project
                        </small>

                    </div>

                </button>


                <button
                    type="button"
                    class="suggestion"
                    data-prompt="Give me some creative business ideas."
                >

                    <span>🚀</span>

                    <div>

                        <strong>
                            Brainstorm ideas
                        </strong>

                        <small>
                            Explore new possibilities
                        </small>

                    </div>

                </button>

            </div>

        </div>
    `;

    setupSuggestions();
}


/* =========================================================
   CREATE NEW CHAT
   ========================================================= */

async function createNewChat() {

    if (isGenerating) {

        return null;
    }

    try {

        const response =
            await fetch(
                `${API}/new-chat?user_id=${encodeURIComponent(USER_ID)}`,`${API}/new-chat`,
                {
                    method: "POST"
                }
            );

        if (!response.ok) {

            const errorText =
                await response.text();

            throw new Error(
                `New chat failed (${response.status})`
            );
        }

        const data =
            await response.json();

        if (
            !data ||
            !data.chat_id
        ) {

            throw new Error(
                "Backend did not return a chat ID."
            );
        }

        currentChatId =
            data.chat_id;

        resetChatScreen();

        await loadChats();

        closeMobileSidebar();

        if (messageInput) {

            messageInput.focus();
        }

        return currentChatId;

    } catch (error) {

        console.error(
            "Create chat error:",
            error
        );

        showError(
            "Could not create a new chat.\n\n" +
            error.message
        );

        return null;
    }
}


/* =========================================================
   LOAD CHATS
   ========================================================= */

async function loadChats() {

    if (!chatList) return;

    try {

        const response =
            await fetch(
                `${API}/chats?user_id=${encodeURIComponent(USER_ID)}`
            );

        if (!response.ok) {

            throw new Error(
                `Chats request failed: ${response.status}`
            );
        }

        const data =
            await response.json();

        chatList.innerHTML = "";

        if (!Array.isArray(data)) {

            return;
        }

        if (data.length === 0) {

            const empty =
                document.createElement("div");

            empty.textContent =
                "No chats yet.";

            empty.style.padding =
                "15px 10px";

            empty.style.color =
                "#747b87";

            empty.style.fontSize =
                "12px";

            chatList.appendChild(
                empty
            );

            return;
        }

        data.forEach(item => {

            if (!item.id) return;

            const chatItem =
                document.createElement("div");

            chatItem.className =
                "chat-item";

            if (
                String(item.id) ===
                String(currentChatId)
            ) {

                chatItem.classList.add(
                    "active"
                );
            }

            const title =
                document.createElement("span");

            title.className =
                "chat-title";

            title.textContent =
                item.title ||
                "New Chat";


            const deleteButton =
                document.createElement("button");

            deleteButton.type =
                "button";

            deleteButton.className =
                "delete-chat";

            deleteButton.textContent =
                "×";

            deleteButton.setAttribute(
                "aria-label",
                "Delete chat"
            );


            chatItem.addEventListener(
                "click",
                () => {

                    openChat(
                        item.id
                    );

                }
            );


            deleteButton.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    deleteChat(
                        item.id
                    );

                }
            );


            chatItem.appendChild(
                title
            );

            chatItem.appendChild(
                deleteButton
            );

            chatList.appendChild(
                chatItem
            );

        });

    } catch (error) {

        console.error(
            "Load chats error:",
            error
        );
    }
}


/* =========================================================
   OPEN CHAT
   ========================================================= */

async function openChat(
    chatId
) {

    if (
        !chatId ||
        isGenerating
    ) {

        return;
    }

    currentChatId =
        chatId;

    resetChatScreen();

    try {

        const response =
            await fetch(
                `${API}/messages?user_id=${encodeURIComponent(USER_ID)}&chat_id=${encodeURIComponent(chatId)}`
            );

        if (!response.ok) {

            throw new Error(
                `Messages request failed: ${response.status}`
            );
        }

        const history =
            await response.json();

        if (
            Array.isArray(history) &&
            history.length > 0
        ) {

            const welcome =
                chat.querySelector(
                    ".welcome"
                );

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

        console.error(
            "Could not load chat:",
            error
        );

        showError(
            "Could not load this conversation.\n\n" +
            error.message
        );
    }

    await loadChats();

    closeMobileSidebar();

    if (messageInput) {

        messageInput.focus();
    }
}


/* =========================================================
   DELETE CHAT
   ========================================================= */

async function deleteChat(
    chatId
) {

    if (
        !chatId ||
        isGenerating
    ) {

        return;
    }

    const confirmed =
        window.confirm(
            "Delete this conversation?"
        );

    if (!confirmed) {

        return;
    }

    try {

        const response =
            await fetch(
                `${API}/chat/${encodeURIComponent(chatId)}?user_id=${encodeURIComponent(USER_ID)}`,
                {
                    method: "DELETE"
                }
            );

        if (!response.ok) {

            const errorText =
                await response.text();

            throw new Error(
                `Delete failed (${response.status})`
            );
        }


        if (
            String(currentChatId) ===
            String(chatId)
        ) {

            currentChatId =
                null;

            resetChatScreen();

            await createNewChat();

        } else {

            await loadChats();
        }

    } catch (error) {

        console.error(
            "Delete chat error:",
            error
        );

        showError(
            "Failed to delete chat.\n\n" +
            error.message
        );
    }
}


/* =========================================================
   SEND MESSAGE — TRUE STREAMING
   ========================================================= */

async function sendMessage() {

    if (isGenerating) {

        return;
    }

    const message =
        messageInput
            ? messageInput.value.trim()
            : "";


    if (!message) {

        return;
    }


    /* Create chat if needed */

    if (!currentChatId) {

        const newChatId =
            await createNewChat();

        if (!newChatId) {

            return;
        }
    }


    /* Add user message */

    addMessage(
        message,
        "user"
    );


    /* Clear input */

    messageInput.value = "";

    autoResizeTextarea();


    /* Generation state */

    isGenerating =
        true;

    currentController =
        new AbortController();


    if (sendButton) {

        sendButton.disabled =
            true;
    }

    if (newChatButton) {

        newChatButton.disabled =
            true;
    }

    if (stopButton) {

        stopButton.style.display =
            "flex";
    }


    /* AI message */

    const aiMessage =
        addMessage(
            "",
            "ai"
        );

    let fullReply = "";


    try {

        console.log(
            "Sending message to Gemini..."
        );


        const response =
            await fetch(
                `${API}/chat?user_id=${encodeURIComponent(USER_ID)}&chat_id=${encodeURIComponent(currentChatId)}&message=${encodeURIComponent(message)}`,
                {
                    method: "POST",
                    signal:
                        currentController.signal
                }
            );


        if (!response.ok) {

            const errorText =
                await response.text();

            throw new Error(
                `Server error ${response.status}: ${errorText}`
            );
        }


        /* =================================================
           TRUE STREAMING
           ================================================= */

        if (!response.body) {

            throw new Error(
                "Streaming is not supported by this browser."
            );
        }


        const reader =
            response.body.getReader();

        const decoder =
            new TextDecoder(
                "utf-8"
            );


        let firstChunk = true;


        while (true) {

            const {
                value,
                done
            } =
                await reader.read();


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


            fullReply +=
                chunk;


            /*
             * Render continuously.
             * This makes Gemini appear
             * word/chunk by chunk.
             */

            if (aiMessage) {

                renderMarkdown(
                    aiMessage,
                    fullReply
                );

            }


            scrollToBottom();


            if (firstChunk) {

                firstChunk =
                    false;

                console.log(
                    "Gemini streaming started."
                );
            }

        }


        /* Flush decoder */

        const remaining =
            decoder.decode();

        if (remaining) {

            fullReply +=
                remaining;

            if (aiMessage) {

                renderMarkdown(
                    aiMessage,
                    fullReply
                );
            }
        }


        if (!fullReply.trim()) {

            throw new Error(
                "Gemini returned an empty response."
            );
        }


        console.log(
            "Gemini response completed."
        );


        await loadChats();


    } catch (error) {

        if (
            error.name ===
            "AbortError"
        ) {

            /*
             * Keep the text generated
             * before Stop was clicked.
             */

            if (aiMessage) {

                if (fullReply.trim()) {

                    renderMarkdown(
                        aiMessage,
                        fullReply +
                        "\n\n*Generation stopped.*"
                    );

                } else {

                    aiMessage.textContent =
                        "Generation stopped.";
                }
            }

        } else {

            console.error(
                "AI ERROR:",
                error
            );

            if (aiMessage) {

                aiMessage.innerHTML = `
                    <strong>
                        Unable to get a response
                    </strong>
                    <br>
                    ${escapeHtml(
                        error.message
                    )}
                `;
            }

        }

    } finally {

        finishGeneration();
    }
}


/* =========================================================
   FINISH GENERATION
   ========================================================= */

function finishGeneration() {

    isGenerating =
        false;

    currentController =
        null;


    if (stopButton) {

        stopButton.style.display =
            "none";
    }

    if (sendButton) {

        sendButton.disabled =
            false;
    }

    if (newChatButton) {

        newChatButton.disabled =
            false;
    }

    if (messageInput) {

        messageInput.focus();
    }
}


/* =========================================================
   STOP GENERATING
   ========================================================= */

function stopGenerating() {

    if (currentController) {

        currentController.abort();
    }
}


/* =========================================================
   PDF UPLOAD
   ========================================================= */

async function uploadPDF() {

    if (!pdfInput) {

        return;
    }

    const file =
        pdfInput.files[0];

    if (!file) {

        return;
    }


    if (
        !file.name
            .toLowerCase()
            .endsWith(".pdf")
    ) {

        alert(
            "Please select a valid PDF file."
        );

        pdfInput.value =
            "";

        return;
    }


    /* Create chat if needed */

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


    if (fileStatus) {

        fileStatus.style.display =
            "block";

        fileStatus.textContent =
            `Uploading ${file.name}...`;
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
                `HTTP ${response.status}: ${errorText}`
            );
        }


        const data =
            await response.json();


        if (data.error) {

            throw new Error(
                data.error
            );
        }


        addMessage(
            `📄 Uploaded PDF: ${file.name}`,
            "user"
        );


        if (fileStatus) {

            fileStatus.textContent =
                `✓ ${file.name} uploaded successfully`;
        }


        await loadChats();


    } catch (error) {

        console.error(
            "PDF upload error:",
            error
        );


        if (fileStatus) {

            fileStatus.textContent =
                "PDF upload failed.";
        }


        showError(
            "PDF upload failed.\n\n" +
            error.message
        );

    } finally {

        pdfInput.value =
            "";
    }
}


/* =========================================================
   MOBILE SIDEBAR
   ========================================================= */

function openMobileSidebar() {

    if (sidebar) {

        sidebar.classList.add(
            "open"
        );
    }

    if (sidebarOverlay) {

        sidebarOverlay.classList.add(
            "active"
        );
    }
}


function closeMobileSidebar() {

    if (sidebar) {

        sidebar.classList.remove(
            "open"
        );
    }

    if (sidebarOverlay) {

        sidebarOverlay.classList.remove(
            "active"
        );
    }
}


/* =========================================================
   CHAT SEARCH
   ========================================================= */

function searchChats() {

    if (
        !chatList ||
        !chatSearch
    ) {

        return;
    }

    const search =
        chatSearch.value
            .trim()
            .toLowerCase();


    const items =
        chatList.querySelectorAll(
            ".chat-item"
        );


    items.forEach(item => {

        const title =
            item.querySelector(
                ".chat-title"
            );

        const text =
            title
                ? title.textContent.toLowerCase()
                : "";


        item.style.display =
            !search ||
            text.includes(search)
                ? "flex"
                : "none";

    });
}


/* =========================================================
   THEME
   ========================================================= */

function loadTheme() {

    const savedTheme =
        localStorage.getItem(
            "answerlyabhi-theme"
        );


    if (savedTheme === "light") {

        document.body.classList.add(
            "light-theme"
        );

    } else {

        document.body.classList.remove(
            "light-theme"
        );
    }
}


function toggleTheme() {

    const isLight =
        document.body.classList.toggle(
            "light-theme"
        );


    localStorage.setItem(
        "answerlyabhi-theme",
        isLight
            ? "light"
            : "dark"
    );
}


/* =========================================================
   TEXTAREA AUTO RESIZE
   ========================================================= */

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


/* =========================================================
   SUGGESTIONS
   ========================================================= */

function setupSuggestions() {

    if (!chat) {

        return;
    }


    const suggestions =
        chat.querySelectorAll(
            ".suggestion"
        );


    suggestions.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const prompt =
                    button.dataset.prompt;


                if (!prompt) {

                    return;
                }


                if (messageInput) {

                    messageInput.value =
                        prompt;

                    autoResizeTextarea();

                    messageInput.focus();
                }

            }
        );

    });
}


/* =========================================================
   CLEAR CURRENT SCREEN
   ========================================================= */

function clearCurrentChat() {

    if (isGenerating) {

        return;
    }


    resetChatScreen();


    if (messageInput) {

        messageInput.value =
            "";

        autoResizeTextarea();

        messageInput.focus();
    }
}


/* =========================================================
   KEYBOARD
   ========================================================= */

function setupKeyboard() {

    if (!messageInput) {

        return;
    }


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


    messageInput.addEventListener(
        "input",
        autoResizeTextarea
    );
}


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

if (sendButton) {

    sendButton.addEventListener(
        "click",
        sendMessage
    );
}


if (stopButton) {

    stopButton.addEventListener(
        "click",
        stopGenerating
    );
}


if (newChatButton) {

    newChatButton.addEventListener(
        "click",
        createNewChat
    );
}


if (pdfInput) {

    pdfInput.addEventListener(
        "change",
        uploadPDF
    );
}


if (openSidebarButton) {

    openSidebarButton.addEventListener(
        "click",
        openMobileSidebar
    );
}


if (closeSidebarButton) {

    closeSidebarButton.addEventListener(
        "click",
        closeMobileSidebar
    );
}


if (sidebarOverlay) {

    sidebarOverlay.addEventListener(
        "click",
        closeMobileSidebar
    );
}


if (themeToggle) {

    themeToggle.addEventListener(
        "click",
        toggleTheme
    );
}


if (clearChatButton) {

    clearChatButton.addEventListener(
        "click",
        clearCurrentChat
    );
}


if (chatSearch) {

    chatSearch.addEventListener(
        "input",
        searchChats
    );
}


/* ESC closes sidebar */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape"
        ) {

            closeMobileSidebar();
        }

    }
);


/* =========================================================
   BACKEND TEST
   ========================================================= */

async function testBackend() {

    try {

        console.log(
            "Testing AnswerlyAbhi backend..."
        );


        const response =
            await fetch(
                `${API}/health`
            );


        console.log(
            "Backend status:",
            response.status
        );


        if (!response.ok) {

            return false;
        }


        const data =
            await response.json();


        console.log(
            "Backend health:",
            data
        );


        return (
            data.status === "ok"
        );

    } catch (error) {

        console.error(
            "Backend connection failed:",
            error
        );

        return false;
    }
}


/* =========================================================
   START APPLICATION
   ========================================================= */

async function startApp() {

    console.log(
        "Starting AnswerlyAbhi..."
    );


    loadTheme();

    setupKeyboard();

    setupSuggestions();

    autoResizeTextarea();


    const backendOK =
        await testBackend();


    if (!backendOK) {

        showError(
            "Cannot connect to the AnswerlyAbhi backend.\n\n" +
            "Please check whether the backend is online."
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


    if (
    messageInput &&
    window.innerWidth > 768
) {

    messageInput.focus();
}
}


/* =========================================================
   START
   ========================================================= */

startApp();
/* =========================================================
   MOBILE KEYBOARD / VIEWPORT FIX
   Keeps the message box above the mobile keyboard
   ========================================================= */

function setupMobileKeyboardFix() {

    if (!window.visualViewport) {
        return;
    }

    const viewport = window.visualViewport;

    function updateKeyboardPosition() {

        const composer =
            document.querySelector(".input-area") ||
            document.querySelector(".composer-wrapper");

        if (!composer) {
            return;
        }

        const keyboardHeight =
            Math.max(
                0,
                window.innerHeight - viewport.height - viewport.offsetTop
            );

        if (window.innerWidth <= 768) {

            composer.style.transform =
                `translateY(-${keyboardHeight}px)`;

        } else {

            composer.style.transform =
                "translateY(0)";
        }

        requestAnimationFrame(() => {
            scrollToBottom();
        });
    }

    viewport.addEventListener(
        "resize",
        updateKeyboardPosition
    );

    viewport.addEventListener(
        "scroll",
        updateKeyboardPosition
    );

    window.addEventListener(
        "resize",
        updateKeyboardPosition
    );

    updateKeyboardPosition();
}


/* Start mobile keyboard fix */

setupMobileKeyboardFix();