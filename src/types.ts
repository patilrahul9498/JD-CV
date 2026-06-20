export interface CandidateResult {
  id: string;
  candidateName: string;
  matchingScore: number;
  strengths: string[];
  weaknesses: string[];
  summary: string;
  fileName: string;
  downloadUrl: string;
}

export interface ScreeningSession {
  jobDescription: string;
  resumesCount: number;
  results: CandidateResult[];
  screenedAt: string;
}
