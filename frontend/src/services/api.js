import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://voice-agent-9k1c.onrender.com',
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Send a spoken user transcript to the backend conversation endpoint.
 * @param {string} transcript
 * @param {string | null} sessionId
 */
export async function sendTranscript(transcript, sessionId = null) {
  const response = await api.post('/api/conversation/transcript', {
    transcript,
    sessionId,
  })
  return response.data
}

/**
 * Fetch qualified leads, appointments, and handoffs for the CRM dashboard.
 */
export async function fetchCrmOverview() {
  const response = await api.get('/api/crm/overview')
  return response.data
}

export default api
