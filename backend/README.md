# Backend Setup

## Environment Variables

Create a `.env` file in this directory with the following variables:

```env
FISH_API_KEY=your_fish_key_here
DEEPGRAM_API_KEY=your_deepgram_key_here
OPENAI_API_KEY=your_openai_key_here
```

## Installation

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Running the Server

```bash
uvicorn server:app --reload
```

The server will start on `http://localhost:8000`

