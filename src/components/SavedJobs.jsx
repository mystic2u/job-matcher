import React, { useEffect, useState } from "react";
import { Briefcase, ExternalLink } from "lucide-react";

const DECISIONS_KEY = "job-matcher-decisions";

export default function SavedJobs() {
  const [saved, setSaved] = useState([]);

  useEffect(() => {
    try {
      const decisions = JSON.parse(localStorage.getItem(DECISIONS_KEY) || "{}");
      const savedEntries = Object.entries(decisions)
        .filter(([, d]) => d.decision === "saved")
        .map(([url, d]) => ({ url, ...d }));
      setSaved(savedEntries);
    } catch {
      setSaved([]);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <span className="inline-block text-xs tracking-widest uppercase text-slate-500 mb-2">
            Saved
          </span>
          <h1 className="font-serif text-3xl md:text-4xl text-slate-50">Jobs you've saved</h1>
        </div>

        {saved.length === 0 && (
          <p className="text-sm text-slate-500 py-16 text-center">Nothing saved yet.</p>
        )}

        <div className="space-y-3">
          {saved.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg p-4 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                <div>
                  <p className="text-slate-50">{s.title}</p>
                  <p className="text-xs text-slate-500">{s.company}</p>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
