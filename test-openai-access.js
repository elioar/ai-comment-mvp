#!/usr/bin/env node

/**
 * Test script to verify OpenAI API access to GPT-5 models
 * Run with: node test-openai-access.js
 */

require('dotenv').config();
const OpenAI = require('openai');

async function testOpenAIAccess() {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY not found in environment variables');
    console.log('\n💡 Make sure your .env file contains:');
    console.log('   OPENAI_API_KEY="your-api-key-here"');
    process.exit(1);
  }

  console.log('🔑 API Key found:', apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4));
  console.log('');

  const openai = new OpenAI({
    apiKey: apiKey,
  });

  // Test models to try
  const modelsToTest = [
    'gpt-5-mini',
    'gpt-5',
    'gpt-4o-mini', // Fallback option
  ];

  for (const model of modelsToTest) {
    console.log(`🧪 Testing model: ${model}...`);
    
    try {
      // GPT-5 models use max_completion_tokens instead of max_tokens
      const isGPT5 = model.startsWith('gpt-5');
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'user',
            content: 'Say "test"',
          },
        ],
        ...(isGPT5 ? { max_completion_tokens: 5 } : { max_tokens: 5 }),
      });

      const response = completion.choices[0]?.message?.content;
      console.log(`✅ ${model} - SUCCESS! Response: "${response}"`);
      console.log(`   ✅ Your API key has access to ${model}`);
      console.log('');
      
      // If we successfully tested gpt-5-mini, we're done
      if (model === 'gpt-5-mini') {
        console.log('🎉 GPT-5 Mini access confirmed! Your API key works with GPT-5.');
        break;
      }
    } catch (error) {
      if (error.status === 404) {
        console.log(`❌ ${model} - Model not found or not available`);
        console.log(`   Error: ${error.message}`);
      } else if (error.status === 401) {
        console.log(`❌ ${model} - Authentication failed`);
        console.log(`   Your API key may be invalid or expired`);
        console.log(`   Error: ${error.message}`);
        break; // Don't continue if auth fails
      } else if (error.status === 403) {
        console.log(`❌ ${model} - Access denied`);
        console.log(`   Your API key may not have access to this model`);
        console.log(`   Error: ${error.message}`);
      } else {
        console.log(`❌ ${model} - Error: ${error.message}`);
      }
      console.log('');
    }
  }

  console.log('\n📋 Summary:');
  console.log('   - Check the results above to see which models you have access to');
  console.log('   - If GPT-5 models show errors, you may need to:');
  console.log('     1. Upgrade your OpenAI account');
  console.log('     2. Request access to GPT-5 models');
  console.log('     3. Check your API key permissions at: https://platform.openai.com/api-keys');
  console.log('     4. Verify your account has GPT-5 access at: https://platform.openai.com/account/usage');
}

testOpenAIAccess().catch(console.error);

