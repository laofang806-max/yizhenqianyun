// Provider contracts are tested with local HTTP requests and mocked upstreams.
// No paid image API or hardware is contacted.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { modelImageApi } from './modelImageApi';
type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
const originalFetch = globalThis.fetch;
afterEach(() => vi.unstubAllGlobals());

async function serve(env: Record<string, string>, check: (base: string) => Promise<void>) {
  let middleware: Middleware;
  const plugin = modelImageApi(env);
  const hook = plugin.configureServer as (s: unknown) => void;
  hook({ middlewares: { use(value: Middleware) { middleware = value; } } });
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await check(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/h1sAAAAASUVORK5CYII=';
const env = { QWEN_API_KEY:'test', WENXIN_API_KEY:'test', ZHIPU_API_KEY:'test', DOUBAO_API_KEY:'test', DOUBAO_MODEL:'test-image', DEEPSEEK_API_KEY:'test' };

describe('model image gateway', () => {
  it('uses the Air-Image contract and keeps its complete prompt within 1000 characters', async () => {
    const upstream=vi.fn(async (url:string|URL,options?:RequestInit)=>{
      expect(String(url)).toBe('https://qianfan.baidubce.com/v2/musesteamer/images/generations');
      const body=JSON.parse(String(options?.body));
      expect(body).toMatchObject({model:'musesteamer-air-image',size:'1024x1024',response_format:'url',prompt_extend:false});
      expect(body.prompt.length).toBeLessThanOrEqual(1000);
      expect(body.prompt).toContain('不要复杂渐变');
      expect(body).not.toHaveProperty('watermark');expect(body).not.toHaveProperty('n');
      return new Response(JSON.stringify({data:[{b64_json:png}]}));
    });
    vi.stubGlobal('fetch',upstream);
    await serve({...env,WENXIN_MODEL:'musesteamer-air-image',WENXIN_IMAGE_URL:'https://qianfan.baidubce.com/v2/musesteamer/images/generations'},async base=>{
      const response=await originalFetch(`${base}/api/models/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'wenxin',prompt:'花'.repeat(1000)})});
      expect(response.status).toBe(200);
    });
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('uses the official ERNIE-Image-Turbo endpoint and safely fetches signed BOS output', async () => {
    const calls: {url:string; options?:RequestInit}[]=[];
    vi.stubGlobal('fetch', vi.fn(async (url:string|URL, options?:RequestInit) => {
      calls.push({url:String(url),options});
      if(String(url)==='https://qianfan.baidubce.com/v2/ernie-image/images/generations') {
        expect(JSON.parse(String(options?.body))).toMatchObject({model:'ernie-image-turbo',size:'1024x1024',watermark:false});
        expect(JSON.parse(String(options?.body))).not.toHaveProperty('n');
        return new Response(JSON.stringify({data:[{url:'http://qianfan-modelbuilder-img-gen.bj.bcebos.com/ernie-image-turbo/test.jpeg?authorization=test-signature'}]}));
      }
      expect(String(url)).toBe('https://qianfan-modelbuilder-img-gen.bj.bcebos.com/ernie-image-turbo/test.jpeg?authorization=test-signature');
      expect(options?.headers).toBeUndefined();
      return new Response(Buffer.from(png,'base64'),{headers:{'Content-Type':'image/jpeg'}});
    }));
    await serve(env,async base=>{
      const response=await originalFetch(`${base}/api/models/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'wenxin',prompt:'白底花朵线稿'})});
      expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('image/jpeg');
    });
    expect(calls).toHaveLength(2);
  });
  it('reports invalid Wenxin credentials and model permission failures without echoing upstream secrets', async () => {
    for(const code of [401,403]) {
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:{message:'private upstream details'}}),{status:code})));
      await serve(env,async base=>{
        const response=await originalFetch(`${base}/api/models/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'wenxin',prompt:'花朵'})});
        expect(response.status).toBe(502);
        const payload=await response.json();expect(payload.error).toContain(code===401?'API Key':'图像模型权限');expect(payload.error).not.toContain('private');
      });
    }
  });
  it('supports each provider contract and DeepSeek prompt-to-image chain', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, options?: RequestInit) => {
      const address=String(url); const body=JSON.parse(String(options?.body ?? '{}'));
      calls.push({ url:address, body });
      if(address.includes('deepseek.com')) return new Response(JSON.stringify({ choices:[{ message:{ content:'优化后的刺绣花朵' } }] }));
      if(address.includes('dashscope')) return new Response(JSON.stringify({ output:{ choices:[{ message:{ content:[{ image:'https://example.aliyuncs.com/test.png' }] } }] } }));
      if(address==='https://example.aliyuncs.com/test.png') return new Response(Buffer.from(png,'base64'),{ headers:{'Content-Type':'image/png'} });
      return new Response(JSON.stringify({ data:[{ b64_json:png }] }));
    }));
    await serve(env, async base => {
      for(const provider of ['qwen','wenxin','zhipu','doubao','deepseek']) {
        const response=await originalFetch(`${base}/api/models/generate`,{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ provider,prompt:'花朵' }) });
        expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('image/png');
        expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
      }
    });
    expect(calls.some(c => c.url.includes('dashscope') && 'input' in c.body)).toBe(true);
    expect(calls.filter(c => c.url.includes('volces.com')).at(-1)?.body.prompt).toContain('优化后的刺绣花朵');
  });
  it('rejects unavailable providers and invalid prompts before upstream calls', async () => {
    const upstream=vi.fn(); vi.stubGlobal('fetch',upstream);
    await serve({},async base => {
      for(const [body,status] of [[{provider:'qwen',prompt:'花'},503],[{provider:'bad',prompt:'花'},400],[{provider:'doubao',prompt:' '},400]] as const) {
        expect((await originalFetch(`${base}/api/models/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status).toBe(status);
      }
    });
    expect(upstream).not.toHaveBeenCalled();
  });
  it('does not fetch unsafe image URLs returned by upstream', async () => {
    const upstream=vi.fn(async()=>new Response(JSON.stringify({data:[{url:'http://127.0.0.1:8765/status'}]})));
    vi.stubGlobal('fetch',upstream);
    await serve(env,async base => {
      const response=await originalFetch(`${base}/api/models/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'zhipu',prompt:'花'})});
      expect(response.status).toBe(502);
    });
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
