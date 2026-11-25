import { useState } from 'react'
import voiceAgentLogo from './assets/voice-agent.svg'
import Microphone from './components/Microphone'
import CrmDashboard from './components/CrmDashboard'
import './App.css'

function App() {
  const [showCrm, setShowCrm] = useState(false)
  const [crmRefreshKey, setCrmRefreshKey] = useState(0)

  const handleTurnComplete = () => {
    setCrmRefreshKey((k) => k + 1)
  }

  return (
    <>
      <div className="aurora-bg" aria-hidden="true">
        <div className="aurora-glow" />
        <div className="aurora-beam beam-1" />
        <div className="aurora-beam beam-2" />
        <div className="aurora-beam beam-3" />
        <div className="aurora-beam beam-4" />
        <div className="aurora-beam beam-5" />
        <div className="aurora-beam beam-6" />
      </div>
      <section id="center">
        <div className="hero">
          <img
            src={voiceAgentLogo}
            className="hero-logo"
            width="170"
            height="170"
            alt="Autonomous AI Sales Voice Agent logo"
          />
        </div>
        <div className="hero-copy">
          <h1>AI Sales Voice Agent</h1>
          <p>
            Autonomous voice conversations that qualify leads, handle
            objections, and book meetings 24/7.
          </p>
        </div>
        <Microphone onTurnComplete={handleTurnComplete} />
      </section>

      <div className="ticks"></div>

      <section id="next-steps">
        <div id="docs">
          <svg
            className="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
          <h2>Core Capabilities</h2>
          <p>Built for natural, high-converting sales calls</p>
          <ul>
            <li>
              <a href="#qualify">Lead Qualification</a>
            </li>
            <li>
              <a href="#booking">Meeting Booking</a>
            </li>
            <li>
              <a
                href="#crm-dashboard"
                onClick={(e) => {
                  e.preventDefault()
                  setShowCrm((prev) => !prev)
                }}
              >
                {showCrm ? 'Hide CRM' : 'CRM Dashboard'}
              </a>
            </li>
          </ul>
        </div>
        <div id="social">
          <svg
            className="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <h2>Quick Launch</h2>
          <p>Configure your agent and go live in minutes</p>
          <ul>
            <li>
              <a href="#script">Sales Script</a>
            </li>
            <li>
              <a href="#voice">Voice Profile</a>
            </li>
            <li>
              <a href="#calls">Call Logs</a>
            </li>
          </ul>
        </div>
      </section>

      {showCrm && (
        <>
          <div className="ticks"></div>
          <CrmDashboard refreshKey={crmRefreshKey} />
        </>
      )}

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
