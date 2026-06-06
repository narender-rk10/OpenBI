# OpenBI Telegram Bot

The OpenBI Telegram Bot lets you chat with your AI agents, view dashboards, and download PDF / PPTX reports — all without opening the web app.

---

## Quick Start

### 1. Get your API key

Open the OpenBI web app → **Settings → API** → copy your API key.

### 2. Start the bot

Find your bot on Telegram and send:

```
/start
```

### 3. Connect your account

```
/connect sk-abc123yourapikey
```

You'll see:
```
✅ Connected as Narender!

Type /projects to pick a project.
```

### 4. Select a project

```
/projects
```

The bot shows numbered inline buttons:

```
📁 Your Projects — tap to select:
[ 1. Sales Analytics  ]
[ 2. Marketing        ]
[ 3. HR Dashboard     ]
```

Tap a button — or type `/use Sales Analytics`.

### 5. Select an agent

```
/agents
```

```
🤖 Agents (current: none) — tap to select:
[ 1. Sales Agent   ]
[ 2. Support Agent ]
```

Tap one. You're ready to chat.

### 6. Start chatting

Just type any message:

```
What were our top 5 products last month?
```

```
📊 Here are your top 5 products by revenue last month:

1. Product A — $142,000
2. Product B — $98,500
3. Product C — $87,200
4. Product D — $76,000
5. Product E — $65,300

[chart image attached]
```

---

## All Commands

| Command | Description |
|---|---|
| `/start` | Welcome message and setup instructions |
| `/help` | Show all commands |
| `/connect <api_key>` | Link your OpenBI account |
| `/disconnect` | Unlink your account |
| `/status` | Show current connection, project, agent, session |
| `/projects` | List projects with tap-to-select buttons |
| `/use <name>` | Switch to a project by name |
| `/agents` | List agents with tap-to-select buttons |
| `/dashboards` | Browse dashboards — tap to view as images |
| `/report pdf` | Generate and send a dashboard as PDF |
| `/report pptx` | Generate and send a dashboard as PPTX |
| `/report` | Pick format (PDF / PPTX) then dashboard |
| `/newchat` | Start a fresh conversation (clears history) |
| `/kbs` | List knowledge bases |
| `/run <template>` | Run a report template |

---

## Commands in Detail

### `/connect`

Links your Telegram account to OpenBI using an API key.

```
/connect sk-abc123yourapikey
```

**Response:**
```
✅ Connected as Narender!

Type /projects to pick a project.
```

---

### `/status`

Shows your current connection state at a glance.

```
/status
```

**Response:**
```
👤 Narender
📁 Project: Sales Analytics
🤖 Agent: Sales Agent
💬 Active chat session: Yes
```

---

### `/projects`

Lists all your projects as tap-to-select inline buttons.

```
/projects
```

**Response:**
```
📁 Your Projects — tap to select:
[ 1. Sales Analytics ]
[ 2. Marketing       ]
[ 3. HR Dashboard    ]
```

Tap any button to switch to that project.

---

### `/use`

Switch to a project by typing its name directly.

```
/use Marketing
```

**Response:**
```
✅ Active project: Marketing

Type /agents to pick an agent.
```

> Switching projects automatically clears the active agent and chat session.

---

### `/agents`

Lists all agents in the current project with tap-to-select buttons.

```
/agents
```

**Response:**
```
🤖 Agents (current: Sales Agent) — tap to select:
[ 1. Sales Agent   ]
[ 2. Support Agent ]
[ 3. Data Analyst  ]
```

Switching agents starts a new conversation automatically.

---

### `/dashboards`

Lists all dashboards. Tap one to receive it as a set of chart images.

```
/dashboards
```

**Response:**
```
📊 Dashboards — tap to view as images:
[ 1. Sales Overview    ]
[ 2. Monthly Revenue   ]
[ 3. Customer Funnel   ]
```

Tap **2. Monthly Revenue** and the bot sends up to 10 chart images from that dashboard.

---

### `/report`

Export a dashboard as a file. Supports PDF and PPTX.

**Pick format interactively:**
```
/report
```
```
📤 Export dashboard as:
[ 📄 PDF ]  [ 📊 PPTX ]
```

Tap **PDF** → the bot shows the dashboard list:
```
Select a dashboard for PDF export:
[ 1. Sales Overview  ]
[ 2. Monthly Revenue ]
[ 3. Customer Funnel ]
```

Tap a dashboard → the file is generated and sent as a document to the chat.

**Skip the format prompt:**
```
/report pdf
```
```
/report pptx
```

Both go directly to the dashboard selection list.

**What you receive:**
- **PDF** — server-rendered PDF with all chart widgets, using the current dashboard filters
- **PPTX** — AI-generated PowerPoint presentation with charts, summaries, and slide titles

---

### `/newchat`

Clears the current conversation session and starts fresh. Use this when you want to ask questions on a completely different topic.

```
/newchat
```

**Response:**
```
🆕 New conversation started. Ask me anything!
```

Without `/newchat`, every message you send is part of the same conversation — the agent remembers what was said earlier in the session.

---

### `/kbs`

Lists all knowledge bases in the current project with source counts.

```
/kbs
```

**Response:**
```
🧠 Knowledge Bases:

• Product Docs — 3 source(s)
• Support FAQs — 7 source(s)
• Onboarding Guide — 1 source(s)
```

> To add sources or create knowledge bases, use the web app.

---

### `/run`

Runs a report template with optional parameters and returns a link to the generated dashboard.

```
/run Monthly_Sales_Report
```

**With parameters:**
```
/run Regional_Report region=APAC month=May
```

**Response:**
```
✅ Template executed!
http://localhost:3000/projects/abc123/dashboards/def456
```

---

## Conversational Chat

After selecting a project and agent, just type any message to chat. The bot maintains full conversation history within a session — you can ask follow-up questions naturally.

### Example: Multi-turn conversation

```
You:   What were our top products last month?

Bot:   Top 5 products by revenue in April:
       1. Product A — $142,000
       2. Product B — $98,500
       ...

You:   How does that compare to March?

Bot:   Comparing April vs March:
       Product A grew 12% (from $126,800)
       Product B declined 3% (from $101,500)
       ...

You:   Which region drove the most growth for Product A?

Bot:   The APAC region was the primary driver with 68% of
       Product A's April growth, mainly from Japan (+$9,200).
```

The agent remembers the full context — "that", "it", "those" all refer back correctly.

### Using `@` to target a specific agent

```
@SalesAgent What is the current ARR?
@DataAnalyst Show me a breakdown by country
```

### Starting a fresh conversation

```
/newchat
```

After `/newchat`, the next message starts a completely new session with no prior context.

---

## Dashboard Images

When you tap a dashboard via `/dashboards`, the bot renders each chart widget server-side and sends them as a photo album (up to 10 images).

**Example flow:**
```
/dashboards
→ [ 1. Sales Overview ] ← tap this
→ 📸 Loading Sales Overview…
→ [photo: Revenue by Month]
→ [photo: Top Products]
→ [photo: Regional Breakdown]
```

---

## PDF and PPTX Reports

### PDF

- Generated server-side using matplotlib — no browser required
- All chart widgets from the dashboard are rendered into pages
- Respects current dashboard filters and data

### PPTX

- AI-generated presentation (LLM creates slide titles, summaries, and content)
- Charts are embedded as native PowerPoint chart objects — fully editable
- Generation takes 30–90 seconds depending on dashboard complexity
- During generation the bot shows: `⏳ Generating PPTX for Sales Overview…`

Both files are sent directly to the Telegram chat as downloadable documents.

---

## Disconnecting

```
/disconnect
```

Clears all local session data (JWT, project, agent, chat session). Use `/connect` again to reconnect.

---

## Setup & Configuration (for admins)

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | **Required.** Bot token from [@BotFather](https://t.me/BotFather) |
| `API_BASE_URL` | `http://backend:8000` | OpenBI backend URL (internal Docker network) |
| `APP_URL` | `http://localhost:3000` | Public OpenBI web app URL (used in template links) |

### docker-compose.yml

```yaml
telegram_bot:
  build:
    context: .
    dockerfile: telegram_bot/Dockerfile.telegram
  environment:
    TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
    API_BASE_URL: http://backend:8000
    APP_URL: ${APP_URL:-http://localhost:3000}
  depends_on:
    backend:
      condition: service_healthy
```

### Getting a bot token

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Follow the prompts — you'll get a token like `7123456789:AAFxxxxx`
4. Add it to your `.env` file:
   ```
   TELEGRAM_BOT_TOKEN=7123456789:AAFxxxxx
   ```
5. Restart: `docker compose up -d --build telegram_bot`

### Getting an API key

1. Log in to the OpenBI web app
2. Go to **Settings → API**
3. Copy your key and send it to the bot with `/connect`

---

## Troubleshooting

### Bot doesn't respond

- Check the token: `docker compose logs telegram_bot`
- Confirm `TELEGRAM_BOT_TOKEN` is set in `.env`

### `/connect` returns "Invalid API key"

- Regenerate the key in **Settings → API**
- Make sure you copied the full key with no spaces

### `/report pptx` times out

- PPTX generation takes 30–120 seconds. The bot waits up to 5 minutes.
- If the LLM API key is missing or wrong, it will fail immediately with an error message.

### Chart images are blank

- The dashboard render endpoint uses server-side matplotlib. 
- Make sure at least one widget has type `chart` and valid data.

### Switching projects or agents starts a new chat

- This is intentional. Sessions are scoped to a project + agent combination.
- Use `/status` to confirm your current setup before chatting.

---

## Full Workflow Example

```
/start
→ Welcome to OpenBI! Connect with /connect <api_key>

/connect sk-myapikey123
→ ✅ Connected as Narender!

/projects
→ 📁 Your Projects — tap to select:
  [ 1. Sales Analytics ]
  [ 2. Marketing       ]

[tap 1. Sales Analytics]
→ ✅ Active project: Sales Analytics

/agents
→ 🤖 Agents (current: none) — tap to select:
  [ 1. Sales Agent ]

[tap 1. Sales Agent]
→ ✅ Agent set to Sales Agent. Start chatting!

What is our MRR this month?
→ Your MRR for May 2026 is $284,500, up 8% from April.
  [chart image]

Break it down by plan tier.
→ MRR by plan tier for May 2026:
  - Enterprise: $180,000 (63%)
  - Pro: $72,000 (25%)
  - Starter: $32,500 (11%)

/report pdf
→ Select a dashboard for PDF export:
  [ 1. Sales Overview  ]
  [ 2. MRR Breakdown   ]

[tap 2. MRR Breakdown]
→ ⏳ Generating PDF for MRR Breakdown…
→ 📄 MRR_Breakdown.pdf  [file sent]

/newchat
→ 🆕 New conversation started. Ask me anything!

/status
→ 👤 Narender
  📁 Project: Sales Analytics
  🤖 Agent: Sales Agent
  💬 Active chat session: No
```
