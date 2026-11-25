# VoxLead AI — Autonomous AI Sales Voice Agent

An autonomous AI sales voice assistant for an electronics showroom. Customers speak naturally in the browser, and the agent understands intent, searches a 2,000-product Excel catalog, remembers conversation context, qualifies leads (`HOT` / `WARM` / `COLD`), books showroom appointments, and speaks responses back aloud.

---

## How It Works

1. **Voice Capture (Frontend — `Microphone.jsx`)**
   - Uses the browser **Web Speech API** (`SpeechRecognition`) to transcribe speech into text and **Web Audio API** (`AnalyserNode`) to animate the live sound wave bar.
   - Assigns a persistent `sessionId` (saved in `localStorage`) and sends `{ transcript, sessionId }` to the backend via Axios (`POST /api/conversation/transcript`).

2. **Intent & Entity Extraction (`supervisorAgent.js`)**
   - Uses **LangChain + Gemini 3+** (with automatic fallback across `gemini-3.5-flash` → `gemini-3.5-flash-lite` → `gemini-3.0-pro` in `geminiClient.js`).
   - Classifies the customer's intent (`GENERAL_QUERY`, `PRODUCT_ENQUIRY`, `PRODUCT_RECOMMENDATION`, `PRICE_ENQUIRY`, `COMPARISON`, `WARRANTY_ENQUIRY`, `APPOINTMENT_BOOKING`, `HUMAN_HANDOFF`) and extracts structured entities (`category`, `brand`, `budget`, `productName`, `date`, `appointmentTime`, `customerName`, `phone`, `otherRequirements`).

3. **Memory, Lead Qualification & Routing (`conversationRoutes.js`)**
   - **Conversation Memory (`memoryService.js`)**: Saves turn history, customer profile, preferences, and partial appointment details per `sessionId` in `backend/data/sessions.json`.
   - **Lead Qualification (`leadService.js`)**: Scores each session as `HOT`, `WARM`, or `COLD` based on buying intent, budget, and timeline, and stores leads in `backend/data/leads.json`.
   - **Action Handling**:
     - **Product Queries**: Searches `backend/data/products.xlsx` via `productService.js` and generates a grounded spoken response via `responseService.js`.
     - **Appointment Booking**: Collects missing details (`date`, `appointmentTime`, `customerName`, `phone`) one at a time and saves requests via `appointmentService.js`.
     - **Human Handoff**: Logs escalation requests with conversation history via `handoffService.js`.

4. **Text-to-Speech & CRM Dashboard (Frontend)**
   - **TTS (`Microphone.jsx`)**: Speaks the AI's reply using the browser's `SpeechSynthesis` API with natural voice ranking, sentence chunking, and **Play / Stop / Replay / Voice** controls.
   - **CRM Dashboard (`CrmDashboard.jsx`)**: Fetches `GET /api/crm/overview` (`crmRoutes.js`) to display `HOT`, `WARM`, and `COLD` leads, budgets, timelines, and notes.

---

## Project Structure

```text
voice-agent/
├── backend/
│   ├── data/products.xlsx          # 2,000-item electronics catalog
│   ├── routes/
│   │   ├── conversationRoutes.js   # Main voice transcript pipeline
│   │   └── crmRoutes.js            # CRM overview endpoint
│   ├── services/
│   │   ├── geminiClient.js         # Gemini 3+ fallback client
│   │   ├── productService.js       # Excel loader & product search
│   │   ├── responseService.js      # Voice-friendly reply generator
│   │   ├── memoryService.js        # Session & preference memory
│   │   ├── leadService.js          # HOT/WARM/COLD lead scoring
│   │   ├── appointmentService.js   # Showroom appointment storage
│   │   └── handoffService.js       # Human handoff storage
│   ├── supervisorAgent.js          # Intent & entity classifier
│   └── index.js                    # Express server (port 3000)
└── frontend/
    └── src/
        ├── components/
        │   ├── Microphone.jsx      # Voice wave, STT, and TTS controls
        │   └── CrmDashboard.jsx    # Lead qualification dashboard
        ├── services/api.js         # Axios API client
        └── App.jsx                 # Main UI & aurora background
```

---

## Setup & Run

### 1. Backend
```bash
cd backend
npm install
```
Create `backend/.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```
Start the backend:
```bash
npm start
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
Open the Vite URL (usually `http://localhost:5173`) in Chrome or Edge, click **Start Voice Demo**, and start speaking.
