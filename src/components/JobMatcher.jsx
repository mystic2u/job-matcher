import React, { useState, useEffect } from "react";
import { Sparkles, Loader2, AlertCircle, Briefcase, ExternalLink } from "lucide-react";

const JOBS_URL = "https://raw.githubusercontent.com/mystic2u/job-matcher/main/jobs.json";
const MAX_JOBS_TO_SCORE = 80;

// Replace with your actual Worker URL once it's deployed
const WORKER_URL = "https://job-matcher-proxy.YOUR-SUBDOMAIN.workers.dev";

function truncate(str, n) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n) + "..." : str;
}

export default function JobMatcher() {
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState(null);

  const [resumeText, setResumeText] = useState("");
  const [matches, setMatches] = useState(null);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState(null);

  useEffect(() => {
    fetch(JOBS_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load jobs.json");
        return res.json();
      })
      .then((data) => {
        setJobs(data.jobs || []);
        setJobsLoading(false);
      })
      .catch((err) => {
        setJobsError(err.message);
        setJobsLoading(false);
      });
  }, []);

  const handleMatch = async () => {
    if (!resumeText.trim() || jobs.length === 0) return;
    setMatching(true);
    setMatchError(null);
    setMatches(null);
    try {
      const scored = jobs.slice(0, MAX_JOBS_TO_SCORE);
      const jobList = scored
        .map(
          (j, i) =>
            `${i}: ${j.title} @ ${j.company}${j.location ? ", " + j.location : ""}\n${truncate(j.description, 200)}`
        )
        .join("\n\n");

      const response = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1200,
          messages: [
            {
              role: "user",
              content:
                'You match a candidate\'s resume against open job postings. Respond with ONLY a JSON object, no markdown fences, no preamble. Schema: {"matches": [{"index": number, "score": number, "reason": string}]}. Score is 0 to 100. Only include jobs that are a genuine fit, leave out weak matches rather than ranking everything, cap at 10 results, order by score descending.\n\nResume:\n' +
                resumeText +
                "\n\nJob listings:\n" +
                jobList,
            },
          ],
        }),
      });
      const data = await response.json();
      const textBlock = (data.content || []).find((b) => b.type === "text");
      if (!textBlock) throw new Error("No response");
      const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const resolved = (parsed.matches || [])
        .map((m) => ({ ...m, job: scored[m.index] }))
        .filter((m) => m.job);
      setMatches(resolved);
    } catch (err) {
      setMatchError("Could not score matches. Try again.");
    } finally {
      setMatching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <span className="inline-block text-xs tracking-widest uppercase text-slate-500 mb-2">
            Job matcher
          </span>
          <h1 className="font-serif text-3xl md:text-4xl text-slate-50">
            Paste your resume, see what fits
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            {jobsLoading
              ? "Loading current listings..."
              : jobsError
              ? `Couldn't load listings: ${jobsError}`
              : `${jobs.length} listings loaded`}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 mb-6">
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste resume text here..."
            className="w-full min-h-[200px] bg-slate-950 border border-slate-800 rounded-md p-4 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40 resize-none"
          />
          <button
            onClick={handleMatch}
            disabled={matching || jobsLoading || !resumeText.trim() || jobs.length === 0}
            className="mt-4 inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-medium text-sm rounded-md py-2.5 px-5 transition-colors"
          >
            {matching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Matching
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Find matches
              </>
            )}
          </button>
          {matchError && (
            <div className="mt-3 flex items-start gap-2 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{matchError}</span>
            </div>
          )}
        </div>

        {matches && (
          <div className="space-y-3">
            {matches.length === 0 && (
              <p className="text-sm text-slate-500 py-8 text-center">
                No strong matches in the current listings.
              </p>
            )}
            {matches.map((m, i) => (
              <a
                key={i}
                href={m.job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                      <h3 className="font-serif text-lg text-slate-50">{m.job.title}</h3>
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {m.job.company}
                      {m.job.location ? ` \u00b7 ${m.job.location}` : ""}
                    </p>
                    <p className="text-sm text-slate-300 mt-2">{m.reason}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="relative text-xs font-medium text-slate-950 px-2 py-0.5">
                      <span className="absolute inset-0 bg-amber-500 -skew-x-6 rounded-sm" />
                      <span className="relative">{m.score}</span>
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
