/** The Web Host authenticates this route; POSTs also require same-origin JSON. */
export function createTestHandler(run) {
  return async (request, response) => {
    let result;
    try {
      if (request.method !== 'POST') throw new Error('只支持 POST 测试请求。');
      const origin = request.headers.origin;
      if (!origin || new URL(origin).host !== request.headers.host
        || !request.headers['content-type']?.startsWith('application/json')) throw new Error('需要同源 JSON 请求。');
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 48000) throw new Error('测试请求过大。');
      }
      const input = JSON.parse(body);
      result = { ok: true, value: await run(input, request.signal) };
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(result));
  };
}
