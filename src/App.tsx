import React, { useState, useEffect, useRef } from "react";
import { 
  UploadCloud, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Trash2, 
  Play, 
  Sparkles, 
  Download, 
  ArrowUpDown, 
  ChevronDown, 
  ChevronUp, 
  Briefcase, 
  Users, 
  Award, 
  History, 
  ExternalLink,
  Search,
  BookOpen,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { CandidateResult, ScreeningSession } from "./types";
import { SAMPLE_JOB_DESCRIPTIONS } from "./data";

export default function App() {
  // Main states
  const [jobDescription, setJobDescription] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const [isScreening, setIsScreening] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Results & UI manipulation
  const [candidates, setCandidates] = useState<CandidateResult[]>([]);
  const [scoreSortOrder, setScoreSortOrder] = useState<"desc" | "asc">("desc");
  const [scoreFilter, setScoreFilter] = useState<"all" | "excellent" | "good" | "partial" | "low">("all");
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);

  // History state
  const [historySessions, setHistorySessions] = useState<ScreeningSession[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Status message rotation stages
  const statusStages = [
    { message: "Reading resumes...", minPct: 10, maxPct: 25 },
    { message: "Extracting candidate details...", minPct: 25, maxPct: 45 },
    { message: "Matching against JD...", minPct: 45, maxPct: 65 },
    { message: "Calculating scores...", minPct: 65, maxPct: 80 },
    { message: "Generating summaries...", minPct: 80, maxPct: 92 },
    { message: "Preparing results...", minPct: 92, maxPct: 98 }
  ];

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("resume_screener_history");
      if (saved) {
        setHistorySessions(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load screening history.", e);
    }
  }, []);

  // Save history helper
  const saveSessionToHistory = (newResults: CandidateResult[], jd: string) => {
    try {
      const newSession: ScreeningSession = {
        jobDescription: jd,
        resumesCount: newResults.length,
        results: newResults,
        screenedAt: new Date().toLocaleString()
      };
      const updated = [newSession, ...historySessions].slice(0, 20); // Keep last 20
      setHistorySessions(updated);
      localStorage.setItem("resume_screener_history", JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to persist session to local storage.", e);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isScreening) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isScreening) return;

    if (e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (files: File[]) => {
    setErrorBanner(null);
    const validFiles = files.filter(file => {
      const name = file.name.toLowerCase();
      return name.endsWith(".pdf") || name.endsWith(".docx");
    });

    if (validFiles.length !== files.length) {
      setErrorBanner("Only PDF and DOCX formats are supported. Unsupported files were filtered out.");
    }

    setUploadedFiles(prev => {
      const combined = [...prev, ...validFiles];
      if (combined.length > 5) {
        setErrorBanner("Maximum of 5 resumes can be analyzed in the free tier.");
        return combined.slice(0, 5);
      }
      return combined;
    });
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    setErrorBanner(null);
  };

  // Fill sample job description
  const handleSelectSample = (jdText: string) => {
    setJobDescription(jdText);
    setErrorBanner(null);
  };

  // Trigger analysis
  const handleAnalyze = async () => {
    if (!jobDescription || jobDescription.trim() === "") {
      setErrorBanner("Please paste or write a Job Description first.");
      return;
    }
    if (uploadedFiles.length === 0) {
      setErrorBanner("Please upload at least one matching candidate resume.");
      return;
    }

    setIsScreening(true);
    setProgressPercent(5);
    setStatusMessage("Initializing server pipelines...");
    setErrorBanner(null);

    // Set up progressive status indicator mock animation
    const mockProgressInterval = setInterval(() => {
      setProgressPercent(prev => {
        if (prev >= 95) {
          return 95;
        }
        const delta = Math.floor(Math.random() * 4) + 1;
        const next = prev + delta;
        
        // Find correct status message based on current progress percentage
        const matchedStage = statusStages.find(stage => next >= stage.minPct && next <= stage.maxPct);
        if (matchedStage) {
          setStatusMessage(matchedStage.message);
        }
        
        return next;
      });
    }, 850);

    try {
      const formData = new FormData();
      formData.append("jobDescription", jobDescription);
      uploadedFiles.forEach(file => {
        formData.append("resumes", file);
      });

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      clearInterval(mockProgressInterval);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Analyzing resumes failed. Check API connectivity.");
      }

      const responseData = await response.json();
      setProgressPercent(100);
      setStatusMessage("Analysis complete!");

      // Wait brief moment for success view, then update state
      setTimeout(() => {
        const results: CandidateResult[] = responseData.results || [];
        setCandidates(results);
        
        // Expand first candidate automatically if results exist
        if (results.length > 0) {
          setExpandedCandidateId(results[0].id);
        }

        // Save session
        saveSessionToHistory(results, jobDescription);
        
        setIsScreening(false);
        setProgressPercent(0);
      }, 600);

    } catch (err: any) {
      clearInterval(mockProgressInterval);
      console.error(err);
      setErrorBanner(err.message || "A network failure occurred. Please re-run analysis.");
      setIsScreening(false);
      setProgressPercent(0);
    }
  };

  // Toggle Sorting
  const toggleScoreSort = () => {
    const nextOrder = scoreSortOrder === "desc" ? "asc" : "desc";
    setScoreSortOrder(nextOrder);
  };

  // Load a historical pool
  const handleLoadSession = (session: ScreeningSession) => {
    setCandidates(session.results);
    setJobDescription(session.jobDescription);
    if (session.results.length > 0) {
      setExpandedCandidateId(session.results[0].id);
    }
    setShowHistoryModal(false);
    setErrorBanner(null);
  };

  // Clear current active session
  const clearCurrentWorkspace = () => {
    setUploadedFiles([]);
    setCandidates([]);
    setExpandedCandidateId(null);
    setErrorBanner(null);
  };

  // Helpers to color-code ranges
  const getScoreTag = (score: number) => {
    if (score >= 90) return { label: "Excellent Match", bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", text: "text-emerald-400", fill: "bg-emerald-500" };
    if (score >= 75) return { label: "Good Match", bg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", text: "text-cyan-400", fill: "bg-cyan-500" };
    if (score >= 50) return { label: "Partial Match", bg: "bg-amber-500/10 text-amber-400 border-amber-500/20", text: "text-amber-400", fill: "bg-amber-500" };
    return { label: "Low Match", bg: "bg-rose-500/10 text-rose-400 border-rose-500/20", text: "text-rose-400", fill: "bg-rose-500" };
  };

  // Filter candidates based on selected match tier
  const filteredCandidates = candidates.filter(cand => {
    if (scoreFilter === "all") return true;
    if (scoreFilter === "excellent") return cand.matchingScore >= 90;
    if (scoreFilter === "good") return cand.matchingScore >= 75 && cand.matchingScore < 90;
    if (scoreFilter === "partial") return cand.matchingScore >= 50 && cand.matchingScore < 75;
    if (scoreFilter === "low") return cand.matchingScore < 50;
    return true;
  });

  // Sort candidates
  const sortedCandidates = [...filteredCandidates].sort((a, b) => {
    if (scoreSortOrder === "desc") {
      return b.matchingScore - a.matchingScore;
    } else {
      return a.matchingScore - b.matchingScore;
    }
  });

  // Highlight max candidate id
  const topCandidateId = candidates.length > 0 
    ? [...candidates].sort((a, b) => b.matchingScore - a.matchingScore)[0].id 
    : null;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans antialiased pb-20">
      
      {/* Header Bar */}
      <header className="sticky top-0 z-40 bg-[#0c0c0e] border-b border-zinc-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 bg-indigo-600 text-white rounded-lg shadow-md shadow-indigo-950/20">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg text-white tracking-tight flex items-center gap-1.5">
                AI Resume Screening <span className="text-indigo-400">Assistant</span>
              </h1>
              <p className="text-[11px] text-zinc-500 hidden sm:block font-medium uppercase tracking-wider">Automated Candidate Alignment Engine • Professional</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden lg:flex items-center gap-4 text-[10px] font-medium text-zinc-500 uppercase tracking-widest mr-4">
              <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> AI Model Online</span>
              <span className="border-l border-zinc-800 pl-4">v2.4.0</span>
            </div>

            <button 
              onClick={() => setShowHistoryModal(true)}
              className="inline-flex items-center space-x-1 px-3 py-2 border border-zinc-800 rounded-lg text-xs font-semibold text-zinc-300 bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <History className="h-4 w-4 text-indigo-400" />
              <span>History ({historySessions.length})</span>
            </button>
            
            {candidates.length > 0 && (
              <button 
                onClick={clearCurrentWorkspace}
                className="inline-flex items-center space-x-1 px-3 py-2 border border-zinc-800 rounded-lg text-xs font-semibold text-zinc-400 bg-zinc-900 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                id="clear-workspace-btn"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        
        {/* Error Banner */}
        <AnimatePresence>
          {errorBanner && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 bg-red-950/40 border border-red-900/50 rounded-lg text-red-200 text-sm flex items-start space-x-3 shadow-xs"
              id="error-banner"
            >
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-300">Attention Required</p>
                <p className="text-red-400 mt-0.5 text-xs">{errorBanner}</p>
              </div>
              <button onClick={() => setErrorBanner(null)} className="text-red-500 hover:text-red-300 transition-colors font-medium text-xs">✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Workstation Card */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-xl overflow-hidden mb-8" id="workstation-section">
          <div className="p-6 border-b border-zinc-800 bg-zinc-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-indigo-400" />
                Initialize Candidate Evaluation Session
              </h2>
              <p className="text-xs text-zinc-400 mt-1">Specify your job constraints and upload up to 5 target resumes (PDF / DOCX format)</p>
            </div>
          </div>

          <div className="p-6 flex flex-col space-y-6">
            
            {/* Custom Evaluation Rigor Criteria Banner */}
            <div className="bg-[#0c0c0e] border border-zinc-800 rounded-lg p-5 flex flex-col md:flex-row md:items-start gap-4">
              <div className="flex gap-3 w-full">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md h-fit shrink-0">
                  <CheckCircle className="h-4.5 w-4.5" />
                </div>
                <div className="w-full">
                  <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-widest flex items-center gap-1.5">
                    Recruiter Calibrated Alignment Rubric <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-semibold normal-case tracking-normal">Five-Factor Guardrails</span>
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Evaluators score profiles out of 100 on the basis of precise screening guidelines. Each trigger weights matches and dynamically adjusts scores up to 100:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                    <div className="bg-[#121214] border border-zinc-800/80 rounded-md p-3">
                      <p className="text-[10px] font-bold text-indigo-300">1. Hard Skills First</p>
                      <p className="text-[9.5px] text-zinc-500 mt-1 leading-normal">Matches specific tools, languages, platforms, and methods named in the JD (+10 pts / decrease).</p>
                    </div>
                    <div className="bg-[#121214] border border-zinc-800/80 rounded-md p-3">
                      <p className="text-[10px] font-bold text-indigo-300">2. Seniority Mapping</p>
                      <p className="text-[9.5px] text-zinc-500 mt-1 leading-normal">Aligns most recent role precisely to JD level (junior, mid, or senior) (+10 pts / decrease).</p>
                    </div>
                    <div className="bg-[#121214] border border-zinc-800/80 rounded-md p-3">
                      <p className="text-[10px] font-bold text-indigo-300">3. Recency Bias</p>
                      <p className="text-[9.5px] text-zinc-500 mt-1 leading-normal">Prioritizes recent roles and the top parts of the resume over older history (+10 pts / decrease).</p>
                    </div>
                    <div className="bg-[#121214] border border-zinc-800/80 rounded-md p-3">
                      <p className="text-[10px] font-bold text-indigo-300">4. Exact Phrase alignment</p>
                      <p className="text-[9.5px] text-zinc-500 mt-1 leading-normal">Applies the employer's exact wording for skills and experience when accurate (+10 pts / decrease).</p>
                    </div>
                    <div className="bg-[#121214] border border-zinc-800/80 rounded-md p-3">
                      <p className="text-[10px] font-bold text-indigo-300">5. Education & Certs</p>
                      <p className="text-[9.5px] text-zinc-500 mt-1 leading-normal">Considers education and credentials specifically when explicitly required in the JD (+10 pts / decrease).</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left Column: Job Description and Pre-fills */}
            <div className="flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider" htmlFor="jd-textarea">
                  1. Job Description (JD)
                </label>
                
                {/* Pre-fill Sample Selector */}
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1 font-medium">
                    <BookOpen className="h-3 w-3 text-indigo-400" /> Pre-fills:
                  </span>
                  {SAMPLE_JOB_DESCRIPTIONS.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectSample(item.description)}
                      disabled={isScreening}
                      className="text-[10px] bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white px-2 py-1 rounded transition-colors border border-zinc-700 cursor-pointer disabled:opacity-50"
                    >
                      {item.title.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                id="jd-textarea"
                rows={11}
                placeholder="Paste the Job Description (requirements, skills, experience, expectations) here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                disabled={isScreening}
                className="w-full text-sm rounded-lg border border-zinc-800 bg-[#09090b] p-3.5 text-zinc-100 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-hidden disabled:opacity-60 placeholder-zinc-700 resize-y min-h-[220px]"
              />
            </div>

            {/* Right Column: PDF / DOCX Dropzone */}
            <div className="flex flex-col space-y-4">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                2. Resumes Pool (Up to 5 files)
              </label>

              {/* Drag Drop Container */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isScreening && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer min-h-[160px] transition-all bg-[#09090b]/30 ${
                  isDragging 
                    ? "border-indigo-500 bg-indigo-950/20" 
                    : "border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/40"
                } ${isScreening ? "opacity-40 cursor-not-allowed" : ""}`}
                id="drag-drop-container"
              >
                <input
                  type="file"
                  id="resume-file-input"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  accept=".pdf,.docx"
                  disabled={isScreening}
                  className="hidden"
                />

                <div className="p-3 bg-zinc-800 text-indigo-400 rounded-lg mb-3 shadow-sm border border-zinc-700">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-zinc-200">
                  Drag and drop resumes, or <span className="text-indigo-400 hover:underline">browse files</span>
                </p>
                <p className="text-xs text-zinc-500 mt-1.5 font-medium">
                  PDF and DOCX formats strictly supported • Max size: 15MB
                </p>
              </div>

              {/* Uploaded File List */}
              <div className="flex-1 flex flex-col justify-between" id="uploaded-file-list-container">
                <div>
                  {uploadedFiles.length > 0 && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                          Ready Candidates: ({uploadedFiles.length})
                        </span>
                        {uploadedFiles.length >= 5 && (
                          <span className="text-[11px] text-amber-500 font-semibold">Limit reached (5/5)</span>
                        )}
                      </div>
                      
                      <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                        {uploadedFiles.map((file, idx) => (
                          <div 
                            key={idx}
                            className="flex items-center justify-between p-2.5 bg-zinc-950 hover:bg-zinc-800 rounded-lg border border-zinc-800/80 transition-all text-xs"
                          >
                            <div className="flex items-center space-x-2.5 min-w-0 pr-4">
                              <FileText className="h-4 w-4 text-indigo-400 shrink-0" />
                              <span className="truncate font-medium text-zinc-300">{file.name}</span>
                              <span className="text-[10px] text-zinc-500 font-mono">({(file.size / 1024).toFixed(0)} KB)</span>
                            </div>
                            
                            {!isScreening && (
                              <button
                                onClick={() => removeFile(idx)}
                                className="text-zinc-500 hover:text-red-400 p-1 rounded-sm hover:bg-zinc-900 transition-colors cursor-pointer"
                                title="Remove file"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Trigger Panel */}
                <div className="pt-4 border-t border-zinc-800 mt-4 flex items-center justify-between">
                  <span className="text-xs text-zinc-500 flex items-center gap-1 font-medium">
                    <Info className="h-3.5 w-3.5 text-zinc-600" /> Selected: {uploadedFiles.length} of 5 resumes
                  </span>

                  <button
                    onClick={handleAnalyze}
                    disabled={isScreening}
                    className="inline-flex items-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-all shadow-lg shadow-indigo-950/40 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs uppercase tracking-wider"
                    id="analyze-screening-button"
                  >
                    <Play className="h-3.5 w-3.5 fill-white" />
                    <span>Analyze resumes</span>
                  </button>
                </div>

              </div>

            </div>
          </div>
        </div>

          {/* Screening Progress Indicator UI */}
          <AnimatePresence>
            {isScreening && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-zinc-950/60 border-t border-zinc-800 p-6 flex flex-col space-y-4"
                id="screening-progress-panel"
              >
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                    </div>
                    <span className="font-semibold text-indigo-400 tracking-tight">{statusMessage}</span>
                  </div>
                  <span className="font-mono font-bold text-zinc-300">{progressPercent}%</span>
                </div>

                {/* Progress bar scale */}
                <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <motion.div 
                    initial={{ width: "5%" }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ ease: "easeOut" }}
                    className="bg-indigo-500 h-full rounded-full"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 pt-1 text-center">
                  {statusStages.map((stage, idx) => {
                    const isPassed = progressPercent > stage.maxPct;
                    const isActive = progressPercent >= stage.minPct && progressPercent <= stage.maxPct;
                    return (
                      <div 
                        key={idx} 
                        className={`p-2 rounded-md border text-[10px] font-semibold leading-tight ${
                          isPassed 
                            ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/50" 
                            : isActive 
                            ? "bg-indigo-950 text-indigo-300 border-indigo-700 animate-pulse" 
                            : "bg-zinc-900 text-zinc-600 border-zinc-800/80"
                        }`}
                      >
                        {stage.message.replace("...", "")}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </section>

        {/* Output bottom section: Analysis Ranked Results list */}
        {candidates.length > 0 ? (
          <section className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-xl overflow-hidden" id="results-dashboard-section">
            <div className="p-6 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/40">
              <div>
                <h2 className="text-sm font-semibold tracking-wide uppercase text-zinc-100 flex items-center gap-2">
                  <Award className="h-5 w-5 text-indigo-400" />
                  Screening Rankings & Evaluation Results
                </h2>
                <p className="text-xs text-zinc-400 mt-1">Showing evaluated profiles matching requirements. Highest score denotes outstanding alignment.</p>
              </div>

              {/* Filtering Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider whitespace-nowrap">Filter Match:</span>
                <div className="inline-flex p-0.5 bg-zinc-950 rounded-lg border border-zinc-800">
                  <button 
                    onClick={() => setScoreFilter("all")} 
                    className={`px-3 py-1 text-[11px] rounded transition-all font-semibold uppercase tracking-wider cursor-pointer ${scoreFilter === "all" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    All ({candidates.length})
                  </button>
                  <button 
                    onClick={() => setScoreFilter("excellent")} 
                    className={`px-3 py-1 text-[11px] rounded transition-all font-semibold uppercase tracking-wider cursor-pointer ${scoreFilter === "excellent" ? "bg-zinc-800 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    Excellent ({candidates.filter(c => c.matchingScore >= 90).length})
                  </button>
                  <button 
                    onClick={() => setScoreFilter("good")} 
                    className={`px-3 py-1 text-[11px] rounded transition-all font-semibold uppercase tracking-wider cursor-pointer ${scoreFilter === "good" ? "bg-zinc-800 text-cyan-400" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    Good ({candidates.filter(c => c.matchingScore >= 75 && c.matchingScore < 90).length})
                  </button>
                  <button 
                    onClick={() => setScoreFilter("partial")} 
                    className={`px-3 py-1 text-[11px] rounded transition-all font-semibold uppercase tracking-wider cursor-pointer ${scoreFilter === "partial" ? "bg-zinc-800 text-amber-400" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    Partial ({candidates.filter(c => c.matchingScore >= 50 && c.matchingScore < 75).length})
                  </button>
                </div>
              </div>
            </div>

            {/* Results Table - Responsive */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" id="candidate-results-table">
                <thead>
                  <tr className="bg-zinc-950 sticky top-0 text-zinc-500 font-semibold text-[11px] uppercase tracking-wider border-b border-zinc-800">
                    <th className="py-4 px-6 w-[22%]">Candidate Name</th>
                    <th className="py-4 px-4 w-[16%]">
                      <button 
                        onClick={toggleScoreSort}
                        className="flex items-center space-x-1.5 hover:text-white transition-colors cursor-pointer"
                      >
                        <span>Matching Score</span>
                        <ArrowUpDown className="h-3.5 w-3.5 text-indigo-400" />
                      </button>
                    </th>
                    <th className="py-4 px-4 w-[20%] hidden md:table-cell">Top Strengths</th>
                    <th className="py-4 px-4 w-[20%] hidden md:table-cell">Key Weaknesses</th>
                    <th className="py-4 px-4 w-[18%] hidden lg:table-cell">AI Summary</th>
                    <th className="py-4 px-6 text-right w-[8%]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-xs">
                  {sortedCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-zinc-500 font-medium bg-zinc-900/40">
                        No candidates matching the selected match tier in the current pool.
                      </td>
                    </tr>
                  ) : (
                    sortedCandidates.map((cand) => {
                      const isTopMatch = cand.id === topCandidateId;
                      const scoreConfig = getScoreTag(cand.matchingScore);
                      const isExpanded = expandedCandidateId === cand.id;

                      return (
                        <React.Fragment key={cand.id}>
                          <tr 
                            onClick={() => setExpandedCandidateId(isExpanded ? null : cand.id)}
                            className={`group cursor-pointer transition-colors ${
                              isExpanded 
                                ? "bg-zinc-800/40" 
                                : isTopMatch 
                                ? "bg-emerald-500/5 hover:bg-emerald-500/10" 
                                : "hover:bg-zinc-800/20"
                            }`}
                          >
                            
                            {/* Candidate & CV indicator */}
                            <td className="py-4 px-6 font-semibold text-zinc-100">
                              <div className="flex items-center space-x-3">
                                <div className="shrink-0 flex items-center justify-center p-2 rounded-lg bg-zinc-900 border border-zinc-800 group-hover:bg-zinc-800">
                                  <FileText className="h-4 w-4 text-zinc-400" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-zinc-100 flex items-center gap-1.5 truncate">
                                    {cand.candidateName}
                                    {isTopMatch && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-500 text-neutral-950 tracking-wider uppercase shrink-0 leading-none">
                                        ★ Top Match
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-zinc-500 font-medium truncate mt-0.5">{cand.fileName}</p>
                                </div>
                              </div>
                            </td>

                            {/* Score Display (Visually Prominent) */}
                            <td className="py-4 px-4">
                              <div className="flex flex-col">
                                <div className="flex items-baseline space-x-1">
                                  <span className={`text-lg font-bold tracking-tight ${scoreConfig.text}`}>{cand.matchingScore}</span>
                                  <span className="text-[10px] text-zinc-600 font-mono">/100</span>
                                </div>
                                
                                <span className={`inline-flex items-center self-start mt-1.5 px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider border ${scoreConfig.bg}`}>
                                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${scoreConfig.fill} mr-1 shrink-0`} />
                                  {scoreConfig.label.replace(" Match", "")}
                                </span>
                              </div>
                            </td>

                            {/* Strengths (Tablet) */}
                            <td className="py-4 px-4 hidden md:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {cand.strengths.slice(0, 2).map((st, sIdx) => (
                                  <span key={sIdx} className="px-2 py-0.5 bg-zinc-950 text-emerald-400 border border-emerald-900/30 rounded text-[10px] lowercase tracking-wide max-w-[130px] truncate block">
                                    {st}
                                  </span>
                                ))}
                                {cand.strengths.length > 2 && (
                                  <span className="text-[9px] text-indigo-400 font-bold self-center">+{cand.strengths.length - 2}</span>
                                )}
                              </div>
                            </td>

                            {/* Weaknesses (Tablet) */}
                            <td className="py-4 px-4 hidden md:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {cand.weaknesses.slice(0, 2).map((wk, wIdx) => (
                                  <span key={wIdx} className="px-2 py-0.5 bg-zinc-950 text-zinc-500 border border-zinc-800 rounded text-[10px] lowercase tracking-wide max-w-[130px] truncate block">
                                    {wk}
                                  </span>
                                ))}
                                {cand.weaknesses.length > 2 && (
                                  <span className="text-[9px] text-zinc-600 font-medium self-center">+{cand.weaknesses.length - 2}</span>
                                )}
                              </div>
                            </td>

                            {/* Summary (Desktop) */}
                            <td className="py-4 px-4 hidden lg:table-cell">
                              <p className="text-zinc-400 italic line-clamp-2 leading-relaxed text-[11px]">
                                {cand.summary}
                              </p>
                            </td>

                            {/* Actions download */}
                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end space-x-2" onClick={(e) => e.stopPropagation()}>
                                <a 
                                  href={cand.downloadUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="View original Document inline"
                                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors border border-zinc-800 bg-zinc-950"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                                <button 
                                  onClick={() => setExpandedCandidateId(isExpanded ? null : cand.id)}
                                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors border border-zinc-800 bg-zinc-950 cursor-pointer animate-none"
                                  title="Toggle expand report"
                                >
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>
                              </div>
                            </td>

                          </tr>

                          {/* Expanded Full candidate breakdown panel */}
                          <AnimatePresence>
                            {isExpanded && (
                              <tr>
                                <td colSpan={6} className="bg-zinc-950/40 p-6 border-b border-zinc-800">
                                  <motion.div 
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                                  >
                                    
                                    {/* Summary Card */}
                                    <div className="lg:col-span-1 flex flex-col space-y-3 bg-zinc-900 p-4.5 rounded-lg border border-zinc-800 shadow-sm">
                                      <h4 className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase">Factual Screening Analysis</h4>
                                      <p className="text-xs font-semibold text-white border-b border-zinc-800 pb-1.5">
                                        Summary evaluation for <span className="text-indigo-400">{cand.candidateName}</span>
                                      </p>
                                      <p className="text-[11px] text-zinc-400 leading-relaxed flex-1">
                                        {cand.summary}
                                      </p>
                                      
                                      <div className="pt-2">
                                        <a 
                                          href={cand.downloadUrl}
                                          download={cand.fileName}
                                          className="w-full inline-flex items-center justify-center space-x-2 px-3 py-2 bg-zinc-850 hover:bg-zinc-800 text-zinc-200 text-[11px] font-semibold rounded-md border border-zinc-750 transition-all cursor-pointer"
                                        >
                                          <Download className="h-3.5 w-3.5 text-indigo-400" />
                                          <span>Download Resume File</span>
                                        </a>
                                      </div>
                                    </div>

                                    {/* Strengths card */}
                                    <div className="bg-zinc-900 p-4.5 rounded-lg border border-zinc-800 shadow-sm">
                                      <h4 className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase mb-2">Technical & Experience Strengths</h4>
                                      <ul className="text-[11px] text-zinc-300 space-y-2">
                                        {cand.strengths.map((str, sIdx) => (
                                          <li key={sIdx} className="flex items-start">
                                            <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-900/30 text-emerald-400 mr-2.5 font-bold text-[9px] border border-emerald-900/40">✓</span>
                                            <span className="leading-tight mt-0.5">{str}</span>
                                          </li>
                                        ))}
                                        {cand.strengths.length === 0 && (
                                          <li className="text-zinc-500">No major strengths highlighted.</li>
                                        )}
                                      </ul>
                                    </div>

                                    {/* Weaknesses card */}
                                    <div className="bg-zinc-900 p-4.5 rounded-lg border border-zinc-800 shadow-sm">
                                      <h4 className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase mb-2">Inconsistencies & Requirements Gaps</h4>
                                      <ul className="text-[11px] text-zinc-300 space-y-2">
                                        {cand.weaknesses.map((wk, wIdx) => (
                                          <li key={wIdx} className="flex items-start">
                                            <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-rose-900/30 text-rose-400 mr-2.5 font-bold text-[9px] border border-rose-900/40">✕</span>
                                            <span className="leading-tight mt-0.5">{wk}</span>
                                          </li>
                                        ))}
                                        {cand.weaknesses.length === 0 && (
                                          <li className="text-zinc-500">Perfect match. No specific unfulfilled criteria found.</li>
                                        )}
                                      </ul>
                                    </div>

                                  </motion.div>
                                </td>
                              </tr>
                            )}
                          </AnimatePresence>

                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination/Status footer */}
            <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
              <span className="font-semibold text-zinc-400">Pool count: {candidates.length} candidate profiles</span>
              <span className="font-mono">Sorted by Matching Score descending</span>
            </div>

          </section>
        ) : (
          /* Empty State Banner (Initial Landing) */
          <div className="text-center p-12 bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg flex flex-col items-center">
            <div className="p-4 bg-zinc-950 rounded-full text-zinc-600 mb-4 border border-zinc-800">
              <Users className="h-8 w-8 text-indigo-400" />
            </div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide">No Pool Screened Yet</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-2 leading-relaxed">
              Compile your Job Description, drop candidate resumes above, and click "Start Screening" to generate alignment summaries instantly.
            </p>
          </div>
        )}

      </main>

      {/* History Session Drawer Modal */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              
              {/* Overlay background */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowHistoryModal(false)}
                className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity" 
              />

              {/* Modal spacing agent */}
              <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

              {/* Modal Box */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="inline-block align-bottom bg-zinc-900 rounded-xl text-left border border-zinc-800 shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full overflow-hidden"
              >
                <div className="p-6 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-white text-sm uppercase tracking-wide flex items-center gap-2">
                      <History className="h-5 w-5 text-indigo-400" />
                      Session History Log ({historySessions.length})
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">Pick a previous analysis pool to load directly into your active workspace</p>
                  </div>
                  <button 
                    onClick={() => setShowHistoryModal(false)} 
                    className="text-zinc-500 hover:text-white text-sm font-semibold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-6 max-h-[380px] overflow-y-auto space-y-3 bg-[#09090b]/40">
                  {historySessions.length === 0 ? (
                    <div className="text-center py-10 text-zinc-500 text-xs">
                      No historical evaluations saved yet.
                    </div>
                  ) : (
                    historySessions.map((hist, hIdx) => (
                      <div 
                        key={hIdx}
                        className="p-4 bg-zinc-900 border border-zinc-800/80 rounded-lg hover:border-zinc-700 transition-all hover:bg-zinc-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-900/30">
                              {hist.resumesCount} Candidate{hist.resumesCount > 1 ? "s" : ""}
                            </span>
                            <span className="text-[11px] text-zinc-500 font-mono">{hist.screenedAt}</span>
                          </div>
                          
                          <p className="text-xs text-zinc-400 line-clamp-2 mt-2 leading-relaxed">
                            <strong className="text-zinc-300">Target JD snippet:</strong> {hist.jobDescription}
                          </p>
                        </div>

                        <div className="shrink-0 flex items-center">
                          <button
                            onClick={() => handleLoadSession(hist)}
                            className="px-3 py-1.5 bg-zinc-800 border border-zinc-750 text-zinc-300 hover:border-zinc-650 hover:bg-zinc-750 hover:text-white text-[11px] font-semibold rounded-md transition-colors cursor-pointer"
                          >
                            Load Pool
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-4.5 bg-zinc-950 border-t border-zinc-800 flex justify-end">
                  <button
                    onClick={() => setShowHistoryModal(false)}
                    className="px-4 py-2 border border-zinc-800 bg-zinc-900 hover:bg-zinc-850 hover:text-white text-zinc-300 font-semibold rounded-lg text-xs cursor-pointer"
                  >
                    Close History
                  </button>
                </div>
              </motion.div>

            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Modern Compact Minimal Footer */}
      <footer className="mt-16 text-center text-xs text-zinc-600">
        <p>© 2026 AI Resume Screening Assistant • Powered by Google Gemini 3.5-flash</p>
      </footer>

    </div>
  );
}
