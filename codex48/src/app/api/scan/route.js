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

function runSafetyPass(text) {
  const clean = text.replace(/[​-‍﻿]/g, '');
  const found = [];
  const seen = new Set();
  const add = (phrase, idx) => {
    const k = phrase.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    found.push(safetyFlag(phrase, idx));
  };
  for (const m of safetyMatcher.getAllMatches(clean, true)) {
    add(clean.slice(m.startIndex, m.endIndex + 1), m.startIndex);
  }
  // Catch letters split up by dots, dashes, stars: "f.u.c.k"
  const spaced = /(?:[a-z][.\-_*]){2,}[a-z]/gi;
  let sm;
  while ((sm = spaced.exec(clean)) !== null) {
    const joined = sm[0].replace(/[.\-_*]/g, '');
    if (safetyMatcher.hasMatch(joined)) add(sm[0], sm.index);
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

/* ---------- STAGE 1B: Brand Vault rules ---------- */
function runVaultPass(draftText, rules) {
  const flags = [];
  let n = 1;
  for (const item of rules) {
    const terms = Array.isArray(item.terms) ? item.terms : [item.term || item];
    for (const termText of terms) {
      if (!termText || typeof termText !== 'string') continue;
      const regex = new RegExp(`\\b${escapeRegex(termText)}\\b`, 'gi');
      let match;
      while ((match = regex.exec(draftText)) !== null) {
        const severity = item.severity === 'red' || item.severity === 'critical' ? 'red' : 'amber';
        const reason = item.description || item.reason || item.explanation || `Avoid using "${match[0]}".`;
        const cite = item.citation || item.source || item.ruleCited || 'Brand Guide §2.1';
        const rw = item.replacement || item.suggestedReplacement || item.suggestedRewrite || '';
        flags.push({
          id: `vault-${item.id || n++}-${match.index}`,
          kind: 'rule',
          flagged: match[0],
          phrase: match[0],
          title: item.title || (severity === 'red' ? 'Critical brand violation' : 'Brand advisory'),
          severity,
          message: reason,
          explanation: reason,
          citation: cite,
          ruleCited: cite,
          rewrite: rw,
          suggestedRewrite: rw,
        });
      }
    }
  }
  return flags;
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
async function runAiPass(draftText, rules, facts, brandVoice) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { failed: 'No GEMINI_API_KEY is set on the server' };

  const prompt = `You are a strict brand compliance reviewer.
Brand voice: ${brandVoice || 'Confident, clear, warm and respectful. We inform and never over-promise.'}
Banned words and rules already checked separately (do NOT flag these again): ${JSON.stringify(rules).slice(0, 3500)}
Claims backed by proof in the Brand Vault (these are OK to use): ${JSON.stringify(facts || []).slice(0, 2500)}

Review the draft below. Return ONLY JSON in exactly this shape:
{"tone":{"formality":1-5,"empathy":1-5,"urgency":1-5,"aggressiveness":1-5},
 "issues":[{"sentence":"exact sentence copied from the draft","problem":"plain-language reason","rule":"which brand principle it breaks","severity":"red or amber","rewrite":"compliant rewrite of that exact sentence, same meaning, calm and warm tone"}]}
Flag every sentence that is angry, hostile, blaming, sarcastic, threatening, pushy, manipulative or deceptive, or that makes statistics or claims NOT backed by the proven claims above. Use severity red for hostile, threatening or deceptive sentences and amber for milder tone problems. Be thorough: short informal text can still break the brand voice. If the draft is truly fine, return an empty issues list.

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
      return { tone, issues };
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
    if (draftText.length > 20000) {
      return NextResponse.json({ error: 'Text is too long. Please scan up to 20,000 characters at a time.' }, { status: 400 });
    }

    const vault = await loadBrandVault();
    const rules = body?.rules && body.rules.length > 0 ? body.rules : vault.forbiddenTerms || vault.rules || [];

    const safety = dropNested([...runThreatPass(draftText), ...runSafetyPass(draftText)]);
    const vaultIssues = dropNested([...safety, ...runVaultPass(draftText, rules)]).filter((f) => f.kind === 'rule');

    let tone = null;
    let extra = [];
    let engine = 'blocked';
    let warning;
    if (safety.length === 0) {
      const ai = await runAiPass(draftText, rules, Array.isArray(body?.approvedFacts) ? body.approvedFacts : [], typeof body?.brandVoice === 'string' ? body.brandVoice : '');
      if (ai.failed) {
        const local = localAnalysis(draftText);
        tone = local.tone;
        extra = local.issues;
        engine = 'built-in';
        warning = 'AI is unavailable right now, so the built-in checker was used. (' + ai.failed + ')';
      } else {
        tone = ai.tone;
        extra = ai.issues;
        engine = 'ai';
      }
    }

    const issues = [...safety, ...vaultIssues, ...extra];
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
