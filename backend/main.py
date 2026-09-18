import os
import uuid
import sqlite3
import logging
import io

from pathlib import Path
from typing import Generator

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from google import genai
from pypdf import PdfReader


# =========================================================
# LOGGING
# =========================================================

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger("answerlyabhi")


# =========================================================
# APP
# =========================================================

app = FastAPI(
    title="AnswerlyAbhi API"
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "https://answerlyabhi.com",
        "https://www.answerlyabhi.com",
        "https://answerlyabhi.abhinaybannuru.workers.dev",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)


# =========================================================
# GEMINI
# =========================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

GEMINI_MODEL = "gemini-3.6-flash"

gemini_client = None

if GEMINI_API_KEY:

    gemini_client = genai.Client(
        api_key=GEMINI_API_KEY
    )

    logger.info(
        "Gemini configured successfully"
    )

else:

    logger.warning(
        "GEMINI_API_KEY is missing"
    )


# =========================================================
# DATABASE
# =========================================================

DB_PATH = (
    Path(__file__).resolve().parent
    / "chat_history.db"
)


def get_db():

    conn = sqlite3.connect(
        DB_PATH,
        check_same_thread=False
    )

    conn.row_factory = sqlite3.Row

    return conn


# =========================================================
# INITIALIZE DATABASE
# =========================================================

def init_database():

    conn = get_db()

    cursor = conn.cursor()


    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            title TEXT NOT NULL
        )
        """
    )


    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL
        )
        """
    )


    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            user_id TEXT,
            filename TEXT NOT NULL,
            content TEXT NOT NULL
        )
        """
    )


    # -----------------------------------------------------
    # Migration for old database
    # -----------------------------------------------------

    cursor.execute(
        "PRAGMA table_info(chats)"
    )

    columns = [
        row["name"]
        for row in cursor.fetchall()
    ]

    if "user_id" not in columns:

        cursor.execute(
            "ALTER TABLE chats ADD COLUMN user_id TEXT"
        )


    cursor.execute(
        "PRAGMA table_info(documents)"
    )

    columns = [
        row["name"]
        for row in cursor.fetchall()
    ]

    if "user_id" not in columns:

        cursor.execute(
            "ALTER TABLE documents ADD COLUMN user_id TEXT"
        )


    conn.commit()

    conn.close()


init_database()


# =========================================================
# VALIDATE USER
# =========================================================

def validate_user_id(user_id):

    if not user_id:

        raise HTTPException(
            status_code=400,
            detail="user_id is required"
        )


    user_id = user_id.strip()


    if len(user_id) < 10:

        raise HTTPException(
            status_code=400,
            detail="Invalid user_id"
        )


    return user_id


# =========================================================
# CHECK CHAT
# =========================================================

def chat_exists(
    chat_id,
    user_id
):

    conn = get_db()

    cursor = conn.cursor()

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

    conn.close()

    return result is not None


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
def health():

    return {
        "status": "ok",
        "service": "AnswerlyAbhi",
        "gemini_configured":
            gemini_client is not None,
        "model": GEMINI_MODEL,
        "privacy": "browser-device"
    }


# =========================================================
# NEW CHAT
# =========================================================

@app.post("/new-chat")
def new_chat(
    user_id: str
):

    user_id = validate_user_id(
        user_id
    )


    chat_id = str(
        uuid.uuid4()
    )


    conn = get_db()

    cursor = conn.cursor()


    cursor.execute(
        """
        INSERT INTO chats (
            id,
            user_id,
            title
        )
        VALUES (?, ?, ?)
        """,
        (
            chat_id,
            user_id,
            "New Chat"
        )
    )


    conn.commit()

    conn.close()


    logger.info(
        "New chat: %s",
        chat_id
    )


    return {
        "chat_id": chat_id,
        "title": "New Chat"
    }


# =========================================================
# SAVE MESSAGE
# =========================================================

def save_message(
    chat_id,
    role,
    content
):

    conn = get_db()

    cursor = conn.cursor()


    cursor.execute(
        """
        INSERT INTO messages (
            chat_id,
            role,
            content
        )
        VALUES (?, ?, ?)
        """,
        (
            chat_id,
            role,
            content
        )
    )


    conn.commit()

    conn.close()


# =========================================================
# UPDATE TITLE
# =========================================================

def update_title(
    chat_id,
    message
):

    title = " ".join(
        message.strip().split()
    )


    if len(title) > 45:

        title = title[:45] + "..."


    conn = get_db()

    cursor = conn.cursor()


    cursor.execute(
        """
        UPDATE chats
        SET title = ?
        WHERE id = ?
        AND title = 'New Chat'
        """,
        (
            title,
            chat_id
        )
    )


    conn.commit()

    conn.close()


# =========================================================
# HISTORY
# =========================================================

def get_history(
    chat_id
):

    conn = get_db()

    cursor = conn.cursor()


    cursor.execute(
        """
        SELECT role, content
        FROM messages
        WHERE chat_id = ?
        ORDER BY id ASC
        """,
        (chat_id,)
    )


    rows = cursor.fetchall()

    conn.close()

    return rows


# =========================================================
# BUILD PROMPT
# =========================================================

def build_prompt(
    chat_id,
    message
):

    history = get_history(
        chat_id
    )


    # Keep last 20 messages.
    # Enough for 5+ questions.

    history = history[-20:]


    conversation = []


    for row in history:

        content = row["content"][:6000]


        if row["role"] == "user":

            conversation.append(
                f"User: {content}"
            )

        else:

            conversation.append(
                f"Assistant: {content}"
            )


    conversation_text = "\n\n".join(
        conversation
    )


    prompt = f"""
You are AnswerlyAbhi, a helpful AI assistant.

Answer the user's question clearly and naturally.

Remember previous messages in this conversation.

If the user asks a follow-up question,
use the previous conversation to understand it.

Do not repeat unnecessary information.

Use Markdown when useful.

Conversation:

{conversation_text}

User:
{message}

Assistant:
"""


    return prompt[:60000]


# =========================================================
# CHAT / GEMINI STREAMING
# =========================================================

@app.post("/chat")
def chat_endpoint(
    user_id: str,
    chat_id: str,
    message: str
):

    user_id = validate_user_id(
        user_id
    )


    message = message.strip()


    if not message:

        raise HTTPException(
            status_code=400,
            detail="Message is empty"
        )


    if not chat_exists(
        chat_id,
        user_id
    ):

        raise HTTPException(
            status_code=404,
            detail="Chat not found"
        )


    if gemini_client is None:

        raise HTTPException(
            status_code=500,
            detail="Gemini API is not configured"
        )


    # Save user message

    save_message(
        chat_id,
        "user",
        message
    )


    update_title(
        chat_id,
        message
    )


    prompt = build_prompt(
        chat_id,
        message
    )


    logger.info(
        "Gemini request for chat %s",
        chat_id
    )


    def generate() -> Generator[str, None, None]:

        full_reply = ""


        try:

            stream = (
                gemini_client
                .models
                .generate_content_stream(
                    model=GEMINI_MODEL,
                    contents=prompt
                )
            )


            for chunk in stream:

                text = getattr(
                    chunk,
                    "text",
                    None
                )


                if not text:

                    continue


                full_reply += text


                yield text


            # Save AI response

            if full_reply.strip():

                save_message(
                    chat_id,
                    "assistant",
                    full_reply
                )


                logger.info(
                    "Gemini response saved"
                )


            else:

                yield (
                    "I couldn't generate a response "
                    "right now. Please try again."
                )


        except Exception as error:

            logger.exception(
                "Gemini error"
            )


            if full_reply.strip():

                save_message(
                    chat_id,
                    "assistant",
                    full_reply
                )


                yield (
                    "\n\n"
                    "*Response interrupted. "
                    "Please try again if needed.*"
                )


            else:

                yield (
                    "I couldn't complete that response "
                    "right now. Please try again."
                )


    return StreamingResponse(
        generate(),
        media_type="text/plain"
    )


# =========================================================
# GET CHATS
# =========================================================

@app.get("/chats")
def get_chats(
    user_id: str
):

    user_id = validate_user_id(
        user_id
    )


    conn = get_db()

    cursor = conn.cursor()


    cursor.execute(
        """
        SELECT id, title
        FROM chats
        WHERE user_id = ?
        ORDER BY rowid DESC
        """,
        (user_id,)
    )


    rows = cursor.fetchall()

    conn.close()


    return [
        {
            "id": row["id"],
            "title": row["title"]
        }
        for row in rows
    ]


# =========================================================
# GET MESSAGES
# =========================================================

@app.get("/messages")
def get_messages(
    user_id: str,
    chat_id: str
):

    user_id = validate_user_id(
        user_id
    )


    if not chat_exists(
        chat_id,
        user_id
    ):

        raise HTTPException(
            status_code=404,
            detail="Chat not found"
        )


    rows = get_history(
        chat_id
    )


    return [
        {
            "role": row["role"],
            "content": row["content"]
        }
        for row in rows
    ]


# =========================================================
# DELETE CHAT
# =========================================================

@app.delete("/chat/{chat_id}")
def delete_chat(
    chat_id: str,
    user_id: str
):

    user_id = validate_user_id(
        user_id
    )


    if not chat_exists(
        chat_id,
        user_id
    ):

        raise HTTPException(
            status_code=404,
            detail="Chat not found"
        )


    conn = get_db()

    cursor = conn.cursor()


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


    conn.commit()

    conn.close()


    return {
        "status": "deleted"
    }


# =========================================================
# PDF UPLOAD
# =========================================================

@app.post("/upload-pdf")
async def upload_pdf(
    user_id: str,
    chat_id: str,
    file: UploadFile = File(...)
):

    user_id = validate_user_id(
        user_id
    )


    if not chat_exists(
        chat_id,
        user_id
    ):

        raise HTTPException(
            status_code=404,
            detail="Chat not found"
        )


    if not file.filename:

        raise HTTPException(
            status_code=400,
            detail="No file selected"
        )


    if not file.filename.lower().endswith(
        ".pdf"
    ):

        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported"
        )


    try:

        data = await file.read()


        if len(data) > 15 * 1024 * 1024:

            raise HTTPException(
                status_code=413,
                detail="PDF must be smaller than 15 MB"
            )


        reader = PdfReader(
            io.BytesIO(data)
        )


        pages = []


        for page in reader.pages:

            text = (
                page.extract_text()
                or ""
            )

            if text.strip():

                pages.append(text)


        extracted_text = "\n\n".join(
            pages
        )


        if not extracted_text.strip():

            raise HTTPException(
                status_code=400,
                detail="Could not extract text from PDF"
            )


        extracted_text = extracted_text[
            :100000
        ]


        document_id = str(
            uuid.uuid4()
        )


        conn = get_db()

        cursor = conn.cursor()


        cursor.execute(
            """
            INSERT INTO documents (
                id,
                chat_id,
                user_id,
                filename,
                content
            )
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


        conn.commit()

        conn.close()


        return {
            "status": "success",
            "document_id": document_id,
            "filename": file.filename
        }


    except HTTPException:

        raise


    except Exception as error:

        logger.exception(
            "PDF error"
        )


        raise HTTPException(
            status_code=500,
            detail=str(error)
        )


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():

    return {
        "service": "AnswerlyAbhi",
        "status": "running"
    }