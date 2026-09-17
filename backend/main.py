from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

import sqlite3
import uuid
import re
import os
import tempfile

from pypdf import PdfReader
from google import genai


# ============================================================
# APP
# ============================================================

app = FastAPI(
    title="AnswerlyAbhi API",
    version="1.0.0"
)


# ============================================================
# CORS
# ============================================================

ALLOWED_ORIGINS = [
    "https://answerlyabhi.abhinaybannuru.workers.dev",
    "https://answerlyabhi.com",
    "https://www.answerlyabhi.com",
    "https://answerlyabhi.onrender.com",

    # Local development
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

# Stable Gemini model
GEMINI_MODEL = "gemini-3.6-flash"

DATABASE = "chat_history.db"


# ============================================================
# DATABASE
# ============================================================

def get_connection():
    connection = sqlite3.connect(
        DATABASE,
        timeout=30,
        check_same_thread=False
    )

    return connection


def init_database():

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
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
            filename TEXT NOT NULL,
            content TEXT NOT NULL
        )
    """)

    connection.commit()
    connection.close()


init_database()


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/")
def home():

    return {
        "service": "AnswerlyAbhi AI",
        "status": "running",
        "model": GEMINI_MODEL
    }


@app.get("/health")
def health():

    return {
        "status": "ok",
        "service": "AnswerlyAbhi",
        "gemini_configured": gemini_client is not None
    }


# ============================================================
# NEW CHAT
# ============================================================

@app.post("/new-chat")
def new_chat():

    chat_id = str(uuid.uuid4())

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO chats (id, title)
        VALUES (?, ?)
        """,
        (chat_id, "New Chat")
    )

    connection.commit()
    connection.close()

    return {
        "chat_id": chat_id,
        "message": "New chat created!"
    }


# ============================================================
# CHECK CHAT
# ============================================================

def chat_exists(chat_id):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        "SELECT id FROM chats WHERE id = ?",
        (chat_id,)
    )

    result = cursor.fetchone()

    connection.close()

    return result is not None


# ============================================================
# PDF UPLOAD
# ============================================================

@app.post("/upload-pdf")
async def upload_pdf(
    chat_id: str,
    file: UploadFile = File(...)
):

    if not chat_exists(chat_id):
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

        # 15 MB safety limit
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
            (id, chat_id, filename, content)
            VALUES (?, ?, ?, ?)
            """,
            (
                document_id,
                chat_id,
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

        print("PDF error:", error)

        return {
            "error": "Failed to process PDF."
        }

    finally:

        if temp_filename and os.path.exists(temp_filename):

            try:
                os.remove(temp_filename)
            except Exception:
                pass


# ============================================================
# PDF RETRIEVAL
# ============================================================

def get_relevant_pdf_text(chat_id, question):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT filename, content
        FROM documents
        WHERE chat_id = ?
        ORDER BY rowid DESC
        LIMIT 1
        """,
        (chat_id,)
    )

    document = cursor.fetchone()

    connection.close()

    if not document:
        return None

    filename, content = document

    words = content.split()

    chunks = []

    chunk_size = 500

    for i in range(0, len(words), chunk_size):

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
            question_words.intersection(chunk_words)
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

    pdf_context = "\n\n".join(best_chunks)

    return {
        "filename": filename,
        "content": pdf_context
    }


# ============================================================
# BUILD PROMPT
# ============================================================

def build_prompt(chat_id, message):

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

Your job is to answer clearly, naturally, accurately, and helpfully.

Important behavior:
- Be concise when the question is simple.
- Give detailed explanations when needed.
- Use markdown when useful.
- For programming questions, provide clean code.
- Do not invent facts.
- If you are uncertain, say so.

PDF rules:
- If relevant PDF information is provided, use it.
- Do not invent information from the PDF.
- If the user asks specifically about the PDF and the answer
  cannot be found in the provided PDF context, clearly say
  that the information is not available in the uploaded PDF.

Conversation:
"""

    # Limit enormous history
    recent_messages = messages[-40:]

    for role, content in recent_messages:

        if role == "user":

            prompt += (
                "\nUser: "
                + content
                + "\n"
            )

        elif role == "assistant":

            prompt += (
                "\nAssistant: "
                + content
                + "\n"
            )

    pdf_data = get_relevant_pdf_text(
        chat_id,
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
# CHAT STREAMING
# ============================================================

@app.post("/chat")
def chat(chat_id: str, message: str):

    if not message.strip():
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty."
        )

    if not chat_exists(chat_id):
        raise HTTPException(
            status_code=404,
            detail="Chat not found."
        )

    if gemini_client is None:
        raise HTTPException(
            status_code=500,
            detail="Gemini API key is not configured."
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
    # UPDATE CHAT TITLE
    # --------------------------------------------------------

    cursor.execute(
        """
        SELECT title
        FROM chats
        WHERE id = ?
        """,
        (chat_id,)
    )

    chat_data = cursor.fetchone()

    if chat_data and chat_data[0] == "New Chat":

        title = message.strip()[:40]

        cursor.execute(
            """
            UPDATE chats
            SET title = ?
            WHERE id = ?
            """,
            (
                title,
                chat_id
            )
        )

    connection.commit()
    connection.close()

    # --------------------------------------------------------
    # CREATE PROMPT
    # --------------------------------------------------------

    prompt = build_prompt(
        chat_id,
        message
    )

    # --------------------------------------------------------
    # STREAM GEMINI RESPONSE
    # --------------------------------------------------------

    def generate():

        full_reply = ""

        try:

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

                    full_reply += text

                    yield text

            # ------------------------------------------------
            # SAVE COMPLETE AI RESPONSE
            # ------------------------------------------------

            if full_reply.strip():

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
                        full_reply
                    )
                )

                connection.commit()
                connection.close()

        except Exception as error:

            print(
                "Gemini streaming error:",
                repr(error)
            )

            yield (
                "\n\n[AnswerlyAbhi server error. "
                "Please try again.]"
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
def get_chats():

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT id, title
        FROM chats
        ORDER BY rowid DESC
        """
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
def get_messages(chat_id: str):

    if not chat_exists(chat_id):

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
def delete_chat(chat_id: str):

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
        """,
        (chat_id,)
    )

    cursor.execute(
        """
        DELETE FROM chats
        WHERE id = ?
        """,
        (chat_id,)
    )

    connection.commit()
    connection.close()

    return {
        "message": "Chat deleted!"
    }