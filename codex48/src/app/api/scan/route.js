import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

const safetyMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

async function loadBrandVault() {
  for (const name of ['brandVaultData.json', 'brand-data.json']) {
    try {
      const raw = await fs.readFile(path.join(process.cwd(), 'src', 'data', name), 'utf-8');
      return JSON.parse(raw);
    } catch {}
  }
  return {};
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ---------- STAGE 1A: hate speech and profanity (zero tolerance) ---------- */
// Spelling tricks we undo before checking: accents, look-alike characters,
// 1337-speak, invisible characters, repeated letters and letters spaced apart.
const FOLD_LEET = { '1': 'i', '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

const FILTER_PATTERNS = [
  // Slur families. Written to catch spelling variants (extra letters, h, q, b, dropped g)
  // but NOT innocent words such as Niger, Nigeria, nigh, Nina.
  /\bn+[i!|l]+(?:[gqb]{2,}h?(?:a|e|er|ah|uh|ers?)+|[gq]h?a+)[sz]*\b/,
  /\bf+a+g{1,2}(?:[eo]+t+|i+t+)?s?\b/,
  /\bre+t+a+r+d+(?:ed|s)?\b/,
  /\btr+a+n+n+(?:y|ie)s?\b/,
  // Profanity with missing letters or symbols: fck, fuk, sht, b!tch, a$$hole
  /\bf+(?:u+c*|u*c+)k+(?:ing|in|ed|er|ers|s)?\b/,
  /\bs+h+[i!*]*t+(?:ty|s|head)?\b/,
  /\bb+[i!*]*t+c+h+(?:es|y)?\b/,
  /\ba+s{2,}h+o+l+e+s?\b/,
  /\bc+u+n+t+s?\b/,
  // Identity words used as insults
  /\b(?:that'?s|thats|so|you'?re|youre|ur|u\s+r|such\s+a)\s+(?:ga+y+|retarded|spastic)\b/,
];
const FILTER_TESTS = FILTER_PATTERNS.map((re) => new RegExp(re.source));

function safetyFlag(phrase, index) {
  return {
    id: `safety-${index}-${phrase}`,
    kind: 'safety',
    flagged: phrase,
    phrase,
    title: 'Hate speech or offensive language',
    severity: 'red',
    message: 'Offensive or hateful language is never allowed in brand content. Remove it before publishing.',
    explanation: 'Offensive or hateful language is never allowed in brand content. Remove it before publishing.',
    citation: 'Zero Tolerance Policy §1.1',
    ruleCited: 'Zero Tolerance Policy §1.1',
    rewrite: '',
    suggestedRewrite: '',
  };
}

function stripInvisible(text) {
  const chars = [];
  const map = [];
  for (let i = 0; i < text.length; i++) {
    if (/[​-‍﻿­⁠]/.test(text[i])) continue;
    chars.push(text[i]);
    map.push(i);
  }
  return { clean: chars.join(''), map };
}

// Same length as the input, so match positions line up with the original text.
function foldForPatterns(clean) {
  let out = '';
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    const base = (c.normalize('NFKD').replace(/[̀-ͯ]/g, '')[0] || c).toLowerCase()[0] || c;
    out += FOLD_LEET[base] || base;
  }
  return out;
}

function runSafetyPass(text) {
  const { clean, map } = stripInvisible(text);
  const found = [];
  const seen = new Set();
  const add = (start, endExclusive) => {
    const phrase = text.slice(map[start], map[endExclusive - 1] + 1);
    const k = phrase.toLowerCase();
    if (!phrase.trim() || seen.has(k)) return;
    seen.add(k);
    found.push(safetyFlag(phrase, map[start]));
  };

  // 1. The word list (handles leetspeak, look-alikes and repeated letters)
  for (const m of safetyMatcher.getAllMatches(clean, true)) add(m.startIndex, m.endIndex + 1);

  // 2. Our own spelling-variant patterns
  const folded = foldForPatterns(clean);
  for (const re of FILTER_PATTERNS) {
    re.lastIndex = 0;
    const g = new RegExp(re.source, 'g');
    let m;
    while ((m = g.exec(folded)) !== null) {
      if (!m[0]) { g.lastIndex++; continue; }
      add(m.index, m.index + m[0].length);
    }
  }

  // 3. Letters spread apart: "f.u.c.k", "n i g g a", "s-h-i-t"
  const spaced = /\b(?:[a-z0-9@$][\s.\-_*,]{1,2}){2,}[a-z0-9@$]\b/gi;
  let sm;
  while ((sm = spaced.exec(clean)) !== null) {
    const joined = sm[0].replace(/[^a-z0-9@$]/gi, '');
    const joinedFolded = foldForPatterns(joined);
    const bad = safetyMatcher.hasMatch(joined) || FILTER_TESTS.some((t) => t.test(joinedFolded));
    if (bad) add(sm.index, sm.index + sm[0].length);
  }
  return found;
}

/* ---------- STAGE 1A-2: threats, violence, self-harm (zero tolerance) ---------- */
const THREAT_PATTERNS = [
  /\bun[-\s]?alive\b/g,
  /\b(?:kill|murder|hurt|harm|shoot|stab|strangle|punch|attack)\s+(?:you|u|ya|him|her|them|everyone|yourself|urself|myself)\b/g,
  /\bkill\s+your\s?self\b/g,
  /\bkys\b/g,
  /\bi(?:'ll|\s+will|'m\s+going\s+to|\s+am\s+going\s+to|\s+may|\s+might|\s+could|\s+want\s+to|\s+wanna)\s+(?:kill|murder|hurt|harm|shoot|stab|strangle|punch|attack)\b/g,
  /\byou(?:'ll|\s+will)\s+(?:pay|regret|die|suffer|be\s+sorry)\b/g,
  /\b(?:hope|wish)\s+you\s+(?:die|suffer|get\s+hurt)\b/g,
  /\bi\s+know\s+where\s+you\s+live\b/g,
  /\bwatch\s+your\s+back\b/g,
];
const LEET = { '1': 'i', '0': 'o', '3': 'e', '@': 'a', '$': 's' };

function runThreatPass(text) {
  // same-length copy so positions line up with the original text
  const probe = text
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .toLowerCase()
    .replace(/[103@$]/g, (c) => LEET[c]);
  const out = [];
  const seen = new Set();
  for (const re of THREAT_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(probe)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      // widen to the whole sentence so "Remove" takes out the full threat
      let a = m.index, b = m.index + m[0].length;
      while (a > 0 && !/[.!?\n]/.test(text[a - 1])) a--;
      while (b < text.length && !/[.!?\n]/.test(text[b])) b++;
      if (b < text.length && /[.!?]/.test(text[b])) b++;
      const phrase = text.slice(a, b).trim();
      if (!phrase || seen.has(phrase)) continue;
      seen.add(phrase);
      out.push({
        id: `threat-${a}`,
        kind: 'safety',
        flagged: phrase,
        phrase,
        title: 'Threatening or violent language',
        severity: 'red',
        message: 'Threats, violence and self-harm language are never allowed in brand content. Remove this sentence before publishing.',
        explanation: 'Threats, violence and self-harm language are never allowed in brand content. Remove this sentence before publishing.',
        citation: 'Zero Tolerance Policy §1.2',
        ruleCited: 'Zero Tolerance Policy §1.2',
        rewrite: '',
        suggestedRewrite: '',
      });
    }
  }
  return out;
}

// If one flag sits fully inside a longer flag, keep only the longer one.
function dropNested(list) {
  return list.filter((a) =>
    !list.some((b) => b !== a && b.phrase.length > a.phrase.length && b.phrase.toLowerCase().includes(a.phrase.toLowerCase()))
  );
}

/* ---------- STAGE 1B: Brand Vault rules (forgiving about spelling) ---------- */
const LEET_CLASS = { a: '[a4@]', e: '[e3]', i: '[i1!]', o: '[o0]', s: '[s5$]', t: '[t7]' };

// "guaranteed" also matches guaranteeed, gu4ranteed, GUARANTEED...
function looseTermRegex(term) {
  const parts = [];
  let prev = '';
  for (const ch of term) {
    const lower = ch.toLowerCase();
    if (/[a-z]/.test(lower)) {
      if (lower === prev) continue; // repeated letters are covered by the "+"
      parts.push((LEET_CLASS[lower] || lower) + '+');
    } else if (/\s/.test(ch)) {
      parts.push('[\\s.\\-_*]+');
    } else if (ch === "'" || ch === '’') {
      parts.push("['’]?");
    } else {
      parts.push(escapeRegex(ch));
    }
    prev = lower;
  }
  return new RegExp(`(?<![A-Za-z0-9])${parts.join('')}(?![A-Za-z0-9])`, 'gi');
}

function collapseRepeats(w) {
  return w.replace(/(.)\1+/g, '$1');
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function runVaultPass(draftText, rules) {
  const flags = [];
  const used = new Set();

  const tokens = [];
  const tre = /[A-Za-z]{6,}/g;
  let tm;
  while ((tm = tre.exec(draftText)) !== null) {
    tokens.push({ text: tm[0], index: tm.index, key: collapseRepeats(tm[0].toLowerCase()) });
  }

  rules.forEach((item, ruleNo) => {
    const label = item.id || `rule${ruleNo}`;
    const severity = item.severity === 'red' || item.severity === 'critical' ? 'red' : 'amber';
    const push = (matchText, index) => {
      const key = `${label}-${index}`;
      if (used.has(key)) return;
      used.add(key);
      const reason = item.description || item.reason || item.explanation || `Avoid using "${matchText}".`;
      const cite = item.citation || item.source || item.ruleCited || 'Brand Guide §2.1';
      const rw = item.replacement || item.suggestedReplacement || item.suggestedRewrite || '';
      flags.push({
        id: `vault-${label}-${index}`,
        kind: 'rule',
        index,
        sentenceRewrite: !!item.sentenceRewrite,
        flagged: matchText,
        phrase: matchText,
        title: item.title || (severity === 'red' ? 'Critical brand violation' : 'Brand advisory'),
        severity,
        message: reason,
        explanation: reason,
        citation: cite,
        ruleCited: cite,
        rewrite: rw,
        suggestedRewrite: rw,
      });
    };

    const terms = Array.isArray(item.terms) ? item.terms : [item.term || item];
    for (const termText of terms) {
      if (!termText || typeof termText !== 'string') continue;
      const re = looseTermRegex(termText);
      let m;
      while ((m = re.exec(draftText)) !== null) {
        if (!m[0]) { re.lastIndex++; continue; }
        push(m[0], m.index);
      }
      // One-letter typos in longer single words: "guarenteed", "revolutionery"
      if (/^[A-Za-z]{7,}$/.test(termText)) {
        const key = collapseRepeats(termText.toLowerCase());
        for (const t of tokens) {
          if (t.key !== key && Math.abs(t.key.length - key.length) <= 1 && editDistance(t.key, key) === 1) push(t.text, t.index);
        }
      }
    }
  });
  return flags;
}

/* ---------- Tone rules: flag the whole sentence and suggest a calmer version ---------- */
function sentenceBounds(text, index, length) {
  let a = index;
  let b = index + length;
  while (a > 0 && !/[.!?\n]/.test(text[a - 1])) a--;
  while (b < text.length && !/[.!?\n]/.test(text[b])) b++;
  if (b < text.length && /[.!?]/.test(text[b])) b++;
  return [a, b];
}

function mergeToSentences(draftText, flags) {
  const keep = [];
  const groups = new Map();
  for (const f of flags) {
    if (!f.sentenceRewrite) { keep.push(f); continue; }
    const [a, b] = sentenceBounds(draftText, f.index, f.phrase.length);
    const phrase = draftText.slice(a, b).trim();
    if (!phrase) { keep.push(f); continue; }
    const g = groups.get(phrase) || { phrase, start: a, items: [] };
    g.items.push(f);
    groups.set(phrase, g);
  }
  const merged = [...groups.values()].map((g) => {
    const first = g.items.find((x) => x.severity === 'red') || g.items[0];
    const words = [...new Set(g.items.map((x) => x.phrase.toLowerCase()))];
    const msg = words.length > 1 ? `${first.message} Found: ${words.map((w) => `“${w}”`).join(', ')}.` : first.message;
    return { ...first, id: `tone-${g.start}`, flagged: g.phrase, phrase: g.phrase, message: msg, explanation: msg, rewrite: '', suggestedRewrite: '', needsRewrite: true };
  });
  return [...keep, ...merged];
}

const INSULTS = /\b(idiot|stupid|moron|loser|shut up|useless|pathetic)\b/i;
const LOCAL_SWAPS = [
  [/\b(?:angry|furious|upset|mad) (?:at|with) you\b/gi, 'concerned about this'],
  [/\byou must\b/gi, 'please'],
  [/\byour fault\b/gi, 'something we can look into together'],
  [/\bsick of\b/gi, 'concerned about'],
  [/\bfed up with\b/gi, 'concerned about'],
  [/\bfed up\b/gi, 'concerned'],
  [/\bor else\b/gi, 'so we can sort this out'],
  [/\bno excuses\b/gi, 'let us find a solution together'],
  [/\bexcuses\b/gi, 'reasons'],
  [/\bfurious\b/gi, 'very concerned'],
  [/\bangry\b/gi, 'concerned'],
  [/\bi hate you\b/gi, 'I disagree with you'],
];

// Used when the AI is unavailable: swap harsh phrases for calmer ones.
function localRewrite(sentence) {
  if (INSULTS.test(sentence)) return "I'd like to talk through this respectfully.";
  let out = sentence;
  let changed = false;
  for (const [re, rep] of LOCAL_SWAPS) {
    const next = out.replace(re, rep);
    if (next !== out) changed = true;
    out = next;
  }
  if (!changed) return "I'd like to talk through what went wrong.";
  out = out.trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

function uniqueByPhrase(list) {
  const seen = new Set();
  return list.filter((f) => {
    const k = f.phrase.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ---------- STAGE 2 fallback: works with no AI key ---------- */
function clamp(n) {
  return Math.max(1, Math.min(5, Math.round(n)));
}

function localAnalysis(text) {
  const lower = text.toLowerCase();
  const count = (arr) => arr.reduce((n, w) => n + (lower.split(w).length - 1), 0);
  const exclam = (text.match(/!/g) || []).length;
  const contractions = (text.match(/\b\w+'(re|ll|s|t|ve|d)\b/gi) || []).length;
  const urgency = count(['now', 'hurry', 'last chance', 'limited', 'today only', "don't miss", 'expires', 'urgent', 'before']);
  const hype = count(['revolutionary', 'best', 'guaranteed', 'amazing', 'incredible', 'ultimate', 'game-changing', 'unbeatable', 'double']);
  const aggressive = count(['must', 'or else', 'you need to', 'never', 'stupid', 'loser', 'angry', 'furious', 'hate', 'sick of', 'fed up', 'your fault', 'shut up']) * 1.5 + exclam;
  const warm = count(['you', 'your', 'we understand', 'help', 'support', 'care', 'together']);
  const tone = {
    formality: clamp(5 - contractions * 0.7 - exclam * 0.6 - hype * 0.4),
    empathy: clamp(1.5 + warm * 0.4 - aggressive * 0.3),
    urgency: clamp(1 + urgency * 1.1),
    aggressiveness: clamp(1 + aggressive * 0.8 + hype * 0.3),
  };
  const issues = [];
  const sentences = text.match(/[^.!?\n]+[.!?]*/g) || [];
  sentences.forEach((raw, i) => {
    const s = raw.trim();
    if (!s) return;
    if (/\b(angry|furious|livid|hate|sick of|fed up|pissed|can't stand|disgusted)\b/i.test(s)) {
      const calm = "I'd like to talk through what went wrong.";
      issues.push({
        id: `local-anger-${i}`, kind: 'tone', flagged: s, phrase: s,
        title: 'Angry or hostile tone', severity: 'amber',
        message: 'This sentence sounds angry or hostile. Our brand voice is warm and respectful.',
        explanation: 'This sentence sounds angry or hostile. Our brand voice is warm and respectful.',
        citation: 'Brand Guide §3.2 — Tone of Voice', ruleCited: 'Brand Guide §3.2 — Tone of Voice',
        rewrite: calm, suggestedRewrite: calm,
      });
    }
    if (/\d+(\.\d+)?\s?(%|x\b|times)/i.test(s)) {
      issues.push({
        id: `local-claim-${i}`, kind: 'claim', flagged: s, phrase: s,
        title: 'Number or statistic without proof', severity: 'amber',
        message: 'This sentence makes a numeric claim. Add a source or proof in the Brand Vault, or remove the number.',
        explanation: 'This sentence makes a numeric claim. Add a source or proof in the Brand Vault, or remove the number.',
        citation: 'Claims Policy §4.1', ruleCited: 'Claims Policy §4.1', rewrite: '', suggestedRewrite: '',
      });
    }
    if ((s.match(/!/g) || []).length >= 2 || (/[A-Z]{5,}/.test(s) && s.length > 12)) {
      const soft = s.replace(/!+/g, '.');
      issues.push({
        id: `local-shout-${i}`, kind: 'tone', flagged: s, phrase: s,
        title: 'Tone is too loud or pushy', severity: 'amber',
        message: 'Several exclamation marks or ALL CAPS read as shouting.',
        explanation: 'Several exclamation marks or ALL CAPS read as shouting.',
        citation: 'Brand Voice §2.4', ruleCited: 'Brand Voice §2.4', rewrite: soft, suggestedRewrite: soft,
      });
    }
  });
  return { tone, issues };
}

/* ---------- STAGE 2: Gemini ---------- */
async function runAiPass(draftText, rules, facts, brandVoice, toRewrite = []) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { failed: 'No GEMINI_API_KEY is set on the server' };

  const prompt = `You are a strict brand compliance reviewer.
Brand voice: ${brandVoice || 'Confident, clear, warm and respectful. We inform and never over-promise.'}
Banned words and rules already checked separately (do NOT flag these again): ${JSON.stringify(rules).slice(0, 3500)}
Claims backed by proof in the Brand Vault (these are OK to use): ${JSON.stringify(facts || []).slice(0, 2500)}

Review the draft below. Return ONLY JSON in exactly this shape:
{"tone":{"formality":1-5,"empathy":1-5,"urgency":1-5,"aggressiveness":1-5},
 "issues":[{"sentence":"exact sentence copied from the draft","problem":"plain-language reason","rule":"which brand principle it breaks","severity":"red or amber","rewrite":"compliant rewrite of that exact sentence, same meaning, calm and warm tone"}],
 "rewrites":[{"sentence":"exact sentence from the list below","rewrite":"calm, warm, respectful version that keeps the real point"}]}
${toRewrite.length ? `Also rewrite each of these sentences in the brand voice (remove blame, anger, commands and insults, keep any genuine request or concern): ${JSON.stringify(toRewrite)}` : 'Set "rewrites" to an empty list.'}
Always flag slurs, hate speech, insults and profanity with severity red, even when misspelled, spaced out, abbreviated or disguised. Flag every sentence that is angry, hostile, blaming, sarcastic, threatening, pushy, manipulative or deceptive, or that makes statistics or claims NOT backed by the proven claims above. Use severity red for hostile, threatening or deceptive sentences and amber for milder tone problems. Be thorough: short informal text can still break the brand voice. If the draft is truly fine, return an empty issues list.

Draft:
"""${draftText}"""`;

  const models = [process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash'].filter(Boolean);
  const started = Date.now();
  let lastError = 'AI returned nothing';
  for (const model of models) {
    if (Date.now() - started > 4000 && model !== models[0]) break;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(7000),
        }
      );
      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) { lastError = `${model}: ${data?.error?.message || 'empty answer'}`; continue; }
      const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, '').trim());
      const issues = (parsed.issues || [])
        .filter((it) => it && typeof it.sentence === 'string' && it.sentence.trim() && draftText.includes(it.sentence.trim()))
        .map((it, i) => {
          const severity = it.severity === 'red' ? 'red' : 'amber';
          const phrase = it.sentence.trim();
          return {
            id: `ai-${i}`, kind: 'ai', flagged: phrase, phrase,
            title: severity === 'red' ? 'Serious issue found by AI' : 'Issue found by AI',
            severity, message: it.problem, explanation: it.problem,
            citation: it.rule || 'Brand Voice Guidelines', ruleCited: it.rule || 'Brand Voice Guidelines',
            rewrite: it.rewrite || '', suggestedRewrite: it.rewrite || '',
          };
        });
      const t = parsed.tone || {};
      const tone = {
        formality: clamp(t.formality ?? 3), empathy: clamp(t.empathy ?? 3),
        urgency: clamp(t.urgency ?? 3), aggressiveness: clamp(t.aggressiveness ?? 3),
      };
      const rewrites = Array.isArray(parsed.rewrites) ? parsed.rewrites.filter((r) => r && typeof r.sentence === 'string' && typeof r.rewrite === 'string') : [];
      return { tone, issues, rewrites };
    } catch (err) {
      lastError = `${model}: ${err?.message || 'failed'}`;
    }
  }
  return { failed: lastError };
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body. Expected { text }.' }, { status: 400 });
    }
    const draftText = body?.text || body?.draftText;
    if (typeof draftText !== 'string' || draftText.trim().length === 0) {
      return NextResponse.json({ error: 'Please type or paste some text first.' }, { status: 400 });
    }
    if (draftText.length > 50000) {
      return NextResponse.json({ error: 'Text is too long. Please scan up to 50,000 characters at a time.' }, { status: 400 });
    }

    const vault = await loadBrandVault();
    const rules = body?.rules && body.rules.length > 0 ? body.rules : vault.forbiddenTerms || vault.rules || [];

    const safety = dropNested([...runThreatPass(draftText), ...runSafetyPass(draftText)]);
    const vaultIssues = mergeToSentences(draftText, dropNested([...safety, ...runVaultPass(draftText, rules)]).filter((f) => f.kind === 'rule'));
    const toRewrite = vaultIssues.filter((f) => f.needsRewrite).map((f) => f.phrase);
    let aiRewrites = [];

    let tone = null;
    let extra = [];
    let engine = 'blocked';
    let warning;
    if (safety.length === 0) {
      const ai = await runAiPass(draftText, rules, Array.isArray(body?.approvedFacts) ? body.approvedFacts : [], typeof body?.brandVoice === 'string' ? body.brandVoice : '', toRewrite);
      if (ai.failed) {
        const local = localAnalysis(draftText);
        tone = local.tone;
        extra = local.issues;
        engine = 'built-in';
        warning = 'AI is unavailable right now, so the built-in checker was used. (' + ai.failed + ')';
      } else {
        tone = ai.tone;
        extra = ai.issues;
        aiRewrites = ai.rewrites || [];
        engine = 'ai';
      }
    }

    for (const f of vaultIssues) {
      if (!f.needsRewrite) continue;
      const hit = aiRewrites.find((r) => r.sentence.trim() === f.phrase);
      f.rewrite = (hit && hit.rewrite.trim()) || localRewrite(f.phrase);
      f.suggestedRewrite = f.rewrite;
    }
    const issues = uniqueByPhrase([...safety, ...vaultIssues, ...extra]);
    return NextResponse.json({
      ok: true,
      blocked: safety.length > 0,
      engine,
      warning,
      tone,
      issues,
      flags: issues,
      draftText,
      summary: {
        total: issues.length,
        critical: issues.filter((i) => i.severity === 'red').length,
        advisory: issues.filter((i) => i.severity === 'amber').length,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Scan failed: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
