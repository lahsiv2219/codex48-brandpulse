import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

async function loadBrandVault() {
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'brandVaultData.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    try {
      const fallbackPath = path.join(process.cwd(), 'src', 'data', 'brand-data.json');
      const raw = await fs.readFile(fallbackPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runRegexPass(draftText, rulesOrTerms) {
  const flags = [];
  let idCounter = 1;

  for (const item of rulesOrTerms) {
    const terms = Array.isArray(item.terms) ? item.terms : [item.term || item];
    for (const termText of terms) {
      if (!termText || typeof termText !== 'string') continue;
      const regex = new RegExp(`\\b${escapeRegex(termText)}\\b`, 'gi');
      let match;
      while ((match = regex.exec(draftText)) !== null) {
        const severity = item.severity === 'red' || item.severity === 'critical' ? 'red' : 'amber';
        flags.push({
          id: item.id ? `${item.id}-${match.index}` : `issue-${idCounter++}`,
          flagged: match[0],
          phrase: match[0],
          title: item.title || (severity === 'red' ? 'Critical brand violation' : 'Brand advisory'),
          severity,
          message: item.description || item.reason || item.explanation || `Avoid using "${match[0]}".`,
          explanation: item.description || item.reason || `Avoid using "${match[0]}".`,
          citation: item.citation || item.source || item.ruleCited || 'Brand Guide §2.1',
          ruleCited: item.citation || item.source || 'Brand Guide §2.1',
          rewrite: item.replacement || item.suggestedReplacement || item.suggestedRewrite || '',
          suggestedRewrite: item.replacement || item.suggestedReplacement || item.suggestedRewrite || '',
        });
      }
    }
  }

  const seen = new Set();
  return flags.filter((f) => {
    const k = `${f.flagged.toLowerCase()}-${f.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body. Expected { text } or { draftText }.' },
        { status: 400 }
      );
    }

    const draftText = body?.text || body?.draftText;
    if (typeof draftText !== 'string' || draftText.trim().length === 0) {
      return NextResponse.json(
        { error: 'text / draftText is required and must be a non-empty string.' },
        { status: 400 }
      );
    }

    const brandVault = await loadBrandVault();
    const rulesToUse = body?.rules && body.rules.length > 0
      ? body.rules
      : (brandVault.forbiddenTerms || brandVault.rules || []);

    const issues = runRegexPass(draftText, rulesToUse);

    return NextResponse.json(
      {
        ok: true,
        issues,
        flags: issues,
        draftText,
        summary: {
          total: issues.length,
          critical: issues.filter((i) => i.severity === 'red').length,
          advisory: issues.filter((i) => i.severity === 'amber').length,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: true,
        issues: [],
        flags: [],
        warning: 'Scan fallback returned empty list: ' + (err?.message || ''),
      },
      { status: 200 }
    );
  }
}
