// Frontend Translation using Google Translate API
// This can be used in the extension's offscreen document or popup

class TranslationService {
    constructor() {
        // Option 1: Google Translate API (requires API key)
        this.googleApiKey = null; // Set this if using official API
        
        // Option 2: Use free Google Translate endpoint (rate limited)
        this.freeTranslateUrl = 'https://translate.googleapis.com/translate_a/single';
    }

    // Option 1: Official Google Cloud Translation API
    async translateWithAPI(text, targetLang, sourceLang = 'auto') {
        if (!this.googleApiKey) {
            throw new Error('Google API key not configured');
        }

        const url = `https://translation.googleapis.com/language/translate/v2?key=${this.googleApiKey}`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    q: text,
                    source: sourceLang,
                    target: targetLang,
                    format: 'text'
                })
            });

            const data = await response.json();
            return data.data.translations[0].translatedText;
        } catch (error) {
            console.error('Translation API error:', error);
            throw error;
        }
    }

    // Option 2: Free Google Translate (unofficial, but works)
    async translateFree(text, targetLang, sourceLang = 'auto') {
        const params = new URLSearchParams({
            client: 'gtx',
            sl: sourceLang,
            tl: targetLang,
            dt: 't',
            q: text
        });

        try {
            const response = await fetch(`${this.freeTranslateUrl}?${params}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const data = await response.json();
            // The response is a nested array, translated text is in data[0][0][0]
            return data[0].map(item => item[0]).join('');
        } catch (error) {
            console.error('Free translation error:', error);
            throw error;
        }
    }

    // Option 3: Using LibreTranslate (self-hosted or public instances)
    async translateWithLibre(text, targetLang, sourceLang = 'auto') {
        // Public instance (rate limited) or self-hosted
        const url = 'https://libretranslate.com/translate';
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    q: text,
                    source: sourceLang,
                    target: targetLang,
                    format: 'text'
                })
            });

            const data = await response.json();
            return data.translatedText;
        } catch (error) {
            console.error('LibreTranslate error:', error);
            throw error;
        }
    }

    // Main translation method that tries different options
    async translate(text, targetLang, sourceLang = 'auto') {
        // Skip if target language is same as source
        if (sourceLang === targetLang) {
            return text;
        }

        // Try methods in order of preference
        try {
            // First try official API if key is available
            if (this.googleApiKey) {
                return await this.translateWithAPI(text, targetLang, sourceLang);
            }
            
            // Fallback to free Google Translate
            return await this.translateFree(text, targetLang, sourceLang);
        } catch (error) {
            console.error('All translation methods failed:', error);
            // Return original text if translation fails
            return text;
        }
    }
}

// Text-to-Speech Service using Fish Audio API or Web Speech API fallback
class TTSService {
    constructor() {
        this.synth = window.speechSynthesis;
        this.currentUtterance = null;
        this.voice = null;
        this.rate = 1.0;
        this.pitch = 1.0;
        this.volume = 1.0;
        
        // Fish Audio TTS integration
        this.fishTTS = null;
        this.useFishAudio = false;
        this.fishApiKey = null;
        this.initializeFishAudio();
    }
    
    // Initialize Fish Audio TTS if available
    async initializeFishAudio() {
        try {
            // Check if FishAudioTTS is available
            if (typeof FishAudioTTS !== 'undefined') {
                this.fishTTS = new FishAudioTTS();
                
                // Check if chrome.storage is available (not available in offscreen documents)
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    try {
                        const result = await chrome.storage.local.get(['fishApiKey']);
                        if (result.fishApiKey) {
                            this.fishApiKey = result.fishApiKey;
                            await this.fishTTS.initialize(this.fishApiKey);
                            console.log('[TTSService] Fish Audio TTS initialized with API key');
                        } else {
                            console.log('[TTSService] No Fish API key found in storage');
                        }
                    } catch (storageError) {
                        console.warn('[TTSService] Cannot access chrome.storage (offscreen document limitation)');
                    }
                } else {
                    console.log('[TTSService] chrome.storage not available (using Web Speech API only)');
                }
            }
        } catch (error) {
            console.warn('[TTSService] Fish Audio TTS initialization failed:', error.message);
        }
    }
    
    // Set Fish Audio API key
    async setFishApiKey(apiKey) {
        this.fishApiKey = apiKey;
        
        // Try to save to storage if available
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                await chrome.storage.local.set({ fishApiKey });
            }
        } catch (e) {
            // Storage not available, just keep in memory
            console.log('[TTSService] Storing API key in memory only');
        }
        
        if (this.fishTTS) {
            await this.fishTTS.initialize(apiKey);
            this.useFishAudio = true;
            console.log('[TTSService] Fish Audio initialized with new API key');
        }
    }
    
    // Set custom voice model
    setCustomVoiceModel(modelId) {
        if (this.fishTTS) {
            this.fishTTS.setCustomVoice(modelId);
            this.useFishAudio = true;
            console.log('[TTSService] Custom voice model set:', modelId);
        }
    }
    
    // Toggle Fish Audio TTS
    setUseFishAudio(use) {
        if (this.fishTTS && this.fishTTS.hasCustomVoice()) {
            this.useFishAudio = use;
            this.fishTTS.setUseCustomVoice(use);
            console.log('[TTSService] Use Fish Audio:', use);
        }
    }

    // Get available voices for a language
    getVoicesForLanguage(lang) {
        const voices = this.synth.getVoices();
        return voices.filter(voice => voice.lang.startsWith(lang));
    }

    // Set preferred voice
    setVoice(voiceOrLang) {
        if (typeof voiceOrLang === 'string') {
            // Find best voice for language
            const voices = this.getVoicesForLanguage(voiceOrLang);
            this.voice = voices[0] || null;
        } else {
            this.voice = voiceOrLang;
        }
    }

    // Speak translated text
    async speak(text, lang) {
        // Cancel any ongoing speech
        this.stop();

        // Try Fish Audio TTS first if available and enabled
        if (this.useFishAudio && this.fishTTS && this.fishTTS.hasCustomVoice()) {
            try {
                console.log('[TTSService] Using Fish Audio TTS');
                await this.speakWithFishAudio(text);
                return;
            } catch (error) {
                console.error('[TTSService] Fish Audio TTS failed, falling back to Web Speech:', error);
                // Fall through to Web Speech API
            }
        }

        // Use Web Speech API as fallback
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Set language
        utterance.lang = this.getLanguageCode(lang);
        
        // Set voice if available
        if (this.voice) {
            utterance.voice = this.voice;
        } else {
            // Try to find a voice for this language
            const voices = this.getVoicesForLanguage(lang);
            if (voices.length > 0) {
                utterance.voice = voices[0];
            }
        }

        // Set speech parameters
        utterance.rate = this.rate;
        utterance.pitch = this.pitch;
        utterance.volume = this.volume;

        // Event handlers
        utterance.onstart = () => {
            console.log('TTS started:', text.substring(0, 50) + '...');
        };

        utterance.onend = () => {
            console.log('TTS completed');
            this.currentUtterance = null;
        };

        utterance.onerror = (event) => {
            console.error('TTS error:', event);
            this.currentUtterance = null;
        };

        this.currentUtterance = utterance;
        this.synth.speak(utterance);
    }
    
    // Speak using Fish Audio TTS
    async speakWithFishAudio(text) {
        try {
            // Generate speech audio
            const audioData = await this.fishTTS.generateSpeech(text);
            
            // Play the audio using the same playback context as in offscreen.js
            // We'll dispatch a custom event that offscreen.js can listen to
            window.dispatchEvent(new CustomEvent('fish-audio-ready', {
                detail: { audioData }
            }));
            
            console.log('[TTSService] Fish Audio speech generated');
        } catch (error) {
            console.error('[TTSService] Fish Audio speech generation failed:', error);
            throw error;
        }
    }

    // Stop current speech
    stop() {
        if (this.synth.speaking) {
            this.synth.cancel();
        }
        this.currentUtterance = null;
    }

    // Pause speech
    pause() {
        if (this.synth.speaking && !this.synth.paused) {
            this.synth.pause();
        }
    }

    // Resume speech
    resume() {
        if (this.synth.paused) {
            this.synth.resume();
        }
    }

    // Get proper language code for TTS
    getLanguageCode(lang) {
        const langMap = {
            'en': 'en-US',
            'es': 'es-ES',
            'fr': 'fr-FR',
            'de': 'de-DE',
            'it': 'it-IT',
            'pt': 'pt-BR',
            'ru': 'ru-RU',
            'ja': 'ja-JP',
            'ko': 'ko-KR',
            'zh': 'zh-CN',
            'ar': 'ar-SA',
            'hi': 'hi-IN',
            'nl': 'nl-NL',
            'pl': 'pl-PL',
            'tr': 'tr-TR',
            'vi': 'vi-VN',
            'th': 'th-TH',
            'sv': 'sv-SE',
            'da': 'da-DK',
            'no': 'no-NO',
            'fi': 'fi-FI'
        };
        return langMap[lang] || lang;
    }
}

// Main Translation Pipeline Manager
class TranslationPipeline {
    constructor(targetLanguage = 'es') {
        this.translator = new TranslationService();
        this.tts = new TTSService();
        this.targetLanguage = targetLanguage;
        this.enableTTS = true;
        this.translationBuffer = '';
        this.translationTimeout = null;
    }

    // Set target language
    setTargetLanguage(lang) {
        this.targetLanguage = lang;
        this.tts.setVoice(lang);
    }

    // Process incoming transcript from STT
    async processTranscript(text, isFinal = false) {
        if (!text || !text.trim()) return;

        // Clear any pending translation
        if (this.translationTimeout) {
            clearTimeout(this.translationTimeout);
        }

        if (isFinal) {
            // Translate immediately for final text
            await this.translateAndSpeak(text);
        } else {
            // Buffer interim text and translate after a delay
            this.translationBuffer = text;
            this.translationTimeout = setTimeout(() => {
                this.translateAndSpeak(this.translationBuffer);
            }, 500); // Wait 500ms for more text
        }
    }

    // Translate text and optionally speak it
    async translateAndSpeak(text) {
        try {
            // Translate the text
            const translated = await this.translator.translate(
                text,
                this.targetLanguage,
                'en' // Assuming source is English
            );

            // Send translated text to UI
            this.sendTranslationUpdate(translated, true);

            // Speak if TTS is enabled
            if (this.enableTTS && translated) {
                this.tts.speak(translated, this.targetLanguage);
            }

            return translated;
        } catch (error) {
            console.error('Translation pipeline error:', error);
            return null;
        }
    }

    // Send translation update to UI
    sendTranslationUpdate(text, isFinal) {
        // Send message to popup or content script
        if (chrome && chrome.runtime) {
            chrome.runtime.sendMessage({
                type: 'translation',
                text: text,
                isFinal: isFinal,
                language: this.targetLanguage
            });
        }

        // Also dispatch custom event for any listeners
        window.dispatchEvent(new CustomEvent('translation', {
            detail: {
                text: text,
                isFinal: isFinal,
                language: this.targetLanguage
            }
        }));
    }

    // Toggle TTS on/off
    setTTSEnabled(enabled) {
        this.enableTTS = enabled;
        if (!enabled) {
            this.tts.stop();
        }
    }

    // Set TTS parameters
    setTTSParams(params) {
        if (params.rate !== undefined) this.tts.rate = params.rate;
        if (params.pitch !== undefined) this.tts.pitch = params.pitch;
        if (params.volume !== undefined) this.tts.volume = params.volume;
    }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TranslationPipeline, TranslationService, TTSService };
}
