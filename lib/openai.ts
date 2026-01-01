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

  try {
    console.log('[Sentiment Analysis] Analyzing comment:', text.substring(0, 50) + '...');
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

    console.log('[Sentiment Analysis] Full completion object:', JSON.stringify(completion, null, 2));
    console.log('[Sentiment Analysis] Choices:', completion.choices);
    console.log('[Sentiment Analysis] First choice:', completion.choices[0]);

    const response = completion.choices[0]?.message?.content
      ?.trim()
      .toLowerCase();

    console.log('[Sentiment Analysis] Raw response:', response);
    console.log('[Sentiment Analysis] Response type:', typeof response);
    console.log('[Sentiment Analysis] Response length:', response?.length);

    if (!response) {
      console.warn('[Sentiment Analysis] Empty sentiment response from OpenAI');
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
      console.log('[Sentiment Analysis] Success! Sentiment:', sentiment);
      return sentiment;
    }

    console.warn(`[Sentiment Analysis] Unexpected sentiment response: ${response}`);
    return null;
  } catch (error: any) {
    // Log error but don't throw - we don't want sentiment analysis to block comment fetching
    if (error?.status === 429) {
      console.warn('OpenAI API rate limit exceeded. Skipping sentiment analysis.');
    } else if (error?.status === 401) {
      console.error('OpenAI API authentication failed. Check your API key.');
    } else if (error?.status === 404) {
      console.error('OpenAI API model not found. Check if the model name is correct:', error?.message || error);
    } else if (error?.status === 500 || error?.status === 503) {
      console.warn('OpenAI API server error. Skipping sentiment analysis.');
    } else {
      console.error('Error analyzing comment sentiment:', error?.message || error);
      // Log full error details for debugging
      if (error?.response) {
        console.error('OpenAI API error details:', JSON.stringify(error.response, null, 2));
      }
    }
    return null;
  }
}


