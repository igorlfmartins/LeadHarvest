<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# LeadHarvest

LeadHarvest is an AI-powered tool that turns event lists into actionable lead databases. It uses Google Gemini to research companies and Airtable to store the results.

## 🚀 Setup & Run Locally

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   - Copy `.env.template` to a new file named `.env`
   - Add your real API keys to `.env` (This file is ignored by Git for security)
   ```bash
   cp .env.template .env
   # Edit .env with your keys
   ```

3. **Run the app:**
   ```bash
   npm run dev
   ```

## ☁️ Deployment on Railway

This project is configured to run on [Railway](https://railway.app/).

1.  **Create a New Project:**
    - Go to Railway Dashboard and click "New Project".
    - Select "Deploy from GitHub repo" and choose this repository.

2.  **Configure Environment Variables:**
    - Once the project is created, go to the **Variables** tab.
    - Add the following variables (copy values from your local `.env`):
        - `VITE_GEMINI_API_KEY`: Your Google Gemini API Key.
        - `VITE_AIRTABLE_TOKEN`: Your Airtable Personal Access Token.

3.  **Deploy:**
    - Railway will automatically detect the changes and trigger a deployment.
    - The build command `npm run build` and start command `npm run start` are already configured in `package.json`.

### ⚠️ Important Security Note
Since this is a client-side application (Vite + React), variables prefixed with `VITE_` are bundled into the JavaScript code sent to the browser.
- **Current Status:** Your keys are safe from *repository* leaks (GitHub), but visible to *advanced users* who inspect the browser network traffic.
- **For Higher Security:** If you need to hide keys from the end-user entirely, you would need to implement a Backend Proxy (e.g., Vercel Functions or a Node.js server) to handle the API calls.
