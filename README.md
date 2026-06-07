# Xiaomi MiMo Proxy

A transparent proxy that intercepts Xiaomi MiMo API requests to automatically cache and inject `reasoning_content` across multi-turn conversations, so Agent tools (Claude Code, Cursor, etc.) work seamlessly.

## Why

Xiaomi MiMo Agent products require `reasoning_content` to be passed back in multi-turn conversations. Without it, the API returns 400 errors. Most Agent tools don't do this by default — this proxy handles it automatically.

## Quick Start

```bash
# Install
npm install

# Configure
cp .env.example .env
# Edit .env — set MIMO_BASE_URL to your Xiaomi API endpoint

# Run
python proxy.py start
```

## Usage

```bash
python proxy.py start    # Start proxy
python proxy.py stop     # Stop proxy
python proxy.py restart  # Restart proxy
python proxy.py status   # Check status
python proxy.py logs     # View logs
```

## Configure Your Agent

Point your Agent tool's base URL to the proxy:

```json
{
  "apiProvider": "anthropic",
  "baseUrl": "http://localhost:3000",
  "apiKey": "your_mimo_api_key"
}
```

## Supported Endpoints

| Endpoint | Protocol | Target URL |
|----------|----------|------------|
| `/v1/messages` | Anthropic | `{MIMO_BASE_URL}/v1/messages` |
| `/v1/chat/completions` | OpenAI | `{MIMO_BASE_URL}/v1/chat/completions` |

## How It Works

```
Agent → Proxy (cache/inject reasoning_content) → Xiaomi MiMo API
```

1. Intercepts requests and responses
2. Extracts and caches `reasoning_content` per conversation
3. Injects historical `reasoning_content` into subsequent requests
4. Forwards to Xiaomi API with the correct URL per protocol

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MIMO_BASE_URL` | `https://api.xiaomimimo.com` | Xiaomi API base URL |
| `PROXY_PORT` | `3000` | Proxy listen port |
| `CACHE_MAX_SIZE` | `1000` | Max cached conversations |
| `CACHE_TTL_HOURS` | `24` | Cache expiration hours |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/stats` | GET | Cache statistics |
| `/cache/clear` | POST | Clear all caches |

## License

MIT
