import OpenAI from 'openai';

// Lazy initialization of OpenAI client to avoid errors during build
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

/**
 * Analyzes the sentiment of a comment using OpenAI's ChatGPT API
 * @param text - The comment text to analyze
 * @returns "positive", "neutral", "negative", or null if analysis fails
 */
export async function analyzeCommentSentiment(
  text: string
): Promise<'positive' | 'neutral' | 'negative' | null> {
  // Skip if no API key is configured
  const client = getOpenAIClient();
  if (!client) {
    console.warn('OpenAI API key not configured. Skipping sentiment analysis.');
    return null;
  }

  // Skip empty or very short messages
  if (!text || text.trim().length < 2) {
    return null;
  }

  const cleanText = text.trim().toLowerCase();

  // Smart pre-filtering: Handle common cases without AI
  // This saves API costs by using simple rules for obvious cases

  // 1. Check if comment is emoji-only (no letters/numbers)
  const hasOnlyEmojis = /^[\p{Emoji}\s]+$/u.test(text.trim()) && !/[a-zA-Z0-9]/.test(text);
  if (hasOnlyEmojis) {
    // Classify emojis by sentiment
    const positiveEmojis = ['😊', '😄', '😃', '😁', '🥰', '😍', '❤️', '💕', '👍', '🙌', '🎉', '✨', '⭐', '💯', '🔥', '😎', '🤗', '💪', '👏', '🥳'];
    const negativeEmojis = ['😢', '😭', '😞', '😔', '😩', '😠', '😡', '💔', '👎', '😤', '🤬', '😰', '😨', '😱', '🤮', '💩'];
    
    const hasPositive = positiveEmojis.some(emoji => text.includes(emoji));
    const hasNegative = negativeEmojis.some(emoji => text.includes(emoji));
    
    if (hasPositive && !hasNegative) {
      console.log('[Sentiment Analysis] Emoji-only comment detected: positive');
      return 'positive';
    }
    if (hasNegative && !hasPositive) {
      console.log('[Sentiment Analysis] Emoji-only comment detected: negative');
      return 'negative';
    }
    // Mixed or neutral emojis
    console.log('[Sentiment Analysis] Emoji-only comment detected: neutral');
    return 'neutral';
  }

  // 2. Very short positive responses (English & Greek)
  const shortPositive = [
    'ok', 'okay', 'thanks', 'thank you', 'good', 'great', 'nice', 'cool', 'yes', 'yep', 'yeah', 
    'perfect', 'awesome', 'love', 'loved it', 'amazing', 'excellent', 'fantastic', 'wow',
    'ευχαριστώ', 'ευχαριστω', 'efharisto', 'efxaristo', 'kala', 'καλα', 'καλά', 'ωραια', 'ωραία', 
    'wraia', 'οκ', 'ναι', 'nai', 'τέλειο', 'τελειο', 'teleio', 'bravo', 'μπράβο', 'μπραβο'
  ];
  if (cleanText.length <= 15 && shortPositive.some(word => cleanText === word || cleanText === word + '!' || cleanText === word + '!!')) {
    console.log('[Sentiment Analysis] Short positive response detected:', cleanText);
    return 'positive';
  }

  // 3. Very short negative responses (English & Greek)
  const shortNegative = [
    'no', 'nope', 'bad', 'terrible', 'awful', 'hate', 'worst', 'disappointed', 'horrible',
    'όχι', 'oxi', 'οχι', 'κακό', 'κακο', 'kako', 'άσχημο', 'ασχημο', 'asxhmo'
  ];
  if (cleanText.length <= 15 && shortNegative.some(word => cleanText === word || cleanText === word + '!' || cleanText === word + '!!')) {
    console.log('[Sentiment Analysis] Short negative response detected:', cleanText);
    return 'negative';
  }

  // 4. Very short neutral responses
  const shortNeutral = [
    'ok', 'k', 'hmm', 'hm', 'eh', 'meh', 'maybe', 'idk', 'dunno', 'what', 'where', 'when', 
    'how', 'why', 'who', 'which'
  ];
  if (cleanText.length <= 8 && shortNeutral.includes(cleanText)) {
    console.log('[Sentiment Analysis] Short neutral response detected:', cleanText);
    return 'neutral';
  }

  // 5. Question-only comments (usually neutral unless clearly positive/negative)
  if (text.includes('?') && text.trim().split(/\s+/).length <= 8) {
    console.log('[Sentiment Analysis] Short question detected: neutral');
    return 'neutral';
  }

  // If none of the simple rules match, use AI for analysis
  const previewText = cleanText.substring(0, 50) + (cleanText.length > 50 ? '...' : '');
  console.log(`🤖 [AI] Using OpenAI API for: "${previewText}"`);
  const aiStart = Date.now();

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini', // Using GPT-4o-mini instead of GPT-5-mini due to reasoning token issues
      messages: [
        {
          role: 'system',
          content:
            'You are a sentiment analyzer. Classify the following comment as positive, neutral, or negative. IMPORTANT: If the comment appears to be written in Greeklish (Greek words using Latin/English letters), first interpret it as Greek before analyzing sentiment. Reply with ONLY one word: positive, neutral, or negative. Do not include any punctuation or additional text.',
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0, // Deterministic responses - GPT-4o-mini supports temperature 0
      max_tokens: 10, // GPT-4o-mini uses max_tokens (not max_completion_tokens)
    });

    const aiTime = Date.now() - aiStart;
    console.log(`⏱️  [AI] OpenAI API response received in ${aiTime}ms`);
    console.log(`📊 [AI] Tokens used: ${completion.usage?.total_tokens || 'N/A'}`);

    const response = completion.choices[0]?.message?.content
      ?.trim()
      .toLowerCase();

    console.log(`🔍 [AI] Raw response: "${response}"`);

    if (!response) {
      console.warn('⚠️  [AI] Empty sentiment response from OpenAI');
      return null;
    }

    // Extract sentiment word more flexibly - handle cases where model adds punctuation or extra text
    // Look for the sentiment words in the response
    const sentimentMatch = response.match(/\b(positive|neutral|negative)\b/);
    const sentiment = sentimentMatch ? sentimentMatch[1] : null;

    // Validate the response
    if (
      sentiment === 'positive' ||
      sentiment === 'neutral' ||
      sentiment === 'negative'
    ) {
      console.log(`✅ [AI] Successfully classified as: ${sentiment}`);
      return sentiment;
    }

    console.warn(`⚠️  [AI] Unexpected sentiment response: ${response}`);
    return null;
  } catch (error: any) {
    const aiTime = Date.now() - aiStart;
    console.error(`❌ [AI] OpenAI API call failed after ${aiTime}ms`);
    
    // Log error but don't throw - we don't want sentiment analysis to block comment fetching
    if (error?.status === 429) {
      console.error('❌ [OpenAI] RATE LIMIT EXCEEDED - Too many requests. Sentiment analysis paused temporarily.');
      console.error('   → Solution: Wait a few minutes or upgrade your OpenAI plan for higher limits.');
    } else if (error?.status === 401) {
      console.error('❌ [OpenAI] AUTHENTICATION FAILED - Invalid or expired API key.');
      console.error('   → Solution: Check your OPENAI_API_KEY in .env file.');
    } else if (error?.status === 404) {
      console.error('❌ [OpenAI] MODEL NOT FOUND - The specified model is not available.');
      console.error(`   → Model: ${error?.message || 'gpt-4o-mini'}`);
      console.error('   → Solution: Check if model name is correct or if you have access to it.');
    } else if (error?.status === 500 || error?.status === 503) {
      console.error('❌ [OpenAI] SERVER ERROR - OpenAI service is temporarily unavailable.');
      console.error('   → This is an OpenAI issue, not your app. Try again in a few minutes.');
    } else if (error?.status === 400) {
      console.error('❌ [OpenAI] BAD REQUEST - Invalid parameters sent to API.');
      console.error(`   → Error: ${error?.message || 'Unknown'}`);
      if (error?.response) {
        console.error('   → Details:', JSON.stringify(error.response, null, 2));
      }
    } else if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
      console.error('❌ [OpenAI] NETWORK ERROR - Cannot reach OpenAI servers.');
      console.error('   → Check your internet connection.');
    } else {
      console.error('❌ [OpenAI] UNEXPECTED ERROR:', error?.message || error);
      console.error('   → This sentiment will be skipped. Comments will still be fetched.');
      // Log full error details for debugging
      if (error?.response) {
        console.error('   → API Response:', JSON.stringify(error.response, null, 2));
      }
    }
    return null;
  }
}


