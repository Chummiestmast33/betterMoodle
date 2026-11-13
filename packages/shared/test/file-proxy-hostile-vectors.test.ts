import { describe, test, expect } from 'bun:test';
import { FileProxyQuerySchema } from '../src/index';

describe('Adversarial Verification: Deep Hostile Vectors & Multi-Stage Decoding Stress-Test', () => {

  // ==========================================================================
  // Section 1: Double & Multi-Stage Encoded Dot-Dot Traversal (Must Reject)
  // ==========================================================================
  describe('Section 1: Double & Multi-Stage Encoded Dot-Dot Traversal', () => {
    const vectors = [
      { name: 'Double-encoded dot-dot (%252e%252e) in pathname', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/%252e%252e/admin/config.php' },
      { name: 'Double-encoded dot-dot (%252e%252e) in query string', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/file.pdf?file=%252e%252e/etc/passwd' },
      { name: 'Double-encoded dot-dot with slash (%252e%252e%252f)', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php?redirect=%252e%252e%252flogin.php' },
      { name: 'Double-encoded dot + raw dot (%252e.)', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/%252e./config.php' },
      { name: 'Raw dot + double-encoded dot (.%252e)', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/.%252e/config.php' },
      { name: 'Triple-encoded dot-dot (%25252e%25252e) in path', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/%25252e%25252e/config.php' },
      { name: 'Triple-encoded dot-dot in query', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?path=%25252e%25252e/secret' },
      { name: 'Double-encoded slash (%252f) with dots', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/..%252f..%252fetc' },
      { name: 'Double-encoded slash in query', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?dir=..%252fetc' },
      { name: 'Recursive %2525 nested pattern', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/%2525/evil' },
    ];

    for (const v of vectors) {
      test(`Reject ${v.name}: ${v.url}`, () => {
        const res = FileProxyQuerySchema.safeParse({ url: v.url });
        expect(res.success).toBe(false);
      });
    }
  });

  // ==========================================================================
  // Section 2: Double-Encoded Null Bytes (Must Reject)
  // ==========================================================================
  describe('Section 2: Double-Encoded Null Bytes', () => {
    const vectors = [
      { name: 'Double-encoded null byte (%2500) in path', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123%2500/doc.pdf' },
      { name: 'Double-encoded null byte (%2500) in filename', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf%2500.exe' },
      { name: 'Double-encoded null byte (%2500) in query parameter', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?file=%2500evil' },
      { name: 'Double-encoded null byte in query key', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?%2500=val' },
      { name: 'Triple-encoded null byte (%252500) in query', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?x=%252500' },
    ];

    for (const v of vectors) {
      test(`Reject ${v.name}: ${v.url}`, () => {
        const res = FileProxyQuerySchema.safeParse({ url: v.url });
        expect(res.success).toBe(false);
      });
    }
  });

  // ==========================================================================
  // Section 3: Double-Encoded CRLF & Header Injections (Must Reject)
  // ==========================================================================
  describe('Section 3: Double-Encoded CRLF & Header Injections', () => {
    const vectors = [
      { name: 'Double-encoded CRLF (%250d%250a) in path', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123%250d%250aSet-Cookie:evil=1' },
      { name: 'Double-encoded CRLF (%250d%250a) in query', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?x=%250d%250aSet-Cookie:evil=1' },
      { name: 'Double-encoded CR (%250d) in query', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?x=%250d' },
      { name: 'Double-encoded LF (%250a) in query', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?x=%250a' },
      { name: 'Double-encoded 0x1F control char (%251f)', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?x=%251f' },
      { name: 'Double-encoded 0x7F DEL char (%257f)', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?x=%257f' },
    ];

    for (const v of vectors) {
      test(`Reject ${v.name}: ${v.url}`, () => {
        const res = FileProxyQuerySchema.safeParse({ url: v.url });
        expect(res.success).toBe(false);
      });
    }
  });

  // ==========================================================================
  // Section 4: Malformed Percent Sequences (Must Reject)
  // ==========================================================================
  describe('Section 4: Malformed Percent Sequences', () => {
    const vectors = [
      { name: 'Standalone percent (%) in path', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc%.pdf' },
      { name: 'Non-hex percent sequence (%Z) in path', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc%Z.pdf' },
      { name: 'Invalid UTF-8 sequence (%E0%A4%A) in path', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc%E0%A4%A.pdf' },
      { name: 'Trailing percent at end of path', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc%' },
      { name: 'Standalone percent (%) in query parameter', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?filter=%' },
      { name: 'Non-hex percent sequence (%Z) in query parameter', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?filter=%Z' },
      { name: 'Invalid UTF-8 sequence (%E0%A4%A) in query parameter', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?filter=%E0%A4%A' },
      { name: 'Double percent without hex (%%)', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc%%.pdf' },
    ];

    for (const v of vectors) {
      test(`Reject ${v.name}: ${v.url}`, () => {
        const res = FileProxyQuerySchema.safeParse({ url: v.url });
        expect(res.success).toBe(false);
      });
    }
  });

  // ==========================================================================
  // Section 5: Windows Backslash Traversal & UNC Paths (Must Reject)
  // ==========================================================================
  describe('Section 5: Windows Backslash Traversal & UNC Paths', () => {
    const vectors = [
      { name: 'Windows backslash \\..\\.. at base', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php\\..\\..' },
      { name: 'Windows backslash \\.. in subpath', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123\\..\\secret' },
      { name: 'Windows backslash \\..\\.. in query param', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?path=\\..\\..' },
      { name: 'Windows absolute path (C:\\windows) in query', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?file=C:\\Windows\\win.ini' },
      { name: 'Encoded backslash (%5c) with traversal in path', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123%5c..%5csecret' },
      { name: 'Encoded backslash (%5c) with traversal in query', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?p=%5c..%5csecret' },
      { name: 'Double-encoded backslash (%255c) in path', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123%255c..%255csecret' },
      { name: 'Double-encoded backslash (%255c) in query', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?p=%255c..' },
      { name: 'UNC share format in query', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?share=\\\\attacker\\share\\file' },
    ];

    for (const v of vectors) {
      test(`Reject ${v.name}: ${v.url}`, () => {
        const res = FileProxyQuerySchema.safeParse({ url: v.url });
        expect(res.success).toBe(false);
      });
    }
  });

  // ==========================================================================
  // Section 6: Trailing Dot Hostnames (FQDN Spoofing / Must Reject)
  // ==========================================================================
  describe('Section 6: Trailing Dot Hostnames', () => {
    const vectors = [
      { name: 'Trailing dot on hostname without port', url: 'https://catedig.itlalaguna.edu.mx./webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Trailing dot on hostname with port 443', url: 'https://catedig.itlalaguna.edu.mx.:443/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Double trailing dot on hostname', url: 'https://catedig.itlalaguna.edu.mx../webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Leading dot on hostname', url: 'https://.catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
    ];

    for (const v of vectors) {
      test(`Reject ${v.name}: ${v.url}`, () => {
        const res = FileProxyQuerySchema.safeParse({ url: v.url });
        expect(res.success).toBe(false);
      });
    }
  });

  // ==========================================================================
  // Section 7: Positive Controls - Legitimate Moodle Files & Characters (Must Accept)
  // ==========================================================================
  describe('Section 7: Positive Controls - Legitimate Moodle Files & Characters', () => {
    const legitimate = [
      { name: 'Standard assignment submission', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/12345/mod_assign/intro/tarea_1.pdf' },
      { name: 'Spanish accent acute a (%C3%A1)', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_resource/content/1/evaluaci%C3%B3n.pdf' },
      { name: 'Spanish accent acute e (%C3%A9)', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_resource/content/1/s%C3%ADntesis.pdf' },
      { name: 'Spanish enye (%C3%B1)', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_resource/content/1/dise%C3%B1o.pdf' },
      { name: 'File with parentheses and dash', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_folder/content/0/Guia-2024(Final).pdf' },
      { name: 'Query param forcedownload=1', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?forcedownload=1' },
      { name: 'Query param preview=tinyicon', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/user/icon/f1?preview=tinyicon' },
      { name: 'Multiple legitimate query params', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?forcedownload=1&time=1690000000' },
    ];

    for (const v of legitimate) {
      test(`Accept ${v.name}: ${v.url}`, () => {
        const res = FileProxyQuerySchema.safeParse({ url: v.url });
        expect(res.success).toBe(true);
        if (res.success) {
          expect(res.data.url).toBe(v.url);
        }
      });
    }
  });

});
