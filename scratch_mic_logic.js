let recognition;
let isListening = false;

function toggleMic() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast("Speech Recognition not supported in this browser.", "error");
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!recognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        
        // Try to guess language based on app state or just use auto
        recognition.lang = 'en-IN'; 

        recognition.onstart = () => {
            isListening = true;
            const mic = document.getElementById('micBtn');
            if (mic) mic.classList.add('active');
            const wave = document.getElementById('alexaWaveform');
            if (wave) wave.style.display = 'flex';
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const input = document.getElementById('chatInput');
            if (input) {
                input.value = transcript;
                sendMessage();
            }
        };

        recognition.onerror = (event) => {
            console.error("Speech Error:", event.error);
            stopMic();
        };

        recognition.onend = () => {
            stopMic();
        };
    }

    if (isListening) {
        recognition.stop();
    } else {
        try {
            recognition.start();
        } catch(e) {
            console.warn("Recognition already started or error:", e);
        }
    }
}

function stopMic() {
    isListening = false;
    const mic = document.getElementById('micBtn');
    if (mic) mic.classList.remove('active');
    const wave = document.getElementById('alexaWaveform');
    if (wave) wave.style.display = 'none';
}
