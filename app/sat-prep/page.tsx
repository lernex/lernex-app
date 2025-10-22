"use client";

import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@/types";
import LessonCard from "@/components/LessonCard";
import QuizBlock from "@/components/QuizBlock";
import FormattedText from "@/components/FormattedText";
import { Brain } from "lucide-react";

type SATSection = "math" | "reading" | "writing";
type SATTopic = {
  id: string;
  label: string;
  section: SATSection;
};

const SAT_TOPICS: SATTopic[] = [
  // Math topics (currently no questions in database)
  { id: "algebra", label: "Algebra", section: "math" },
  { id: "geometry", label: "Geometry", section: "math" },
  { id: "trigonometry", label: "Trigonometry", section: "math" },
  { id: "data-analysis", label: "Data Analysis", section: "math" },
  { id: "problem-solving", label: "Problem Solving", section: "math" },

  // Reading topics - Vocabulary (first 10 questions)
  { id: "contextual-meaning", label: "Contextual Meaning", section: "reading" },
  { id: "context-clues", label: "Context Clues", section: "reading" },
  { id: "precise-word-choice", label: "Precise Word Choice", section: "reading" },
  { id: "technical-vocabulary", label: "Technical Vocabulary", section: "reading" },
  { id: "nuanced-vocabulary", label: "Nuanced Vocabulary", section: "reading" },
  { id: "inference-from-evidence", label: "Inference from Evidence", section: "reading" },
  { id: "synonym-recognition", label: "Synonym Recognition", section: "reading" },
  { id: "spatial-vocabulary", label: "Spatial Vocabulary", section: "reading" },
  { id: "advanced-vocabulary", label: "Advanced Vocabulary", section: "reading" },
  { id: "contrast-interpretation", label: "Contrast Interpretation", section: "reading" },

  // Reading topics - Comprehension (next 10 questions)
  { id: "main-idea-identification", label: "Main Idea", section: "reading" },
  { id: "author-purpose", label: "Author's Purpose", section: "reading" },
  { id: "textual-inference", label: "Textual Inference", section: "reading" },
  { id: "structural-analysis", label: "Text Structure", section: "reading" },
  { id: "cross-text-synthesis", label: "Cross-Text Analysis", section: "reading" },
  { id: "character-motivation", label: "Character Motivation", section: "reading" },
  { id: "explicit-meaning", label: "Explicit Meaning", section: "reading" },
  { id: "literary-device-analysis", label: "Literary Devices", section: "reading" },
  { id: "central-claim", label: "Central Claim", section: "reading" },
  { id: "character-perspective", label: "Character Perspective", section: "reading" },
  { id: "graph-data-analysis", label: "Graph Analysis", section: "reading" },
  { id: "table-data-analysis", label: "Table Analysis", section: "reading" },
  { id: "table-trend-analysis", label: "Data Trends", section: "reading" },
  { id: "summarizing-claims", label: "Summarizing", section: "reading" },
  { id: "evidence-evaluation", label: "Evidence Evaluation", section: "reading" },

  // Writing topics (currently no questions in database)
  { id: "grammar", label: "Grammar & Usage", section: "writing" },
  { id: "sentence-structure", label: "Sentence Structure", section: "writing" },
  { id: "punctuation", label: "Punctuation", section: "writing" },
  { id: "rhetoric", label: "Rhetorical Skills", section: "writing" },
];

export default function SATPrep() {
  const [selectedSection, setSelectedSection] = useState<SATSection>("reading");
  const [selectedTopic, setSelectedTopic] = useState<string>("contextual-meaning");
  const [streamed, setStreamed] = useState("");
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const sections: { key: SATSection; label: string; color: string }[] = [
    { key: "math", label: "Math", color: "from-blue-500 to-cyan-500" },
    { key: "reading", label: "Reading", color: "from-purple-500 to-pink-500" },
    { key: "writing", label: "Writing", color: "from-green-500 to-emerald-500" },
  ];

  const currentTopics = SAT_TOPICS.filter((t) => t.section === selectedSection);

  useEffect(() => {
    const firstTopic = currentTopics[0];
    if (firstTopic) setSelectedTopic(firstTopic.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSection]);

  const startProgress = () => {
    setProgress(0);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(1, Math.floor((90 - p) / 8)) : p));
    }, 120);
  };

  const stopProgress = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setProgress(100);
    setTimeout(() => setProgress(0), 400);
  };

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  const run = async () => {
    const t0 = performance.now();
    setLoading(true);
    setErr(null);
    setLesson(null);
    setStreamed("");
    startProgress();

    try {
      const topicData = SAT_TOPICS.find((t) => t.id === selectedTopic);
      const topicLabel = topicData?.label ?? "SAT Practice";

      // Fetch SAT questions from database for context
      const streamReq = fetch("/api/sat-prep/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          section: selectedSection,
          topic: selectedTopic,
          topicLabel,
        }),
      });
      const t1 = performance.now();
      console.log("[sat-prep] request-sent", (t1 - t0).toFixed(1), "ms");

      const quizReq = fetch("/api/sat-prep/quiz", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          section: selectedSection,
          topic: selectedTopic,
          topicLabel,
        }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.text()) || "Quiz failed");
        return r.json();
      });

      const res = await streamReq;
      const t1b = performance.now();
      console.log("[sat-prep] response-received", {
        dt: (t1b - t0).toFixed(1) + "ms",
        status: res.status,
        ok: res.ok,
      });

      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || "Stream failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      const streamPump = async () => {
        console.log("[sat-prep] stream-start");
        let first = true;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (first) {
            console.log("[sat-prep] stream-first-chunk", {
              len: chunk.length,
              dt: (performance.now() - t0).toFixed(1) + "ms",
            });
            first = false;
          }
          full += chunk;
          setStreamed((s) => s + chunk);
        }
        console.log("[sat-prep] stream-complete-bytes", { len: full.length });
        return full.trim();
      };

      const [content, quizObj] = await Promise.all([streamPump(), quizReq]);

      const assembled: Lesson = {
        id: quizObj?.id ?? crypto.randomUUID(),
        subject: `SAT ${selectedSection.charAt(0).toUpperCase() + selectedSection.slice(1)}`,
        topic: topicLabel,
        title: quizObj?.title ?? `SAT ${topicLabel} Practice`,
        content: content || "Generated SAT practice lesson.",
        difficulty: (quizObj?.difficulty as "intro" | "easy" | "medium" | "hard") ?? "medium",
        questions: Array.isArray(quizObj?.questions) ? quizObj.questions : [],
      };

      setLesson(assembled);
      const t3 = performance.now();
      console.log("[sat-prep] stream-complete", (t3 - t0).toFixed(1), "ms");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setErr(message);
    } finally {
      setLoading(false);
      stopProgress();
    }
  };

  useEffect(() => {
    if (!lesson) return;
    const kick = () => {
      try {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.MathJax?.typesetPromise?.().catch(() => {});
            setTimeout(() => {
              window.MathJax?.typesetPromise?.().catch(() => {});
            }, 200);
          });
        });
      } catch {}
    };
    kick();
  }, [lesson]);

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 py-10 text-foreground">
      <div className="w-full max-w-2xl space-y-4 py-6">
        <div className="rounded-2xl border border-surface bg-surface-panel p-6 space-y-5 shadow-sm backdrop-blur transition-colors">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-lernex-blue/20 to-lernex-purple/20 text-lernex-blue shadow-inner">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-lernex-blue to-lernex-purple bg-clip-text text-transparent">
                SAT Prep
              </h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Practice with realistic SAT-style questions
              </p>
            </div>
          </div>

          {(loading || progress > 0) && (
            <div className="h-2 w-full rounded-full bg-surface-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-lernex-blue to-lernex-purple transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Section Selection */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Select SAT Section
            </label>
            <div className="grid grid-cols-3 gap-2">
              {sections.map((section) => (
                <button
                  key={section.key}
                  onClick={() => setSelectedSection(section.key)}
                  className={`relative overflow-hidden rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                    selectedSection === section.key
                      ? `border-transparent bg-gradient-to-r ${section.color} text-white shadow-lg`
                      : "border-surface bg-surface-card text-neutral-700 dark:text-neutral-200 hover:border-lernex-blue/40 hover:shadow-md"
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </div>

          {/* Topic Selection */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Choose Topic
            </label>
            <div className="grid grid-cols-2 gap-2">
              {currentTopics.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => setSelectedTopic(topic.id)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                    selectedTopic === topic.id
                      ? "border-lernex-blue bg-lernex-blue/10 text-lernex-blue shadow-sm dark:bg-lernex-blue/20"
                      : "border-surface bg-surface-muted text-neutral-600 dark:text-neutral-300 hover:border-lernex-blue/30 hover:bg-surface-card"
                  }`}
                >
                  {topic.label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={run}
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-r from-lernex-blue to-lernex-purple py-3.5 text-white font-semibold shadow-lg transition-all hover:opacity-90 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-sm"
          >
            {loading ? "Generating Practice..." : "Generate SAT Practice"}
          </button>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400">
              {err}
            </div>
          )}
        </div>

        {/* Streaming text preview */}
        {!lesson && streamed && (
          <div className="whitespace-pre-wrap rounded-2xl border border-surface bg-surface-card p-5 text-neutral-700 shadow-sm dark:text-neutral-200 transition-all animate-in fade-in duration-300">
            <FormattedText text={streamed} incremental />
          </div>
        )}

        {/* Empty state */}
        {!lesson && !streamed && (
          <div className="rounded-2xl border border-dashed border-surface bg-gradient-to-br from-surface-muted/50 to-surface-card/50 p-6 shadow-sm backdrop-blur transition-all">
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-lernex-blue/10 to-lernex-purple/10">
                  <Brain className="h-8 w-8 text-lernex-blue" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
                Ready to Practice?
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 max-w-md mx-auto">
                Select an SAT section and topic above, then click Generate to create
                realistic practice questions modeled after actual SAT exams.
              </p>
              <div className="pt-2">
                <ul className="inline-flex flex-col gap-1.5 text-left text-xs text-neutral-500 dark:text-neutral-400">
                  <li className="flex items-start gap-2">
                    <span className="text-lernex-blue mt-0.5">✓</span>
                    <span>Questions based on real SAT patterns</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-lernex-blue mt-0.5">✓</span>
                    <span>Instant feedback and explanations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-lernex-blue mt-0.5">✓</span>
                    <span>Practice at your own pace</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Lesson display */}
        {lesson && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <LessonCard lesson={lesson} className="max-h-[60vh] sm:max-h-[520px] min-h-[260px]" />
            {Array.isArray(lesson.questions) && lesson.questions.length > 0 && (
              <QuizBlock lesson={lesson} onDone={() => {}} />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
