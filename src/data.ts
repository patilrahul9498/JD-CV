export interface SampleJD {
  title: string;
  description: string;
}

export const SAMPLE_JOB_DESCRIPTIONS: SampleJD[] = [
  {
    title: "Senior Full-Stack Engineer (React & TypeScript)",
    description: `We are looking for a Senior Full-Stack Engineer to design, build, and deploy production-ready web apps.

Requirements:
- 5+ years of software development experience with React (v18+), TypeScript, and Node.js (Express).
- Strong command of modern styling, CSS frameworks like Tailwind CSS, and layout design.
- Hands-on experience with database engines (PostgreSQL/MongoDB) and API design (REST/GraphQL).
- Experience setting up automated CI/CD pipelines, Docker containers, and AWS or GCP cloud environments.
- Excellent communication skills and a passion for mentoring team members.`
  },
  {
    title: "GenAI Product Manager",
    description: `We are hiring a Product Manager to lead our next-generation AI platforms.

Requirements:
- 3+ years of product management experience shipping AI-assisted SaaS applications or developer platforms.
- Deep familiarity with Google Gemini APIs, LLM prompting strategies, and multi-modal models.
- Core proficiency in translating complex technological concepts into elegant human-centered product designs.
- Strong analytical skills, working with telemetry frameworks, metrics tools, and direct user feedback pipelines.
- Technical background or hands-on coding experience is a big plus.`
  }
];
