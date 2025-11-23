import os
import io
import wave
import requests
import soundfile as sf
import numpy as np
import scipy.signal
import subprocess
from openai import OpenAI
from dotenv import load_dotenv

# ----------------------------------------
# CONFIGURATION
# ----------------------------------------
FISH_API_KEY = os.getenv("FISH_API_KEY")
OPENAI_KEY = os.getenv("OPENAI_KEY")

STT_URL = "https://api.fish.audio/v1/asr"
TTS_URL = "https://api.fish.audio/v1/tts"
CLONE_URL = "https://api.fish.audio/model"

# ------------------------------------------------
# 1. HELPER: Load & Resample
# ------------------------------------------------
def load_and_prep_audio(file_path):
    print(f"📂 Loading: {os.path.basename(file_path)}...")
    data, sr = sf.read(file_path)
    
    if len(data.shape) > 1:
        data = np.mean(data, axis=1)
        
    target_sr = 16000
    if sr != target_sr:
        print(f"   Note: Resampling from {sr}Hz to {target_sr}Hz...")
        num_samples = int(len(data) * target_sr / sr)
        data = scipy.signal.resample(data, num_samples)
    
    data = (data * 32767).astype(np.int16)
    
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2) 
        wf.setframerate(target_sr)
        wf.writeframes(data.tobytes())
        
    return buffer.getvalue()

# ------------------------------------------------
# 2. STEP: Train Voice Clone
# ------------------------------------------------
def create_voice_clone(audio_bytes):
    print("\n🧬 Step 1: Training Voice Clone...")
    headers = {"Authorization": f"Bearer {FISH_API_KEY}"}
    files = {"voices": ("train.wav", audio_bytes, "audio/wav")}
    data = {
        "title": "Batch_Process_Clone",
        "type": "tts",
        "train_mode": "fast",
        "visibility": "private"
    }
    
    response = requests.post(CLONE_URL, headers=headers, data=data, files=files)
    if response.status_code not in (200, 201):
        raise Exception(f"Clone Failed: {response.text}")
    
    resp_json = response.json()
    model_id = resp_json.get("_id") or resp_json.get("id")
    print(f"✅ Voice Cloned! ID: {model_id}")
    return model_id

# ------------------------------------------------
# 3. STEP: Transcribe
# ------------------------------------------------
def transcribe_audio(audio_bytes):
    print("\n👂 Step 2: Transcribing Audio...")
    headers = {"Authorization": f"Bearer {FISH_API_KEY}"}
    files = {"audio": ("speech.wav", audio_bytes, "audio/wav")}
    data = {"language": "en", "ignore_timestamps": "true"}
    
    response = requests.post(STT_URL, headers=headers, files=files, data=data)
    if response.status_code != 200:
        raise Exception(f"STT Failed: {response.text}")
        
    text = response.json().get("text", "")
    print(f"📝 Original Text: \"{text}\"")
    return text

# ------------------------------------------------
# 4. STEP: Translate (GPT-4o)
# ------------------------------------------------
def translate_text(text, target_lang="Spanish"):
    print(f"\n🔄 Step 3: Translating to {target_lang}...")
    client = OpenAI(api_key=OPENAI_KEY)
    
    try:
        response = client.chat.completions.create(
            model="gpt-5",
            messages=[
                {"role": "system", "content": f"You are a professional interpreter. Translate to {target_lang}. Return ONLY the translated text."},
                {"role": "user", "content": text}
            ]
        )
        translated = response.choices[0].message.content
        print(f"🇪🇸 Translated: \"{translated}\"")
        return translated
    except Exception as e:
        print(f"❌ OpenAI Error: {e}")
        return text

# ------------------------------------------------
# 5. STEP: Generate Speech
# ------------------------------------------------
def generate_cloned_speech(text, voice_id):
    print("\n🔊 Step 4: Generating Cloned Speech...")
    headers = {
        "Authorization": f"Bearer {FISH_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "text": text,
        "format": "wav",
        "reference_id": voice_id
    }
    
    response = requests.post(TTS_URL, headers=headers, json=payload)
    if response.status_code != 200:
        raise Exception(f"TTS Failed: {response.text}")
        
    return response.content

# ------------------------------------------------
# MAIN
# ------------------------------------------------
if __name__ == "__main__":
    file_path = input("Enter WAV file path: ").strip()
    
    if not os.path.exists(file_path):
        print("❌ File not found.")
        exit()

    try:
        clean_audio = load_and_prep_audio(file_path)
        voice_id = create_voice_clone(clean_audio)
        original_text = transcribe_audio(clean_audio)
        spanish_text = translate_text(original_text, target_lang="Spanish")
        output_audio = generate_cloned_speech(spanish_text, voice_id)
        
        # 6. Save
        output_filename = "output_cloned.wav"
        with open(output_filename, "wb") as f:
            f.write(output_audio)
        
        file_size = os.path.getsize(output_filename)
        print(f"\n✅ Saved to '{output_filename}' ({file_size} bytes)")
            
        if file_size < 1000:
            print("⚠️ WARNING: File looks too small. The audio might be empty.")

        # 7. Play (Using the 'open' command)
        print("▶️ Opening audio player...")
        subprocess.run(["open", output_filename]) 

    except Exception as e:
        print(f"\n❌ Error: {e}")