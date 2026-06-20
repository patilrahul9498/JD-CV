import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// In-memory cache for raw document downloads
const resumeFileCache = new Map<string, { buffer: Buffer; mimeType: string; originalName: string }>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Multer in-memory upload configuration
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 15 * 1024 * 1024, // 15MB limit
      files: 5, // strictly up to 5 resumes
    }
  });

  // Lazy initialize Google GenAI API Client
  const getGenAIClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY is not defined in environment variables.");
      return null;
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  };

  // Endpoint: Analyze PDF/DOCX Resumes against Job Description
  app.post("/api/analyze", upload.array("resumes", 5), async (req, res) => {
    try {
      const { jobDescription } = req.body;
      if (!jobDescription || jobDescription.trim() === "") {
        return res.status(400).json({ error: "Job Description is required." });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "At least one candidate resume must be uploaded." });
      }

      const ai = getGenAIClient();
      if (!ai) {
        return res.status(500).json({
          error: "Gemini API key is not configured on the server. Please define GEMINI_API_KEY to start resume screening."
        });
      }

      const results = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let textContent = "";

        // Parse resume based on mimetype/extension
        try {
          const extension = file.originalname.slice(((file.originalname.lastIndexOf(".") - 1) >>> 0) + 2).toLowerCase();
          
          if (file.mimetype === "application/pdf" || extension === "pdf") {
            const parser = new PDFParse({ data: file.buffer });
            const parsed = await parser.getText();
            textContent = parsed.text || "";
          } else if (
            file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
            extension === "docx"
          ) {
            const parsed = await mammoth.extractRawText({ buffer: file.buffer });
            textContent = parsed.value || "";
          } else {
            // Treat as plain text
            textContent = file.buffer.toString("utf8") || "";
          }
        } catch (parseError: any) {
          console.error(`Error parsing document: ${file.originalname}`, parseError);
          textContent = `[Failed to extract text from document ${file.originalname}. Please review download directly]`;
        }

        // Cache file for direct download/viewing support
        const fileId = `res-${Date.now()}-${i}`;
        resumeFileCache.set(fileId, {
          buffer: file.buffer,
          mimeType: file.mimetype || "application/octet-stream",
          originalName: file.originalname,
        });

        // Trigger Gemini structured ranking evaluation
        const promptText = `
JOB DESCRIPTION:
${jobDescription}

CANDIDATE DOCUMENT CONTENT:
${textContent || `[File parsing failed or contained no recognizable technical text. Filename: ${file.originalname}]`}
`;

        try {
          const geminiResponse = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: promptText,
            config: {
              systemInstruction: `You are an elite automated technical screening recruiter. 
Review the Candidate Document Content against the core requirements of the Job Description. 

1. Determine the clean candidate name. If no exact candidate name is present in the CV, extract an alternative name string (such as the document name without extension). Do NOT return "Candidate" or "Unknown" unless absolutely necessary.

2. Calculate a strictly matching score from 0 to 100 based on the following specific 5 screening criteria. Start with a baseline score of 50:
   - hard_skills_match: Check for tools, languages, platforms, frameworks, and methods named in the JD. If any of these matches exist, increase the score by 10. If none match, decrease the score.
   - seniority_match: The candidate's most recent role should plausibly map to the JD level (such as junior, mid-level, or senior in terms of experience). If it maps accurately, increase the score by 10. If not, decrease the score.
   - recent_experience_match: The top part of the resume carries more weight than older roles. If the most recent roles align strongly with the core JD requirements, increase the score by 10. If not, decrease the score.
   - phrasing_alignment_match: Use of the employer’s exact wording for skills and responsibilities when it is accurate and supported by experience. If exact phrasing or direct terminology is shared, increase the score by 10. If not, decrease the score.
   - specialized_certifications_or_education: Education and certifications matter when explicitly requested, especially for specialized or regulated roles. If these requirements match or are satisfied, increase the score by 10. If none match/are satisfied, decrease the score.

   *Constraint*: The total matchingScore MUST NOT go more than 100, and must not be lower than 0. If none of the five criteria above match or are satisfied, decrease the score heavily. Ensure realistic, calibrated arithmetic.

3. Call out explicit strengths and weaknesses based STRICTLY on the JD comparison. Strengths must represent actual matches, whereas weaknesses must represent missing core skills or experience gaps.

4. Provide a high-quality 1-2 sentence professional summary detailing their exact relevant years of experience, core matching skills, and where they fall short.

Return responses in strict JSON matching the requested schema.`,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  candidateName: {
                    type: Type.STRING,
                    description: "Formal full name of the candidate extracted directly from the CV content. If missing, return empty string."
                  },
                  matchingScore: {
                    type: Type.INTEGER,
                    description: "Score out of 100 based on: hard skills (+10/dec), seniority alignment (+10/dec), recent experience prominence (+10/dec), phrasing matching (+10/dec), and certs/edu (+10/dec). Caps at 100, min 0."
                  },
                  strengths: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "List of 2-4 key alignment strengths."
                  },
                  weaknesses: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "List of 2-4 missing requirements or skill gaps compared to the JD."
                  },
                  summary: {
                    type: Type.STRING,
                    description: "Short, factual candidate resume summary matching JD requirements."
                  }
                },
                required: ["candidateName", "matchingScore", "strengths", "weaknesses", "summary"]
              }
            }
          });

          const jsonText = geminiResponse.text?.trim() || "{}";
          const evaluationResult = JSON.parse(jsonText);

          let resolvedName = evaluationResult.candidateName?.trim();
          if (!resolvedName || resolvedName.toLowerCase() === "candidate" || resolvedName.length < 2) {
            resolvedName = file.originalname.substring(0, file.originalname.lastIndexOf(".")) || file.originalname;
          }

          results.push({
            id: fileId,
            candidateName: resolvedName,
            matchingScore: Math.min(100, Math.max(0, Number(evaluationResult.matchingScore) || 0)),
            strengths: Array.isArray(evaluationResult.strengths) ? evaluationResult.strengths : [],
            weaknesses: Array.isArray(evaluationResult.weaknesses) ? evaluationResult.weaknesses : [],
            summary: evaluationResult.summary || "Summary generation complete.",
            fileName: file.originalname,
            downloadUrl: `/api/resumes/${fileId}`
          });

        } catch (geminiError: any) {
          console.error(`Gemini Evaluation Error for candidate ${file.originalname}:`, geminiError);
          const fallbackName = file.originalname.substring(0, file.originalname.lastIndexOf(".")) || file.originalname;
          results.push({
            id: fileId,
            candidateName: fallbackName,
            matchingScore: 40,
            strengths: ["Successfully parsed document format"],
            weaknesses: ["AI screen timeout or quota limit reached"],
            summary: `Automated grading was interrupted for this CV: ${geminiError.message || "Endpoint error"}.`,
            fileName: file.originalname,
            downloadUrl: `/api/resumes/${fileId}`
          });
        }
      }

      // Sort by matching score descending by default
      results.sort((a, b) => b.matchingScore - a.matchingScore);

      res.json({ results });
    } catch (err: any) {
      console.error("Critical API Analyze error:", err);
      res.status(500).json({ error: err.message || "An unexpected error occurred during resume screening." });
    }
  });

  // Endpoint: Download/View specific CV file
  app.get("/api/resumes/:id", (req, res) => {
    const fileId = req.params.id;
    const item = resumeFileCache.get(fileId);

    if (!item) {
      return res.status(404).send("Document not found or session has expired. Please re-run analysis.");
    }

    res.setHeader("Content-Type", item.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(item.originalName)}"`);
    res.send(item.buffer);
  });

  // Vite Assets Dev vs Production serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // PORT is 3000 inside the container proxy environment
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server integrated on port ${PORT}`);
  });
}

startServer();
