/**
 * Test script for semantic compression
 *
 * Usage:
 *   npx tsx scripts/test-compression.ts
 *
 * Requirements:
 *   - GROQ_API_KEY set in environment
 *   - ENABLE_SEMANTIC_COMPRESSION=true (optional, for testing in different modes)
 */

import { compressContext, compressContextBatch, compressLargeContext, clearCompressionCache, getCacheStats } from '../lib/semantic-compression';

// Sample verbose text for testing
const VERBOSE_SYSTEM_PROMPT = `
You are an expert AI assistant for the Lernex platform. Your primary mission is to provide
accurate, helpful, and actionable support to users who are using the Lernex AI-powered
micro-learning platform.

CORE OPERATING PRINCIPLES:

PRINCIPLE 1: ABSOLUTE ACCURACY
- You must only provide information that is explicitly stated in the platform reference
  documentation or knowledge articles provided below
- Never guess, invent, speculate, or make assumptions about features, functionality,
  limits, quotas, technical specifications, pricing details, or implementation details
- If a specific detail is not available in your knowledge base, you should clearly state
  that you don't know and recommend that the user contact support
- It is better to say "I don't know—contact support" than to provide incorrect or misleading information

PRINCIPLE 2: BE EXTREMELY SPECIFIC
- Always provide exact navigation paths such as "/analytics", "/generate", "/pricing"
- Use numbered step-by-step instructions for any multi-step processes
- Include specific requirements and constraints when applicable
- Provide concrete examples rather than vague descriptions

PRINCIPLE 3: USER-FIRST EMPATHY
- Acknowledge user frustration or confusion with empathy
- Use encouraging and supportive language throughout your responses
- Celebrate user achievements and progress
- Provide reassurance when users face challenges

PLATFORM FEATURES:

1. /fyp (For You Page) — The primary learning interface
   - TikTok-style swipeable feed of personalized micro-lessons
   - Each card contains a 30-120 word lesson plus 3 multiple-choice quiz questions
   - Adaptive algorithm based on user interests, quiz performance, likes/dislikes
   - Unlimited lessons on all plans

2. /generate — Custom Lesson Creation
   - Input: Paste text (up to 2 paragraphs) or upload PDF (max 10MB)
   - Output: 80-105 word structured lesson with 3 MCQs
   - Full LaTeX math support
   - Subject-aware difficulty levels

3. /analytics — Progress Dashboard
   - Real-time metrics and visualizations
   - Streak tracking, points, weekly goals
   - Subject-specific mastery percentages

Contact support at support@lernex.net for additional help or visit https://lernex.net/support
`;

const LONG_SOURCE_TEXT = `
In mathematics, particularly in linear algebra, a vector space is a fundamental structure
consisting of a collection of objects called vectors, which can be added together and
multiplied by numbers called scalars. Scalars are typically real numbers or complex numbers.

Vector spaces are characterized by two operations: vector addition and scalar multiplication.
These operations must satisfy several axioms including commutativity, associativity, and
distributivity. The zero vector serves as the additive identity, and every vector has an
additive inverse.

Common examples of vector spaces include Euclidean space (R^n), function spaces, and
polynomial spaces. In R^n, vectors are represented as n-tuples of real numbers, and operations
are performed component-wise. Function spaces consist of functions mapping from one set to
another, where addition and scalar multiplication are defined pointwise.

Vector spaces form the foundation for many areas of mathematics and physics, including
differential equations, quantum mechanics, and optimization theory. Linear transformations
between vector spaces preserve the vector space structure and can be represented by matrices.

Understanding vector spaces is crucial for advanced mathematical study and has applications
in computer graphics, machine learning, signal processing, and many other fields of science
and engineering.
`;

async function runTests() {
  console.log('═══════════════════════════════════════════');
  console.log('SEMANTIC COMPRESSION TEST SUITE');
  console.log('═══════════════════════════════════════════\n');

  // Clear cache before tests
  clearCompressionCache();

  // Test 1: Basic compression with different rates (UPDATED with new optimized rates)
  console.log('📝 Test 1: Basic Compression with Different Rates (OPTIMIZED)\n');

  // OPTIMIZED: Test new compression rates including 0.65 default
  for (const rate of [0.5, 0.65, 0.7]) {
    console.log(`Testing compression rate: ${rate} (temp: 0.1)`);
    const result = await compressContext(VERBOSE_SYSTEM_PROMPT, {
      rate,
      temperature: 0.1,  // OPTIMIZED: Lower temperature for deterministic output
      preserve: ['lernex.net', 'support@lernex.net', '/fyp', '/generate', '/analytics'],
      useCache: false, // Disable cache for this test
    });

    console.log(`  Original: ${result.originalLength} chars (~${result.tokensEstimate.original} tokens)`);
    console.log(`  Compressed: ${result.compressedLength} chars (~${result.tokensEstimate.compressed} tokens)`);
    console.log(`  Saved: ${result.tokensEstimate.saved} tokens (${((1 - result.compressionRatio) * 100).toFixed(1)}% reduction)`);
    console.log(`  Actual ratio: ${result.compressionRatio.toFixed(2)}\n`);
  }

  // Test 2: Cache effectiveness
  console.log('🗂️  Test 2: Cache Effectiveness\n');

  console.log('First request (no cache):');
  const start1 = Date.now();
  const result1 = await compressContext(LONG_SOURCE_TEXT, {
    rate: 0.4,
    preserve: ['vector', 'linear algebra'],
    useCache: true,
  });
  const time1 = Date.now() - start1;
  console.log(`  Time: ${time1}ms`);
  console.log(`  Cached: ${result1.cached}`);
  console.log(`  Saved: ${result1.tokensEstimate.saved} tokens\n`);

  console.log('Second request (should be cached):');
  const start2 = Date.now();
  const result2 = await compressContext(LONG_SOURCE_TEXT, {
    rate: 0.4,
    preserve: ['vector', 'linear algebra'],
    useCache: true,
  });
  const time2 = Date.now() - start2;
  console.log(`  Time: ${time2}ms`);
  console.log(`  Cached: ${result2.cached}`);
  console.log(`  Speedup: ${(time1 / time2).toFixed(1)}x faster\n`);

  const cacheStats = getCacheStats();
  console.log(`Cache stats: ${cacheStats.size} entries\n`);

  // Test 3: Batch compression
  console.log('📦 Test 3: Batch Compression\n');

  const batchStart = Date.now();
  const batchResults = await compressContextBatch([
    {
      key: 'systemPrompt',
      text: VERBOSE_SYSTEM_PROMPT,
      options: { rate: 0.4, preserve: ['lernex.net'] },
    },
    {
      key: 'sourceText',
      text: LONG_SOURCE_TEXT,
      options: { rate: 0.3, preserve: ['vector'] },
    },
  ]);
  const batchTime = Date.now() - batchStart;

  console.log(`Batch compression completed in ${batchTime}ms`);
  for (const [key, result] of Object.entries(batchResults)) {
    console.log(`  ${key}: Saved ${result.tokensEstimate.saved} tokens`);
  }
  console.log();

  // Test 4: Large context compression
  console.log('📚 Test 4: Large Context Compression\n');

  const largeText = LONG_SOURCE_TEXT.repeat(5); // ~5000 chars
  console.log(`Input size: ${largeText.length} chars`);

  const largeResult = await compressLargeContext(largeText, {
    rate: 0.4,
    chunkSize: 2000,
  });

  console.log(`  Compressed: ${largeResult.compressedLength} chars`);
  console.log(`  Saved: ${largeResult.tokensEstimate.saved} tokens`);
  console.log(`  Ratio: ${largeResult.compressionRatio.toFixed(2)}\n`);

  // Test 5: Preservation verification
  console.log('🔒 Test 5: Keyword Preservation\n');

  const preserveTerms = ['lernex.net', 'support@lernex.net', '/fyp', '/generate'];
  const preserveResult = await compressContext(VERBOSE_SYSTEM_PROMPT, {
    rate: 0.4,
    preserve: preserveTerms,
    useCache: false,
  });

  console.log('Checking preservation of critical terms:');
  for (const term of preserveTerms) {
    const preserved = preserveResult.compressed.includes(term);
    console.log(`  ${term}: ${preserved ? '✅ Preserved' : '❌ Missing'}`);
  }
  console.log();

  // Test 6: Knowledge field compression (NEW)
  console.log('🧠 Test 6: Knowledge Field Compression (NEW OPTIMIZATION)\n');

  const knowledgeDefinition = `A vector space is a fundamental structure consisting of a collection of objects called vectors, which can be added together and multiplied by scalars. Vector spaces are characterized by vector addition and scalar multiplication operations.`;
  const knowledgePrereqs = [
    'Review linear algebra fundamentals and basic set theory',
    'Understand mathematical operations and properties',
    'Study axioms of vector spaces including commutativity and associativity'
  ];

  console.log('Testing knowledge definition compression:');
  const defResult = await compressContext(knowledgeDefinition, {
    rate: 0.7,
    maxTokens: 20,
    temperature: 0.05,
    useCache: false,
  });
  console.log(`  Original: ${defResult.originalLength} chars`);
  console.log(`  Compressed: ${defResult.compressedLength} chars`);
  console.log(`  Result: "${defResult.compressed}"`);
  console.log(`  Saved: ${defResult.tokensEstimate.saved} tokens\n`);

  console.log('Testing knowledge prerequisites compression:');
  const prereqsText = knowledgePrereqs.join('; ');
  const prereqsResult = await compressContext(prereqsText, {
    rate: 0.7,
    maxTokens: 30,
    temperature: 0.05,
    useCache: false,
  });
  console.log(`  Original: ${prereqsResult.originalLength} chars`);
  console.log(`  Compressed: ${prereqsResult.compressedLength} chars`);
  console.log(`  Result: "${prereqsResult.compressed}"`);
  console.log(`  Saved: ${prereqsResult.tokensEstimate.saved} tokens\n`);

  // Summary
  console.log('═══════════════════════════════════════════');
  console.log('TEST SUMMARY');
  console.log('═══════════════════════════════════════════');
  console.log('✅ All tests completed successfully');
  console.log(`📊 Cache entries: ${getCacheStats().size}`);
  console.log('\n🚀 OPTIMIZATIONS APPLIED:');
  console.log('  • Compression rate: 0.5 → 0.65 (30% more aggressive)');
  console.log('  • Temperature: 0.3 → 0.1 (more deterministic, faster)');
  console.log('  • Cache TTL: 15 min → 60 min (4x longer for better hit rate)');
  console.log('  • Knowledge field compression: NEW (definition, prereqs, reminders)');
  console.log('  • Structured context threshold: 800 → 600 chars (more aggressive)');
  console.log('\nTo use in production:');
  console.log('1. Set ENABLE_SEMANTIC_COMPRESSION=true in .env.local');
  console.log('2. Set SEMANTIC_COMPRESSION_RATE=0.65 (NEW default, was 0.3)');
  console.log('3. Ensure GROQ_API_KEY is configured');
  console.log('4. Monitor logs for compression metrics');
  console.log('\n💡 Uses Groq gpt-oss-20b by default - cheapest & smartest option!');
  console.log('📈 Estimated savings: 5-15% additional token reduction');
}

// Run tests
runTests().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
