
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

import sqlite3
import uuid
import json
import re
import os

from pypdf import PdfReader
from google import genai


# ============================================================
# APP
# ============================================================

app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# GEMINI
# ============================================================

gemini_client = genai.Client()

GEMINI_MODEL = "gemini-3.6-flash"

DATABASE = "chat_history.db"


# ============================================================
# DATABASE
# ============================================================

def init_database():

    connection = sqlite3.connect(DATABASE)
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
# HOME
# ============================================================

@app.get("/")
def home():

    return {
        "message": "AnswerlyAbhi AI is running!"
    }


# ============================================================
# NEW CHAT
# ============================================================

@app.post("/new-chat")
def new_chat():

    chat_id = str(uuid.uuid4())

    connection = sqlite3.connect(DATABASE)
    cursor = connection.cursor()

    cursor.execute(
        "INSERT INTO chats (id, title) VALUES (?, ?)",
        (chat_id, "New Chat")
    )

    connection.commit()
    connection.close()

    return {
        "chat_id": chat_id,
        "message": "New chat created!"
    }


# ============================================================
# PDF UPLOAD
# ============================================================

@app.post("/upload-pdf")
async def upload_pdf(
    chat_id: str,
    file: UploadFile = File(...)
):

    if not file.filename.lower().endswith(".pdf"):

        return {
            "error": "Please upload a PDF file."
        }

    temp_filename = None

    try:

        file_bytes = await file.read()

        # Temporary PDF filename
        temp_filename = f"temp_{uuid.uuid4()}.pdf"

        with open(temp_filename, "wb") as pdf_file:
            pdf_file.write(file_bytes)

        # Extract PDF text
        reader = PdfReader(temp_filename)

        extracted_text = ""

        for page in reader.pages:

            page_text = page.extract_text()

            if page_text:
                extracted_text += page_text + "\n"

        # Delete temporary PDF
        os.remove(temp_filename)
        temp_filename = None

        if not extracted_text.strip():

            return {
                "error": "Could not extract text from this PDF."
            }

        # Store document
        document_id = str(uuid.uuid4())

        connection = sqlite3.connect(DATABASE)
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

    except Exception as error:

        print("PDF error:", error)

        if temp_filename and os.path.exists(temp_filename):

            try:
                os.remove(temp_filename)
            except:
                pass

        return {
            "error": "Failed to process PDF."
        }


# ============================================================
# PDF RETRIEVAL
# ============================================================

def get_relevant_pdf_text(chat_id, question):

    connection = sqlite3.connect(DATABASE)
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

    # Split PDF into chunks
    words = content.split()

    chunks = []

    chunk_size = 500

    for i in range(0, len(words), chunk_size):

        chunk = " ".join(
            words[i:i + chunk_size]
        )

        chunks.append(chunk)

    # Extract useful words from question
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

    # Select best chunks
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
# CHAT
# ============================================================

@app.post("/chat")
def chat(chat_id: str, message: str):

    connection = sqlite3.connect(DATABASE)
    cursor = connection.cursor()

    # --------------------------------------------------------
    # SAVE USER MESSAGE
    # --------------------------------------------------------

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
        "SELECT title FROM chats WHERE id = ?",
        (chat_id,)
    )

    chat_data = cursor.fetchone()

    if chat_data and chat_data[0] == "New Chat":

        title = message[:40]

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

    # --------------------------------------------------------
    # GET CONVERSATION HISTORY
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # CHECK PDF
    # --------------------------------------------------------

    pdf_data = get_relevant_pdf_text(
        chat_id,
        message
    )

    # --------------------------------------------------------
    # CREATE PROMPT
    # --------------------------------------------------------

    prompt = """
You are AnswerlyAbhi, a helpful personal AI assistant.

Answer clearly, naturally, and accurately.

If a PDF context is provided, use it when relevant.

IMPORTANT PDF RULES:
- Use the PDF information when relevant.
- Do not invent information that is not in the PDF.
- If the user asks something specifically about the PDF and
  the answer cannot be found in the provided PDF context,
  say that the information is not available in the uploaded PDF.
- You can still answer normal questions when no PDF
  information is relevant.

Conversation:
"""

    for role, content in messages:

        if role == "user":

            prompt += (
                "User: "
                + content
                + "\n"
            )

        else:

            prompt += (
                "Assistant: "
                + content
                + "\n"
            )

    # --------------------------------------------------------
    # ADD PDF CONTEXT
    # --------------------------------------------------------

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

    # ========================================================
    # GEMINI STREAMING
    # ========================================================

    def generate():

        full_reply = ""

        try:

            response_stream = gemini_client.models.generate_content_stream(
                model=GEMINI_MODEL,
                contents=prompt
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
            # SAVE AI RESPONSE
            # ------------------------------------------------

            connection = sqlite3.connect(DATABASE)
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
                error
            )

            yield "\n[AI server error]"

    return StreamingResponse(
        generate(),
        media_type="text/plain"
    )


# ============================================================
# GET CHATS
# ============================================================

@app.get("/chats")
def get_chats():

    connection = sqlite3.connect(DATABASE)

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

    connection = sqlite3.connect(DATABASE)

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

    connection = sqlite3.connect(DATABASE)

    cursor = connection.cursor()

    # Delete messages
    cursor.execute(
        """
        DELETE FROM messages
        WHERE chat_id = ?
        """,
        (chat_id,)
    )

    # Delete documents
    cursor.execute(
        """
        DELETE FROM documents
        WHERE chat_id = ?
        """,
        (chat_id,)
    )

    # Delete chat
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

