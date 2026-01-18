const { OpenAI } = require('openai');

// Get API key from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;

// Debug logging (remove after fixing)
if (process.env.NODE_ENV === 'production') {
  console.log('[LLM Query] Environment check:');
  console.log('  - OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
  console.log('  - OPENAI_API_KEY length:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);
  console.log('  - OPENAI_API_KEY starts with sk-:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.startsWith('sk-') : false);
  // Log all env vars that contain 'OPEN' or 'AI' (for debugging)
  const relevantVars = Object.keys(process.env).filter(key => 
    key.includes('OPEN') || key.includes('AI') || key.includes('LLM')
  );
  console.log('  - Relevant env vars:', relevantVars);
}

// Initialize OpenAI client (will fail gracefully if no key)
const openai = OPENAI_API_KEY ? new OpenAI({
  apiKey: OPENAI_API_KEY
}) : null;

/**
 * Generate a list of items from a natural language query using LLM
 * POST /api/admin/llm-query
 * Body: { query: string, count?: number }
 */
const generateItemList = async (req, res) => {
  try {
    const { query, count = 100 } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ 
        error: 'Query is required',
        message: 'Please provide a natural language query'
      });
    }

    if (!openai || !OPENAI_API_KEY) {
      console.log('[LLM Query] API key check - OPENAI_API_KEY:', OPENAI_API_KEY ? 'SET (length: ' + OPENAI_API_KEY.length + ')' : 'NOT SET');
      return res.status(503).json({ 
        error: 'LLM service not available',
        message: 'OPENAI_API_KEY environment variable is not set or invalid'
      });
    }

    const trimmedQuery = query.trim();
    const itemCount = parseInt(count) || 100;

    console.log(`[LLM Query] Generating list for: "${trimmedQuery}" (count: ${itemCount})`);

    // Create a prompt that will return items in CSV format
    const systemPrompt = `You are a helpful assistant that generates lists of items in CSV format.
Given a user's request, you should return ONLY a CSV formatted list with a header row.
The CSV should have exactly two columns:
1. "Title" - The name of the item
2. "Category" (optional) - A category name if relevant

Do NOT include any explanation, markdown formatting, code blocks, or additional text.
Return ONLY the CSV data, one item per line.

Example output:
Title,Category
LeBron James,Sports
Michael Jordan,Sports
Tom Brady,Sports`;

    const userPrompt = `Generate a list of ${itemCount} items based on this query: "${trimmedQuery}"

Return the list as a CSV with "Title" and optionally "Category" columns.
Make sure each item is a real, notable person, place, thing, or concept that would have a Wikipedia page.`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using the cheaper, faster model
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4000 // Enough for ~100 items with CSV formatting
    });

    const responseText = completion.choices[0]?.message?.content || '';
    
    // Extract CSV from response (remove markdown code blocks if present)
    let csvData = responseText.trim();
    
    // Remove markdown code blocks if present
    csvData = csvData.replace(/^```csv\n?/i, '');
    csvData = csvData.replace(/^```\n?/i, '');
    csvData = csvData.replace(/\n?```$/i, '');
    csvData = csvData.trim();

    // Validate CSV format
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      return res.status(500).json({ 
        error: 'Invalid response format',
        message: 'The LLM did not return a valid CSV format. Please try again.',
        rawResponse: responseText
      });
    }

    // Ensure header row is present
    const headerLine = lines[0].trim();
    if (!headerLine.toLowerCase().includes('title')) {
      // Try to add header if missing
      csvData = 'Title,Category\n' + csvData;
    }

    console.log(`[LLM Query] Generated ${lines.length - 1} items`);

    res.json({
      success: true,
      query: trimmedQuery,
      count: lines.length - 1, // Excluding header
      csv: csvData,
      message: `Generated ${lines.length - 1} items for: "${trimmedQuery}"`
    });

  } catch (error) {
    console.error('[LLM Query] Error:', error);
    
    // Handle OpenAI API errors
    if (error.response) {
      return res.status(500).json({ 
        error: 'OpenAI API error',
        message: error.response.data?.error?.message || error.message,
        details: process.env.NODE_ENV === 'development' ? error.response.data : undefined
      });
    }

    res.status(500).json({ 
      error: 'Failed to generate item list',
      message: error.message
    });
  }
};

module.exports = {
  generateItemList
};

