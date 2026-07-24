# Translatuhh

A browser-tab translation MVP. It captures a shared tab's audio with `getDisplayMedia()`, posts audio chunks to a local backend, and renders translated captions in a split-screen interface.

## Run

Create a local `.env` file first:

```powershell
Copy-Item .env.example .env
```

Then put your real keys in `.env`:

```text
SARVAM_API_KEY=your_sarvam_api_key_here
```

`SARVAM_API_KEY` enables real speech-to-text and translation through Sarvam.

```powershell
npm.cmd run dev
```

Open http://localhost:3000, click **Share tab audio**, choose a browser tab, and enable the browser's tab-audio sharing option.

## Current State

This version has the complete capture UI and backend integration boundary. With `SARVAM_API_KEY` set, the backend sends audio chunks to Sarvam's speech-to-text API, then translates the transcript with Sarvam's text translation API.

The response shape expected by the UI is:

```json
{
  "id": "uuid",
  "mode": "live",
  "targetLanguage": "English",
  "detectedLanguage": "Spanish",
  "original": "Original transcript text",
  "translated": "Translated caption text",
  "createdAt": "2026-07-24T00:00:00.000Z"
}
```

## Why This Shape

Browsers cannot directly feed shared-tab audio into the built-in `SpeechRecognition` API. A backend speech service is the practical route for real translation. This MVP keeps the product flow working while leaving one clean server-side function to connect to a transcription model and translation API.
