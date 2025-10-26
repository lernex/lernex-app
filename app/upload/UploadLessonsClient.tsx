"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  NotebookPen,
  Sparkles,
  UploadCloud,
  Wand2,
} from "lucide-react";
import LessonCard from "@/components/LessonCard";
import QuizBlock from "@/components/QuizBlock";
import WelcomeTourOverlay from "@/components/WelcomeTourOverlay";
import { ProfileBasicsProvider } from "@/app/providers/ProfileBasicsProvider";
import { useLernexStore } from "@/lib/store";
import type { Lesson } from "@/types";
import type { ProfileBasics } from "@/lib/profile-basics";

type UploadLessonsClientProps = {
  initialProfile?: ProfileBasics | null;
};

type Stage = "idle" | "parsing" | "chunking" | "generating" | "complete" | "error";

type SourcePreview = {
  name: string;
  sizeLabel: string;
};

type PendingLesson = Lesson & {
  sourceIndex: number;
};

const MAX_FILE_SIZE_BYTES = 18 * 1024 * 1024;
const MAX_TEXT_LENGTH = 24_000;
const MIN_CHARS_REQUIRED = 220;

async function parseFileWithLlamaParse(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`"${file.name}" is larger than ${(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB.`);
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload/parse', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to parse file' }));
    throw new Error(error.error || 'Failed to parse file');
  }

  const result = await response.json();
  return result.text || '';
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = -1;
  do {
    size /= 1024;
    unitIndex += 1;
  } while (size >= 1024 && unitIndex < units.length - 1);
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function normalizeWhitespace(raw: string): string {
  return raw.replace(/\r/g, "\n").replace(/\t/g, " ").replace(/\u00a0/g, " ").replace(/[ ]{2,}/g, " ").trim();
}

function chunkTextPassages(text: string): string[] {
  const clean = normalizeWhitespace(text);
  if (!clean) return [];

  // Determine number of chunks based on content length
  // Short content (< 1000 chars): 2-3 lessons
  // Medium content (1000-3000 chars): 3-5 lessons
  // Long content (> 3000 chars): 5-6 lessons
  let targetChunks = 3;
  const textLength = clean.length;

  if (textLength < 1000) {
    targetChunks = Math.max(2, Math.min(3, Math.ceil(textLength / 400)));
  } else if (textLength < 3000) {
    targetChunks = Math.max(3, Math.min(5, Math.ceil(textLength / 700)));
  } else {
    targetChunks = Math.max(5, Math.min(6, Math.ceil(textLength / 900)));
  }

  const maxCharsPerChunk = Math.ceil(textLength / targetChunks);

  const paragraphs = clean
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed.length >= MIN_CHARS_REQUIRED) {
      chunks.push(trimmed);
    }
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }
    const combinedLength = current.length + 2 + paragraph.length;
    if (combinedLength > maxCharsPerChunk * 0.95 && current.length >= MIN_CHARS_REQUIRED) {
      pushCurrent();
      current = paragraph;
    } else {
      current = `${current}\n\n${paragraph}`;
    }
    if (chunks.length >= targetChunks) break;
  }

  if (current && chunks.length < targetChunks) {
    pushCurrent();
  }

  if (chunks.length === 0 && clean.length >= MIN_CHARS_REQUIRED) {
    return [clean];
  }

  return chunks;
}

function deriveInsights(chunks: string[]): string[] {
  if (!chunks.length) return [];
  const highlights = new Set<string>();
  for (const chunk of chunks) {
    const sentences = chunk
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.replace(/\s+/g, " ").trim())
      .filter((sentence) => sentence.length > 0 && sentence.length < 160);
    for (const sentence of sentences.slice(0, 2)) {
      if (highlights.size >= 4) break;
      highlights.add(sentence);
    }
    if (highlights.size >= 4) break;
  }
  return Array.from(highlights);
}

function ensureSubjectLabel(label: string | undefined): string {
  const trimmed = (label ?? "").trim();
  if (trimmed.length === 0) return "General Studies";
  if (trimmed.length <= 1) return trimmed.toUpperCase();
  return trimmed
    .split(/\s+/)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

export default function UploadLessonsClient({ initialProfile }: UploadLessonsClientProps) {
  const { selectedSubjects } = useLernexStore();
  const preferredSubject = useMemo(() => {
    if (selectedSubjects.length > 0) return selectedSubjects[0];
    if (initialProfile?.interests?.length) return initialProfile.interests[0];
    return "General Studies";
  }, [initialProfile?.interests, selectedSubjects]);

  const [subject, setSubject] = useState(() => ensureSubjectLabel(preferredSubject));
  const [stage, setStage] = useState<Stage>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<SourcePreview[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [lessons, setLessons] = useState<PendingLesson[]>([]);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSubject(ensureSubjectLabel(preferredSubject));
  }, [preferredSubject]);

  useEffect(() => {
    if (!lessons.length) return;
    const timer = window.setTimeout(() => {
      try {
        window.MathJax?.typesetPromise?.().catch(() => {});
      } catch {}
    }, 180);
    return () => window.clearTimeout(timer);
  }, [lessons]);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  const resetState = useCallback(() => {
    setStage("idle");
    setStatusDetail(null);
    setProgress(0);
    setError(null);
    setSourcePreview([]);
    setInsights([]);
    setLessons([]);
    setTextPreview(null);
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const handleBrowse = useCallback(() => {
    if (stage === "generating") return;
    fileInputRef.current?.click();
  }, [stage]);

  const processFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);
      setStage("parsing");
      setStatusDetail("Parsing your documents with AI…");
      setProgress(8);
      setLessons([]);
      setInsights([]);

      const previews: SourcePreview[] = [];
      const textFragments: string[] = [];

      try {
        for (let index = 0; index < files.length; index += 1) {
          const file = files.item(index);
          if (!file) continue;
          previews.push({ name: file.name, sizeLabel: formatBytes(file.size) });

          setStatusDetail(`Parsing ${file.name} with LlamaParse…`);
          setProgress(8 + Math.round((index / files.length) * 12));

          const extracted = await parseFileWithLlamaParse(file);
          if (extracted && extracted.trim().length) {
            textFragments.push(extracted);
          }
          if (textFragments.join("\n").length > MAX_TEXT_LENGTH) break;
        }
      } catch (err) {
        setStage("error");
        setError(err instanceof Error ? err.message : "Failed to process file.");
        setStatusDetail(null);
        setProgress(0);
        setSourcePreview(previews);
        return;
      }

      setSourcePreview(previews);

      const combinedText = textFragments
        .join("\n\n")
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n");
      const normalized = normalizeWhitespace(combinedText).slice(0, MAX_TEXT_LENGTH);
      setTextPreview(normalized.slice(0, 1400));

      if (normalized.length < MIN_CHARS_REQUIRED) {
        setStage("error");
        setError("We couldn't find enough readable text. Try a clearer export or add more notes.");
        setStatusDetail(null);
        setProgress(0);
        return;
      }

      setStage("chunking");
      setStatusDetail("Structuring your content into lesson-sized chunks…");
      setProgress(20);

      const chunks = chunkTextPassages(normalized);
      if (!chunks.length) {
        setStage("error");
        setError("We couldn't segment your content. Try adding a few headings or paragraphs.");
        setStatusDetail(null);
        setProgress(0);
        return;
      }

      setInsights(deriveInsights(chunks));
      setStage("generating");
      setStatusDetail(`Generating ${chunks.length} adaptive mini-lessons…`);
      setProgress(26);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const generatedLessons: PendingLesson[] = [];

      try {
        for (let index = 0; index < chunks.length; index += 1) {
          const chunk = chunks[index];
          setStatusDetail(`Generating lesson ${index + 1} of ${chunks.length}…`);
          setProgress(26 + Math.round((index / chunks.length) * 60));

          const response = await fetch("/api/generate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text: chunk,
              subject,
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const message = await response.text().catch(() => "");
            throw new Error(message || `Generation failed (lesson ${index + 1}).`);
          }

          const payload = (await response.json()) as Lesson;
          generatedLessons.push({
            ...payload,
            id: payload.id ?? crypto.randomUUID(),
            sourceIndex: Math.min(index, previews.length - 1),
          });
        }
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") {
          setStage("idle");
          setStatusDetail(null);
          setProgress(0);
          return;
        }
        setStage("error");
        setError(err instanceof Error ? err.message : "Lesson generation failed.");
        setStatusDetail(null);
        setProgress(0);
        return;
      } finally {
        abortControllerRef.current = null;
      }

      setLessons(generatedLessons);
      setStage("complete");
      setStatusDetail(null);
      setProgress(100);
    },
    [subject],
  );

  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const list = event.target.files;
      await processFiles(list);
      event.target.value = "";
    },
    [processFiles],
  );

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (stage === "generating") return;
      setDragActive(false);
      const { files } = event.dataTransfer;
      await processFiles(files);
    },
    [processFiles, stage],
  );

  const subjectChips = useMemo(() => {
    const base = new Set<string>();
    if (initialProfile?.interests?.length) {
      for (const item of initialProfile.interests) {
        if (typeof item === "string" && item.trim()) base.add(ensureSubjectLabel(item));
      }
    }
    if (selectedSubjects.length) {
      for (const item of selectedSubjects) {
        if (typeof item === "string" && item.trim()) base.add(ensureSubjectLabel(item));
      }
    }
    base.add("General Studies");
    base.add("Exam Review");
    base.add("Team Onboarding");
    base.add("Certification Prep");
    return Array.from(base).slice(0, 8);
  }, [initialProfile?.interests, selectedSubjects]);

  const statusAccent =
    stage === "error"
      ? "from-rose-500/20 via-red-500/10 to-transparent text-rose-500 dark:text-rose-300"
      : "from-lernex-blue/20 via-lernex-purple/20 to-transparent text-lernex-blue dark:text-lernex-blue/80";

  return (
    <ProfileBasicsProvider initialData={initialProfile ?? undefined}>
      <WelcomeTourOverlay />
      <main className="relative isolate mx-auto flex min-h-[calc(100vh-56px)] w-full max-w-6xl flex-col gap-12 px-4 pb-16 pt-12 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-x-[-12%] top-[-18%] h-[420px] rounded-full bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.28),transparent_70%)]" />
          <div className="absolute left-[-6%] top-[32%] h-64 w-64 rounded-full bg-lernex-blue/20 blur-3xl opacity-80 dark:bg-lernex-blue/35" />
          <div className="absolute right-[-8%] bottom-[14%] h-72 w-72 rounded-full bg-lernex-purple/20 blur-3xl opacity-70 dark:bg-lernex-purple/35" />
        </div>

        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="relative z-10 overflow-hidden rounded-[32px] border border-white/60 bg-white/80 px-6 py-8 shadow-[0_42px_120px_-46px_rgba(47,128,237,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5"
        >
          <div className="pointer-events-none absolute inset-0 -z-10 rounded-[32px] bg-[linear-gradient(135deg,rgba(59,130,246,0.12),rgba(129,140,248,0.08),transparent)] dark:bg-[linear-gradient(135deg,rgba(47,128,237,0.3),rgba(129,140,248,0.15),transparent)]" />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-lernex-blue/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-lernex-blue/80 dark:bg-lernex-blue/15 dark:text-lernex-blue/60">
                Upload to learn
                <UploadCloud className="h-3.5 w-3.5" />
              </span>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold leading-tight text-neutral-900 dark:text-white sm:text-4xl">
                  Turn your notes into{" "}
                  <span className="bg-gradient-to-r from-lernex-blue via-indigo-500 to-lernex-purple bg-clip-text text-transparent">
                    swipeable mini-lessons
                  </span>
                </h1>
                <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-300 sm:text-base">
                  Drop in PDFs, PowerPoints, Word docs, or lecture notes. Our LlamaParse AI intelligently extracts the
                  content and crafts a personalized flow of micro-lessons - complete with adaptive quizzes - based on what
                  you uploaded.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.28em] text-neutral-400 dark:text-neutral-500">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 dark:border-white/10 dark:bg-white/10">
                  <Wand2 className="h-3 w-3 text-lernex-blue" />
                  Adaptive sequencing
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 dark:border-white/10 dark:bg-white/10">
                  <Sparkles className="h-3 w-3 text-lernex-purple" />
                  Quiz-ready outputs
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 dark:border-white/10 dark:bg-white/10">
                  <NotebookPen className="h-3 w-3 text-emerald-500" />
                  Works across subjects
                </span>
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="relative isolate w-full max-w-xs overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-6 text-sm shadow-[0_32px_90px_-64px_rgba(47,128,237,0.65)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10"
            >
              <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-lernex-blue/15 via-transparent to-lernex-purple/15" />
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-lernex-blue/15 via-lernex-blue/10 to-lernex-purple/15 text-lernex-blue dark:text-lernex-blue/80">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
                    Quick tip
                  </p>
                  <p className="text-sm font-semibold text-neutral-800 dark:text-white">Best results</p>
                </div>
              </div>
              <ul className="mt-4 space-y-3 text-xs text-neutral-600 dark:text-neutral-300">
                <li className="flex gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lernex-blue" />
                  Upload PowerPoint, Word, or PDF files directly - LlamaParse extracts everything intelligently.
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lernex-purple" />
                  Longer documents create 5-6 lessons, shorter ones create 2-3 - perfectly sized for learning.
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  Drop multiple files at once; we automatically merge and create a cohesive lesson sequence.
                </li>
              </ul>
            </motion.div>
          </div>
        </motion.header>

        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.5 }}
            className="flex-1 space-y-6"
          >
            <div className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_40px_100px_-60px_rgba(47,128,237,0.55)] backdrop-blur-xl transition-colors dark:border-white/10 dark:bg-white/5">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Focus subject</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Choose where you want Lernex to aim each generated lesson.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {subjectChips.map((chip) => {
                    const active = chip === subject;
                    return (
                      <button
                        key={chip}
                        onClick={() => setSubject(chip)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          active
                            ? "border-lernex-blue/80 bg-lernex-blue/90 text-white shadow-sm"
                            : "border-white/60 bg-white/70 text-neutral-600 hover:border-lernex-blue/40 hover:text-lernex-blue dark:border-white/10 dark:bg-white/10 dark:text-neutral-300 dark:hover:border-lernex-blue/50 dark:hover:text-lernex-blue/80"
                        }`}
                        type="button"
                      >
                        {chip}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-center">
                <label className="flex-1 text-sm text-neutral-600 dark:text-neutral-300">
                  <span className="mb-1 inline-block text-xs uppercase tracking-[0.25em] text-neutral-400 dark:text-neutral-500">
                    Custom subject
                  </span>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="e.g. AP Biology, Cybersecurity, Sales onboarding"
                    className="w-full rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-sm font-medium text-neutral-800 shadow-inner outline-none transition focus:border-lernex-blue/60 focus:ring-2 focus:ring-lernex-blue/30 dark:border-white/10 dark:bg-white/10 dark:text-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={resetState}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40 dark:border-white/10 dark:bg-white/10 dark:text-neutral-200"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Reset
                </button>
              </div>
            </div>

            <div
              onDragEnter={(event) => {
                event.preventDefault();
                if (stage === "generating") return;
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (stage === "generating") return;
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (stage === "generating") return;
                if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) {
                  setDragActive(false);
                }
              }}
              onDrop={handleDrop}
              className={`relative overflow-hidden rounded-[28px] border-2 border-dashed ${
                dragActive
                  ? "border-lernex-blue/60 bg-lernex-blue/10"
                  : "border-white/70 bg-white/80 dark:border-white/10 dark:bg-white/5"
              } px-6 py-12 text-center shadow-[0_32px_90px_-64px_rgba(47,128,237,0.65)] backdrop-blur-xl transition-colors`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.pptx,.txt,.md,.markdown,.csv,.json,.rtf,.html,.htm"
                multiple
                hidden
                onChange={handleFileInputChange}
              />
              <motion.div
                initial={{ opacity: 0.85, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="mx-auto flex max-w-xl flex-col items-center gap-6"
              >
                <motion.span
                  animate={
                    stage === "generating" || stage === "parsing"
                      ? {
                          scale: [1, 1.05, 1],
                          rotate: [0, 5, -5, 0],
                        }
                      : {}
                  }
                  transition={{
                    duration: 2,
                    repeat: stage === "generating" || stage === "parsing" ? Infinity : 0,
                    ease: "easeInOut",
                  }}
                  className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-lernex-blue/15 via-lernex-blue/10 to-lernex-purple/20 text-lernex-blue dark:text-lernex-blue/80"
                >
                  {stage === "generating" || stage === "parsing" ? (
                    <Loader2 className="h-10 w-10 animate-spin" />
                  ) : (
                    <UploadCloud className="h-10 w-10" />
                  )}
                </motion.span>
                <div className="space-y-3 text-neutral-700 dark:text-neutral-200">
                  <p className="text-xl font-semibold">
                    {stage === "parsing"
                      ? "Parsing your documents..."
                      : stage === "generating"
                      ? "Generating your lessons..."
                      : "Drop files or click to upload"}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {stage === "parsing" || stage === "generating" ? (
                      <>
                        Using LlamaParse AI to intelligently extract and structure your content into personalized
                        mini-lessons.
                      </>
                    ) : (
                      <>
                        Accepts PDFs, DOCX, PPTX, and text files up to 18MB combined. We use LlamaParse AI to extract
                        content, then craft mini-lessons with quizzes tuned to <span className="font-medium">{subject}</span>
                        .
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/70 px-3 py-1 dark:border-white/10 dark:bg-white/10">
                    <FileText className="h-3.5 w-3.5 text-lernex-blue" />
                    PDF, DOCX, PPTX, TXT
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/70 px-3 py-1 dark:border-white/10 dark:bg-white/10">
                    <Sparkles className="h-3.5 w-3.5 text-lernex-purple" />
                    LlamaParse AI Parsing
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleBrowse}
                  disabled={stage === "generating"}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-lernex-blue to-lernex-purple px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-lernex-blue/30 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lernex-blue/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UploadCloud className="h-4 w-4" />
                  Choose files
                </button>
              </motion.div>
              {(stage === "parsing" || stage === "generating" || stage === "chunking") && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-10 flex flex-col items-center gap-3"
                >
                  <div className="relative h-3 w-full max-w-lg overflow-hidden rounded-full bg-white/40 shadow-inner dark:bg-white/10">
                    <motion.div
                      animate={{
                        backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="h-full rounded-full bg-gradient-to-r from-lernex-blue via-lernex-purple to-lernex-blue bg-[length:200%_100%] transition-[width] duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <motion.p
                    animate={{ opacity: [1, 0.7, 1] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-600 dark:text-neutral-400"
                  >
                    {statusDetail ?? "Processing"}
                  </motion.p>
                  <button
                    type="button"
                    onClick={() => abortControllerRef.current?.abort()}
                    className="text-xs font-semibold text-rose-500 transition hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40 dark:text-rose-300"
                  >
                    Cancel
                  </button>
                </motion.div>
              )}
            </div>

            <AnimatePresence>
              {(stage === "error" || (stage !== "idle" && statusDetail)) && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.24 }}
                  className={`overflow-hidden rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur-lg dark:border-white/10 dark:bg-white/10 ${
                    stage === "error" ? "border-rose-400/50 dark:border-rose-500/50" : ""
                  }`}
                >
                  <div className={`flex items-center gap-3 bg-gradient-to-r ${statusAccent} rounded-2xl px-4 py-3`}>
                    {stage === "error" ? (
                      <Loader2 className="h-4 w-4 rotate-45" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/80">
                      {stage === "error" ? "Upload issue" : "Processing"}
                    </p>
                  </div>
                  <div className="mt-4 text-sm text-neutral-600 dark:text-neutral-300">
                    {stage === "error" ? <p>{error}</p> : <p>{statusDetail ?? "Preparing your content..."}</p>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {sourcePreview.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-3xl border border-white/60 bg-white/80 p-6 text-sm shadow-sm backdrop-blur-lg dark:border-white/10 dark:bg-white/10"
              >
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-white">Source files</h3>
                <ul className="mt-4 space-y-3">
                  {sourcePreview.map((file) => (
                    <li
                      key={`${file.name}-${file.sizeLabel}`}
                      className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-neutral-600 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-neutral-300"
                    >
                      <span className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-lernex-blue" />
                        <span className="font-medium text-neutral-700 dark:text-neutral-200">{file.name}</span>
                      </span>
                      <span className="text-xs uppercase tracking-[0.22em] text-neutral-400 dark:text-neutral-500">
                        {file.sizeLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            {textPreview && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur-lg dark:border-white/10 dark:bg-white/10"
              >
                <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-400">
                  <span className="font-semibold text-neutral-800 dark:text-white">Preview snapshot</span>
                  <span>{textPreview.length} characters</span>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {textPreview.length < MAX_TEXT_LENGTH ? textPreview : `${textPreview}...`}
                </p>
              </motion.div>
            )}
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.55 }}
            className="w-full space-y-6 lg:w-[min(400px,40%)]"
          >
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 240, damping: 24 }}
              className="rounded-3xl border border-white/60 bg-white/80 p-6 text-sm shadow-[0_32px_90px_-64px_rgba(47,128,237,0.65)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-lernex-blue/15 text-lernex-blue dark:bg-lernex-blue/20 dark:text-lernex-blue/70">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-neutral-800 dark:text-white">Generation status</h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Track lesson creation and highlights from your upload.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm dark:border-white/10 dark:bg-white/10">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-neutral-400 dark:text-neutral-500">
                    <span>Status</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/50 dark:bg-white/10">
                    <div
                      className={`h-full rounded-full ${
                        stage === "complete"
                          ? "bg-emerald-500"
                          : stage === "error"
                          ? "bg-rose-500"
                          : "bg-gradient-to-r from-lernex-blue to-lernex-purple"
                      } transition-[width]`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <motion.p
                    animate={
                      stage === "complete"
                        ? {
                            scale: [1, 1.05, 1],
                            color: ["rgb(34, 197, 94)", "rgb(22, 163, 74)", "rgb(34, 197, 94)"],
                          }
                        : {}
                    }
                    transition={{ duration: 1.5, repeat: stage === "complete" ? 3 : 0 }}
                    className="mt-3 text-xs font-medium text-neutral-500 dark:text-neutral-400"
                  >
                    {stage === "complete"
                      ? "✨ All lessons ready! Scroll down to start learning!"
                      : stage === "error"
                      ? error ?? "Upload failed."
                      : statusDetail ?? "Waiting for upload..."}
                  </motion.p>
                </div>
                {insights.length > 0 && (
                  <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm dark:border-white/10 dark:bg-white/10">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-400 dark:text-neutral-500">
                      Key takeaways detected
                    </p>
                    <ul className="mt-3 space-y-3 text-sm text-neutral-600 dark:text-neutral-300">
                      {insights.map((insight) => (
                        <li key={insight} className="flex gap-3">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-lernex-blue" />
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: "spring", stiffness: 220, damping: 26 }}
              className="rounded-3xl border border-white/60 bg-white/80 p-6 text-sm shadow-[0_32px_90px_-64px_rgba(47,128,237,0.65)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10"
            >
              <h2 className="text-sm font-semibold text-neutral-800 dark:text-white">Why it works</h2>
              <ul className="mt-4 space-y-3 text-neutral-600 dark:text-neutral-300">
                <li>
                  <span className="font-semibold text-neutral-700 dark:text-white">Smart parsing:</span> LlamaParse AI
                  extracts text, tables, and structure from any document format.
                </li>
                <li>
                  <span className="font-semibold text-neutral-700 dark:text-white">Tier-based AI:</span> free users get
                  fast lessons with Groq, paid users get enhanced quality with Cerebras.
                </li>
                <li>
                  <span className="font-semibold text-neutral-700 dark:text-white">Quiz-first design:</span> every lesson
                  comes with comprehension checks to lock in understanding.
                </li>
              </ul>
            </motion.div>
          </motion.aside>
        </div>

        <AnimatePresence>
          {lessons.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: 0.14, duration: 0.55 }}
              className="relative"
            >
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white">Your Personalized Lessons</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Scroll through your custom-generated mini-lessons
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-neutral-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-neutral-300">
                  <Sparkles className="h-3.5 w-3.5 text-lernex-blue" />
                  {lessons.length} Lessons
                </div>
              </div>

              {/* Scrollable lesson container - FYP style */}
              <div className="relative">
                <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-lernex-blue/20 scrollbar-track-transparent">
                  {lessons.map((lesson, index) => (
                    <motion.article
                      key={lesson.id}
                      initial={{ opacity: 0, x: -30, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      transition={{
                        duration: 0.5,
                        delay: index * 0.1,
                        type: "spring",
                        stiffness: 100,
                        damping: 15,
                      }}
                      whileHover={{ scale: 1.01, y: -4 }}
                      className="group relative overflow-hidden rounded-[32px] border border-white/60 bg-white/90 p-6 shadow-[0_20px_70px_-30px_rgba(47,128,237,0.4)] backdrop-blur-xl transition-all dark:border-white/10 dark:bg-white/5 dark:shadow-[0_20px_70px_-30px_rgba(47,128,237,0.6)]"
                    >
                      {/* Gradient overlay */}
                      <div className="pointer-events-none absolute inset-0 -z-10 rounded-[32px] bg-[linear-gradient(135deg,rgba(59,130,246,0.08),rgba(129,140,248,0.05),transparent)] opacity-0 transition-opacity group-hover:opacity-100 dark:bg-[linear-gradient(135deg,rgba(47,128,237,0.2),rgba(129,140,248,0.1),transparent)]" />

                      {/* Lesson number badge */}
                      <div className="absolute -right-2 -top-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-lernex-blue to-lernex-purple text-sm font-bold text-white shadow-lg">
                        {index + 1}
                      </div>

                      <div className="space-y-4">
                        <LessonCard lesson={lesson} className="border-0 shadow-none" />

                        {lesson.questions?.length ? (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 + 0.2 }}
                            className="rounded-2xl border border-white/60 bg-white/70 p-4 text-sm shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10"
                          >
                            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-lernex-purple">
                              <Sparkles className="h-3.5 w-3.5" />
                              Quiz Challenge
                            </div>
                            <QuizBlock lesson={lesson} onDone={() => {}} showSummary={false} />
                          </motion.div>
                        ) : null}
                      </div>
                    </motion.article>
                  ))}
                </div>

                {/* Scroll indicator gradient at bottom */}
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white/80 to-transparent dark:from-neutral-950/80" />
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Empty state when no lessons */}
        {lessons.length === 0 && stage === "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center justify-center rounded-[32px] border border-dashed border-white/60 bg-white/40 px-8 py-20 text-center backdrop-blur dark:border-white/10 dark:bg-white/5"
          >
            <motion.div
              animate={{
                y: [0, -10, 0],
                rotate: [0, 5, -5, 0],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Sparkles className="mb-4 h-12 w-12 text-lernex-blue/60" />
            </motion.div>
            <h3 className="text-xl font-semibold text-neutral-700 dark:text-neutral-200">
              Ready to Transform Your Notes
            </h3>
            <p className="mt-2 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
              Upload your documents above to see AI-generated lessons appear here. Each lesson is tailored to help you
              learn faster and retain more.
            </p>
          </motion.div>
        )}
      </main>
    </ProfileBasicsProvider>
  );
}
