import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Briefcase,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const JOBS_URL = "https://raw.githubusercontent.com/mystic2u/job-matcher/main/jobs.json";
const MAX_JOBS_TO_SCORE = 80;
const DECISIONS_KEY = "job-matcher-decisions";

// Replace with your actual Worker URL once it's deployed
const WORKER_URL = "https://job-matcher-proxy.YOUR-SUBDOMAIN.workers.dev";

function truncate(str, n) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n) + "..." : str;
}

function loadDecisions() {
  try {
    return JSON.parse(localStorage.getItem(DECISIONS_KEY) || "{}");
  } catch {
    return {};
  }
}

async function callWorker(content, maxTokens) {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });
  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("No response");
  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

export default function JobMatcher() {
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState(null);

  const [resumeText, setResumeText] = useState("");
  const [matches, setMatches] = useState(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [matching, setMatching] = useState(false);
  const [matchPhase, setMatchPhase] = useState(null); // "scoring" | "enriching"
  const [matchError, setMatchError] = useState(null);
  const [exiting, setExiting] = useState(null); // null | "saved" | "rejected"

  const [decisions, setDecisions] = useState({});

  useEffect(() => {
    setDecisions(loadDecisions());
  }, []);

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

  const recordDecision = (decision) => {
    if (exiting) return;
    const current = matches && matches[reviewIndex];
    if (!current) return;
    setExiting(decision);
    setTimeout(() => {
      const updated = {
        ...decisions,
        [current.job.url]: {
          decision,
          title: current.job.title,
          company: current.job.company,
        },
      };
      setDecisions(updated);
      localStorage.setItem(DECISIONS_KEY, JSON.stringify(updated));
      setReviewIndex((i) => i + 1);
      setExiting(null);
    }, 200);
  };

  useEffect(() => {
    function handleKey(e) {
      if (!matches || reviewIndex >= matches.length) return;
      if (e.key === "ArrowRight") recordDecision("saved");
      if (e.key === "ArrowLeft") recordDecision("rejected");
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [matches, reviewIndex, decisions, exiting]);

  const handleMatch = async () => {
    if (!resumeText.trim() || jobs.length === 0) return;
    setMatching(true);
    setMatchPhase("scoring");
    setMatchError(null);
    setMatches(null);
    setReviewIndex(0);
    try {
      const scored = jobs.slice(0, MAX_JOBS_TO_SCORE);
      const jobList = scored
        .map(
          (j, i) =>
            `${i}: ${j.title} @ ${j.company}${j.location ? ", " + j.location : ""}\n${truncate(j.description, 200)}`
        )
        .join("\n\n");

      const savedList = Object.values(decisions)
        .filter((d) => d.decision === "saved")
        .map((d) => `${d.title} at ${d.company}`);
      const rejectedList = Object.values(decisions)
        .filter((d) => d.decision === "rejected")
        .map((d) => `${d.title} at ${d.company}`);

      let feedback = "";
      if (savedList.length) {
        feedback += `\n\nRoles this candidate has previously saved, lean toward similar ones:\n${savedList.join("\n")}`;
      }
      if (rejectedList.length) {
        feedback += `\n\nRoles this candidate has previously rejected, avoid similar ones:\n${rejectedList.join("\n")}`;
      }

      const scorePayload = await callWorker(
        'You match a candidate\'s resume against open job postings. Respond with ONLY a JSON object, no markdown fences, no preamble. Schema: {"matches": [{"index": number, "score": number, "reason": string}]}. Score is 0 to 100. Only include jobs that are a genuine fit, leave out weak matches rather than ranking everything, cap at 10 results, order by score descending.\n\nResume:\n' +
          resumeText +
          feedback +
          "\n\nJob listings:\n" +
          jobList,
        1200
      );

      const resolved = (scorePayload.matches || [])
        .map((m) => ({ ...m, job: scored[m.index], details: null }))
        .filter((m) => m.job);

      if (resolved.length === 0) {
        setMatches(resolved);
        return;
      }

      setMatchPhase("enriching");
      try {
        const fullJobList = resolved
          .map((m, i) => `${i}: ${m.job.title} @ ${m.job.company}\n${truncate(m.job.description, 2500)}`)
          .join("\n\n");

        const detailPayload = await callWorker(
          'Extract structured details from each job posting below. Respond with ONLY a JSON object, no markdown fences, no preamble. Schema: {"jobs": [{"index": number, "salary": string or null, "responsibilities": string or null, "requirements": string or null, "start_date": string or null, "experience_required": string or null, "summary": string}]}. Use null for any field not mentioned in the posting text, do not guess or invent figures. Keep responsibilities and requirements each to 2 or 3 short sentences. Keep summary to one or two sentences.\n\nJob postings:\n' +
            fullJobList,
          3000
        );

        const detailsByIndex = {};
        (detailPayload.jobs || []).forEach((d) => {
          detailsByIndex[d.index] = d;
        });

        const enriched = resolved.map((m, i) => ({ ...m, details: detailsByIndex[i] || null }));
        setMatches(enriched);
      } catch (err) {
        // Enrichment failing shouldn't lose the working match results
        setMatches(resolved);
      }
    } catch (err) {
      setMatchError("Could not score matches. Try again.");
    } finally {
      setMatching(false);
      setMatchPhase(null);
    }
  };

  const current = matches && matches[reviewIndex];
  const savedCount = Object.values(decisions).filter((d) => d.decision === "saved").length;

  const cardTransform =
    exiting === "saved" ? "translate-x-full opacity-0" : exiting === "rejected" ? "-translate-x-full opacity-0" : "translate-x-0 opacity-100";

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
                {matchPhase === "enriching" ? "Adding details" : "Matching"}
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

        {matches && matches.length === 0 && (
          <p className="text-sm text-slate-500 py-8 text-center">
            No strong matches in the current listings.
          </p>
        )}

        {matches && matches.length > 0 && current && (
          <div>
            <p className="text-xs text-slate-500 mb-3">
              {reviewIndex + 1} of {matches.length}
            </p>
            <div
              className={`bg-slate-900 border border-slate-800 rounded-lg p-6 transition-all duration-200 ${cardTransform}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                    <h3 className="font-serif text-xl text-slate-50">{current.job.title}</h3>
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {current.job.company}
                    {current.job.location ? ` \u00b7 ${current.job.location}` : ""}
                  </p>
                </div>
                <span className="relative shrink-0 text-xs font-medium text-slate-950 px-2 py-0.5">
                  <span className="absolute inset-0 bg-amber-500 -skew-x-6 rounded-sm" />
                  <span className="relative">{current.score}</span>
                </span>
              </div>

              {current.details?.summary && (
                <p className="text-sm text-slate-300 mt-4">{current.details.summary}</p>
              )}

              {(current.details?.salary || current.details?.experience_required || current.details?.start_date) && (
                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-800">
                  {current.details?.salary && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">Salary</p>
                      <p className="text-xs text-slate-300 mt-0.5">{current.details.salary}</p>
                    </div>
                  )}
                  {current.details?.experience_required && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">Experience</p>
                      <p className="text-xs text-slate-300 mt-0.5">{current.details.experience_required}</p>
                    </div>
                  )}
                  {current.details?.start_date && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">Start date</p>
                      <p className="text-xs text-slate-300 mt-0.5">{current.details.start_date}</p>
                    </div>
                  )}
                </div>
              )}

              {current.details?.responsibilities && (
                <div className="mt-4">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Responsibilities</p>
                  <p className="text-sm text-slate-300">{current.details.responsibilities}</p>
                </div>
              )}

              {current.details?.requirements && (
                <div className="mt-4">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Requirements</p>
                  <p className="text-sm text-slate-300">{current.details.requirements}</p>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-slate-800">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Why it's a good fit</p>
                <p className="text-sm text-slate-300">{current.reason}</p>
              </div>

              <a
                href={current.job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mt-4"
              >
                View posting <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="flex justify-between items-center mt-4">
              <button
                onClick={() => recordDecision("rejected")}
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-400 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Reject
              </button>
              <span className="text-xs text-slate-600">use \u2190 / \u2192</span>
              <button
                onClick={() => recordDecision("saved")}
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-emerald-400 transition-colors"
              >
                Save
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {matches && matches.length > 0 && !current && (
          <p className="text-sm text-slate-500 py-8 text-center">
            That's everything from this run. {savedCount} saved so far, check the Saved tab.
          </p>
        )}
      </div>
    </div>
  );
}
