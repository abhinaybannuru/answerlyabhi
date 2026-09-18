from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

import sqlite3
import uuid
import re
import os
import tempfile
import time

from pypdf import PdfReader
from google import genai


# ============================================================
# APP
# ============================================================

app = FastAPI(
    title="AnswerlyAbhi API",
    version="2.0.0"
)


# ============================================================
# CORS
# ============================================================

ALLOWED_ORIGINS = [
    "https://answerlyabhi.abhinaybannuru.workers.dev",
    "https://answerlyabhi.com",
    "https://www.answerlyabhi.com",
    "https://answerlyabhi.onrender.com",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# GEMINI
# ============================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("WARNING: GEMINI_API_KEY is not configured.")

gemini_client = (
    genai.Client(api_key=GEMINI_API_KEY)
    if GEMINI_API_KEY
    else None
)

GEMINI_MODEL = "gemini-3.6-flash"


# ============================================================
# DATABASE
# ============================================================

DATABASE = "chat_history.db"


def get_connection():
    return sqlite3.connect(
        DATABASE,
        timeout=30,
        check_same_thread=False
    )


def init_database():

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            content TEXT NOT NULL
        )
    """)

    # --------------------------------------------------------
    # DATABASE MIGRATION FOR OLD DATABASES
    # --------------------------------------------------------

    try:
        cursor.execute(
            "ALTER TABLE chats ADD COLUMN user_id TEXT"
        )
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute(
            "ALTER TABLE documents ADD COLUMN user_id TEXT"
        )
    except sqlite3.OperationalError:
        pass

    connection.commit()
    connection.close()


init_database()


# ============================================================
# VALIDATE USER ID
# ============================================================

def validate_user_id(user_id):

    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="User ID is required."
        )

    user_id = str(user_id).strip()

    if len(user_id) < 10 or len(user_id) > 100:
        raise HTTPException(
            status_code=400,
            detail="Invalid user ID."
        )

    return user_id


# ============================================================
# HEALTH
# ============================================================

@app.get("/")
def home():

    return {
        "service": "AnswerlyAbhi AI",
        "status": "running",
        "model": GEMINI_MODEL,
        "version": "2.0.0"
    }


@app.get("/health")
def health():

    return {
        "status": "ok",
        "service": "AnswerlyAbhi",
        "gemini_configured": gemini_client is not None,
        "model": GEMINI_MODEL,
        "privacy": "browser-device"
    }


# ============================================================
# NEW CHAT
# ============================================================

@app.post("/new-chat")
def new_chat(user_id: str):

    user_id = validate_user_id(user_id)

    chat_id = str(uuid.uuid4())

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO chats
        (id, user_id, title)
        VALUES (?, ?, ?)
        """,
        (
            chat_id,
            user_id,
            "New Chat"
        )
    )

    connection.commit()
    connection.close()

    return {
        "chat_id": chat_id,
        "message": "New chat created!"
    }


# ============================================================
# CHECK CHAT OWNERSHIP
# ============================================================

def chat_exists(chat_id, user_id):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT id
        FROM chats
        WHERE id = ?
        AND user_id = ?
        """,
        (
            chat_id,
            user_id
        )
    )

    result = cursor.fetchone()

    connection.close()

    return result is not None


# ============================================================
# PDF UPLOAD
# ============================================================

@app.post("/upload-pdf")
async def upload_pdf(
    user_id: str,
    chat_id: str,
    file: UploadFile = File(...)
):

    user_id = validate_user_id(user_id)

    if not chat_exists(chat_id, user_id):
        raise HTTPException(
            status_code=404,
            detail="Chat not found."
        )

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No file selected."
        )

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF file."
        )

    temp_filename = None

    try:

        file_bytes = await file.read()

        if len(file_bytes) > 15 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="PDF is too large. Maximum size is 15 MB."
            )

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".pdf"
        ) as temp_file:

            temp_filename = temp_file.name
            temp_file.write(file_bytes)

        reader = PdfReader(temp_filename)

        extracted_text = ""

        for page in reader.pages:

            page_text = page.extract_text()

            if page_text:
                extracted_text += page_text + "\n"

        if not extracted_text.strip():

            return {
                "error": "Could not extract text from this PDF."
            }

        document_id = str(uuid.uuid4())

        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute(
            """
            INSERT INTO documents
            (id, chat_id, user_id, filename, content)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                document_id,
                chat_id,
                user_id,
                file.filename,
                extracted_text
            )
        )

        connection.commit()
        connection.close()

        return {
            "message": "PDF uploaded successfully!",
            "document_id": document_id,
            "filename": file.filename,
            "pages": len(reader.pages),
            "characters": len(extracted_text)
        }

    except HTTPException:
        raise

    except Exception as error:

        print("PDF error:", repr(error))

        raise HTTPException(
            status_code=500,
            detail="Failed to process PDF."
        )

    finally:

        if temp_filename and os.path.exists(temp_filename):

            try:
                os.remove(temp_filename)
            except Exception:
                pass


# ============================================================
# PDF RETRIEVAL
# ============================================================

def get_relevant_pdf_text(chat_id, user_id, question):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT filename, content
        FROM documents
        WHERE chat_id = ?
        AND user_id = ?
        ORDER BY rowid DESC
        LIMIT 1
        """,
        (
            chat_id,
            user_id
        )
    )

    document = cursor.fetchone()

    connection.close()

    if not document:
        return None

    filename, content = document

    words = content.split()

    chunks = []

    chunk_size = 500

    for i in range(
        0,
        len(words),
        chunk_size
    ):

        chunk = " ".join(
            words[i:i + chunk_size]
        )

        chunks.append(chunk)

    question_words = set(
        re.findall(
            r"\b[a-zA-Z0-9]{3,}\b",
            question.lower()
        )
    )

    scored_chunks = []

    for chunk in chunks:

        chunk_words = set(
            re.findall(
                r"\b[a-zA-Z0-9]{3,}\b",
                chunk.lower()
            )
        )

        score = len(
            question_words.intersection(
                chunk_words
            )
        )

        scored_chunks.append(
            (score, chunk)
        )

    scored_chunks.sort(
        key=lambda x: x[0],
        reverse=True
    )

    best_chunks = [
        chunk
        for score, chunk in scored_chunks[:4]
        if score > 0
    ]

    if not best_chunks:
        best_chunks = chunks[:2]

    # Prevent extremely large PDF prompts
    selected_content = "\n\n".join(
        best_chunks
    )

    selected_content = selected_content[:12000]

    return {
        "filename": filename,
        "content": selected_content
    }


# ============================================================
# BUILD PROMPT
# ============================================================

def build_prompt(
    chat_id,
    user_id,
    message
):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT role, content
        FROM messages
        WHERE chat_id = ?
        ORDER BY id
        """,
        (chat_id,)
    )

    messages = cursor.fetchall()

    connection.close()

    prompt = """
You are AnswerlyAbhi, a helpful personal AI assistant.

Answer naturally, accurately, and helpfully.

Important behavior:
- Answer simple questions concisely.
- Give detailed answers when the user needs them.
- Support follow-up questions using conversation context.
- Do not lose context between questions.
- Use markdown when useful.
- For programming questions, provide clean code.
- Do not invent facts.
- If uncertain, clearly say so.

Conversation:
"""

    # --------------------------------------------------------
    # Keep enough history for multi-question conversations
    # --------------------------------------------------------

    recent_messages = messages[-20:]

    for role, content in recent_messages:

        # Protect prompt size
        safe_content = str(content)[:6000]

        if role == "user":

            prompt += (
                "\nUser: "
                + safe_content
                + "\n"
            )

        elif role == "assistant":

            prompt += (
                "\nAssistant: "
                + safe_content
                + "\n"
            )

    # --------------------------------------------------------
    # PDF CONTEXT
    # --------------------------------------------------------

    pdf_data = get_relevant_pdf_text(
        chat_id,
        user_id,
        message
    )

    if pdf_data:

        prompt += """

Uploaded PDF:
Filename: {}

Relevant PDF content:

{}

""".format(
            pdf_data["filename"],
            pdf_data["content"]
        )

    prompt += "\nAssistant:"

    return prompt


# ============================================================
# SAVE ASSISTANT RESPONSE
# ============================================================

def save_assistant_message(
    chat_id,
    user_id,
    content
):

    if not content.strip():
        return

    if not chat_exists(
        chat_id,
        user_id
    ):
        return

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO messages
        (chat_id, role, content)
        VALUES (?, ?, ?)
        """,
        (
            chat_id,
            "assistant",
            content
        )
    )

    connection.commit()
    connection.close()


# ============================================================
# CHAT STREAMING
# ============================================================

@app.post("/chat")
def chat(
    user_id: str,
    chat_id: str,
    message: str
):

    user_id = validate_user_id(user_id)

    message = message.strip()

    if not message:

        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty."
        )

    if not chat_exists(
        chat_id,
        user_id
    ):

        raise HTTPException(
            status_code=404,
            detail="Chat not found."
        )

    if gemini_client is None:

        raise HTTPException(
            status_code=500,
            detail="Gemini service is not configured."
        )

    # --------------------------------------------------------
    # SAVE USER MESSAGE
    # --------------------------------------------------------

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO messages
        (chat_id, role, content)
        VALUES (?, ?, ?)
        """,
        (
            chat_id,
            "user",
            message
        )
    )

    # --------------------------------------------------------
    # UPDATE TITLE
    # --------------------------------------------------------

    cursor.execute(
        """
        SELECT title
        FROM chats
        WHERE id = ?
        AND user_id = ?
        """,
        (
            chat_id,
            user_id
        )
    )

    chat_data = cursor.fetchone()

    if (
        chat_data
        and chat_data[0] == "New Chat"
    ):

        title = message[:40]

        cursor.execute(
            """
            UPDATE chats
            SET title = ?
            WHERE id = ?
            AND user_id = ?
            """,
            (
                title,
                chat_id,
                user_id
            )
        )

    connection.commit()
    connection.close()

    # --------------------------------------------------------
    # BUILD PROMPT
    # --------------------------------------------------------

    prompt = build_prompt(
        chat_id,
        user_id,
        message
    )

    # --------------------------------------------------------
    # GEMINI STREAM
    # --------------------------------------------------------

    def generate():

        full_reply = ""
        successful_stream = False

        try:

            print(
                f"Gemini request started | "
                f"user={user_id[:8]} | "
                f"chat={chat_id[:8]} | "
                f"model={GEMINI_MODEL}"
            )

            response_stream = (
                gemini_client.models.generate_content_stream(
                    model=GEMINI_MODEL,
                    contents=prompt
                )
            )

            for chunk in response_stream:

                text = getattr(
                    chunk,
                    "text",
                    None
                )

                if text:

                    successful_stream = True
                    full_reply += text

                    yield text

            if full_reply.strip():

                save_assistant_message(
                    chat_id,
                    user_id,
                    full_reply
                )

                print(
                    "Gemini request completed | "
                    f"characters={len(full_reply)}"
                )

            else:

                print(
                    "Gemini returned an empty response."
                )

                yield (
                    "I didn't receive a response from "
                    "Gemini. Please try your question again."
                )

        except Exception as error:

            print(
                "=================================================="
            )
            print(
                "GEMINI STREAMING ERROR"
            )
            print(
                repr(error)
            )
            print(
                "=================================================="
            )

            # ------------------------------------------------
            # If some response already arrived, preserve it.
            # ------------------------------------------------

            if full_reply.strip():

                save_assistant_message(
                    chat_id,
                    user_id,
                    full_reply
                )

                yield (
                    "\n\n*The response was interrupted. "
                    "Please ask me to continue.*"
                )

            else:

                # No ugly server error shown to the user.
                yield (
                    "I couldn't complete that response right now. "
                    "Please try again in a moment."
                )

    return StreamingResponse(
        generate(),
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )


# ============================================================
# GET CHATS
# ============================================================

@app.get("/chats")
def get_chats(user_id: str):

    user_id = validate_user_id(user_id)

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT id, title
        FROM chats
        WHERE user_id = ?
        ORDER BY rowid DESC
        """,
        (user_id,)
    )

    chats = cursor.fetchall()

    connection.close()

    return [
        {
            "id": chat_id,
            "title": title
        }
        for chat_id, title in chats
    ]


# ============================================================
# GET MESSAGES
# ============================================================

@app.get("/messages")
def get_messages(
    user_id: str,
    chat_id: str
):

    user_id = validate_user_id(user_id)

    if not chat_exists(
        chat_id,
        user_id
    ):

        raise HTTPException(
            status_code=404,
            detail="Chat not found."
        )

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT role, content
        FROM messages
        WHERE chat_id = ?
        ORDER BY id
        """,
        (chat_id,)
    )

    messages = cursor.fetchall()

    connection.close()

    return [
        {
            "role": role,
            "content": content
        }
        for role, content in messages
    ]


# ============================================================
# DELETE CHAT
# ============================================================

@app.delete("/chat/{chat_id}")
def delete_chat(
    chat_id: str,
    user_id: str
):

    user_id = validate_user_id(user_id)

    if not chat_exists(
        chat_id,
        user_id
    ):

        raise HTTPException(
            status_code=404,
            detail="Chat not found."
        )

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        DELETE FROM messages
        WHERE chat_id = ?
        """,
        (chat_id,)
    )

    cursor.execute(
        """
        DELETE FROM documents
        WHERE chat_id = ?
        AND user_id = ?
        """,
        (
            chat_id,
            user_id
        )
    )

    cursor.execute(
        """
        DELETE FROM chats
        WHERE id = ?
        AND user_id = ?
        """,
        (
            chat_id,
            user_id
        )
    )

    connection.commit()
    connection.close()

    return {
        "message": "Chat deleted!"
    }