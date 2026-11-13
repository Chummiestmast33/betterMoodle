import { describe, test, expect } from 'bun:test';
import { FileProxyQuerySchema } from '../src/index';

describe('Adversarial Verification: FileProxyQuerySchema SSRF & Edge Case Stress-Test', () => {

  // ==========================================================================
  // Category 1: Non-HTTPS Protocols (Must Reject)
  // ==========================================================================
  describe('Category 1: Non-HTTPS Protocols', () => {
    const vectors = [
      { name: 'Plain HTTP', url: 'http://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'FTP protocol', url: 'ftp://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'File scheme local', url: 'file:///etc/passwd' },
      { name: 'File scheme with host', url: 'file://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Gopher protocol', url: 'gopher://127.0.0.1:70/_' },
      { name: 'Javascript pseudo-protocol', url: 'javascript:alert(1)' },
      { name: 'Data URI scheme', url: 'data:text/html,<script>alert(1)</script>' },
      { name: 'WebSocket (ws)', url: 'ws://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'WebSocket Secure (wss)', url: 'wss://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
    ];

    for (const v of vectors) {
      test(`Reject ${v.name}: ${v.url}`, () => {
        const res = FileProxyQuerySchema.safeParse({ url: v.url });
        expect(res.success).toBe(false);
      });
    }
  });

  // ==========================================================================
  // Category 2: Hostname Spoofing & SSRF Targets (Must Reject)
  // ==========================================================================
  describe('Category 2: Hostname Spoofing & SSRF Targets', () => {
    const vectors = [
      { name: 'Subdomain spoof', url: 'https://evil.catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Suffix spoof domain', url: 'https://catedig.itlalaguna.edu.mx.attacker.com/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Prefix spoof with hyphen', url: 'https://attacker-catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Typo/lookalike domain', url: 'https://catedig-itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'IPv4 Loopback (127.0.0.1)', url: 'https://127.0.0.1/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Cloud metadata IP (169.254.169.254)', url: 'https://169.254.169.254/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Localhost name', url: 'https://localhost/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'IPv6 Loopback ([::1])', url: 'https://[::1]/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'IPv4-mapped IPv6 ([::ffff:127.0.0.1])', url: 'https://[::ffff:127.0.0.1]/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Decimal IP SSRF', url: 'https://2130706433/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Arbitrary external host', url: 'https://google.com/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Cyrillic homograph spoof', url: 'https://c\u0430tedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
    ];

    for (const v of vectors) {
      test(`Reject ${v.name}: ${v.url}`, () => {
        const res = FileProxyQuerySchema.safeParse({ url: v.url });
        expect(res.success).toBe(false);
      });
    }
  });

  // ==========================================================================
  // Category 3: Port Manipulation (Must Reject)
  // ==========================================================================
  describe('Category 3: Port Manipulation', () => {
    const vectors = [
      { name: 'Port 80 (HTTP port on HTTPS)', url: 'https://catedig.itlalaguna.edu.mx:80/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Port 8080 (Alternate web proxy)', url: 'https://catedig.itlalaguna.edu.mx:8080/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Port 8443 (Alternate TLS)', url: 'https://catedig.itlalaguna.edu.mx:8443/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Port 22 (SSH)', url: 'https://catedig.itlalaguna.edu.mx:22/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Port 3000 (Internal dev port)', url: 'https://catedig.itlalaguna.edu.mx:3000/webservice/pluginfile.php/123/doc.pdf' },
    ];

    for (const v of vectors) {
      test(`Reject ${v.name}: ${v.url}`, () => {
        const res = FileProxyQuerySchema.safeParse({ url: v.url });
        expect(res.success).toBe(false);
      });
    }
  });

  // ==========================================================================
  // Category 4: Embedded Credentials / Userinfo (Must Reject)
  // ==========================================================================
  describe('Category 4: Embedded Credentials / Userinfo', () => {
    const vectors = [
      { name: 'User & Password', url: 'https://user:pass@catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Username only', url: 'https://admin@catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Password only', url: 'https://:secret@catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'Token in userinfo', url: 'https://token:x@catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
      { name: 'URL-encoded userinfo', url: 'https://admin%40catedig:pass@catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf' },
    ];

    for (const v of vectors) {
      test(`Reject ${v.name}: ${v.url}`, () => {
        const res = FileProxyQuerySchema.safeParse({ url: v.url });
        expect(res.success).toBe(false);
      });
    }
  });

  // ==========================================================================
  // Category 5: Path Prefix Bypasses (Must Reject)
  // ==========================================================================
  describe('Category 5: Path Prefix Bypasses', () => {
    const vectors = [
      { name: 'Underscore suffix on script', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php_evil/123/doc.pdf' },
      { name: 'Backup file extension .bak', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php.bak/123/doc.pdf' },
      { name: 'Alternate extension .phpx', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.phpx' },
      { name: 'Missing slash delimiter', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.phpfoo/bar' },
      { name: 'Admin panel path', url: 'https://catedig.itlalaguna.edu.mx/admin/index.php' },
      { name: 'Root path', url: 'https://catedig.itlalaguna.edu.mx/' },
      { name: 'Other webservice endpoint', url: 'https://catedig.itlalaguna.edu.mx/webservice/rest/server.php' },
      { name: 'Login endpoint', url: 'https://catedig.itlalaguna.edu.mx/login/index.php' },
      { name: 'Backslash path bypass', url: 'https://catedig.itlalaguna.edu.mx\\evil.com/webservice/pluginfile.php' },
    ];

    for (const v of vectors) {
      test(`Reject ${v.name}: ${v.url}`, () => {
        const res = FileProxyQuerySchema.safeParse({ url: v.url });
        expect(res.success).toBe(false);
      });
    }
  });

  // ==========================================================================
  // Category 6: Directory Traversal / Dot-Dot Attacks (Must Reject)
  // ==========================================================================
  describe('Category 6: Directory Traversal / Dot-Dot Attacks', () => {
    const vectors = [
      { name: 'Raw traversal to /etc/passwd', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/../../etc/passwd' },
      { name: 'Raw traversal to config.php', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/../../../config.php' },
      { name: 'URL-encoded %2e%2e traversal', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/%2e%2e/%2e%2e/config.php' },
      { name: 'Mixed dot dot %2e.', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/%2e./config.php' },
      { name: 'Mixed dot dot .%2e', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/.%2e/config.php' },
      { name: 'Trailing dot dot', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/..' },
      { name: 'Percent-encoded slash traversal ..%2f', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/..%2f..%2f..%2fadmin' },
      { name: 'Inline traversal segment', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/sub/..' },
      { name: 'Query param traversal file=/../../', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php?file=/../../../../etc/passwd' },
      { name: 'Query param traversal preview=../../', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?preview=../../etc/shadow' },
    ];

    for (const v of vectors) {
      test(`Reject ${v.name}: ${v.url}`, () => {
        const res = FileProxyQuerySchema.safeParse({ url: v.url });
        expect(res.success).toBe(false);
      });
    }
  });

  // ==========================================================================
  // Category 7: Control Characters, Null Bytes & Malformed Inputs (Must Reject)
  // ==========================================================================
  describe('Category 7: Control Characters, Null Bytes & Malformed Inputs', () => {
    const vectors = [
      { name: 'Raw null byte in path', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123\x00/doc.pdf' },
      { name: 'Encoded null byte %00 in path', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123%00/doc.pdf' },
      { name: 'Encoded null byte %00 in query', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?file=%00evil' },
      { name: 'CRLF injection (raw)', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123\r\nSet-Cookie:evil=1' },
      { name: 'CRLF injection in query (encoded %0d%0a)', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?x=%0d%0aSet-Cookie:evil=1' },
      { name: 'ASCII control char 0x1F', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123\x1f/doc.pdf' },
      { name: 'ASCII DEL char 0x7F', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123\x7f/doc.pdf' },
      { name: 'Empty string', url: '' },
      { name: 'Not a URL string', url: 'not-a-valid-url' },
    ];

    for (const v of vectors) {
      test(`Reject ${v.name}: ${JSON.stringify(v.url)}`, () => {
        const res = FileProxyQuerySchema.safeParse({ url: v.url });
        expect(res.success).toBe(false);
      });
    }

    test('Reject non-string types (null, undefined, number, object)', () => {
      expect(FileProxyQuerySchema.safeParse({ url: null }).success).toBe(false);
      expect(FileProxyQuerySchema.safeParse({ url: undefined }).success).toBe(false);
      expect(FileProxyQuerySchema.safeParse({ url: 12345 }).success).toBe(false);
      expect(FileProxyQuerySchema.safeParse({ url: {} }).success).toBe(false);
      expect(FileProxyQuerySchema.safeParse({}).success).toBe(false);
    });
  });

  // ==========================================================================
  // Category 8: Legitimate Moodle Pluginfile URLs (Must Accept)
  // ==========================================================================
  describe('Category 8: Legitimate Moodle Pluginfile URLs', () => {
    const validUrls = [
      { name: 'Exact base path without slash', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php' },
      { name: 'Exact base path with trailing slash', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/' },
      { name: 'Assignment intro PDF', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_assign/intro/doc.pdf' },
      { name: 'Course resource PDF', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/456/mod_resource/content/1/Lecture_Notes.pdf' },
      { name: 'Forum attachment image', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/789/mod_forum/post/42/image.png' },
      { name: 'Explicit port 443', url: 'https://catedig.itlalaguna.edu.mx:443/webservice/pluginfile.php/123/mod_assign/intro/doc.pdf' },
      { name: 'Uppercase host (case insensitivity)', url: 'https://CATEDIG.ITLALAGUNA.EDU.MX/webservice/pluginfile.php/123/mod_assign/intro/doc.pdf' },
      { name: 'Filename with URL-encoded space', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_folder/content/0/file%20with%20spaces.docx' },
      { name: 'With legitimate query parameter', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/999/mod_assign/intro/test.pdf?forcedownload=1' },
      { name: 'User avatar icon file', url: 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/555/user/icon/f1' },
    ];

    for (const v of validUrls) {
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
