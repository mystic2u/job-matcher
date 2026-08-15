import { useState } from "react";
import ResumeParser from "./components/ResumeParser.jsx";
import JobMatcher from "./components/JobMatcher.jsx";

export default function App() {
  const [tab, setTab] = useState("match");

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="border-b border-slate-800 px-6 md:px-10 py-4 flex gap-6">
        <button
          onClick={() => setTab("match")}
          className={`text-sm font-medium ${
            tab === "match" ? "text-amber-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Match
        </button>
        <button
          onClick={() => setTab("parse")}
          className={`text-sm font-medium ${
            tab === "parse" ? "text-amber-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Extract
        </button>
      </nav>
      {tab === "match" ? <JobMatcher /> : <ResumeParser />}
    </div>
  );
}
