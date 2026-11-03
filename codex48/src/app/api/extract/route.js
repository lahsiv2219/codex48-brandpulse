import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_BYTES = 4 * 1024 * 1024; // Vercel allows about 4.5 MB per request
const MAX_CHARS = 50000; // same limit as the scanner

function tidy(text) {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file was received. Please try again.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'That file is bigger than 4 MB. Please choose a smaller one.' }, { status: 413 });
    }

    const name = String(file.name || '').toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    let text = '';

    if (name.endsWith('.docx')) {
      if (buf.slice(0, 2).toString() !== 'PK') {
        return NextResponse.json({ error: 'That does not look like a real .docx file.' }, { status: 400 });
      }
      const mod = await import('mammoth');
      const mammoth = mod.default || mod;
      const out = await mammoth.extractRawText({ buffer: buf });
      text = out.value || '';
    } else if (name.endsWith('.pdf')) {
      if (buf.slice(0, 4).toString() !== '%PDF') {
        return NextResponse.json({ error: 'That does not look like a real PDF file.' }, { status: 400 });
      }
      const mod = await import('pdf-parse/lib/pdf-parse.js');
      const pdfParse = mod.default || mod;
      const out = await pdfParse(buf);
      text = out.text || '';
    } else {
      return NextResponse.json({ error: 'Please upload a PDF or a Word (.docx) file.' }, { status: 400 });
    }

    text = tidy(text);
    if (!text) {
      return NextResponse.json(
        { error: 'No readable text was found. If this PDF is a scan or a picture of text, it cannot be read.' },
        { status: 422 }
      );
    }

    let note = '';
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      note = 'This file is long, so only the first 50,000 characters were loaded.';
    }
    return NextResponse.json({ ok: true, text, note });
  } catch (err) {
    return NextResponse.json({ error: 'Could not read that file: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
