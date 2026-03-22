import { extractDescription } from '../utils/description-extractor';

/**
 * Test script for description-extractor.ts
 * Run: npx ts-node src/scripts/test-description-extractor.ts
 */

let passed = 0;
let failed = 0;

function assert(testName: string, actual: string, expected: string): void {
  if (actual === expected) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    console.log(`  Expected: ${JSON.stringify(expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertHash(testName: string, hash: string, shouldBeEmpty: boolean): void {
  const ok = shouldBeEmpty ? hash === '' : hash.length === 64;
  if (ok) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${testName} (hash: "${hash}", shouldBeEmpty: ${shouldBeEmpty})`);
    failed++;
  }
}

console.log('\n========== Description Extractor Tests ==========\n');

// Test 1: Basic HTML structure from the task requirements
{
  const html = `
    Xe đẹp, máy ngon, gầm bệ chắc chắn.
    <br>
    Nội thất zin, sạch sẽ.
    <br>
    Liên hệ :<span data-phone="0912345678">0912 345 678</span>
  `;
  const { text, hash } = extractDescription(html);
  assert('Test 1 - Basic HTML', text,
    'Xe đẹp, máy ngon, gầm bệ chắc chắn.\n\nNội thất zin, sạch sẽ.\n\nLiên hệ :0912 345 678');
  assertHash('Test 1 - Hash generated', hash, false);
}

// Test 2: Complex HTML with onclick, class, tracking attributes
{
  const html = `
    <div class="content-inner" onclick="trackClick()">
      <span class="highlight" style="color:red" data-track="abc">Xe mới về showroom!</span>
      <br>
      <a href="/contact" onclick="ga('send','event')">Liên hệ ngay</a>
      <br>
      Giá thương lượng.
    </div>
  `;
  const { text } = extractDescription(html);
  // Should NOT contain any HTML tags, onclick, class, etc.
  assert('Test 2 - Attributes stripped', text,
    'Xe mới về showroom!\n\nLiên hệ ngay\n\nGiá thương lượng.');
  // Verify no HTML remnants
  const hasHtml = text.includes('<') || text.includes('>');
  assert('Test 2 - No HTML tags', String(hasHtml), 'false');
}

// Test 3: Phone numbers preserved
{
  const html = `
    Chính chủ bán gấp.<br>
    <span data-phone="0987654321" class="phone">0987.654.321</span><br>
    <span data-phone="0123456789">0123 456 789</span>
  `;
  const { text } = extractDescription(html);
  const hasPhone1 = text.includes('0987.654.321');
  const hasPhone2 = text.includes('0123 456 789');
  assert('Test 3 - Phone 1 preserved', String(hasPhone1), 'true');
  assert('Test 3 - Phone 2 preserved', String(hasPhone2), 'true');
}

// Test 4: Duplicate hash detection
{
  const html1 = 'Xe đẹp, máy ngon.<br>Giá tốt.';
  const html2 = 'Xe đẹp, máy ngon.<br>Giá tốt.';
  const r1 = extractDescription(html1);
  const r2 = extractDescription(html2);
  assert('Test 4 - Same hash for same content', r1.hash, r2.hash);
}

// Test 5: Different content → different hash
{
  const r1 = extractDescription('Xe mới 100%');
  const r2 = extractDescription('Xe cũ đã qua sử dụng');
  const same = r1.hash === r2.hash;
  assert('Test 5 - Different hash for different content', String(same), 'false');
}

// Test 6: Empty input
{
  const { text, hash } = extractDescription('');
  assert('Test 6 - Empty input text', text, '');
  assertHash('Test 6 - Empty input hash', hash, true);
}

// Test 7: Whitespace-only input
{
  const { text, hash } = extractDescription('   \n\n  ');
  assert('Test 7 - Whitespace input text', text, '');
  assertHash('Test 7 - Whitespace input hash', hash, true);
}

// Test 8: Script and style tags removed
{
  const html = `
    Mô tả xe.
    <script>alert('xss')</script>
    <style>.red{color:red}</style>
    <br>
    Nội dung tiếp theo.
  `;
  const { text } = extractDescription(html);
  const hasScript = text.includes('alert') || text.includes('script');
  const hasStyle = text.includes('.red') || text.includes('style');
  assert('Test 8 - No script content', String(hasScript), 'false');
  assert('Test 8 - No style content', String(hasStyle), 'false');
  assert('Test 8 - Content preserved', String(text.includes('Mô tả xe.') && text.includes('Nội dung tiếp theo.')), 'true');
}

// Test 9: Duplicate blank lines collapsed
{
  const html = 'Line 1<br><br><br><br>Line 2<br><br>Line 3';
  const { text } = extractDescription(html);
  assert('Test 9 - Collapsed blank lines', text, 'Line 1\n\nLine 2\n\nLine 3');
}

// Test 10: HTML entities decoded
{
  const html = 'Giá &lt; 500 triệu &amp; xe đẹp';
  const { text } = extractDescription(html);
  assert('Test 10 - Entities decoded', text, 'Giá < 500 triệu & xe đẹp');
}

console.log(`\n========== Results: ${passed} passed, ${failed} failed ==========\n`);

if (failed > 0) {
  process.exit(1);
}
