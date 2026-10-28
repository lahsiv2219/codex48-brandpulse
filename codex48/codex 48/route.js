import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

async function loadBrandVault() {
  const filePath = path.join(process.cwd(), 'src', 'data', 'brandVaultData.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runRegexPass(draftText, forbiddenTerms) {
  const flags = [];
  let idCounter = 1;

  for (const term of forbiddenTerms) {
    const termText = typeof term === 'string' ? term : term.term;
    if (!termText) continue;

    const regex = new RegExp(`\\b${escapeRegex(termText)}\\b`, 'gi');
    let match;
    while ((match = regex.exec(draftText)) !== null) {
      flags.push({
        id: `regex-${idCounter++}`,
        phrase: match[0],
        category: (typeof term === 'object' && term.category) || 'forbidden-terminology',
        severity: (typeof term === 'object' && term.severity) || 'critical',
        explanation:
          (typeof term === 'object' && term.explanation) ||
          `The term "${match[0]}" is on the forbidden terminology list and must not be used.`,
        suggestedRewrite:
          (typeof term === 'object' && term.suggestedRewrite) || '',
        ruleCited:
          (typeof term === 'object' && term.ruleCited) ||
          'Brand Vault — Forbidden Terms',
        source: 'regex',
      });
    }
  }

  return flags;
}

function buildDummySemanticFlags(draftText, brandVault) {
  const guidelines = brandVault.guidelines || [];
  const approvedFacts = brandVault.approvedFacts || [];
  const dummy = [];

  const firstGuideline = Array.isArray(guidelines) && guidelines.length
    ? guidelines[0]
    : null;
  const firstFact = Array.isArray(approvedFacts) && approvedFacts.length
    ? approvedFacts[0]
    : null;

  const snippet = draftText.trim().slice(0, 80) || 'the submitted text';

  dummy.push({
    id: 'semantic-1',
    phrase: snippet,
    category: 'tone-and-voice',
    severity: 'medium',
    explanation:
      'Semantic analysis (fallback mode) suggests reviewing tone against brand voice guidelines. The Ollama API was unavailable, so this is a placeholder flag.',
    suggestedRewrite:
      'Consider tightening phrasing to align with the approved brand tone and voice.',
    ruleCited: firstGuideline
      ? typeof firstGuideline === 'string'
        ? firstGuideline
        : firstGuideline.rule || firstGuideline.name || 'Brand Voice Guidelines'
      : 'Brand Voice Guidelines',
    source: 'fallback-semantic',
  });

  if (firstFact) {
    dummy.push({
      id: 'semantic-2',
      phrase: snippet,
      category: 'factual-accuracy',
      severity: 'low',
      explanation:
        'Semantic analysis (fallback mode) recommends verifying claims against approved facts. This is a placeholder flag because the semantic model was unreachable.',
      suggestedRewrite:
        'Cross-check any factual claims with the approved facts list in the Brand Vault.',
      ruleCited: firstFact
        ? typeof firstFact === 'string'
          ? firstFact
          : firstFact.fact || firstFact.name || 'Approved Facts'
        : 'Approved Facts',
      source: 'fallback-semantic',
    });
  }

  return dummy;
}

async function runSemanticPass(draftText, brandVault, apiKey) {
  const guidelines = brandVault.guidelines || [];
  const approvedFacts = brandVault.approvedFacts || [];

  const systemPrompt = `You are a brand compliance reviewer. Analyze the user's draft text against the provided brand guidelines and approved facts. Return ONLY valid JSON with the shape: {"flags":[{"id":"string","phrase":"string","category":"string","severity":"critical|high|medium|low","explanation":"string","suggestedRewrite":"string","ruleCited":"string"}]}. If no issues, return {"flags":[]}.`;

  const userPrompt = `BRAND GUIDELINES:\n${JSON.stringify(
    guidelines,
    null,
    2
  )}\n\nAPPROVED FACTS:\n${JSON.stringify(
    approvedFacts,
    null,
    2
  )}\n\nDRAFT TEXT:\n${draftText}`;

  const response = await fetch('https://ollama.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gemma4:31b-cloud',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API responded with status ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Ollama API returned no content');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse JSON from Ollama response');
    parsed = JSON.parse(match[0]);
  }

  const flags = Array.isArray(parsed.flags) ? parsed.flags : [];
  return flags.map((flag, index) => ({
    id: flag.id || `semantic-${index + 1}`,
    phrase: flag.phrase || '',
    category: flag.category || 'semantic',
    severity: flag.severity || 'medium',
    explanation: flag.explanation || '',
    suggestedRewrite: flag.suggestedRewrite || '',
    ruleCited: flag.ruleCited || 'Brand Guidelines',
    source: 'semantic',
  }));
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body. Expected { draftText }.' },
        { status: 400 }
      );
    }

    const { draftText } = body || {};
    if (typeof draftText !== 'string' || draftText.trim().length === 0) {
      return NextResponse.json(
        { error: 'draftText is required and must be a non-empty string.' },
        { status: 400 }
      );
    }

    const brandVault = await loadBrandVault();
    const forbiddenTerms =
      brandVault.forbiddenTerms || brandVault.forbidden_terms || [];

    const regexFlags = runRegexPass(draftText, forbiddenTerms);

    const apiKey = process.env.OLLAMA_API_KEY;
    let semanticFlags = [];
    let semanticMode = 'skipped';

    if (apiKey) {
      try {
        semanticFlags = await runSemanticPass(draftText, brandVault, apiKey);
        semanticMode = 'live';
      } catch (err) {
        semanticFlags = buildDummySemanticFlags(draftText, brandVault);
        semanticMode = 'fallback';
      }
    } else {
      semanticFlags = buildDummySemanticFlags(draftText, brandVault);
      semanticMode = 'fallback';
    }

    const allFlags = [...regexFlags, ...semanticFlags];

    return NextResponse.json(
      {
        ok: true,
        draftText,
        flags: allFlags,
        summary: {
          total: allFlags.length,
          critical: allFlags.filter((f) => f.severity === 'critical').length,
          regexMatches: regexFlags.length,
          semanticFlags: semanticFlags.length,
          semanticMode,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: true,
        flags: [],
        summary: { total: 0, semanticMode: 'fallback' },
        warning:
          'Unexpected error during scan; returning safe empty result. ' +
          (err?.message || ''),
      },
      { status: 200 }
    );
  }
}