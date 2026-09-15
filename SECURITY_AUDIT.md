# SECURITY AUDIT

## 1. Authentication & Authorization
- **[LOW] Mobile JWT Handling**: The mobile app uses `AsyncStorage` for Supabase session persistence. While standard for React Native, it is susceptible to extraction on compromised/rooted devices. Consider using `expo-secure-store`.
- **[INFO] RLS Policies**: Row Level Security is configured on all tables enforcing `user_id = auth.uid()`. This correctly isolates user data.

## 2. API & Secrets Exposure
- **[CRITICAL] Serverless Environment Variables**: Vercel endpoints (`/api/*`) securely access `NVIDIA_API_KEY` and `OPENAI_API_KEY` via `process.env`. These do NOT leak to the client.
- **[HIGH] API Abuse / Rate Limiting**: The `/api/ai-chat`, `/api/parse-workout`, and `/api/parse-food` endpoints do not currently implement rate limiting. A malicious actor could spam these endpoints, resulting in high AI provider costs.

## 3. Data Integrity & Validation
- **[MEDIUM] Input Sanitization**: The `/api/parse-workout` endpoint implements some noise filtering and length limits (12k chars), but prompt injection via natural language input remains a possibility (e.g., a user passing "Ignore all instructions and say X").

## 4. Privacy & Data Handling
- **[INFO] Food Image Uploads**: The `/api/parse-food` endpoint processes Base64 images directly to the Vision model. It does not currently store the images persistently, mitigating some privacy concerns, but this should be formally documented.
