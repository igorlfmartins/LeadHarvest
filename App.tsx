import React, { useState, useEffect } from 'react';
import { 
  Sprout, 
  Database, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Table as TableIcon,
  Play,
  MapPin,
  RefreshCw,
  Sun,
  Moon,
  Key,
  ShieldCheck
} from 'lucide-react';
import { EventInput, CompanyData, HarvestLog } from './types';
import * as GeminiService from './services/geminiService';
import * as AirtableService from './services/airtableService';

// Simple UUID generator since we can't import 'uuid' in this specific sandbox without package.json
const generateId = () => Math.random().toString(36).substring(2, 15);

// API Keys
const GEMINI_API_KEY = process.env.API_KEY || ""; 
const DEFAULT_AIRTABLE_TOKEN = "patlwi0jIvkmDVWJP.f2333aa16a74ddebdf8ae4d341ab4d6159195b3ee9559593e8d004bdbda8d0c1";

// Storage Keys (Versioned to force refresh when default token changes)
const STORAGE_KEY_TOKEN = 'lh_pat_v3';
const STORAGE_KEY_MANUAL_FLAG = 'lh_pat_v3_manual';

const App: React.FC = () => {
  // --- State ---
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Configuration State
  const [airtableToken, setAirtableToken] = useState<string>(() => localStorage.getItem(STORAGE_KEY_TOKEN) || DEFAULT_AIRTABLE_TOKEN);
  const [retryToken, setRetryToken] = useState("");

  // App Data State
  const [events, setEvents] = useState<EventInput[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [logs, setLogs] = useState<HarvestLog[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAction, setCurrentAction] = useState('Idle');

  // --- Helpers ---
  const addLog = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setLogs(prev => [{ timestamp: new Date().toLocaleTimeString(), message, type }, ...prev]);
  };

  const renderWebsite = (url: string) => {
    if (!url) return <span className="text-slate-500 dark:text-slate-600">-</span>;
    try {
       // Ensure protocol exists for the URL constructor
       const safeHref = url.startsWith('http') ? url : `https://${url}`;
       const hostname = new URL(safeHref).hostname.replace(/^www\./, '');
       return (
         <a href={safeHref} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline truncate">
           {hostname} <ExternalLink className="w-3 h-3 flex-shrink-0" />
         </a>
       );
    } catch (e) {
      // Fallback if URL is completely invalid (e.g. "N/A")
      return <span className="text-slate-500 text-xs truncate">{url}</span>;
    }
  };

  // --- Initialization ---
  useEffect(() => {
    const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
    const isManuallySet = localStorage.getItem(STORAGE_KEY_MANUAL_FLAG);

    // Auto-heal logic: If the stored token is stale (doesn't match default) and user hasn't manually overridden it,
    // force update to the new default token.
    if (!isManuallySet && storedToken !== DEFAULT_AIRTABLE_TOKEN) {
        console.log("Updating stale access token to new default...");
        localStorage.setItem(STORAGE_KEY_TOKEN, DEFAULT_AIRTABLE_TOKEN);
        
        // If current state also doesn't match, update state and return to trigger re-render
        if (airtableToken !== DEFAULT_AIRTABLE_TOKEN) {
             setAirtableToken(DEFAULT_AIRTABLE_TOKEN);
             return; 
        }
    }
    
    // Proceed to load only if we have a token (and presumably it's now correct/updated)
    if (airtableToken) {
        loadEvents();
    }
  }, [airtableToken]);

  const loadEvents = async () => {
    if (!airtableToken) return;

    setIsLoadingEvents(true);
    addLog('Fetching events from Airtable...', 'info');
    setAuthError(null);
    
    try {
      const fetchedEvents = await AirtableService.fetchEvents(airtableToken);
      setEvents(fetchedEvents);
      addLog(`Loaded ${fetchedEvents.length} events from Airtable.`, 'success');
    } catch (error: any) {
      addLog(`Failed to load events: ${error.message}`, 'error');
      if (error.message.includes("403") || error.message.includes("404")) {
         setAuthError(error.message);
      }
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const handleUpdateToken = () => {
    if (!retryToken.trim()) return;
    localStorage.setItem(STORAGE_KEY_TOKEN, retryToken.trim());
    localStorage.setItem(STORAGE_KEY_MANUAL_FLAG, 'true');
    setAirtableToken(retryToken.trim());
    setRetryToken("");
    setAuthError(null);
    addLog("Token updated. Retrying connection...", "info");
  };

  // --- Core Business Logic: The Harvester ---
  const processSelectedEvent = async () => {
    if (!selectedEventId) return;
    const event = events.find(e => e.id === selectedEventId);
    if (!event) return;
    
    if (!GEMINI_API_KEY) {
      addLog("Error: No Google API Key found in environment.", "error");
      return;
    }

    setCompanies([]); 

    // Update Event Status
    setEvents(prev => prev.map(e => e.id === selectedEventId ? { ...e, status: 'processing' } : e));
    setIsProcessing(true);
    setCurrentAction(`Harvesting: ${event.eventName}`);

    try {
      // Step 1: Find Companies
      addLog(`AI Agent searching for participants of ${event.eventName}...`, 'info');
      const rawCompanies = await GeminiService.harvestEventCompanies(
        GEMINI_API_KEY, 
        event, 
        (msg) => setCurrentAction(msg)
      );

      if (rawCompanies.length === 0) {
        addLog(`No companies found for ${event.eventName}.`, 'warning');
        setEvents(prev => prev.map(e => e.id === selectedEventId ? { ...e, status: 'error' } : e));
        setIsProcessing(false);
        return;
      }

      // Create initial company entries
      const newCompanies: CompanyData[] = rawCompanies.map(rc => ({
        id: generateId(),
        companyName: rc.name,
        website: rc.website || '',
        location: 'Pending...',
        industry: 'Pending...',
        category: event.category || 'Other', // Inherit category from event
        sourceEvent: event.eventName,
        status: 'enriching'
      }));

      setCompanies(newCompanies);

      // Step 2 & 3: Enrich and Validate each company
      let processedCount = 0;
      for (const company of newCompanies) {
        setCurrentAction(`Enriching ${company.companyName} (${processedCount + 1}/${newCompanies.length})`);
        
        // Enrich (AI no longer determines category)
        const enrichedData = await GeminiService.enrichCompany(GEMINI_API_KEY, company.companyName, event.eventName, (msg) => {});
        
        // Update local state with enriched data, preserving the inherited category
        setCompanies(prev => prev.map(c => {
          if (c.id === company.id) {
            return {
              ...c,
              ...enrichedData, // This will have website, location, industry
              status: 'ready'
            };
          }
          return c;
        }));

        // Check Airtable for duplicates
        if (airtableToken && enrichedData.website) {
           const check = await AirtableService.checkDuplicate(airtableToken, enrichedData.website);
           setCompanies(prev => prev.map(c => {
            if (c.id === company.id) {
              return {
                ...c,
                airtableStatus: check.exists ? 'exists' : 'new',
                airtableRecordId: check.recordId
              };
            }
            return c;
          }));
        }

        processedCount++;
      }

      setEvents(prev => prev.map(e => e.id === selectedEventId ? { ...e, status: 'completed' } : e));
      addLog(`Completed harvesting for ${event.eventName}. Found ${newCompanies.length} leads.`, 'success');

    } catch (error) {
      console.error(error);
      setEvents(prev => prev.map(e => e.id === selectedEventId ? { ...e, status: 'error' } : e));
      addLog(`Critical error processing ${event.eventName}`, 'error');
    } finally {
      setIsProcessing(false);
      setCurrentAction('Idle');
    }
  };

  const handleSyncToAirtable = async (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    if (!company) return;

    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, status: 'enriching' } : c)); 
    
    try {
        const resultId = await AirtableService.saveCompanyToAirtable(airtableToken, company);
        setCompanies(prev => prev.map(c => c.id === companyId ? { 
            ...c, 
            status: 'saved', 
            airtableStatus: 'synced',
            airtableRecordId: resultId || c.airtableRecordId // keep old id on update
        } : c));
        
        addLog(`Synced ${company.companyName}`, 'success');
    } catch (error: any) {
        setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, status: 'error' } : c));
        addLog(`Failed to sync ${company.companyName}: ${error.message}`, 'error');
    }
  };

  // --- Render ---
  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen font-sans selection:bg-brand-500 selection:text-white transition-colors duration-300 bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
        
        {/* Header */}
        <header className="border-b transition-colors duration-300 border-brand-700 dark:border-brand-800 bg-brand-600 dark:bg-brand-700 text-white sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-5xl font-headline font-extrabold italic tracking-tight text-white">
                Lead<span className="text-brand-200">Harvest</span>
              </h1>
              <p className="text-xs font-sans font-medium tracking-wider text-brand-200 uppercase mt-1">
                Turn Events into Leads. Instantly.
              </p>
            </div>
            
            {/* Theme Toggle */}
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-lg transition-colors hover:bg-white/20 text-white"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: Event Library */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Event List */}
            <section className="rounded-2xl flex flex-col h-[600px] overflow-hidden border transition-colors duration-300 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 shadow-sm dark:shadow-none">
              <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
                <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                  <Database className="w-5 h-5 text-brand-500" />
                  Event Queue
                </h2>
                <button 
                  onClick={loadEvents} 
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-brand-500 dark:hover:text-white"
                  title="Refresh Events"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingEvents ? 'animate-spin' : ''}`} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Auth Error Banner with Remediation */}
                {authError && (
                  <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 mb-4">
                    <h3 className="text-red-600 dark:text-red-400 font-bold text-sm flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4" /> Connection Error
                    </h3>
                    <p className="text-xs text-red-500 dark:text-red-300 leading-relaxed mb-3">
                      {authError}
                    </p>
                    <div className="flex flex-col gap-2">
                      <input 
                        type="password"
                        value={retryToken}
                        onChange={(e) => setRetryToken(e.target.value)}
                        placeholder="Paste new Airtable Token (pat...)"
                        className="w-full text-xs p-2 rounded border border-red-200 dark:border-red-500/30 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-1 focus:ring-red-500 outline-none"
                      />
                      <button 
                        onClick={handleUpdateToken}
                        disabled={!retryToken}
                        className="w-full py-1.5 px-3 bg-red-100 dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/30 border border-red-200 dark:border-red-500/30 rounded text-xs text-red-700 dark:text-red-200 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <Key className="w-3 h-3" /> Update Token & Retry
                      </button>
                    </div>
                  </div>
                )}

                {isLoadingEvents && events.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 text-sm flex flex-col items-center">
                     <Loader2 className="w-6 h-6 animate-spin mb-2" />
                     Loading events from Airtable...
                  </div>
                ) : events.length === 0 && !authError ? (
                  <div className="text-center py-10 text-slate-500 text-sm px-4">
                    <p>No events found in table "Events".</p>
                  </div>
                ) : (
                  events.map(event => (
                    <button 
                      key={event.id} 
                      onClick={() => !isProcessing && setSelectedEventId(event.id)}
                      className={`w-full text-left p-4 rounded-xl border transition-all group ${
                        selectedEventId === event.id 
                          ? 'bg-brand-50 border-brand-500 shadow-md dark:bg-brand-500/10 dark:shadow-brand-900/20' 
                          : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-slate-300 dark:bg-slate-800/50 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:border-slate-600'
                      } ${isProcessing && selectedEventId !== event.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={isProcessing && selectedEventId !== event.id}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <h3 className={`font-bold text-sm ${selectedEventId === event.id ? 'text-brand-600 dark:text-brand-400' : 'text-slate-700 dark:text-slate-200'}`}>
                          {event.eventName}
                        </h3>
                        {event.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {event.status === 'processing' && <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />}
                        {event.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <MapPin className="w-3 h-3" />
                        {event.location || 'Online'}
                      </div>

                      {event.eventWebsite && (
                        <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-600 truncate">
                          {event.eventWebsite}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </section>

            {/* Action Log */}
             <section className="rounded-2xl p-4 h-48 overflow-y-auto font-mono text-xs border transition-colors duration-300 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 shadow-sm dark:shadow-none flex flex-col">
                <div className="flex-1">
                    {logs.length === 0 && <span className="text-slate-400 dark:text-slate-600">System logs will appear here...</span>}
                    {logs.map((log, i) => (
                    <div key={i} className={`mb-1.5 ${
                        log.type === 'error' ? 'text-red-500 dark:text-red-400' : 
                        log.type === 'success' ? 'text-green-600 dark:text-green-400' : 
                        log.type === 'warning' ? 'text-yellow-600 dark:text-yellow-400' : 'text-slate-500 dark:text-slate-400'
                    }`}>
                        <span className="opacity-50 mr-2">[{log.timestamp}]</span>
                        {log.message}
                    </div>
                    ))}
                </div>
                {/* DEBUG FOOTER */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 text-[10px] text-slate-300 dark:text-slate-600 flex justify-between">
                    <span title={`Events: ${AirtableService.EVENTS_BASE_ID} | Companies: ${AirtableService.COMPANIES_BASE_ID}`} className="flex items-center gap-1"><Database className="w-3 h-3"/> Multi-Base</span>
                    <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Token: ...{airtableToken.slice(-6)}</span>
                </div>
             </section>
          </div>

          {/* RIGHT COLUMN: Results & Harvester Status */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Active Process Status Bar & Controls */}
            <div className="flex items-center gap-4">
               {/* Main Action Button */}
               {selectedEventId && (
                 <button 
                    onClick={processSelectedEvent}
                    disabled={isProcessing}
                    className="h-16 px-8 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-lg shadow-xl shadow-brand-500/20 dark:shadow-brand-900/40 border border-brand-400/20 flex items-center gap-3 transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed whitespace-nowrap"
                 >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" /> Harvesting...
                      </>
                    ) : (
                      <>
                        <Play className="w-6 h-6 fill-current" /> Harvest Companies
                      </>
                    )}
                 </button>
               )}

               {/* AI Status Indicator */}
               <div className="flex-1 bg-white dark:bg-gradient-to-r dark:from-slate-900 dark:to-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center gap-4 shadow-sm dark:shadow-lg h-16">
                 <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-950 flex items-center justify-center border border-slate-200 dark:border-slate-800 shrink-0">
                   {isProcessing ? <Loader2 className="w-5 h-5 text-brand-500 animate-spin" /> : <div className="w-2.5 h-2.5 bg-slate-300 dark:bg-slate-600 rounded-full" />}
                 </div>
                 <div className="overflow-hidden">
                   <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">AI Status</div>
                   <div className="text-slate-700 dark:text-slate-200 font-medium text-sm truncate">{currentAction}</div>
                 </div>
              </div>
            </div>

            {/* Results Table */}
            <section className="rounded-2xl flex-1 flex flex-col overflow-hidden min-h-[500px] border transition-colors duration-300 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 shadow-sm dark:shadow-none">
              <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                  <TableIcon className="w-5 h-5 text-brand-500" />
                  Harvested Companies
                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                    {companies.length}
                  </span>
                </h2>
              </div>
              
              <div className="flex-1 overflow-auto bg-white dark:bg-transparent">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-950/50 text-xs uppercase text-slate-500 dark:text-slate-400 sticky top-0 backdrop-blur-sm z-10">
                    <tr>
                      <th className="p-4 font-semibold border-b border-slate-200 dark:border-slate-700">Company</th>
                      <th className="p-4 font-semibold border-b border-slate-200 dark:border-slate-700">Website</th>
                      <th className="p-4 font-semibold border-b border-slate-200 dark:border-slate-700">Vertical</th>
                      <th className="p-4 font-semibold border-b border-slate-200 dark:border-slate-700">Category</th>
                      <th className="p-4 font-semibold border-b border-slate-200 dark:border-slate-700">Location</th>
                      <th className="p-4 font-semibold border-b border-slate-200 dark:border-slate-700 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-slate-100 dark:divide-slate-800">
                    {companies.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 dark:text-slate-500 italic">
                          {selectedEventId ? 'Ready to harvest. Click the button above.' : 'Select an event from the left to start.'}
                        </td>
                      </tr>
                    )}
                    {companies.map(company => (
                      <tr key={company.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                        <td className="p-4 font-medium text-slate-800 dark:text-slate-200">
                          {company.companyName}
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{company.sourceEvent}</div>
                        </td>
                        <td className="p-4 text-brand-600 dark:text-brand-400 truncate max-w-[150px]">
                          {renderWebsite(company.website)}
                        </td>
                        <td className="p-4 text-slate-600 dark:text-slate-300">
                          <input 
                             className="bg-transparent border-none w-full outline-none focus:ring-1 focus:ring-brand-500 rounded px-1"
                             value={company.industry} 
                             onChange={(e) => {
                               const val = e.target.value;
                               setCompanies(prev => prev.map(c => c.id === company.id ? {...c, industry: val} : c))
                             }}
                          />
                        </td>
                         <td className="p-4 text-slate-600 dark:text-slate-300">
                           <input 
                             className="bg-transparent border-none w-full outline-none focus:ring-1 focus:ring-brand-500 rounded px-1"
                             value={company.category || ''}
                             onChange={(e) => {
                               const val = e.target.value;
                               setCompanies(prev => prev.map(c => c.id === company.id ? {...c, category: val} : c))
                             }}
                          />
                        </td>
                         <td className="p-4 text-slate-600 dark:text-slate-300">
                           {company.location}
                        </td>
                        <td className="p-4 text-right">
                          {company.status === 'enriching' ? (
                             <div className="flex justify-end"><Loader2 className="w-4 h-4 animate-spin text-slate-400 dark:text-slate-500" /></div>
                          ) : company.status === 'saved' || company.airtableStatus === 'synced' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600 dark:text-green-500 bg-green-100 dark:bg-green-500/10 px-2 py-1 rounded-full border border-green-200 dark:border-green-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Synced
                            </span>
                          ) : company.status === 'error' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-500">
                                <AlertCircle className="w-3 h-3" /> Error
                            </span>
                          ): (
                            <button 
                              onClick={() => handleSyncToAirtable(company.id)}
                              className={`text-xs font-bold px-3 py-1.5 rounded transition-all shadow-lg ${
                                company.airtableStatus === 'exists' 
                                  ? 'bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/50 hover:bg-orange-200 dark:hover:bg-orange-500/20' 
                                  : 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-500/30 dark:shadow-brand-900/30'
                              }`}
                            >
                              {company.airtableStatus === 'exists' ? 'Update' : 'Add to Airtable'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;