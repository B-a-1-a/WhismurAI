import requests

# Your API key from https://fish.audio/app/api-keys/
API_KEY = "99592f70055945f0bd94a0009121c8fe"

url = "https://api.fish.audio/v1/tts"

headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

data = {
    "text": "",
    "reference_id": None,  # Use None for generic voice, or specify a voice model ID
    "format": "mp3",  # or "wav", "pcm", "opus"
    "mp3_bitrate": 128,
    "latency": "normal",  # or "balanced"
}

response = requests.post(url, json=data, headers=headers)

if response.status_code == 200:
    # Save the audio file
    with open("output.mp3", "wb") as f:
        f.write(response.content)
    print("Audio generated successfully!")
else:
    print(f"Error: {response.status_code}")
    print(response.text)
