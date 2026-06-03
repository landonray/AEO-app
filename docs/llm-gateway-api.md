# LLM Gateway API Documentation

A unified API gateway for OpenAI, Anthropic (Claude), and Google Gemini. Use a single API format to access all providers with centrally managed keys, usage tracking, and cost reporting.

## Base URL

```
https://418e8e41-f2c5-4668-9288-05bf4383eab5-00-2qo8qplx7ur9c.janeway.replit.dev
```

## Authentication

Include your API key in the Authorization header as a Bearer token:

```
Authorization: Bearer llmgw_xxxxxxxxxxxxxxxx
```

API keys are project-scoped. Generate them from the dashboard after signing in. All usage is tracked per key, per project, per user.

---

## Endpoints

### List Models

`GET /api/v1/models`

Returns all available models with their provider and pricing information.

**Example:**
```bash
curl https://418e8e41-f2c5-4668-9288-05bf4383eab5-00-2qo8qplx7ur9c.janeway.replit.dev/api/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "models": [
    {
      "id": "gpt-5.4",
      "provider": "openai",
      "type": "chat",
      "pricing": {
        "input_per_1m_tokens": 2.5,
        "output_per_1m_tokens": 15
      }
    },
    {
      "id": "claude-sonnet-4-6",
      "provider": "anthropic",
      "type": "chat",
      "pricing": {
        "input_per_1m_tokens": 3,
        "output_per_1m_tokens": 15
      }
    },
    {
      "id": "gemini-2.5-flash",
      "provider": "gemini",
      "type": "chat",
      "pricing": {
        "input_per_1m_tokens": 0.3,
        "output_per_1m_tokens": 2.5
      }
    },
    {
      "id": "...",
      "provider": "...",
      "type": "chat",
      "pricing": {}
    }
  ]
}
```

**All chat models & pricing:**

| Model | Provider | Input / 1M tokens | Output / 1M tokens |
|-------|----------|-------------------|--------------------|
| gpt-5.5-pro | openai | $30.00 | $180.00 |
| gpt-5.5 | openai | $5.00 | $30.00 |
| gpt-5.4-pro | openai | $30.00 | $180.00 |
| gpt-5.4 | openai | $2.50 | $15.00 |
| gpt-5.4-mini | openai | $0.75 | $4.50 |
| gpt-5.4-nano | openai | $0.20 | $1.25 |
| gpt-5 | openai | $1.25 | $10.00 |
| gpt-5.2 | openai | $1.75 | $14.00 |
| gpt-4.1 | openai | $2.00 | $8.00 |
| gpt-4.1-mini | openai | $1.00 | $4.00 |
| gpt-4.1-nano | openai | $0.50 | $2.00 |
| claude-opus-4-8 | anthropic | $5.00 | $25.00 |
| claude-sonnet-4-6 | anthropic | $3.00 | $15.00 |
| claude-haiku-4-5 | anthropic | $1.00 | $5.00 |
| claude-opus-4-6 | anthropic | $5.00 | $25.00 |
| claude-sonnet-4-5 | anthropic | $3.00 | $15.00 |
| gemini-3.5-flash | gemini | $1.50 | $9.00 |
| gemini-2.5-flash | gemini | $0.30 | $2.50 |
| gemini-2.5-pro | gemini | $1.25 | $10.00 |
| gemini-3-flash-preview | gemini | $0.50 | $3.00 |
| gemini-3-pro-preview | gemini | $2.00 | $12.00 |
| gemini-3.1-pro-preview | gemini | $2.00 | $12.00 |
| gemini-3.1-flash-lite-preview | gemini | $0.25 | $1.50 |

---

### Chat Completion

`POST /api/v1/chat/completions`

Send a chat completion request. The gateway routes to the correct provider based on the model you specify.

**Example:**
```bash
curl -X POST https://418e8e41-f2c5-4668-9288-05bf4383eab5-00-2qo8qplx7ur9c.janeway.replit.dev/api/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "max_tokens": 1024,
    "run_id": "my-pipeline-run-001"
  }'
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| model | string | Yes | The model ID to use (determines provider automatically) |
| messages | array | Yes | Array of message objects with `role` and `content` |
| max_tokens | number | No | Maximum tokens in response (default: 1024) |
| temperature | number | No | Sampling temperature 0-2 (default: 1) |
| run_id | string | No | Group multiple requests into a run for cumulative cost tracking |
| tools | array | No | Tool/function definitions (OpenAI-compatible format, works across all providers) |
| tool_choice | string/object | No | Controls tool use: `"auto"`, `"none"`, `"required"`, or `{"type":"function","function":{"name":"..."}}` |
| stream | boolean | No | Set `true` for Server-Sent Events (SSE) streaming response |
| previous_response_id | string | No | For OpenAI `*-pro` reasoning models only — chain to a prior response so OpenAI keeps the conversation server-side. Send only the new user turn in `messages`. |
| response_format | object | No | OpenAI-shaped structured-output constraint. Works across all providers — see *Structured Output* section. |

**Response:**
```json
{
  "id": "resp_abc123",
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "content": "Hello! How can I help you today?",
  "finish_reason": "stop",
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 12,
    "total_tokens": 22
  },
  "estimated_cost": 0.00021,
  "run_total_cost": 0.00483,
  "response_id": "resp_abc123"
}
```

> `run_total_cost` is only present when `run_id` was included in the request. `response_id` is only present for OpenAI Responses-API models (e.g. `gpt-5.5-pro`, `gpt-5.4-pro`).

**Stateful conversations (gpt-5.5-pro / gpt-5.4-pro):**

These reasoning models route through OpenAI's `/v1/responses` endpoint. Save `response_id` from a turn and pass it as `previous_response_id` on the next request to continue the conversation — you only need to send the new user message:

```bash
# Turn 2 — continues from response_id of turn 1
curl -X POST https://418e8e41-f2c5-4668-9288-05bf4383eab5-00-2qo8qplx7ur9c.janeway.replit.dev/api/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.5-pro",
    "messages": [{"role": "user", "content": "Now make it cheaper."}],
    "previous_response_id": "resp_abc123"
  }'
```

**Structured output (`response_format`):**

Accepts OpenAI's `response_format` shape and translates it to each provider's native equivalent. Works on **all providers** — same call shape gives you JSON across OpenAI, Anthropic, and Gemini.

```json
{ "type": "json_object" }                                            // any valid JSON object
{ "type": "json_schema",
  "json_schema": { "name": "person", "strict": true,
                   "schema": { "type": "object", "required": ["name","age"],
                               "properties": { "name": {"type":"string"},
                                               "age":  {"type":"integer"} } } } }
```

- **OpenAI chat/Responses:** forwarded natively (Responses API as `text.format`). The native `json_object` requires at least one message to contain the word "json" — that's an OpenAI API requirement.
- **Anthropic:** `json_schema` is enforced by synthesizing a forced single-tool call whose input_schema is your schema; the gateway unwraps the tool input back into `content` so the response stays OpenAI-shaped. `json_object` injects a JSON-only system hint and strips any ```` ```json ``` ```` fences from the reply.
- **Gemini:** translated to `responseMimeType` + `responseSchema`.
- **Conflict:** combining `json_schema` with caller-supplied `tools` returns 400 on Anthropic and Gemini (those providers can't do both at once). OpenAI accepts both.
- **Streaming:** schema-mode streams content deltas as usual. Anthropic `json_object` mode buffers and emits the fence-stripped result in a single chunk.

```bash
curl -X POST https://418e8e41-f2c5-4668-9288-05bf4383eab5-00-2qo8qplx7ur9c.janeway.replit.dev/api/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "messages": [{"role": "user", "content": "Make up a person."}],
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "person",
        "strict": true,
        "schema": { "type": "object", "required": ["name","age"],
                    "properties": { "name": {"type":"string"}, "age": {"type":"integer"} } }
      }
    }
  }'
```

---

### Streaming

Set `"stream": true` in your chat completion request to receive Server-Sent Events (SSE). The format is OpenAI-compatible and works with all providers.

Each chunk is sent as a `data:` line, ending with `data: [DONE]`.

**Example:**
```bash
curl -X POST https://418e8e41-f2c5-4668-9288-05bf4383eab5-00-2qo8qplx7ur9c.janeway.replit.dev/api/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

**SSE chunk format:**
```
data: {"id":"msg-123","object":"chat.completion.chunk","model":"claude-sonnet-4-6","provider":"anthropic","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"msg-123","object":"chat.completion.chunk","model":"claude-sonnet-4-6","provider":"anthropic","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**Python streaming example:**
```python
import requests, json

response = requests.post("https://418e8e41-f2c5-4668-9288-05bf4383eab5-00-2qo8qplx7ur9c.janeway.replit.dev/api/v1/chat/completions",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={"model": "claude-sonnet-4-6", "messages": [{"role": "user", "content": "Hello!"}], "stream": True},
    stream=True
)
for line in response.iter_lines():
    if line and line.startswith(b"data: "):
        data = line[6:]
        if data == b"[DONE]": break
        chunk = json.loads(data)
        content = chunk["choices"][0]["delta"].get("content", "")
        print(content, end="", flush=True)
```

---

### Vision / Multimodal

Send images alongside text using the same `POST /api/v1/chat/completions` endpoint. All providers support vision. The gateway translates the OpenAI-compatible format automatically for Anthropic and Gemini.

Instead of a plain string for `content`, pass an array of content parts:

**Image via URL:**
```json
{
  "model": "gpt-4.1",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What is in this image?"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/photo.jpg"
          }
        }
      ]
    }
  ]
}
```

**Image via Base64:**
```json
{ "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KGgo..." } }
```

Supported formats: JPEG, PNG, GIF, WebP. Include multiple `image_url` parts for multi-image requests.

| Part Type | Fields | Description |
|-----------|--------|-------------|
| text | `text`: string | Text content |
| image_url | `image_url.url`: string | HTTPS URL or base64 data URI |

---

### Tool Use / Function Calling

The gateway supports tool use across all providers using a unified OpenAI-compatible format.

**Request with tools:**
```json
{
  "model": "claude-sonnet-4-6",
  "messages": [
    {
      "role": "user",
      "content": "What is the weather in San Francisco?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "City name"
            }
          },
          "required": [
            "location"
          ]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

**Response with tool calls:**
```json
{
  "id": "resp_abc123",
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "content": null,
  "tool_calls": [
    {
      "id": "call_xyz789",
      "type": "function",
      "function": {
        "name": "get_weather",
        "arguments": "{\"location\":\"San Francisco\"}"
      }
    }
  ],
  "finish_reason": "tool_calls",
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 25,
    "total_tokens": 75
  },
  "estimated_cost": 0.00053
}
```

**Sending tool results back:**

Include the assistant's tool_calls message and a `tool` role message with the result:
```json
{
  "model": "claude-sonnet-4-6",
  "messages": [
    {
      "role": "user",
      "content": "What is the weather in San Francisco?"
    },
    {
      "role": "assistant",
      "content": null,
      "tool_calls": [
        {
          "id": "call_xyz789",
          "type": "function",
          "function": {
            "name": "get_weather",
            "arguments": "{\"location\":\"San Francisco\"}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_xyz789",
      "name": "get_weather",
      "content": "72°F, sunny"
    }
  ]
}
```

**Gemini 3 thought signatures:**

Gemini 3 models may return a `thought_signature` field on tool calls. You **must** pass it back in the assistant message when sending tool results:
```json
{
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "get_weather",
        "arguments": "..."
      },
      "thought_signature": "eyJhbGciOi..."
    }
  ]
}
```

> `thought_signature` is only returned by Gemini 3 models. OpenAI and Anthropic do not use it.

**tool_choice options:**

| Value | Behavior |
|-------|----------|
| `"auto"` | Model decides whether to call tools (default) |
| `"none"` | Model will not call any tools |
| `"required"` | Model must call at least one tool |
| `{"type":"function","function":{"name":"..."}}` | Force a specific tool |

---

### Embeddings

`POST /api/v1/embeddings`

Generate vector embeddings for text input. Useful for semantic search, clustering, and similarity comparisons.

**Example:**
```bash
curl -X POST https://418e8e41-f2c5-4668-9288-05bf4383eab5-00-2qo8qplx7ur9c.janeway.replit.dev/api/v1/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-004",
    "input": "The quick brown fox jumps over the lazy dog"
  }'
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| model | string | Yes | Embedding model ID |
| input | string or string[] | Yes | Text or array of texts to embed |
| dimensions | number | No | Output vector dimensions (model-dependent) |

**Response:**
```json
{
  "model": "text-embedding-004",
  "embeddings": [
    {
      "embedding": [
        0.0123,
        -0.0456
      ],
      "index": 0
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "total_tokens": 10
  },
  "estimated_cost": 0.000001
}
```

**Batch embedding** — pass an array of strings:
```json
{ "model": "text-embedding-004", "input": ["first text", "second text", "third text"] }
```

---

### Image Generation

`POST /api/v1/images/generations`

Generate images from text prompts. Images are returned as base64-encoded data. OpenAI's flagship `gpt-image-2` supports thousands of resolutions up to 4K and is priced per image based on size and quality.

**Example:**
```bash
curl -X POST https://418e8e41-f2c5-4668-9288-05bf4383eab5-00-2qo8qplx7ur9c.janeway.replit.dev/api/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "A serene mountain landscape at sunset",
    "size": "1024x1024",
    "quality": "medium"
  }'
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| model | string | Yes | Image model ID (gpt-image-1, gpt-image-2, gemini-2.5-flash-image, gemini-3.1-flash-image-preview, imagen-4.0-generate-001) |
| prompt | string | Yes | Text description of the desired image |
| n | number | No | Number of images to generate (1-10, default: 1) |
| size | string | No | Image size. OpenAI gpt-image-2: 1024x1024, 1536x1024, 1024x1536, 2048x2048, 2048x1152, 3840x2160, 2160x3840, auto, or any resolution that satisfies the constraints (max edge ≤ 3840px, multiples of 16, ratio ≤ 3:1, total pixels 655,360-8,294,400). OpenAI gpt-image-1: 1024x1024, 1536x1024, 1024x1536, auto. Gemini: aspect ratios (1:1, 16:9, 9:16, etc.) or resolution keyword (512, 1K, 2K) — OpenAI pixel dimensions auto-translate. |
| quality | string | No | Image quality (OpenAI: low, medium, high, auto) |
| background | string | No | Background type. OpenAI gpt-image-1: transparent, opaque, auto. OpenAI gpt-image-2: opaque or auto only (transparent not supported). |
| output_format | string | No | OpenAI gpt-image-2 only: png (default), jpeg, or webp |
| output_compression | number | No | OpenAI gpt-image-2 only: 0-100 compression level for jpeg/webp |
| moderation | string | No | OpenAI only: auto (default) or low — content filtering strictness |
| run_id | string | No | Optional run ID for cost tracking |
| previous_response_id | string | No | OpenAI image models only: `response_id` from a prior call. Continues that image conversation server-side so you can edit / refine the previous image ("make it blue", "render at 4K") without resending the original prompt. |
| image | string \| string[] | No | OpenAI image models only: one or more input images to **edit**. Each entry is either a fully-qualified URL (https://...) or a Base64 data URL (`data:image/png;base64,...`). Combine with `prompt` (e.g. "give this cat a hat") to modify your own image. |

**Response:**
```json
{
  "model": "gpt-image-2",
  "provider": "openai",
  "images": [
    {
      "b64_json": "/9j/4AAQ...",
      "index": 0,
      "response_id": "resp_abc123"
    }
  ],
  "estimated_cost": 0.053,
  "response_id": "resp_abc123",
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 1,
    "total_tokens": 13
  }
}
```

OpenAI only — every image carries its own `response_id`. Pass that ID back as `previous_response_id` on a follow-up call to keep editing *that specific image*. The top-level `response_id` mirrors the last image's ID for convenience when `n=1`. `usage` reports token counts for the host model that orchestrates the image tool; image-pixel cost is already included in `estimated_cost`.

**Python example:**
```python
import requests, base64

response = requests.post("https://418e8e41-f2c5-4668-9288-05bf4383eab5-00-2qo8qplx7ur9c.janeway.replit.dev/api/v1/images/generations",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={"model": "gpt-image-2", "prompt": "A cute robot painting", "size": "1024x1024", "quality": "medium"}
)
data = response.json()
image_bytes = base64.b64decode(data["images"][0]["b64_json"])
with open("output.png", "wb") as f:
    f.write(image_bytes)
```

### Audio Transcription

`POST /api/v1/audio/transcriptions`

Transcribe audio files to text using OpenAI's speech-to-text models. Supports files up to 25 MB in flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, or webm format. Send as multipart/form-data.

**Example:**
```bash
curl -X POST https://418e8e41-f2c5-4668-9288-05bf4383eab5-00-2qo8qplx7ur9c.janeway.replit.dev/api/v1/audio/transcriptions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F file=@recording.mp3 \
  -F model=whisper-1
```

**Parameters (multipart/form-data):**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| file | file | Yes | The audio file to transcribe (max 25 MB) |
| model | string | No | Transcription model (whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe). Default: whisper-1 |
| language | string | No | Language code in ISO-639-1 (e.g. `en`, `es`, `fr`). Improves accuracy. |
| prompt | string | No | Optional text to guide the model's style or provide context |
| response_format | string | No | Output format: `json` (default), `text`, `srt`, `vtt`, `verbose_json` |
| temperature | number | No | Sampling temperature (0-1). Default: 0 |
| timestamp_granularities | string[] | No | `word` and/or `segment` (requires `verbose_json` format) |

**Response (json format):**
```json
{
  "text": "Hello, this is a transcription of the audio file.",
  "model": "whisper-1",
  "provider": "openai",
  "duration": 12.5,
  "estimated_cost": 0.00125,
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

**Python example:**
```python
import requests

response = requests.post("https://418e8e41-f2c5-4668-9288-05bf4383eab5-00-2qo8qplx7ur9c.janeway.replit.dev/api/v1/audio/transcriptions",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    files={"file": open("recording.mp3", "rb")},
    data={"model": "whisper-1"}
)
print(response.json()["text"])
```

**Notes:**
- `whisper-1` is billed per minute of audio ($0.006/min)
- `gpt-4o-transcribe` and `gpt-4o-mini-transcribe` are billed per token and return token usage in the response
- For large files, ensure your HTTP client has an adequate timeout (transcription can take a while)
- `verbose_json` format returns additional fields: `duration`, `language`, `segments`, and optionally `words`

---

## Supported Models & Pricing

### Chat Models

Prices per 1M tokens.

**Openai**

| Model | Input | Output |
|-------|-------|--------|
| gpt-5.5-pro | $30.00 | $180.00 |
| gpt-5.5 | $5.00 | $30.00 |
| gpt-5.4-pro | $30.00 | $180.00 |
| gpt-5.4 | $2.50 | $15.00 |
| gpt-5.4-mini | $0.75 | $4.50 |
| gpt-5.4-nano | $0.20 | $1.25 |
| gpt-5 | $1.25 | $10.00 |
| gpt-5.2 | $1.75 | $14.00 |
| gpt-4.1 | $2.00 | $8.00 |
| gpt-4.1-mini | $1.00 | $4.00 |
| gpt-4.1-nano | $0.50 | $2.00 |

**Anthropic**

| Model | Input | Output |
|-------|-------|--------|
| claude-opus-4-8 | $5.00 | $25.00 |
| claude-sonnet-4-6 | $3.00 | $15.00 |
| claude-haiku-4-5 | $1.00 | $5.00 |
| claude-opus-4-6 | $5.00 | $25.00 |
| claude-sonnet-4-5 | $3.00 | $15.00 |

**Gemini**

| Model | Input | Output |
|-------|-------|--------|
| gemini-3.5-flash | $1.50 | $9.00 |
| gemini-2.5-flash | $0.30 | $2.50 |
| gemini-2.5-pro | $1.25 | $10.00 |
| gemini-3-flash-preview | $0.50 | $3.00 |
| gemini-3-pro-preview | $2.00 | $12.00 |
| gemini-3.1-pro-preview | $2.00 | $12.00 |
| gemini-3.1-flash-lite-preview | $0.25 | $1.50 |

### Embedding Models

| Model | Price per 1M tokens |
|-------|---------------------|
| text-embedding-004 | $0.10 |
| gemini-embedding-001 | $0.15 |

### Image Models

Flat-priced models charge per image. Tiered models (`gpt-image-2`) charge based on size and quality.

| Model | Provider | Price per Image |
|-------|----------|-----------------|
| gpt-image-1 | openai | $0.040 |
| gemini-2.5-flash-image | gemini | $0.020 |
| gemini-3.1-flash-image-preview | gemini | $0.067 |
| imagen-4.0-generate-001 | gemini | $0.030 |

**gpt-image-2** (openai) — tiered pricing per image

| Quality | 1024x1024 | 1024x1536 | 1536x1024 |
|---------|-------|-------|-------|
| low | $0.006 | $0.005 | $0.005 |
| medium | $0.053 | $0.041 | $0.041 |
| high | $0.211 | $0.165 | $0.165 |
| (other sizes) | fallback $0.053 per image |


### Audio Transcription Models

| Model | Provider | Pricing |
|-------|----------|---------|
| whisper-1 | openai | $0.0060/min |
| gpt-4o-transcribe | openai | $40.00 input / $100.00 output per 1M tokens |
| gpt-4o-mini-transcribe | openai | $5.00 input / $20.00 output per 1M tokens |

---

## Features

- **Unified API**: Single format for all providers. Use OpenAI-compatible request/response structure.
- **Multi-provider**: OpenAI, Anthropic (Claude), Google Gemini — just change the model name.
- **Streaming**: SSE streaming in OpenAI-compatible format across all providers.
- **Vision/Multimodal**: Send images via URL or base64 with text to any model.
- **Tool use / Function calling**: OpenAI-compatible tool definitions work across all providers.
- **Embeddings**: Vector embeddings via Gemini embedding models.
- **Image generation**: Text-to-image via OpenAI and Gemini models.
- **Audio transcription**: Speech-to-text via OpenAI Whisper and GPT-4o transcribe models.
- **Run ID tracking**: Group related API calls and track cumulative costs per workflow.
- **Project-scoped keys**: Isolate API keys per project for organized usage tracking.
- **Cost tracking**: Every request logged with token counts and estimated costs.
