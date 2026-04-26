export default {
  async fetch(_req: Request): Promise<Response> {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'content-type': 'application/json' },
    });
  },
};
