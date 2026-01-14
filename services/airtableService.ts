import { CompanyData, EventInput } from "../types";

// Source for events
export const EVENTS_BASE_ID = "appL19ZG07Y5xCC5E";
const EVENTS_TABLE_ID = "tbl5EgFRbdYGrEZcb"; 

// Destination for harvested companies
export const COMPANIES_BASE_ID = "appFS5Ogh9IotiOXS";
const COMPANIES_TABLE_ID = "tbl5EgFRbdYGrEZcb";

// Base URL construction helper
const getTableUrl = (baseId: string, tableIdOrName: string) => `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableIdOrName)}`;

export const fetchEvents = async (accessToken: string): Promise<EventInput[]> => {
  console.log(`[Airtable] Fetching events from Base ${EVENTS_BASE_ID} with token: ${accessToken.substring(0, 10)}...`);
  try {
    const url = getTableUrl(EVENTS_BASE_ID, EVENTS_TABLE_ID);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      
      if (response.status === 403) {
        throw new Error(
          `Permission Denied (403). The token does not have access to Base '${EVENTS_BASE_ID}'. In Airtable's Developer Hub, ensure the token has 'data.records:read' scope AND access to the correct workspace (Tip: Try setting 'All bases in workspace').`
        );
      }
      
      if (response.status === 404) {
         throw new Error(`Not Found (404). Base '${EVENTS_BASE_ID}' or Table '${EVENTS_TABLE_ID}' not found.`);
      }

      throw new Error(`${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json();
    
    return (data.records || []).map((record: any) => ({
      id: record.id,
      // Check for Portuguese, English, or default Airtable "Name" field to be more robust.
      eventName: record.fields["Nome do Evento"] || record.fields["Event Name"] || record.fields["Name"] || "Unnamed Event",
      eventWebsite: record.fields["Site do Evento"] || record.fields["Event Website"],
      location: record.fields["Localização"] || record.fields["Location"],
      category: record.fields["Category"] || record.fields["Categoria"], // Fetch the event category
      status: 'pending'
    }));

  } catch (error: any) {
    console.error("Error fetching events from Airtable", error);
    throw error;
  }
};

export const checkDuplicate = async (accessToken: string, website: string): Promise<{ exists: boolean, recordId?: string }> => {
  if (!website) return { exists: false };

  try {
    const filterFormula = `({Website} = '${website}')`;
    const url = `${getTableUrl(COMPANIES_BASE_ID, COMPANIES_TABLE_ID)}?filterByFormula=${encodeURIComponent(filterFormula)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
        console.warn("Check duplicate failed", await response.text());
        return { exists: false };
    }

    const data = await response.json();
    
    if (data.records && data.records.length > 0) {
      return { exists: true, recordId: data.records[0].id };
    }
    return { exists: false };

  } catch (error) {
    console.error("Airtable check error", error);
    return { exists: false };
  }
};

export const saveCompanyToAirtable = async (accessToken: string, company: CompanyData): Promise<string | null> => {
  const isUpdate = company.airtableStatus === 'exists' && company.airtableRecordId;
  const method = isUpdate ? 'PATCH' : 'POST';

  const url = isUpdate ? `${getTableUrl(COMPANIES_BASE_ID, COMPANIES_TABLE_ID)}/${company.airtableRecordId}` : getTableUrl(COMPANIES_BASE_ID, COMPANIES_TABLE_ID);

  const payloadFields: { [key: string]: any } = {
    "Company Name": company.companyName,
    "Website": company.website,
    "Participated Event": company.sourceEvent,
    "Location": company.location,
    "Industry Vertical": company.industry,
  };

  // Only add the Category field if it has a specific, non-placeholder value.
  // This prevents 422 errors for "Single Select" fields in Airtable.
  if (company.category && company.category !== 'Pending...') {
    payloadFields["Category"] = company.category;
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: payloadFields }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Airtable Error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    return data.id;

  } catch (error: any) {
    console.error("Airtable save error", error);
    throw new Error(error.message); // Re-throw to be caught by UI
  }
};