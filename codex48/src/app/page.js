'use client';

/*
 * BrandPulse AI — src/app/page.js
 *
 * Expects a local JSON file at src/data/brand-data.json with this shape
 * (every field is optional; sensible fallbacks are built in):
 * {
 *   "brand": { "name": "...", "voice": "...", "tone": ["..."] },
 *   "rules": [{ "id": "R-01", "title": "...", "severity": "red" | "amber",
 *               "terms": ["guaranteed"], "description": "...",
 *               "citation": "Brand Guide §2.1", "replacement": "..." }],
 *   "approvedFacts": [{ "id": "F-01", "claim": "...", "source": "..." }],
 *   "palette": [{ "name": "Deep Navy", "hex": "#0B132B" }]
 * }
 *
 * The scanner POSTs { text, rules, approvedFacts } to /api/scan and expects
 * { issues: [{ id, severity, flagged, message, citation, rewrite }] }.
 * If the route is missing or fails, a local rule-based scan is used.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ScanLine,
  Palette,
  Library,
  GitBranch,
  BarChart3,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Upload,
  Loader2,
  Sparkles,
  ChevronDown,
  Lock,
  Hash,
  Quote,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  UserCircle2,
  FileJson,
  Eye,
  XCircle,
  Check,
  Trash2,
  TrendingUp,
  HelpCircle,
} from 'lucide-react';
import brandJson from '../data/brand-data.json';

/* ------------------------------------------------------------------ */
/* Constants & defaults                                                */
/* ------------------------------------------------------------------ */

const NAVY = '#0B132B';
const EMERALD = '#047857';

const FALLBACK = {
  brand: {
    name: 'BrandPulse',
    voice: 'Confident, clear and human. We inform, we never over-promise.',
    tone: ['Confident', 'Transparent', 'Warm', 'Precise'],
  },
  rules: [
    {
      id: 'R-01',
      title: 'No absolute guarantees',
      severity: 'red',
      terms: ['guaranteed', '100% guaranteed', 'risk-free', 'no risk'],
      description: 'Absolute claims create legal exposure and break our transparency principle.',
      citation: 'Brand Guide §2.1 — Claims & Promises',
      replacement: 'designed to help',
    },
    {
      id: 'R-02',
      title: 'No unverified superlatives',
      severity: 'red',
      terms: ['best in the world', '#1', 'number one', 'world-class'],
      description: 'Superlatives must be backed by a cited third-party source.',
      citation: 'Legal Policy L-14 — Comparative Advertising',
      replacement: 'a trusted choice',
    },
    {
      id: 'R-03',
      title: 'Avoid hype language',
      severity: 'amber',
      terms: ['revolutionary', 'game-changing', 'groundbreaking', 'mind-blowing'],
      description: 'Hype words dilute credibility. Prefer concrete, specific benefits.',
      citation: 'Brand Guide §3.4 — Tone of Voice',
      replacement: 'practical',
    },
    {
      id: 'R-04',
      title: 'Avoid pressure tactics',
      severity: 'amber',
      terms: ['act now', 'hurry', 'last chance', "don't miss out"],
      description: 'Urgency language conflicts with our warm, respectful tone.',
      citation: 'Brand Guide §3.6 — Calls to Action',
      replacement: 'explore when you are ready',
    },
  ],
  approvedFacts: [
    { id: 'F-01', claim: 'Founded in 2019 and headquartered in Bengaluru, India.', source: 'Corporate Fact Sheet 2026' },
    { id: 'F-02', claim: 'Trusted by over 1,200 brands across 14 countries.', source: 'Q3 2026 Investor Update' },
    { id: 'F-03', claim: 'Average campaign review time reduced by 38%.', source: 'Internal Study, Sept 2026' },
  ],
  palette: [
    { name: 'Deep Navy', hex: '#0B132B' },
    { name: 'Emerald', hex: '#047857' },
    { name: 'Slate White', hex: '#F8FAFC' },
  ],
};

const DATA = {
  brand: { ...FALLBACK.brand, ...(brandJson?.brand || {}) },
  rules: brandJson?.rules?.length ? brandJson.rules : FALLBACK.rules,
  approvedFacts: brandJson?.approvedFacts?.length ? brandJson.approvedFacts : FALLBACK.approvedFacts,
  palette: brandJson?.palette?.length ? brandJson.palette : FALLBACK.palette,
};

const ROLES = [
  { key: 'creator', label: 'Creator', name: 'Kaira' },
  { key: 'manager', label: 'Manager', name: 'Shraddha' },
  { key: 'legal', label: 'Legal', name: 'Luv' },
  { key: 'admin', label: 'Admin', name: 'Vishal' },
];

const TABS = [
  { key: 'scanner', label: 'Scanner', icon: ScanLine, help: 'Paste your writing or upload a PDF or Word file, press Run AI Scan, then fix each problem card with one click.' },
  { key: 'visual', label: 'Visual Check', icon: Palette, help: 'Drop in an image or pick colours to check that text on top of them is easy to read.' },
  { key: 'vault', label: 'Brand Vault', icon: Library, help: 'These are your company rules. The Scanner checks every draft against them.' },
  { key: 'workflow', label: 'Workflow', icon: GitBranch, help: 'Moves a draft through 8 steps, from first write-up to published, with a manager and legal review in between. Every action is saved in a tamper-proof history.' },
  { key: 'insights', label: 'Insights', icon: BarChart3, help: 'Real numbers from the scans you run: scores, common mistakes and totals. Deleting history resets these.' },
];

const TONE_ROWS = [
  ['formality', 'Formality', 'How professional it sounds'],
  ['empathy', 'Empathy', 'How caring and human it feels'],
  ['urgency', 'Urgency', 'How much it pushes people to hurry'],
  ['aggressiveness', 'Pushiness', 'How forceful it sounds'],
];

const STAGES = [
  { name: 'Draft', owner: 'creator' },
  { name: 'AI Scan', owner: 'creator' },
  { name: 'Revision', owner: 'creator' },
  { name: 'Manager Review', owner: 'manager' },
  { name: 'Legal Review', owner: 'legal' },
  { name: 'Brand Approval', owner: 'manager' },
  { name: 'Scheduled', owner: 'admin' },
  { name: 'Published', owner: 'admin' },
];

const SAMPLE_DRAFT =
  "Introducing our revolutionary new platform — guaranteed to double your engagement! We're the best in the world at campaign automation, so act now before this last chance disappears.";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function sha256(str) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Non-secure-context fallback (FNV-1a, demo only)
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0').repeat(8);
  }
}

function entryPayload(e) {
  return [e.prevHash, e.ts, e.actor, e.role, e.action, e.stage].join('|');
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function wcag(ratio) {
  return {
    aaText: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaText: ratio >= 7,
  };
}

const MAX_FILE_MB = 25;
const MAX_CHARS = 50000;
const MAMMOTH_URL = 'https://cdn.jsdelivr.net/npm/mammoth@1/mammoth.browser.min.js';
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

const scriptCache = {};
function loadScript(src) {
  if (!scriptCache[src]) {
    scriptCache[src] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        delete scriptCache[src];
        reject(new Error('The file reader could not be loaded'));
      };
      document.head.appendChild(el);
    });
  }
  return scriptCache[src];
}

async function readDocx(file) {
  await loadScript(MAMMOTH_URL);
  const out = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return out.value || '';
}

async function readPdf(file) {
  await loadScript(PDFJS_URL);
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/ +\n/g, '\n'));
  }
  return pages.join('\n\n');
}

async function extractFromFile(file, isText) {
  let text = '';
  if (isText) {
    text = await file.text();
  } else {
    try {
      text = (file.name || '').toLowerCase().endsWith('.pdf') ? await readPdf(file) : await readDocx(file);
    } catch (err) {
      if (err?.name === 'PasswordException') throw new Error('This PDF is password protected. Please remove the password and try again.');
      if (file.size > 4 * 1024 * 1024) {
        throw new Error('This file could not be opened in your browser. Check your internet connection and try again, or use a file under 4 MB.');
      }
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/extract', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not read that file.');
      text = json.text;
    }
  }
  text = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('No readable text was found. If this PDF is a scan or a picture of text, it cannot be read.');
  let note = '';
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
    note = `This file is long, so only the first ${MAX_CHARS.toLocaleString()} characters were loaded.`;
  }
  return { text, note };
}

function wordDiff(a, b) {
  const x = a.split(/(\s+)/).filter(Boolean);
  const y = b.split(/(\s+)/).filter(Boolean);
  const m = x.length, n = y.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const left = [], right = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (x[i] === y[j]) { left.push({ t: x[i] }); right.push({ t: y[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { left.push({ t: x[i], del: true }); i++; }
    else { right.push({ t: y[j], add: true }); j++; }
  }
  while (i < m) left.push({ t: x[i++], del: true });
  while (j < n) right.push({ t: y[j++], add: true });
  return { left, right };
}

function localScan(text) {
  const issues = [];
  DATA.rules.forEach((rule) => {
    (rule.terms || []).forEach((term) => {
      const re = new RegExp(escapeRegExp(term), 'gi');
      let m;
      while ((m = re.exec(text)) !== null) {
        issues.push({
          id: `${rule.id}-${m.index}`,
          severity: rule.severity === 'red' ? 'red' : 'amber',
          flagged: m[0],
          title: rule.title,
          message: rule.description,
          citation: rule.citation,
          rewrite: rule.replacement || '',
        });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    });
  });
  // De-duplicate overlapping identical flags
  const seen = new Set();
  return issues.filter((i) => {
    const k = i.flagged.toLowerCase() + i.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function normalizeIssues(raw) {
  return (raw || []).map((i, idx) => ({
    id: i.id || `issue-${idx}`,
    severity: String(i.severity || 'amber').toLowerCase().startsWith('r') ? 'red' : 'amber',
    flagged: i.flagged || i.text || '',
    title: i.title || (i.severity === 'red' ? 'Critical brand violation' : 'Brand advisory'),
    message: i.message || i.reason || i.description || 'Flagged by AI scan.',
    citation: i.citation || i.source || 'Brand Guide',
    rewrite: i.rewrite || i.suggestion || '',
  }));
}

/* ------------------------------------------------------------------ */
/* Small UI primitives                                                 */
/* ------------------------------------------------------------------ */

function Card({ className = '', children }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-[#047857]/10 text-[#047857]">
            <Icon size={18} />
          </div>
        )}
        <div>
          <h2 className="text-base font-semibold text-[#0B132B]">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function Badge({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    red: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    amber: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    navy: 'bg-[#0B132B] text-white',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Tab 1 — Scanner                                                     */
/* ------------------------------------------------------------------ */

function ScannerTab({ role, onLog, onScan, onFix }) {
  const [draft, setDraft] = useState('');
  const [issues, setIssues] = useState([]);
  const [accepted, setAccepted] = useState({});
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [tone, setTone] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState('');
  const [baseline, setBaseline] = useState('');
  const [uploading, setUploading] = useState(false);
  const [fileNote, setFileNote] = useState('');
  const fileRef = useRef(null);
  const [hydrated, setHydrated] = useState(false);

  // Remember the draft while this browser tab is open
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('bp-draft');
      if (saved) setDraft(saved);
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem('bp-draft', draft);
    } catch {}
  }, [draft, hydrated]);

  const counts = useMemo(() => {
    const open = issues.filter((i) => !accepted[i.id]);
    return {
      red: open.filter((i) => i.severity === 'red').length,
      amber: open.filter((i) => i.severity === 'amber').length,
      fixed: Object.keys(accepted).length,
    };
  }, [issues, accepted]);

  const score = useMemo(() => {
    if (!scanned) return null;
    return Math.max(0, 100 - counts.red * 18 - counts.amber * 7);
  }, [scanned, counts]);

  const resetResults = () => {
    setIssues([]);
    setAccepted({});
    setScanned(false);
    setTone(null);
    setBlocked(false);
    setNotice('');
    setBaseline('');
  };

  const handleFile = async (file) => {
    if (!file) return;
    setFileNote('');
    const name = (file.name || '').toLowerCase();
    const isText = name.endsWith('.txt') || name.endsWith('.md');
    if (!isText && !name.endsWith('.pdf') && !name.endsWith('.docx')) {
      setFileNote('Please choose a PDF, a Word file (.docx) or a text file (.txt). For an old .doc file, open it in Word and use Save As → .docx first.');
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setFileNote(`That file is bigger than ${MAX_FILE_MB} MB. Please split it or choose a smaller one.`);
      return;
    }
    setUploading(true);
    try {
      const { text, note } = await extractFromFile(file, isText);
      setDraft(text);
      resetResults();
      if (note) setFileNote(note);
      onLog(`Loaded file "${file.name}"`);
    } catch (e) {
      setFileNote(e.message || 'Could not read that file.');
    } finally {
      setUploading(false);
    }
  };

  const clearAll = () => {
    setDraft('');
    resetResults();
    setSource(null);
    setFileNote('');
    if (fileRef.current) fileRef.current.value = '';
    try {
      sessionStorage.removeItem('bp-draft');
    } catch {}
    onLog('Cleared the scanner');
  };

  const openWithRewrite = issues.filter((i) => !accepted[i.id] && i.rewrite && i.flagged);
  const openNoRewrite = issues.filter((i) => !accepted[i.id] && !i.rewrite).length;

  const diff = useMemo(() => (baseline && baseline !== draft ? wordDiff(baseline, draft) : null), [baseline, draft]);

  const runScan = async () => {
    if (!draft.trim()) return;
    setLoading(true);
    setAccepted({});
    let result;
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft, rules: DATA.rules, approvedFacts: DATA.approvedFacts, brandVoice: DATA.brand.voice }),
      });
      if (!res.ok) throw new Error('scan failed');
      const json = await res.json();
      result = normalizeIssues(json.issues);
      setSource(json.engine === 'ai' ? 'api' : 'builtin');
      setTone(json.tone || null);
      setBlocked(!!json.blocked);
      setNotice(json.warning || '');
    } catch {
      await new Promise((r) => setTimeout(r, 700));
      result = normalizeIssues(localScan(draft));
      setSource('local');
      setTone(null);
      setBlocked(false);
      setNotice('The live scan could not be reached, so only your Brand Vault word rules were checked.');
    }
    setIssues(result);
    setBaseline(draft);
    setScanned(true);
    setLoading(false);
    const logId = await onLog(`Ran AI scan — ${result.length} issue${result.length === 1 ? '' : 's'} flagged`);
    const reds = result.filter((i) => i.severity === 'red').length;
    onScan?.({
      logId,
      time: Date.now(),
      score: Math.max(0, 100 - reds * 18 - (result.length - reds) * 7),
      found: result.map((i) => ({ label: i.title, severity: i.severity })),
      fixed: 0,
    });
  };

  const acceptRewrite = (issue) => {
    if (!issue.flagged) return;
    const re = new RegExp(escapeRegExp(issue.flagged), 'i');
    setDraft((d) => d.replace(re, () => issue.rewrite || '').replace(/ {2,}/g, ' '));
    setAccepted((a) => ({ ...a, [issue.id]: true }));
    onFix?.(1);
    onLog(`Accepted rewrite for "${issue.flagged}"`);
  };

  const acceptAll = () => {
    const todo = issues.filter((i) => !accepted[i.id] && i.rewrite && i.flagged);
    if (!todo.length) return;
    const longestFirst = [...todo].sort((a, b) => b.flagged.length - a.flagged.length);
    setDraft((d) => {
      let out = d;
      for (const it of longestFirst) out = out.replace(new RegExp(escapeRegExp(it.flagged), 'i'), () => it.rewrite);
      return out.replace(/ {2,}/g, ' ');
    });
    setAccepted((a) => {
      const next = { ...a };
      todo.forEach((i) => { next[i.id] = true; });
      return next;
    });
    onFix?.(todo.length);
    onLog(`Accepted ${todo.length} rewrite${todo.length === 1 ? '' : 's'} at once`);
  };

  const openAll = issues.filter((i) => !accepted[i.id] && i.flagged);

  const removeAll = () => {
    if (!openAll.length) return;
    const longestFirst = [...openAll].sort((a, b) => b.flagged.length - a.flagged.length);
    setDraft((d) => {
      let out = d;
      for (const it of longestFirst) out = out.replace(new RegExp(escapeRegExp(it.flagged), 'i'), () => '');
      return out.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,!?;:])/g, '$1').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    });
    setAccepted((a) => {
      const next = { ...a };
      openAll.forEach((i) => { next[i.id] = true; });
      return next;
    });
    onFix?.(openAll.length);
    onLog(`Removed ${openAll.length} flagged item${openAll.length === 1 ? '' : 's'} at once`);
  };

  const dismiss = (issue) => {
    setIssues((list) => list.filter((i) => i.id !== issue.id));
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* Left: editor */}
      <div className="lg:col-span-3">
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {['Paste, type or upload your text', 'Press “Run AI Scan”', 'Fix each problem card with one click'].map((t, i) => (
            <div key={t} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#047857] text-xs font-bold text-white">{i + 1}</span>
              {t}
            </div>
          ))}
        </div>
        <Card className="p-5">
          <SectionTitle
            icon={ScanLine}
            title="Draft Content"
            subtitle="Paste your copy, caption or script to check it against brand rules."
            right={
              <button
                onClick={() => {
                  setDraft(SAMPLE_DRAFT);
                  setIssues([]);
                  setAccepted({});
                  setScanned(false);
                  setTone(null);
                  setBlocked(false);
                  setNotice('');
                  setBaseline('');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw size={13} /> Load sample
              </button>
            }
          />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files?.[0]);
            }}
            rows={13}
            placeholder={`Paste or type your text here, or drop a PDF or Word file onto this box.\n\nExample: ${SAMPLE_DRAFT}`}
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm leading-relaxed text-slate-800 outline-none transition focus:border-[#047857] focus:bg-white focus:ring-4 focus:ring-[#047857]/10"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? 'Reading file…' : 'Upload PDF or Word file'}
            </button>
            <span className="text-xs text-slate-400">or drag a file onto the box · PDF, .docx or .txt · up to 25 MB</span>
          </div>
          {fileNote && <p className="mt-2 text-xs text-amber-700">{fileNote}</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              {draft.trim() ? draft.trim().split(/\s+/).length : 0} words · {draft.length} characters
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={clearAll}
                disabled={loading || (!draft && !scanned && !fileNote)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={15} /> Clear
              </button>
              <button
                onClick={runScan}
                disabled={loading || !draft.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#047857] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#065f46] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {loading ? 'Scanning…' : 'Run AI Scan'}
              </button>
            </div>
          </div>
        </Card>

        {scanned && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Brand Score', value: score, tone: score >= 80 ? 'text-emerald-700' : score >= 50 ? 'text-amber-600' : 'text-red-600' },
              { label: 'Critical', value: counts.red, tone: 'text-red-600' },
              { label: 'Advisory', value: counts.amber, tone: 'text-amber-600' },
              { label: 'Resolved', value: counts.fixed, tone: 'text-emerald-700' },
            ].map((s) => (
              <Card key={s.label} className="p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.label}</div>
                <div className={`mt-1 text-2xl font-bold ${s.tone}`}>{s.value}</div>
              </Card>
            ))}
          </div>
        )}
        {scanned && blocked && (
          <Card className="mt-4 border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-2 text-sm text-red-800">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div><b>Blocked: harmful language found.</b> Remove the flagged text on the right. The tone check runs once it is gone.</div>
            </div>
          </Card>
        )}

        {scanned && notice && <p className="mt-3 text-xs text-slate-500">{notice}</p>}

        {scanned && tone && (
          <Card className="mt-4 p-5">
            <SectionTitle icon={Sparkles} title="Tone of your writing" subtitle="Scores run from 1 (low) to 5 (high). Urgency or pushiness of 4+ turns red." />
            <div className="space-y-3">
              {TONE_ROWS.map(([k, label, desc]) => {
                const v = tone[k] || 1;
                const warn = (k === 'urgency' || k === 'aggressiveness') && v >= 4;
                return (
                  <div key={k} className="grid grid-cols-[130px_1fr_32px] items-center gap-3">
                    <div className="text-sm font-medium text-slate-700">{label}<div className="text-[11px] font-normal text-slate-500">{desc}</div></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${warn ? 'bg-red-500' : 'bg-[#047857]'}`} style={{ width: `${(v / 5) * 100}%` }} />
                    </div>
                    <div className="text-right text-xs text-slate-500">{v}/5</div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {diff && (
          <Card className="mt-4 p-5">
            <SectionTitle icon={GitBranch} title="Before and after" subtitle="Red = removed from your text. Green = added." />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Before</div>
                <div className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
                  {diff.left.map((w, i) => <span key={i} className={w.del ? 'rounded bg-red-100 text-red-800 line-through' : ''}>{w.t}</span>)}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">After</div>
                <div className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
                  {diff.right.map((w, i) => <span key={i} className={w.add ? 'rounded bg-emerald-100 text-emerald-800' : ''}>{w.t}</span>)}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">Press “Run AI Scan” again to check the new version.</p>
          </Card>
        )}
      </div>

      {/* Right: issue cards */}
      <div className="lg:col-span-2">
        <Card className="p-5">
          <SectionTitle
            icon={ShieldCheck}
            title="Explainable Issue Cards"
            subtitle="Every flag shows why, and where the rule comes from."
            right={source && <Badge tone={source === 'api' ? 'green' : 'slate'}>{source === 'api' ? 'Live AI' : source === 'builtin' ? 'Built-in checker' : 'Local rules'}</Badge>}
          />

          {!scanned && !loading && (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center">
              <ScanLine className="mb-3 text-slate-400" size={32} />
              <p className="text-sm font-medium text-slate-700">No scan yet</p>
              <p className="mt-1 text-xs text-slate-500">Run an AI scan to see explainable flags here.</p>
            </div>
          )}

          {loading && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse rounded-xl border border-slate-200 p-4">
                  <div className="h-3 w-1/3 rounded bg-slate-200" />
                  <div className="mt-3 h-3 w-full rounded bg-slate-100" />
                  <div className="mt-2 h-3 w-4/5 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          )}

          {scanned && !loading && issues.length === 0 && (
            <div className="flex flex-col items-center rounded-xl bg-emerald-50 px-6 py-10 text-center">
              <CheckCircle2 className="mb-2 text-[#047857]" size={32} />
              <p className="text-sm font-semibold text-emerald-800">All clear</p>
              <p className="mt-1 text-xs text-emerald-700">No brand violations were found in this draft.</p>
            </div>
          )}

          {!loading && openAll.length > 0 && (
            <div className="mb-3 space-y-2">
              {openWithRewrite.length > 0 && (
                <button
                  onClick={acceptAll}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B132B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#16213f]"
                >
                  <CheckCircle2 size={16} /> Accept all rewrites ({openWithRewrite.length})
                </button>
              )}
              <button
                onClick={removeAll}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
              >
                <Trash2 size={16} /> Remove all bad text ({openAll.length})
              </button>
              <p className="text-xs text-slate-500">
                “Accept all” swaps in the better wording. “Remove all” simply deletes every flagged piece from your draft.
              </p>
            </div>
          )}

          {!loading && issues.length > 0 && (
            <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
              {issues.map((issue) => {
                const done = accepted[issue.id];
                const red = issue.severity === 'red';
                return (
                  <div
                    key={issue.id}
                    className={`rounded-xl border-l-4 border p-4 transition ${
                      done
                        ? 'border-emerald-200 border-l-emerald-600 bg-emerald-50/50'
                        : red
                        ? 'border-red-100 border-l-red-500 bg-red-50/40'
                        : 'border-amber-100 border-l-amber-500 bg-amber-50/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {done ? (
                          <CheckCircle2 size={16} className="text-emerald-600" />
                        ) : red ? (
                          <AlertCircle size={16} className="text-red-600" />
                        ) : (
                          <AlertTriangle size={16} className="text-amber-600" />
                        )}
                        <span className="text-sm font-semibold text-[#0B132B]">{issue.title}</span>
                      </div>
                      <Badge tone={done ? 'green' : red ? 'red' : 'amber'}>{done ? 'Resolved' : red ? 'Critical' : 'Advisory'}</Badge>
                    </div>

                    <p className="mt-2 text-sm text-slate-600">
                      Flagged: <mark className="rounded bg-white px-1.5 py-0.5 font-medium text-slate-900 ring-1 ring-slate-200">{issue.flagged}</mark>
                    </p>
                    <p className="mt-2 text-sm text-slate-600">{issue.message}</p>

                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/80 p-2.5 text-xs text-slate-600 ring-1 ring-slate-200">
                      <Quote size={13} className="mt-0.5 shrink-0 text-[#047857]" />
                      <span>{issue.citation}</span>
                    </div>

                    {issue.rewrite && !done && (
                      <div className="mt-3 rounded-lg bg-white p-2.5 text-sm ring-1 ring-emerald-200">
                        <span className="text-xs font-medium uppercase tracking-wide text-emerald-700">Suggested rewrite</span>
                        <p className="mt-1 text-slate-800">“{issue.rewrite}”</p>
                      </div>
                    )}

                    {!done && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => acceptRewrite(issue)}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#047857] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#065f46] disabled:opacity-40"
                        >
                          <Check size={14} /> {issue.rewrite ? 'Accept Rewrite' : 'Remove this text'}
                        </button>
                        <button
                          onClick={() => dismiss(issue)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          <XCircle size={14} /> Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab 2 — Visual Check                                                */
/* ------------------------------------------------------------------ */

function extractColors(imageData, count = 6) {
  const buckets = new Map();
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 16) {
    if (d[i + 3] < 128) continue;
    const r = d[i] >> 4;
    const g = d[i + 1] >> 4;
    const b = d[i + 2] >> 4;
    const key = (r << 8) | (g << 4) | b;
    const cur = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    cur.n++;
    cur.r += d[i];
    cur.g += d[i + 1];
    cur.b += d[i + 2];
    buckets.set(key, cur);
  }
  const sorted = [...buckets.values()]
    .map((v) => ({ n: v.n, hex: rgbToHex(Math.round(v.r / v.n), Math.round(v.g / v.n), Math.round(v.b / v.n)) }))
    .sort((a, b) => b.n - a.n);

  const picked = [];
  for (const c of sorted) {
    const [r1, g1, b1] = hexToRgb(c.hex);
    const far = picked.every((p) => {
      const [r2, g2, b2] = hexToRgb(p.hex);
      return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) > 60;
    });
    if (far) picked.push(c);
    if (picked.length >= count) break;
  }
  const total = picked.reduce((s, c) => s + c.n, 0) || 1;
  return picked.map((c) => ({ hex: c.hex, share: Math.round((c.n / total) * 100) }));
}

function VisualTab({ onLog }) {
  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const [colors, setColors] = useState([]);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [fg, setFg] = useState(null);
  const [bg, setBg] = useState(null);
  const [error, setError] = useState('');

  const handleFile = useCallback(
    (file) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setError('Please upload an image file (PNG, JPG, WebP).');
        return;
      }
      setError('');
      setFileName(file.name);
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const maxW = 560;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const cols = extractColors(ctx.getImageData(0, 0, canvas.width, canvas.height));
        setColors(cols);
        setFg(cols[0]?.hex || null);
        setBg(cols[1]?.hex || cols[0]?.hex || null);
        URL.revokeObjectURL(url);
        onLog(`Visual check on "${file.name}" — ${cols.length} colors extracted`);
      };
      img.onerror = () => setError('Could not read that image.');
      img.src = url;
    },
    [onLog]
  );

  const pair = fg && bg ? contrastRatio(fg, bg) : null;
  const pairResult = pair ? wcag(pair) : null;

  const copy = (hex) => {
    try {
      navigator.clipboard.writeText(hex);
    } catch {}
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <p className="font-semibold">What is this tab for?</p>
          <p className="mt-1">It checks your poster or banner, not your words. Text must be easy to read on its background, and the colours should match your brand.</p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5">
            <li>Upload your poster or image. We find its main colours.</li>
            <li>Each colour shows on-brand or off-brand.</li>
            <li>Click two colours (text and background). Green Pass means people can read it easily; red Fail means change the colours.</li>
          </ol>
        </div>
        <Card className="p-5">
          <SectionTitle icon={Eye} title="Visual Asset Upload" subtitle="Drop a creative to extract its palette and test accessibility." />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
              dragging ? 'border-[#047857] bg-emerald-50' : 'border-slate-300 bg-slate-50/60 hover:border-[#047857] hover:bg-emerald-50/40'
            }`}
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#047857]/10 text-[#047857]">
              <Upload size={22} />
            </div>
            <p className="text-sm font-semibold text-[#0B132B]">{fileName || 'Click to upload or drag & drop'}</p>
            <p className="mt-1 text-xs text-slate-500">PNG, JPG or WebP — processed locally in your browser</p>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className={`mt-5 overflow-hidden rounded-xl border border-slate-200 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] ${colors.length ? '' : 'hidden'}`}>
            <canvas ref={canvasRef} className="mx-auto block max-w-full" />
          </div>
        </Card>

        {pair && (
          <Card className="mt-6 p-5">
            <SectionTitle icon={ShieldCheck} title="Contrast Checker" subtitle="Click swatches on the right to set foreground and background." />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex h-32 items-center justify-center rounded-xl p-4 text-center" style={{ background: bg, color: fg }}>
                <div>
                  <div className="text-xl font-bold">Brand headline sample</div>
                  <div className="mt-1 text-sm">Body text preview at regular size</div>
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-[#0B132B]">{pair.toFixed(2)}:1</div>
                <div className="mt-1 text-xs text-slate-500">
                  {fg} on {bg}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone={pairResult.aaText ? 'green' : 'red'}>AA Text {pairResult.aaText ? 'Pass' : 'Fail'}</Badge>
                  <Badge tone={pairResult.aaLarge ? 'green' : 'red'}>AA Large {pairResult.aaLarge ? 'Pass' : 'Fail'}</Badge>
                  <Badge tone={pairResult.aaaText ? 'green' : 'red'}>AAA Text {pairResult.aaaText ? 'Pass' : 'Fail'}</Badge>
                </div>
                <button
                  onClick={() => {
                    setFg(bg);
                    setBg(fg);
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <RotateCcw size={13} /> Swap colors
                </button>
              </div>
            </div>
          </Card>
        )}
      </div>

      <div className="lg:col-span-2">
        <Card className="p-5">
          <SectionTitle icon={Palette} title="Extracted Palette" subtitle="Dominant colors, with WCAG results against key backgrounds." />
          {colors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-500">
              Upload an image to extract hex colors.
            </div>
          ) : (
            <div className="space-y-3">
              {colors.map((c) => {
                const onWhite = contrastRatio(c.hex, '#FFFFFF');
                const onNavy = contrastRatio(c.hex, NAVY);
                const inBrand = DATA.palette.some((p) => p.hex.toLowerCase() === c.hex.toLowerCase());
                return (
                  <div key={c.hex} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 shrink-0 rounded-lg ring-1 ring-black/10" style={{ background: c.hex }} />
                      <div className="min-w-0 flex-1">
                        <button onClick={() => copy(c.hex)} className="font-mono text-sm font-semibold text-[#0B132B] hover:text-[#047857]" title="Copy hex">
                          {c.hex}
                        </button>
                        <div className="text-xs text-slate-500">{c.share}% of palette{inBrand ? ' · on-brand' : ''}</div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setFg(c.hex)}
                          className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${fg === c.hex ? 'bg-[#0B132B] text-white ring-[#0B132B]' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}
                        >
                          FG
                        </button>
                        <button
                          onClick={() => setBg(c.hex)}
                          className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${bg === c.hex ? 'bg-[#047857] text-white ring-[#047857]' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}
                        >
                          BG
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5">
                        <span className="text-slate-500">vs White</span>
                        <span className={`font-semibold ${onWhite >= 4.5 ? 'text-emerald-700' : 'text-red-600'}`}>{onWhite.toFixed(1)}:1</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5">
                        <span className="text-slate-500">vs Navy</span>
                        <span className={`font-semibold ${onNavy >= 4.5 ? 'text-emerald-700' : 'text-red-600'}`}>{onNavy.toFixed(1)}:1</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab 3 — Brand Vault                                                 */
/* ------------------------------------------------------------------ */

function VaultTab() {
  const [showRaw, setShowRaw] = useState(false);
  const [filter, setFilter] = useState('all');

  const rules = DATA.rules.filter((r) => filter === 'all' || r.severity === filter);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="bg-[#0B132B] p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-widest text-emerald-400">Brand Vault</div>
              <h2 className="mt-1 text-2xl font-bold">{DATA.brand.name}</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">{DATA.brand.voice}</p>
            </div>
            <button
              onClick={() => setShowRaw((s) => !s)}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white ring-1 ring-white/20 hover:bg-white/20"
            >
              <FileJson size={14} /> {showRaw ? 'Hide raw JSON' : 'View raw JSON'}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(DATA.brand.tone || []).map((t) => (
              <span key={t} className="rounded-full bg-[#047857]/30 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-500/40">
                {t}
              </span>
            ))}
          </div>
        </div>
        {showRaw && (
          <pre className="max-h-80 overflow-auto bg-slate-950 p-5 text-xs leading-relaxed text-emerald-300">{JSON.stringify(DATA, null, 2)}</pre>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card className="p-5">
            <SectionTitle
              icon={Lock}
              title="Built-in Protection"
              subtitle="Always on. These checks run on every scan and cannot be switched off."
              right={<Badge tone="green">Always on</Badge>}
            />
            <ul className="space-y-2.5 text-sm text-slate-700">
              {[
                ['Hate speech and slurs', 'Including disguised spellings like f.u.c.k, leetspeak and hidden characters.'],
                ['Swearing and profanity', 'Blocked before anything else is checked.'],
                ['Threats, violence and self-harm', 'Whole sentences are flagged so they can be removed.'],
                ['Angry, pushy or hostile tone', 'The AI scores formality, empathy, urgency and pushiness and flags problem sentences.'],
                ['Unproven claims and statistics', 'Compared against the Approved Facts on this page.'],
              ].map(([t, d]) => (
                <li key={t} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#047857]" />
                  <span><b className="font-semibold text-[#0B132B]">{t}.</b> {d}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <SectionTitle
              icon={ShieldCheck}
              title="Brand Rules"
              subtitle={`${DATA.rules.length} active rules enforced by the scanner`}
              right={
                <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
                  {['all', 'red', 'amber'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`rounded-md px-2.5 py-1 capitalize transition ${filter === f ? 'bg-white text-[#0B132B] shadow-sm' : 'text-slate-500'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              }
            />
            <div className="space-y-3">
              {rules.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">{r.id}</span>
                      <span className="text-sm font-semibold text-[#0B132B]">{r.title}</span>
                    </div>
                    <Badge tone={r.severity === 'red' ? 'red' : 'amber'}>{r.severity === 'red' ? 'Critical' : 'Advisory'}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{r.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(r.terms || []).map((t) => (
                      <code key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {t}
                      </code>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                    <Quote size={12} className="text-[#047857]" /> {r.citation}
                  </div>
                </div>
              ))}
              {rules.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No rules match this filter.</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <SectionTitle icon={CheckCircle2} title="Approved Facts" subtitle="Claims verified for use in public content." />
            <div className="space-y-3">
              {DATA.approvedFacts.map((f) => (
                <div key={f.id} className="rounded-xl bg-emerald-50/60 p-3.5 ring-1 ring-emerald-100">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#047857]" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{f.claim}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {f.id} · Source: {f.source}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={Palette} title="Brand Palette" />
            <div className="grid grid-cols-3 gap-3">
              {DATA.palette.map((p) => (
                <div key={p.hex} className="text-center">
                  <div className="h-14 rounded-xl ring-1 ring-black/10" style={{ background: p.hex }} />
                  <div className="mt-1.5 text-xs font-medium text-slate-700">{p.name}</div>
                  <div className="font-mono text-[11px] text-slate-400">{p.hex}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab 4 — Workflow & Audit Log                                        */
/* ------------------------------------------------------------------ */

function WorkflowTab({ role, actor, stage, setStage, log, setLog, addLog, onDeleteEntry, onClearHistory }) {
  const [verify, setVerify] = useState(null); // { ok, brokenAt }
  const [checking, setChecking] = useState(false);

  const current = STAGES[stage];
  const canAct = role === 'admin' || role === current.owner;
  const ownerLabel = ROLES.find((r) => r.key === current.owner)?.label;

  const advance = () => {
    if (stage >= STAGES.length - 1) return;
    addLog(`Advanced "${STAGES[stage].name}" → "${STAGES[stage + 1].name}"`, stage + 1);
    setStage(stage + 1);
    setVerify(null);
  };

  const sendBack = () => {
    if (stage === 0) return;
    addLog(`Returned "${STAGES[stage].name}" → "${STAGES[stage - 1].name}" for changes`, stage - 1);
    setStage(stage - 1);
    setVerify(null);
  };

  const runVerify = async () => {
    setChecking(true);
    let prev = 'GENESIS';
    let brokenAt = -1;
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      const expected = await sha256(entryPayload({ ...e, prevHash: prev }));
      if (e.prevHash !== prev || e.hash !== expected) {
        brokenAt = i;
        break;
      }
      prev = e.hash;
    }
    await new Promise((r) => setTimeout(r, 400));
    setVerify({ ok: brokenAt === -1, brokenAt });
    setChecking(false);
  };

  const tamper = () => {
    if (log.length < 2) return;
    const idx = Math.max(1, Math.floor(log.length / 2) - 1);
    setLog((l) => l.map((e, i) => (i === idx ? { ...e, action: e.action + ' [edited]' } : e)));
    setVerify(null);
  };

  const tampered = log.some((e) => e.action.endsWith(' [edited]'));
  const undoTamper = () => {
    setLog((l) => l.map((e) => (e.action.endsWith(' [edited]') ? { ...e, action: e.action.slice(0, -' [edited]'.length) } : e)));
    setVerify(null);
  };
  const askDelete = (e, i) => {
    if (window.confirm(`Delete history entry #${i + 1}?\n\n"${e.action}"\n\nIf it was a scan, that scan is also removed from Insights.`)) {
      onDeleteEntry(e.id);
      setVerify(null);
    }
  };
  const askClear = () => {
    if (window.confirm('Delete ALL history?\n\nThis clears the audit log and the Insights numbers, and moves the workflow back to Draft. It cannot be undone.')) {
      onClearHistory();
      setVerify(null);
    }
  };

  const fmt = (ts) =>
    new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <SectionTitle
          icon={GitBranch}
          title="Approval Workflow"
          subtitle={`Stage ${stage + 1} of ${STAGES.length} — currently with ${ownerLabel}`}
          right={<Badge tone="navy">{current.name}</Badge>}
        />

        <div className="relative mt-2 overflow-x-auto pb-2">
          <div className="relative flex min-w-[720px] items-start justify-between">
            <div className="absolute left-0 right-0 top-4 mx-6 h-1 rounded bg-slate-200" />
            <div
              className="absolute left-0 top-4 ml-6 h-1 rounded bg-[#047857] transition-all duration-500"
              style={{ width: `calc((100% - 3rem) * ${stage / (STAGES.length - 1)})` }}
            />
            {STAGES.map((s, i) => {
              const done = i < stage;
              const active = i === stage;
              return (
                <div key={s.name} className="relative z-10 flex w-24 flex-col items-center text-center">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                      done
                        ? 'border-[#047857] bg-[#047857] text-white'
                        : active
                        ? 'border-[#047857] bg-white text-[#047857] ring-4 ring-[#047857]/20'
                        : 'border-slate-300 bg-white text-slate-400'
                    }`}
                  >
                    {done ? <Check size={16} /> : i + 1}
                  </div>
                  <div className={`mt-2 text-xs font-medium ${active ? 'text-[#0B132B]' : done ? 'text-slate-700' : 'text-slate-400'}`}>{s.name}</div>
                </div>
              );
})}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
          <div className="text-sm text-slate-600">
            Acting as <span className="font-semibold text-[#0B132B]">{actor}</span>.{' '}
            {canAct ? 'You can action this stage.' : `Waiting on ${ownerLabel} — switch role to continue.`}
          </div>
          <div className="flex gap-2">
            <button
              onClick={sendBack}
              disabled={!canAct || stage === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ArrowLeft size={15} /> Send back
            </button>
            <button
              onClick={advance}
              disabled={!canAct || stage === STAGES.length - 1}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#047857] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#065f46] disabled:opacity-40"
            >
              {stage === STAGES.length - 2 ? 'Publish' : 'Approve & advance'} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle
          icon={Lock}
          title="Tamper-Evident Audit Log"
          subtitle="Every action is saved here. Each entry is locked to the one before it, so a secret edit is detected. Try: Simulate tampering, then Verify integrity."
          right={
            <div className="flex flex-wrap gap-2">
              <button
                onClick={tamper}
                title="Demo only: secretly edits one entry so you can see Verify integrity catch it"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <AlertTriangle size={13} /> Simulate tampering
              </button>
              {tampered && (
                <button
                  onClick={undoTamper}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  <RotateCcw size={13} /> Undo tampering
                </button>
              )}
              <button
                onClick={askClear}
                disabled={log.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
              >
                <Trash2 size={13} /> Clear all history
              </button>
              <button
                onClick={runVerify}
                disabled={checking}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B132B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#16213f] disabled:opacity-60"
              >
                {checking ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Verify integrity
              </button>
            </div>
          }
        />

        {verify && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
              verify.ok ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-red-50 text-red-800 ring-1 ring-red-200'
            }`}
          >
            {verify.ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {verify.ok
              ? `Chain intact — all ${log.length} entries verified.`
              : `Tampering detected at entry #${verify.brokenAt + 1}. Hashes after this point cannot be trusted.`}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Hash</th>
                <th className="px-4 py-3"><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {log.map((e, i) => {
                const broken = verify && !verify.ok && i >= verify.brokenAt;
                const bad = verify && !verify.ok && i === verify.brokenAt;
                return (
                  <tr key={e.id} className={bad ? 'bg-red-50' : broken ? 'bg-red-50/40' : 'hover:bg-slate-50/70'}>
                    <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmt(e.ts)}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-[#0B132B]">{e.actor}</span>
                      <span className="ml-1.5 text-xs text-slate-400">{e.role}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{e.action}</td>
                    <td className="px-4 py-3">
                      <Badge>{STAGES[e.stage]?.name}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-500">
                        <Hash size={11} /> {e.hash.slice(0, 10)}…
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => askDelete(e, i)}
                        title="Delete this entry"
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {log.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    No history yet. Scan a draft or approve a stage and it will appear here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab 5 — Insights                                                    */
/* ------------------------------------------------------------------ */

function InsightsTab({ scans, logCount }) {
  const total = scans.length;
  const avg = total ? Math.round(scans.reduce((n, x) => n + x.score, 0) / total) : null;
  const found = scans.reduce((n, x) => n + x.found.length, 0);
  const fixed = scans.reduce((n, x) => n + (x.fixed || 0), 0);

  const counts = {};
  scans.forEach((x) => x.found.forEach((f) => { counts[f.label] = (counts[f.label] || 0) + 1; }));
  const mistakes = Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const max = mistakes[0]?.count || 1;

  const crit = scans.reduce((n, x) => n + x.found.filter((f) => f.severity === 'red').length, 0);
  const sev = [
    { label: 'Critical', value: crit, color: '#dc2626' },
    { label: 'Advisory', value: found - crit, color: '#f59e0b' },
  ];
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;

  const scores = scans.slice(-8).map((x) => x.score);
  const pts = scores.map((v, i) => `${(i / (scores.length - 1)) * 280 + 10},${90 - (v / 100) * 75}`).join(' ');

  return (
    <div className="space-y-6">
      {total === 0 && (
        <Card className="p-5">
          <p className="text-sm text-slate-600">
            <b className="text-[#0B132B]">No data yet.</b> Run a scan in the Scanner tab and your numbers will appear here.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { label: 'Drafts scanned', value: total },
          { label: 'Avg. brand score', value: avg === null ? '—' : avg },
          { label: 'Problems found', value: found },
          { label: 'Fixed with rewrites', value: fixed },
          { label: 'History entries', value: logCount },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{k.label}</div>
            <div className="mt-1 text-2xl font-bold text-[#0B132B]">{k.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <SectionTitle icon={AlertTriangle} title="Repeated Mistakes" subtitle="The problems found most often in your scans" />
          {mistakes.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing to show yet.</p>
          ) : (
            <div className="space-y-3.5">
              {mistakes.map((m, i) => (
                <div key={m.label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-slate-700">{m.label}</span>
                    <span className="font-semibold text-[#0B132B]">{m.count}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${(m.count / max) * 100}%`, background: i < 2 ? '#dc2626' : i < 4 ? '#f59e0b' : EMERALD }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {mistakes[0] && (
            <p className="mt-5 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-100">
              Suggestion: “{mistakes[0].label}” comes up most. Add clear examples of it to your Brand Guide.
            </p>
          )}
        </Card>

        <Card className="p-6">
          <SectionTitle icon={HelpCircle} title="How serious were the problems?" subtitle="Critical means it must be fixed before publishing" />
          {found === 0 ? (
            <p className="text-sm text-slate-500">Nothing to show yet.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <svg width="150" height="150" viewBox="0 0 140 140" className="shrink-0 -rotate-90">
                <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f5f9" strokeWidth="18" />
                {sev.map((u) => {
                  const len = (u.value / found) * C;
                  const el = (
                    <circle
                      key={u.label}
                      cx="70"
                      cy="70"
                      r={R}
                      fill="none"
                      stroke={u.color}
                      strokeWidth="18"
                      strokeDasharray={`${len} ${C - len}`}
                      strokeDashoffset={-offset}
                    />
                  );
                  offset += len;
                  return el;
                })}
              </svg>
              <div className="min-w-[180px] flex-1 space-y-2.5">
                {sev.map((u) => (
                  <div key={u.label} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-700">
                      <span className="h-3 w-3 rounded-sm" style={{ background: u.color }} />
                      {u.label}
                    </span>
                    <span className="font-semibold text-[#0B132B]">
                      {u.value} ({Math.round((u.value / found) * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <SectionTitle icon={TrendingUp} title="Brand score over time" subtitle="Your last 8 scans — higher is better" />
        {scores.length < 2 ? (
          <p className="text-sm text-slate-500">Run at least two scans to see the trend.</p>
        ) : (
          <>
            <svg viewBox="0 0 300 100" className="h-40 w-full">
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={EMERALD} stopOpacity="0.25" />
                  <stop offset="100%" stopColor={EMERALD} stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={`10,95 ${pts} 290,95`} fill="url(#trendFill)" />
              <polyline points={pts} fill="none" stroke={EMERALD} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {scores.map((v, i) => (
                <circle key={i} cx={(i / (scores.length - 1)) * 280 + 10} cy={90 - (v / 100) * 75} r="3" fill="#fff" stroke={EMERALD} strokeWidth="2" />
              ))}
            </svg>
            <div className="mt-1 flex justify-between px-2 text-xs text-slate-400">
              {scores.map((v, i) => (
                <span key={i}>{v}</span>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Root page                                                           */
/* ------------------------------------------------------------------ */

export default function Page() {
  const [roleKey] = useState('admin');
  const [tab, setTab] = useState('scanner');
  const [menuOpen, setMenuOpen] = useState(false);
  const [stage, setStage] = useState(1);
  const [log, setLog] = useState([]);
  const [scans, setScans] = useState([]);
  const [ready, setReady] = useState(false);
  const logRef = useRef([]);
  const menuRef = useRef(null);

  const role = ROLES.find((r) => r.key === roleKey);

  useEffect(() => {
    logRef.current = log;
  }, [log]);

  // Seed the audit log with a valid hash chain
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Use saved history from this browser if there is any
      try {
        const raw = localStorage.getItem('bp-state');
        if (raw) {
          const saved = JSON.parse(raw);
          if (Array.isArray(saved.log)) {
            if (!cancelled) {
              logRef.current = saved.log;
              setLog(saved.log);
              setStage(Number.isInteger(saved.stage) ? saved.stage : 0);
              setScans(Array.isArray(saved.scans) ? saved.scans : []);
              setReady(true);
            }
            return;
          }
        }
      } catch {}
      const base = Date.now() - 1000 * 60 * 60 * 5;
      const seed = [
        { actor: 'Kaira', role: 'Creator', action: 'Created draft "Diwali Campaign Caption"', stage: 0 },
        { actor: 'Kaira', role: 'Creator', action: 'Submitted draft for AI scan', stage: 1 },
      ];
      const out = [];
      let prev = 'GENESIS';
      for (let i = 0; i < seed.length; i++) {
        const e = { ...seed[i], id: `seed-${i}`, ts: base + i * 1000 * 60 * 17, prevHash: prev };
        e.hash = await sha256(entryPayload(e));
        prev = e.hash;
        out.push(e);
      }
      if (!cancelled) {
        setLog(out);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addLog = useCallback(
    async (action, stageOverride) => {
      const prevList = logRef.current;
      const prev = prevList.length ? prevList[prevList.length - 1].hash : 'GENESIS';
      const entry = {
        id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ts: Date.now(),
        actor: role.name,
        role: role.label,
        action,
        stage: stageOverride ?? stage,
        prevHash: prev,
      };
      entry.hash = await sha256(entryPayload(entry));
      logRef.current = [...logRef.current, entry];
      setLog(logRef.current);
      return entry.id;
    },
    [role, stage]
  );

  // Save history in this browser so it survives a refresh
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem('bp-state', JSON.stringify({ log, stage, scans }));
    } catch {}
  }, [log, stage, scans, ready]);

  const recordScan = useCallback((rec) => setScans((s) => [...s.slice(-199), rec]), []);
  const recordFix = useCallback(
    (n) => setScans((s) => (s.length ? s.map((x, i) => (i === s.length - 1 ? { ...x, fixed: (x.fixed || 0) + n } : x)) : s)),
    []
  );

  // Re-seal the chain after an entry is removed so the remaining history still verifies
  const deleteEntry = useCallback(async (id) => {
    const rest = logRef.current.filter((e) => e.id !== id);
    const out = [];
    let prev = 'GENESIS';
    for (const e of rest) {
      const n = { ...e, prevHash: prev };
      n.hash = await sha256(entryPayload(n));
      prev = n.hash;
      out.push(n);
    }
    logRef.current = out;
    setLog(out);
    setScans((s) => s.filter((x) => x.logId !== id));
  }, []);

  const clearHistory = useCallback(() => {
    logRef.current = [];
    setLog([]);
    setScans([]);
    setStage(0);
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0B132B] shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#047857] text-white shadow-inner">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight tracking-tight text-white">
                BrandPulse <span className="text-emerald-400">AI</span>
              </h1>
              <p className="hidden text-xs text-slate-400 sm:block">Brand safety, compliance & approvals in one place</p>
            </div>
          </div>

        </div>

        {/* Tabs */}
        <nav className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6">
          <div className="flex gap-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition ${
                    active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon size={16} className={active ? 'text-emerald-400' : ''} />
                  {t.label}
                  {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-emerald-400" />}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <p className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          💡 {TABS.find((t) => t.key === tab)?.help}
        </p>
        <div className={tab === 'scanner' ? '' : 'hidden'}>
          <ScannerTab role={roleKey} onLog={addLog} onScan={recordScan} onFix={recordFix} />
        </div>
        {tab === 'visual' && <VisualTab onLog={addLog} />}
        {tab === 'vault' && <VaultTab />}
        {tab === 'workflow' && (
          <WorkflowTab
            role={roleKey}
            actor={`${role.name} (${role.label})`}
            stage={stage}
            setStage={setStage}
            log={log}
            setLog={(updater) => {
              setLog((prev) => {
                const next = typeof updater === 'function' ? updater(prev) : updater;
                logRef.current = next;
                return next;
              });
            }}
            addLog={addLog}
            onDeleteEntry={deleteEntry}
            onClearHistory={clearHistory}
          />
        )}
        {tab === 'insights' && <InsightsTab scans={scans} logCount={log.length} />}
      </main>

      <footer className="mx-auto max-w-7xl px-6 pb-8 text-center text-xs text-slate-400">
        BrandPulse AI
      </footer>
    </div>
  );
}
