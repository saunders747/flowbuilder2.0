import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';

function normaliseDataFile(fileUrl, index) {
  if (typeof fileUrl !== 'string' || !fileUrl.startsWith('data:')) return null;
  const mime = fileUrl.slice(5, fileUrl.indexOf(';')) || 'application/octet-stream';
  const extension = mime.includes('pdf') ? 'pdf' : mime.includes('csv') ? 'csv' : 'txt';
  return {
    type: 'input_file',
    filename: `uploaded-${index + 1}.${extension}`,
    file_data: fileUrl,
  };
}

function parseJsonOutput(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Model did not return valid JSON');
    return JSON.parse(match[0]);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the host' });
  }

  try {
    const { prompt, mode = 'text', response_json_schema, file_urls = [] } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    const content = [{ type: 'input_text', text: prompt }];
    file_urls.map(normaliseDataFile).filter(Boolean).forEach(file => content.push(file));

    const request = {
      model: MODEL,
      input: [{ role: 'user', content }],
    };

    if (mode === 'json' && response_json_schema) {
      request.text = {
        format: {
          type: 'json_schema',
          name: 'structured_response',
          schema: response_json_schema,
          strict: false,
        },
      };
    }

    const response = await client.responses.create(request);
    const text = response.output_text || '';
    if (mode === 'json') return res.status(200).json({ json: parseJsonOutput(text), text });
    return res.status(200).json({ text });
  } catch (error) {
    const message = error?.message || 'OpenAI request failed';
    return res.status(500).json({ error: message });
  }
}

