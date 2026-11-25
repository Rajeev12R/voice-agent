import { useEffect, useRef, useState } from 'react'
import { sendTranscript } from '../services/api'

const BAR_COUNT = 9
const SESSION_STORAGE_KEY = 'voxlead_session_id'

function generateSessionId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `session-${Date.now()}`
}

function Microphone({ onTurnComplete }) {
  const [isListening, setIsListening] = useState(false)
  const [levels, setLevels] = useState(() => Array(BAR_COUNT).fill(0.25))
  const [lastReply, setLastReply] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)

  const recognitionRef = useRef(null)
  const streamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const rafRef = useRef(null)
  const pendingTranscriptRef = useRef('')
  const lastSentRef = useRef({ text: '', time: 0 })
  const sessionIdRef = useRef(null)

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
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsSpeaking(false)
  }

  const speakText = (text) => {
    if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1
    utterance.pitch = 1
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    window.speechSynthesis.speak(utterance)
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
      const data = await sendTranscript(cleaned, getSessionId())
      console.log('[Voice Agent] Sent transcript to backend:', cleaned, data)

      if (data?.reply) {
        setLastReply(data.reply)
        speakText(data.reply)
      }
      if (onTurnComplete) {
        onTurnComplete(data)
      }
    } catch (err) {
      const fallbackReply = err.response?.data?.reply
      if (fallbackReply) {
        setLastReply(fallbackReply)
        speakText(fallbackReply)
      }
      console.error(
        '[Voice Agent] Failed to send transcript:',
        err.response?.data || err.message
      )
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
    recognition.lang = 'en-US'

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

  return (
    <div className="voice-wrapper">
      {!isListening ? (
        <div className="voice-actions">
          <button type="button" className="counter" onClick={handleStart}>
            Start Voice Demo
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
