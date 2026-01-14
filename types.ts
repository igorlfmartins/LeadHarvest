export interface EventInput {
  id: string;
  eventName: string;
  eventWebsite?: string;
  location?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  category?: 'Marketing' | 'Health' | 'Tech' | 'Sustainability';
}

export interface CompanyData {
  id: string;
  companyName: string;
  website: string;
  location: string;
  industry: string;
  sourceEvent: string;
  status: 'new' | 'enriching' | 'ready' | 'saved' | 'error';
  airtableStatus?: 'new' | 'exists' | 'synced';
  airtableRecordId?: string;
  confidenceScore?: number; // 0-100
  category?: string;
}

export interface HarvestLog {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface AirtableConfig {
  apiKey: string;
  baseId: string;
  tableName: string;
}

// For AI JSON parsing
export interface RawCompanyExtraction {
  name: string;
  website?: string; // Sometimes the list page has it
}