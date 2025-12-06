# AI Chat Backend

A secure and scalable backend service for handling AI chat requests with OpenAI and Anthropic APIs.

## System Architecture

### Authentication Flow

1. Client sends authentication request to `/auth` endpoint with:

   - `x-signature`: HMAC signature of `${appIdentifier}${timestamp}${nonce}`
   - `x-timestamp`: Current timestamp
   - `x-nonce`: Unique request identifier
   - `x-api-key`: API key for client identification

2. Server validates the request:

   - Verifies all required headers are present
   - Validates timestamp is within 5 minutes
   - Checks if nonce was previously used
   - Validates HMAC signature using API key

3. If validation successful:
   - Server generates encrypted HMAC secret
   - Returns secret to client
   - Client stores secret securely for future requests

### Request Flow

1. Client prepares request:

   - Generates timestamp and nonce
   - Creates HMAC signature using stored secret
   - Includes all required headers

2. Server processes request:
   - Validates HMAC signature
   - Checks rate limits
   - Processes request through appropriate AI service
   - Returns response to client

### Security Features

- HMAC authentication for all requests
- Rate limiting per user/IP
- Request timestamp validation
- Nonce-based replay attack prevention
- Secure headers with Helmet
- CORS protection
- Firebase authentication (optional)

## Folder Structure

```
src/
├── config/                 # Configuration files
│   └── env.validator.ts   # Environment variable validation
│
├── middleware/            # Express middlewares
│   ├── audit.middleware.ts     # Request logging
│   ├── error.middleware.ts     # Error handling
│   ├── hmac.middleware.ts      # HMAC authentication
│   └── rate-limit.middleware.ts # Rate limiting
│
├── routes/               # API routes
│   ├── ai.routes.ts     # AI-related endpoints
│   └── auth.routes.ts   # Authentication endpoints
│
├── services/            # Business logic
│   ├── auth.service.ts        # Authentication service
│   ├── openai-chat.service.ts # OpenAI integration
│   ├── anthropic-chat.service.ts # Anthropic integration
│   ├── gemini-chat.service.ts # Gemini integration
│   ├── vision.service.ts      # Image analysis
│   ├── fal-ai.service.ts      # Fal.ai integration
│   └── replicate.service.ts   # Replicate.ai integration
│
└── server.ts            # Main application entry

expoparts/ (Client Side)
├── helpers/             # Utility functions
│   └── api-client.ts   # API client with HMAC auth
│
├── hooks/              # React hooks
│   ├── useChat.ts     # Chat functionality
│   ├── useGenerate.ts # Image generation
│   └── useIdentifier.ts # Image identification
│
└── store/             # State management
    └── slices/       # Redux slices
```

## Environment Variables

### Server-side (.env)

```env
# Environment
NODE_ENV=development
PORT=3000

# Application
APP_IDENTIFIER=your-app-identifier

# MAX_TOKENS
MAX_TOKENS=500

# Security
API_KEY=your-api-key
HMAC_SECRET_KEY=your-hmac-secret-key

# Rate Limits
AUTH_LIMIT=1     # Auth requests per 5 minutes
PROMPT_LIMIT=20  # AI requests per 5 minutes

# AI Provider Keys
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
FAL_API_KEY=your-fal-api-key
REPLICATE_API_KEY=your-replicate-api-key
GOOGLE_API_KEY=your-google-api-key
```

### Client-side (.env)

```env
EXPO_PUBLIC_API_URL=your-api-url
EXPO_PUBLIC_API_KEY=your-api-key
```

## API Endpoints

### Authentication

```http
POST /auth
Headers:
  x-signature: <hmac_signature>
  x-timestamp: <timestamp>
  x-nonce: <nonce>
  x-api-key: <api_key>
```

### AI Chat

```http
POST /api_url/openai
POST /api_url/openai/stream
POST /api_url/anthropic
POST /api_url/anthropic/stream
POST /api_url/gemini
POST /api_url/gemini/stream
Headers:
  x-signature: <hmac_signature>
  x-timestamp: <timestamp>
  x-nonce: <nonce>
Body:
  {
    "prompt": "Your message"
  }
```

### Image Generation

```http
POST /api_url/fal/generate
POST /api_url/replicate/generate
Headers:
  x-signature: <hmac_signature>
  x-timestamp: <timestamp>
  x-nonce: <nonce>
Body:
  {
    "prompt": "Your message"
  }
```

### Image Analysis

```http
POST /api_url/ai/vision
Headers:
  x-signature: <hmac_signature>
  x-timestamp: <timestamp>
  x-nonce: <nonce>
Body:
  {
    "prompt": "Describe this image",
    "imageUrl": "https://example.com/image.jpg"
  }
```

## Security Best Practices

1. All requests must include HMAC authentication
2. Timestamps must be within 5 minutes of server time
3. Nonces can only be used once
4. HMAC secrets are encrypted and stored securely
5. Rate limiting prevents abuse
6. CORS restricts allowed origins
7. Helmet provides additional security headers

## Error Handling

- All errors are properly logged and tracked
- Standardized error responses
- Rate limit notifications
- Authentication failure details
- Validation error messages
