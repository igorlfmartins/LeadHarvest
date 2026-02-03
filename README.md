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

## ☁️ Deployment & Cloud Security

To deploy this application to the cloud (Vercel, Netlify, AWS, etc.) without exposing your keys in the code repository, follow these steps:

### 1. Source Code Security
We have already configured `.gitignore` to exclude your `.env` file. **Never** commit your real API keys to GitHub.

### 2. Configuring Cloud Environment Variables
When deploying, your cloud provider will need the keys to build the application. You must set them in your hosting dashboard:

**Required Variables:**
- `VITE_GEMINI_API_KEY`
- `VITE_AIRTABLE_TOKEN`

**How to set them:**
- **Vercel:** Go to Settings > Environment Variables > Add New
- **Netlify:** Go to Site settings > Build & deploy > Environment > Environment variables
- **Render/Heroku:** Look for "Environment" or "Config Vars" in settings.

Once added, redeploy your application. The build process will inject these values securely.

### ⚠️ Important Security Note
Since this is a client-side application (Vite + React), variables prefixed with `VITE_` are bundled into the JavaScript code sent to the browser.
- **Current Status:** Your keys are safe from *repository* leaks (GitHub), but visible to *advanced users* who inspect the browser network traffic.
- **For Higher Security:** If you need to hide keys from the end-user entirely, you would need to implement a Backend Proxy (e.g., Vercel Functions or a Node.js server) to handle the API calls.
