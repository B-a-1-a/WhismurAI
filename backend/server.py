import os
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from openai import OpenAI
from bot import run_translation_bot
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize OpenAI client
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = FastAPI(title="Live Translation Backend")

# Enable CORS for Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Default Generic Voice ID from Fish Audio
# Replace this with a real voice ID from your Fish Audio console
DEFAULT_VOICE_ID = "7f92f8afb8ec43bf81429cc1c9199cb1"


class SummarizeRequest(BaseModel):
    transcripts: list[str]


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "Live Translation Backend",
        "endpoints": {
            "websocket": "/ws/translate/{target_lang}",
            "summarize": "/api/summarize",
        },
    }


@app.post("/api/summarize")
async def summarize_transcripts(request: SummarizeRequest):
    """
    Summarize transcripts into key insightful points using GPT-4o-mini
    """
    try:
        # Combine all transcripts into a single text
        full_text = "\n".join(request.transcripts)

        if not full_text.strip():
            return JSONResponse(
                status_code=400, content={"error": "No transcripts provided"}
            )

        # Create prompt for summarization
        prompt = f"""Analyze the following transcript and create a comprehensive summary with key insightful points.

Transcript:
{full_text}

Please provide:
1. A brief session summary (2-3 sentences)
2. Key insightful points (bullet points highlighting important information, insights, and takeaways)
3. Action items (if any tasks or follow-ups are mentioned)

Format your response as JSON with the following structure:
{{
  "summary": "Brief summary text",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "actionItems": ["action 1", "action 2"]
}}"""

        # Call OpenAI API
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert at analyzing transcripts and extracting key insights, important points, and action items. Always respond with valid JSON.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=1000,
        )

        # Extract the response
        summary_text = response.choices[0].message.content

        # Try to parse as JSON, if it fails return as text
        import json

        try:
            summary_data = json.loads(summary_text)
            return summary_data
        except json.JSONDecodeError:
            # If not valid JSON, return as structured text
            return {"summary": summary_text, "keyPoints": [], "actionItems": []}

    except Exception as e:
        print(f"[Summarize] Error: {e}")
        return JSONResponse(
            status_code=500, content={"error": f"Failed to generate summary: {str(e)}"}
        )


@app.websocket("/ws/translate/{target_lang}")
async def websocket_endpoint(websocket: WebSocket, target_lang: str):
    """
    WebSocket endpoint for real-time translation

    Args:
        target_lang: Target language code (e.g., 'es', 'fr', 'de', 'ja')

    Query Parameters:
        reference_id: Optional Fish Audio voice ID (defaults to DEFAULT_VOICE_ID)
    """
    await websocket.accept()

    # Get voice reference ID from query params, or use default
    ref_id = websocket.query_params.get("reference_id", DEFAULT_VOICE_ID)

    print(f"[WebSocket] Starting translation pipeline")
    print(f"[WebSocket] Target Language: {target_lang}")
    print(f"[WebSocket] Voice ID: {ref_id}")

    try:
        await run_translation_bot(websocket, ref_id, target_lang)
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
        await websocket.close()
