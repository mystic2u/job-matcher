import React, { useState } from "react";
import { Sparkles, Loader2, FileText, AlertCircle } from "lucide-react";

// Replace with your actual Worker URL once it's deployed
const WORKER_URL = "https://calm-field-818cjob-matcher-proxy.swaggz4life.workers.dev/";

function monthIndex(dateStr) {
  if (!dateStr || dateStr === "Present") {
    const now = new Date();
    return now.getFullYear() * 12 + now.getMonth();
  }
  const [y, m] = dateStr.split("-").map(Number);
  return y * 12 + (m - 1);
}

// Merges overlapping role date ranges before summing, so concurrent roles
// don't get double counted. This runs in JS rather than asking the model
// to do the arithmetic, which is where the inaccurate totals were coming from.
function computeTotalYears(roles) {
  const intervals = (roles || [])
    .filter((r) => r.start)
    .map((r) => [monthIndex(r.start), monthIndex(r.end)])
    .filter(([s, e]) => e >= s)
    .sort((a, b) => a[0] - b[0]);

  if (intervals.length === 0) return 0;

  let totalMonths = 0;
  let [curStart, curEnd] = intervals[0];
  for (const [s, e] of intervals.slice(1)) {
    if (s <= curEnd) {
      curEnd = Math.max(curEnd, e);
    } else {
      totalMonths += curEnd - curStart;
      [curStart, curEnd] = [s, e];
    }
  }
  totalMonths += curEnd - curStart;
  return Math.round((totalMonths / 12) * 10) / 10;
}

function formatRange(start, end) {
  return `${start || "?"} \u2013 ${end === "Present" ? "Present" : end || "?"}`;
}

export default function ResumeParser() {
  const [resumeText, setResumeText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleParse = async () => {
    if (!resumeText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content:
                'You extract structured data from resumes. Respond with ONLY a JSON object, no markdown fences, no preamble. For each role, give start and end as "YYYY-MM" (use "Present" for a current role). Do not calculate durations or totals yourself, just report the dates as written. Schema: {"seniority": string, "primary_role": string, "skills": string[], "industries": string[], "roles": [{"title": string, "start": "YYYY-MM", "end": "YYYY-MM or Present"}], "summary": string}. Resume text:\n\n' +
                resumeText,
            },
          ],
        }),
      });
      const data = await response.json();
      const textBlock = (data.content || []).find((b) => b.type === "text");
      if (!textBlock) throw new Error("No text in response");
      const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      parsed.years_experience = computeTotalYears(parsed.roles);
      setResult(parsed);
    } catch (err) {
      setError("Could not extract structured data. Try again, or check the pasted text.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <span className="inline-block text-xs tracking-widest uppercase text-slate-500 mb-2">
            Resume intake
          </span>
          <h1 className="font-serif text-3xl md:text-4xl text-slate-50">
            Paste in a resume, get back a brief
          </h1>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-slate-500" />
              <span className="text-xs tracking-widest uppercase text-slate-500">Source</span>
            </div>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste resume text here..."
              className="flex-1 min-h-[320px] bg-slate-950 border border-slate-800 rounded-md p-4 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40 resize-none"
            />
            <button
              onClick={handleParse}
              disabled={loading || !resumeText.trim()}
              className="mt-4 inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-medium text-sm rounded-md py-2.5 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Extract
                </>
              )}
            </button>
            {error && (
              <div className="mt-3 flex items-start gap-2 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs tracking-widest uppercase text-slate-500">Extract</span>
            </div>

            {!result && !loading && (
              <div className="h-full flex items-center justify-center text-slate-600 text-sm py-16">
                Nothing extracted yet
              </div>
            )}

            {loading && (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm py-16">
                Reading the resume...
              </div>
            )}

            {result && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h2 className="font-serif text-xl text-slate-50">{result.primary_role}</h2>
                    <span className="relative text-xs font-medium text-slate-950 px-1.5">
                      <span className="absolute inset-0 bg-amber-500 -skew-x-6 rounded-sm" />
                      <span className="relative">{result.seniority}</span>
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    {result.years_experience} years experience
                  </p>
                </div>

                <div>
                  <h3 className="text-xs tracking-widest uppercase text-slate-500 mb-2">Skills</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {(result.skills || []).map((s, i) => (
                      <span key={i} className="text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-full px-2.5 py-1">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs tracking-widest uppercase text-slate-500 mb-2">Industries</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {(result.industries || []).map((s, i) => (
                      <span key={i} className="text-xs bg-teal-950 border border-teal-800 text-teal-300 rounded-full px-2.5 py-1">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs tracking-widest uppercase text-slate-500 mb-2">Roles</h3>
                  <ul className="space-y-1.5">
                    {(result.roles || []).map((r, i) => (
                      <li key={i} className="flex justify-between text-sm text-slate-300 border-b border-slate-800 pb-1.5">
                        <span>{r.title}</span>
                        <span className="text-slate-500">{formatRange(r.start, r.end)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-xs tracking-widest uppercase text-slate-500 mb-2">Summary</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">{result.summary}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
