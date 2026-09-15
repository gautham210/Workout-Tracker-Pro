# QUESTIONS FOR EXTERNAL RESEARCH

## PRODUCT
- What features are expected in modern workout tracking apps (e.g., Strong, Hevy, Fitbod)?
- What features are currently missing compared with leading apps?
- Which features (e.g., social sharing, AI insights, detailed analytics) actually improve long-term user retention?

## WORKOUT SCIENCE
- Is the current progression system (simple volume tracking) scientifically reasonable for intermediate lifters?
- What should an intelligent progression engine consider (e.g., RPE, 1RM estimation, fatigue tracking)?
- How should deloads, rest, and recovery be handled by the AI Coach?
- How should total weekly volume and intensity be interpreted across muscle groups?

## AI
- What should a trustworthy AI fitness coach do, and what boundaries should it have?
- What AI features are genuinely useful vs. mere gimmicks in the fitness space?
- How should LLM hallucinations (e.g., suggesting dangerous weight increments) be structurally controlled?
- How should AI recommendations be validated before being presented to the user?
- What models are most appropriate for text processing vs. food-image analysis considering speed and cost?

## NUTRITION
- How accurate can zero-shot image-based calorie estimation realistically be?
- What additional information should the scanner request from the user (e.g., "Is there oil/butter?") to improve accuracy?
- How should statistical uncertainty be communicated to the user?

## SECURITY
- What security architecture should a Supabase + Expo + Vercel app use in production?
- What specific RLS policies should be audited before public release?
- What API protections (e.g., rate limiting, captcha, auth-headers) are required for Vercel endpoints?
- How should AI endpoints be protected against abuse, spam, and prompt injection?

## PRIVACY
- What workout, nutrition, and food-image data should be stored persistently?
- What explicit consent should be obtained during onboarding?
- What deletion/export functionality should exist to comply with global regulations?
- What Indian (DPDP), European (GDPR), and international privacy requirements may apply?

## MOBILE
- What specific UI/UX details make a premium native workout app feel polished?
- What offline functionality should exist to handle gym dead-zones?
- What should happen when the app is backgrounded or killed by the OS during an active workout?

## MONETIZATION
- What features are appropriate for a free tier vs. a premium tier?
- What would fitness users realistically pay a subscription for?
- What AI features create meaningful, undeniable premium value?

## STORE READINESS
- What are the current Google Play and Apple App Store requirements for health/fitness apps?
- What AI disclosure considerations exist in the app stores?
- What specific health/fitness disclaimers are legally required?
- What are the strict account deletion requirements for Apple/Google?
