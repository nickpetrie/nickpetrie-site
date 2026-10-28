// A carousel's slides as one PDF, for a LinkedIn document post. Each JPEG becomes a full page
// (DCTDecode, no re-encoding), so the PDF is about the size of the slides added together.
//   jpegsToPdf([Uint8Array, ...]) -> Uint8Array

/** Pixel size from a JPEG's start-of-frame marker. */
export function jpegSize(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('Not a JPEG');
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    // SOF0 to SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + len;
  }
  throw new Error('JPEG has no size');
}

export function jpegsToPdf(jpegs) {
  if (!jpegs.length) throw new Error('No slides');
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (x) => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); length += u.length; };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  // 1: catalog, 2: pages, then per slide: page, content, image.
  const pageIds = jpegs.map((_, i) => 3 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${jpegs.length} >>`);
  jpegs.forEach((jpg, i) => {
    const { width, height } = jpegSize(jpg);
    const [page, content, image] = [3 + i * 3, 4 + i * 3, 5 + i * 3];
    const draw = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`);
    obj(content, [`<< /Length ${draw.length} >>\nstream\n`, draw, '\nendstream']);
    obj(image, [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, '\nendstream']);
  });
  const count = 3 + jpegs.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const u of parts) { out.set(u, at); at += u.length; }
  return out;
}
