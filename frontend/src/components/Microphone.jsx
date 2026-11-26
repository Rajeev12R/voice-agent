import { useEffect, useRef, useState } from 'react'
import { sendTranscript } from '../services/api'

const BAR_COUNT = 9
const SESSION_STORAGE_KEY = 'voxlead_session_id'
const LANGUAGE_STORAGE_KEY = 'voxlead_language'

const PREFERRED_VOICE_PATTERNS = [
  /natural/i,
  /online/i,
  /google/i,
  /enhanced|premium|siri/i,
  /swara|madhur|lekha|neerja|samantha|aria|jenny|karen|daniel|rishi/i,
]

function rankVoice(voice, isHindi) {
  const targetPrefix = isHindi ? 'hi' : 'en'
  if (!voice.lang.toLowerCase().startsWith(targetPrefix)) return -1

  let score = 10
  if (isHindi && voice.lang.toLowerCase().startsWith('hi-in')) score += 10
  if (!isHindi && (voice.lang.startsWith('en-IN') || voice.lang.startsWith('en-US'))) score += 8
  if (!voice.localService) score += 5

  PREFERRED_VOICE_PATTERNS.forEach((pattern, idx) => {
    if (pattern.test(voice.name)) {
      score += (PREFERRED_VOICE_PATTERNS.length - idx) * 10
    }
  })

  return score
}

function formatTextForSpeech(text, isHindi) {
  return text
    .replace(/₹\s*([\d,]+)/g, isHindi ? '$1 रुपये' : '$1 rupees')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function generateSessionId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `session-${Date.now()}`
}

function Microphone({ onTurnComplete }) {
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [levels, setLevels] = useState(() => Array(BAR_COUNT).fill(0.25))
  const [lastReply, setLastReply] = useState('')
  const [replyLanguage, setReplyLanguage] = useState('en')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [language, setLanguage] = useState(
    () => localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en-IN'
  )
  const [voices, setVoices] = useState([])

  const recognitionRef = useRef(null)
  const streamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const rafRef = useRef(null)
  const pendingTranscriptRef = useRef('')
  const lastSentRef = useRef({ text: '', time: 0 })
  const sessionIdRef = useRef(null)
  const speechRunIdRef = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices()
      if (available.length > 0) setVoices(available)
    }

    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
    }
  }, [])

  const getSessionId = () => {
    if (!sessionIdRef.current) {
      const saved = localStorage.getItem(SESSION_STORAGE_KEY)
      if (saved) {
        sessionIdRef.current = saved
      } else {
        const created = generateSessionId()
        localStorage.setItem(SESSION_STORAGE_KEY, created)
        sessionIdRef.current = created
      }
    }
    return sessionIdRef.current
  }

  const stopSpeech = () => {
    speechRunIdRef.current += 1
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsSpeaking(false)
  }

  const speakText = (text, langHint = replyLanguage) => {
    if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return
    }

    speechRunIdRef.current += 1
    const currentRunId = speechRunIdRef.current
    window.speechSynthesis.cancel()

    const isHindi = langHint === 'hi' || /[\u0900-\u097F]/.test(text)
    const cleaned = formatTextForSpeech(text, isHindi)
    const chunks = cleaned.match(/[^।.!?]+[।.!?]+|[^।.!?]+$/g) || [cleaned]

    const allVoices =
      voices.length > 0 ? voices : window.speechSynthesis.getVoices()
    const matchedVoice =
      allVoices
        .map((v) => ({ voice: v, score: rankVoice(v, isHindi) }))
        .filter((item) => item.score >= 0)
        .sort((a, b) => b.score - a.score)[0]?.voice || null

    let index = 0

    const speakNext = () => {
      if (speechRunIdRef.current !== currentRunId) return
      if (index >= chunks.length) {
        setIsSpeaking(false)
        return
      }

      const utterance = new SpeechSynthesisUtterance(chunks[index].trim())
      utterance.lang = isHindi ? 'hi-IN' : 'en-IN'
      if (matchedVoice) utterance.voice = matchedVoice
      utterance.rate = 0.98
      utterance.pitch = 1
      utterance.onstart = () => {
        if (speechRunIdRef.current === currentRunId) setIsSpeaking(true)
      }
      utterance.onend = () => {
        if (speechRunIdRef.current !== currentRunId) return
        index += 1
        speakNext()
      }
      utterance.onerror = () => {
        if (speechRunIdRef.current === currentRunId) setIsSpeaking(false)
      }

      window.speechSynthesis.speak(utterance)
    }

    speakNext()
  }

  const submitTranscript = async (text) => {
    const cleaned = text.trim()
    if (!cleaned) return

    const now = Date.now()
    if (
      lastSentRef.current.text === cleaned &&
      now - lastSentRef.current.time < 2000
    ) {
      return
    }
    lastSentRef.current = { text: cleaned, time: now }

    try {
      setIsProcessing(true)
      const data = await sendTranscript(cleaned, getSessionId(), language)
      console.log('[Voice Agent] Sent transcript to backend:', cleaned, data)

      const nextLang = data?.language || (language.startsWith('hi') ? 'hi' : 'en')
      setReplyLanguage(nextLang)

      if (data?.reply) {
        setLastReply(data.reply)
        speakText(data.reply, nextLang)
      }
      if (onTurnComplete) {
        onTurnComplete(data)
      }
    } catch (err) {
      const fallbackReply = err.response?.data?.reply
      if (fallbackReply) {
        const nextLang = language.startsWith('hi') ? 'hi' : 'en'
        setReplyLanguage(nextLang)
        setLastReply(fallbackReply)
        speakText(fallbackReply, nextLang)
      }
      console.error(
        '[Voice Agent] Failed to send transcript:',
        err.response?.data || err.message
      )
    } finally {
      setIsProcessing(false)
    }
  }

  const cleanup = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null
        recognitionRef.current.onerror = null
        recognitionRef.current.onend = null
        recognitionRef.current.stop()
      } catch {
        // Ignore if already stopped
      }
      recognitionRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      cleanup()
      stopSpeech()
    }
  }, [])

  const startAudioVisualizer = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx

      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const updateLevels = () => {
        analyser.getByteFrequencyData(dataArray)
        const next = Array.from({ length: BAR_COUNT }, (_, i) => {
          const val = dataArray[i + 1] || 0
          return Math.max(0.2, Math.min(1, val / 180))
        })
        setLevels(next)
        rafRef.current = requestAnimationFrame(updateLevels)
      }

      updateLevels()
    } catch (err) {
      console.warn('[Voice Agent] Microphone visualizer unavailable:', err.message)
    }
  }

  const startSpeechRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      console.warn(
        '[Voice Agent] SpeechRecognition API is not supported in this browser.'
      )
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = language

    recognition.onstart = () => {
      console.log('[Voice Agent] Listening started...')
    }

    recognition.onresult = (event) => {
      let interim = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0].transcript.trim()
        if (!transcript) continue

        if (result.isFinal) {
          console.log('[Transcript - Final]:', transcript)
          pendingTranscriptRef.current = ''
          submitTranscript(transcript)
        } else {
          interim += (interim ? ' ' : '') + transcript
          console.log('[Transcript - Interim]:', transcript)
        }
      }

      if (interim) {
        pendingTranscriptRef.current = interim
      }
    }

    recognition.onerror = (event) => {
      console.warn('[Voice Agent] Speech recognition error:', event.error)
    }

    recognition.onend = () => {
      if (recognitionRef.current) {
        try {
          recognition.start()
        } catch {
          // Ignore restart errors when stopping
        }
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const handleStart = () => {
    stopSpeech()
    pendingTranscriptRef.current = ''
    setIsListening(true)
    startAudioVisualizer()
    startSpeechRecognition()
  }

  const handleStop = () => {
    const remaining = pendingTranscriptRef.current
    pendingTranscriptRef.current = ''

    cleanup()
    setIsListening(false)
    setLevels(Array(BAR_COUNT).fill(0.25))
    console.log('[Voice Agent] Stopped listening.')

    if (remaining) {
      submitTranscript(remaining)
    }
  }

  const handleNewSession = () => {
    stopSpeech()
    const freshId = generateSessionId()
    localStorage.setItem(SESSION_STORAGE_KEY, freshId)
    sessionIdRef.current = freshId
    setLastReply('')
    console.log('[Voice Agent] Started new session:', freshId)
  }

  const handleLanguageChange = (nextLang) => {
    setLanguage(nextLang)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLang)
  }

  return (
    <div className="voice-wrapper">
      <div className="lang-toggle" role="group" aria-label="Voice language">
        <button
          type="button"
          className={`lang-pill ${language === 'en-IN' ? 'active' : ''}`}
          onClick={() => handleLanguageChange('en-IN')}
          disabled={isListening}
        >
          English
        </button>
        <button
          type="button"
          className={`lang-pill ${language === 'hi-IN' ? 'active' : ''}`}
          onClick={() => handleLanguageChange('hi-IN')}
          disabled={isListening}
        >
          हिन्दी (Hindi)
        </button>
      </div>

      {!isListening ? (
        <div className="voice-actions">
          <button type="button" className="counter" onClick={handleStart}>
            {language === 'hi-IN' ? 'वॉइस डेमो शुरू करें' : 'Start Voice Demo'}
          </button>
          {lastReply && (
            <button
              type="button"
              className="secondary-btn"
              onClick={handleNewSession}
            >
              New Session
            </button>
          )}
        </div>
      ) : (
        <div className="voice-controls">
          <div className="voice-wave" role="status" aria-label="Voice wave active">
            {levels.map((level, index) => (
              <span
                key={index}
                className="wave-bar"
                style={{
                  '--bar-scale': level,
                  '--bar-delay': `${index * 0.08}s`,
                }}
              />
            ))}
          </div>
          <button type="button" className="counter stop-btn" onClick={handleStop}>
            Stop
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="processing-pill" role="status" aria-live="polite">
          <span className="processing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Processing…</span>
        </div>
      )}

      {lastReply && (
        <div className="tts-panel" aria-live="polite">
          <p className="tts-reply">{lastReply}</p>
          <div className="tts-controls">
            <button
              type="button"
              className="tts-btn"
              onClick={() => speakText(lastReply)}
              disabled={isSpeaking}
            >
              Play
            </button>
            <button
              type="button"
              className="tts-btn"
              onClick={stopSpeech}
              disabled={!isSpeaking}
            >
              Stop
            </button>
            <button
              type="button"
              className="tts-btn"
              onClick={() => speakText(lastReply)}
            >
              Replay
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Microphone
