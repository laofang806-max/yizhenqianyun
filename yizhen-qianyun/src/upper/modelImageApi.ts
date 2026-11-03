import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { jsonReply, readJson } from './localAuthApi';

type Provider = 'qwen' | 'wenxin' | 'deepseek' | 'zhipu' | 'doubao';
type Config = { id: Provider; label: string; key: string; model: string; url: string };
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown): string => typeof v === 'string' ? v : '';
export function modelImageApi(env: Record<string, string>): Plugin {
  const config: Config[] = [
    { id: 'qwen', label: '通义千问', key: env.QWEN_API_KEY || '', model: env.QWEN_MODEL || 'qwen-image-plus', url: env.QWEN_IMAGE_URL || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' },
    { id: 'wenxin', label: '文心一言', key: env.WENXIN_API_KEY || '', model: env.WENXIN_MODEL || 'ernie-image-turbo', url: env.WENXIN_IMAGE_URL || 'https://qianfan.baidubce.com/v2/ernie-image/images/generations' },
    { id: 'deepseek', label: 'DeepSeek', key: env.DEEPSEEK_API_KEY || '', model: env.DEEPSEEK_MODEL || 'deepseek-chat', url: 'https://api.deepseek.com/chat/completions' },
    { id: 'zhipu', label: '智谱清言', key: env.ZHIPU_API_KEY || '', model: env.ZHIPU_MODEL || 'cogview-4-250304', url: env.ZHIPU_IMAGE_URL || 'https://open.bigmodel.cn/api/paas/v4/images/generations' },
    { id: 'doubao', label: '豆包', key: env.DOUBAO_API_KEY || '', model: env.DOUBAO_MODEL || '', url: env.DOUBAO_IMAGE_URL || 'https://ark.cn-beijing.volces.com/api/v3/images/generations' },
  ];
  const renderer = config.find(c => c.id === (env.DEEPSEEK_IMAGE_PROVIDER || 'doubao') && c.id !== 'deepseek')!;
  const ready = (c: Config) => !!(c.key && c.model) && (c.id !== 'deepseek' || !!(renderer?.key && renderer.model));
  let running = 0;
  const post = async (c: Config, body: unknown, signal: AbortSignal) => {
    const response = await fetch(c.url, { method: 'POST', headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    const payload = record(await response.json());
    if (c.id === 'wenxin' && !response.ok) {
      if (record(payload.error).code === 'invalid_model' || payload.code === 'invalid_model') throw new Error('当前百度图像模型不存在或当前账号无调用权限，请核对模型ID及服务状态。');
      const reason: Record<number, string> = { 401: '文心图像接口鉴权失败，请核对API Key的平台、应用绑定及该图像模型调用权限。', 403: '当前API Key没有图像模型权限，请在千帆控制台核对所选图像模型的服务及授权。', 429: '文心图像服务达到额度或频率限制，请检查用量后重试。' };
      throw new Error(reason[response.status] ?? `文心图像服务请求失败（HTTP ${response.status}），请检查模型配置和账户服务状态。`);
    }
    if (!response.ok || payload.code) throw new Error(`${c.label}请求失败（${response.status}），请核对模型权限和服务配置。`);
    return payload;
  };
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/api/models/status' && req.method === 'GET') {
      jsonReply(res, 200, { providers: config.map(c => ({ id: c.id, label: c.label, configured: ready(c), model: c.model, description: c.id === 'deepseek' ? `提示词优化 + ${renderer?.label ?? '图像模型'}生成` : '图像生成' })) }); return;
    }
    if (path !== '/api/models/generate') { next(); return; }
    if (req.method !== 'POST') { jsonReply(res, 405, { error: '只支持POST请求。' }); return; }
    if (running >= 2) { jsonReply(res, 429, { error: '图片生成繁忙，请稍后重试。' }); return; }
    running++;
    void (async () => {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 180_000);
      const close = () => { if (!res.writableEnded) controller.abort(); }; res.on('close', close);
      try {
        const body = await readJson(req); let prompt = text(body.prompt).trim();
        const selected = config.find(c => c.id === body.provider);
        if (!selected || !prompt || prompt.length > 1000) { jsonReply(res, 400, { error: '请选择模型，并输入1到1000字的图案描述。' }); return; }
        if (!ready(selected)) { jsonReply(res, 503, { error: `${selected.label}暂未配置可用服务，请联系管理员配置后重试。` }); return; }
        let imageModel = selected;
        if (selected.id === 'deepseek') {
          const enhanced = await post(selected, { model: selected.model, messages: [{ role: 'system', content: '将用户需求改写为简洁刺绣图案的中文图像生成提示词，保留主题，不要解释，最多500字。' }, { role: 'user', content: prompt }], max_tokens: 800 }, controller.signal);
          const choice = record(Array.isArray(enhanced.choices) ? enhanced.choices[0] : null);
          prompt = text(record(choice.message).content).trim();
          if (!prompt) throw new Error('DeepSeek没有返回有效的图案描述。');
          imageModel = renderer;
        }
        const hint = '\n刺绣线稿设计，纯白背景，主体居中，轮廓清晰，构图简洁；使用清晰的彩色色块和纯白背景，相近颜色不必细分，不要复杂渐变、文字或水印。';
        const isAir = imageModel.id === 'wenxin' && imageModel.model === 'musesteamer-air-image';
        prompt = (isAir ? prompt.slice(0, 1000 - hint.length) : prompt) + hint;
        const payload = await post(imageModel, imageModel.id === 'qwen' ? {
          model: imageModel.model, input: { messages: [{ role: 'user', content: [{ text: prompt }] }] }, parameters: { size: '1328*1328', n: 1, watermark: false },
        } : isAir ? { model: imageModel.model, prompt, size: '1024x1024', response_format: 'url', prompt_extend: false } : { model: imageModel.model, prompt, size: '1024x1024', ...(imageModel.id === 'wenxin' ? { watermark: false } : { n: 1 }), ...(imageModel.id === 'doubao' ? { response_format: 'b64_json', watermark: false } : {}) }, controller.signal);
        const first = record(Array.isArray(payload.data) ? payload.data[0] : null);
        const choices = record(payload.output).choices;
        const content = record(record(Array.isArray(choices) ? choices[0] : null).message).content;
        const remote = text(first.url) || text(record(Array.isArray(content) ? content[0] : null).image);
        let bytes: Buffer; let mime = 'image/png';
        if (typeof first.b64_json === 'string') {
          if (first.b64_json.length > 28_000_000) throw new Error('模型返回图片过大。');
          bytes = Buffer.from(first.b64_json.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
        } else if (remote) {
          const url = new URL(remote);
          // Qianfan documents signed BOS links using HTTP. Fetch the same
          // host/path/query over HTTPS; never send the model API key to BOS.
          if (imageModel.id === 'wenxin' && url.protocol === 'http:' && !url.username && !url.password && !url.port && /\.bcebos\.com$/i.test(url.hostname)) url.protocol = 'https:';
          if (url.protocol !== 'https:' || url.username || url.password || !/\.(aliyuncs\.com|volces\.com|volcengine\.com|bigmodel\.cn|baidubce\.com|bcebos\.com)$/i.test(url.hostname)) throw new Error('模型返回了不受支持的图片地址。');
          const image = await fetch(url, { signal: controller.signal, redirect: 'error' });
          mime = image.headers.get('content-type')?.split(';')[0] || '';
          if (!image.ok || !['image/png', 'image/jpeg', 'image/webp'].includes(mime) || !image.body) throw new Error('无法读取模型返回的图片。');
          const chunks: Buffer[] = []; let size = 0;
          for await (const part of image.body as unknown as AsyncIterable<Uint8Array>) {
            size += part.length;
            if (size > 20 * 1024 * 1024) { controller.abort(); throw new Error('模型返回图片超过20MB。'); }
            chunks.push(Buffer.from(part));
          }
          bytes = Buffer.concat(chunks);
        } else throw new Error('模型没有返回可用图片，请核对所选模型及接口格式。');
        if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('模型返回了无效或过大的图片。');
        if (!res.destroyed) { res.writeHead(200, { 'Content-Type': mime, 'Content-Length': bytes.length, 'Cache-Control': 'no-store' }); res.end(bytes); }
      } catch (cause) {
        if (!res.destroyed && !res.writableEnded) jsonReply(res, 502, { error: controller.signal.aborted ? '生成超时或已取消，请重试。' : cause instanceof Error ? cause.message : '模型生成失败，请重试。' });
      } finally { clearTimeout(timer); res.off('close', close); running--; }
    })();
  };
  return { name: 'xiangxiu-model-images', configureServer: s => { s.middlewares.use(middleware); }, configurePreviewServer: s => { s.middlewares.use(middleware); } };
}
