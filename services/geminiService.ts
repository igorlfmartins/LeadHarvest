import { GoogleGenAI } from "@google/genai";
import { EventInput, CompanyData, RawCompanyExtraction } from "../types";

// Updated to a known stable model with search capabilities
const MODEL_ID = "gemini-2.0-flash-exp";

const getClient = (apiKey: string) => new GoogleGenAI({ apiKey });

/**
 * Helper to clean Markdown JSON blocks and preambles from response text
 */
const parseJSON = <T>(text: string | undefined): T | null => {
  if (!text) return null;
  try {
    // Find the start of the first JSON object '{' or array '['
    const jsonStart = text.indexOf('{');
    const arrayStart = text.indexOf('[');
    
    let start = -1;
    if (jsonStart > -1 && arrayStart > -1) {
        start = Math.min(jsonStart, arrayStart);
    } else if (jsonStart > -1) {
        start = jsonStart;
    } else {
        start = arrayStart;
    }

    if (start === -1) {
        throw new Error("No JSON object or array found in the response.");
    }

    // Find the end of the last JSON object '}' or array ']'
    const jsonEnd = text.lastIndexOf('}');
    const arrayEnd = text.lastIndexOf(']');
    const end = Math.max(jsonEnd, arrayEnd);

    if (end === -1) {
        throw new Error("JSON object or array not properly closed.");
    }

    // Extract and parse the JSON string
    const jsonString = text.substring(start, end + 1);
    return JSON.parse(jsonString);
  } catch (e: any) {
    console.error("Failed to parse JSON response:", text, "Error:", e.message);
    return null;
  }
};

/**
 * Step 1: Find companies participating in the event using Google Search
 */
export const harvestEventCompanies = async (
  apiKey: string,
  event: EventInput,
  log: (msg: string) => void
): Promise<RawCompanyExtraction[]> => {
  if (!apiKey) {
    log("Error: Missing Gemini API Key");
    return [];
  }

  const ai = getClient(apiKey);
  
  log(`Initializing harvester for: ${event.eventName}...`);
  
  // Explicitly requesting strict JSON in the prompt since we can't use responseMimeType with tools
  const prompt = `
    Find the official list of sponsors, exhibitors, or speakers for the event "${event.eventName}" (${event.location || 'Global'}).
    Use Google Search to find the official event website or reliable industry news covering the event.
    
    Extract a list of distinct company names that are confirmed to be participating.
    Ignore media partners if possible, focus on paying sponsors or exhibitors.
    
    CRITICAL: Return ONLY a valid JSON array of objects. No markdown formatting.
    Format: [{"name": "Company Name"}]
    
    Limit to top 15 most relevant companies found to ensure accuracy.
  `;

  try {
    log(`Scanning web for participant lists...`);
    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        // responseMimeType: "application/json", // REMOVED: Incompatible with googleSearch tool
      }
    });

    // Debug logging
    console.log("Raw AI Response:", response.text);

    const data = parseJSON<RawCompanyExtraction[]>(response.text);
    
    if (!data || !Array.isArray(data)) {
      log(`Failed to parse company list from AI response. Check console for raw output.`);
      console.warn("Raw response that failed parsing:", response.text);
      return [];
    }

    log(`Found ${data.length} potential companies.`);
    return data;

  } catch (error: any) {
    console.error("Harvest error", error);
    if (error.message?.includes("API_KEY_INVALID")) {
      log(`Error: API Key invalid or Model ${MODEL_ID} not found.`);
    } else {
      log(`Error during harvesting: ${error.message}`);
    }
    return [];
  }
};

/**
 * Step 2: Enrich a specific company with details
 */
export const enrichCompany = async (
  apiKey: string,
  companyName: string,
  eventName: string,
  log: (msg: string) => void
): Promise<Partial<CompanyData>> => {
  if (!apiKey) return { website: '', location: 'Unknown', industry: 'Unknown' };

  const ai = getClient(apiKey);
  
  const prompt = `
    Research the company "${companyName}" which participated in "${eventName}".
    
    Find the following details:
    1. Official Website URL (Home page)
    2. Headquarters Location (City, Country)
    3. Primary Industry Vertical (e.g., "Enterprise Software", "Biotechnology", "Digital Advertising")

    CRITICAL: Return ONLY a valid JSON object. No markdown formatting.
    Format: {"website": "url", "location": "city, country", "industry": "industry name"}
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        // responseMimeType: "application/json", // REMOVED: Incompatible with googleSearch tool
      }
    });

    const data = parseJSON<Partial<CompanyData>>(response.text);

    if (!data) throw new Error("No enrichment data generated");

    return data;

  } catch (error) {
    console.error(`Enrichment error for ${companyName}`, error);
    return {
      website: '',
      location: 'Unknown',
      industry: 'Unknown',
    };
  }
};