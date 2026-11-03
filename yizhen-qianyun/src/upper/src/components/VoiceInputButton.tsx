import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import './VoiceInputButton.css';

type SpeechResultEvent = {
  results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }>;
};
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function VoiceInputButton({ value, disabled, onChange, onListeningChange }: {
  value: string; disabled: boolean; onChange: (value: string) => void;
  onListeningChange: (listening: boolean) => void;
}) {
  const active = useRef<Recognition | null>(null);
  const notify = useRef(onListeningChange); notify.current = onListeningChange;
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  const abort = () => {
    const recognition = active.current; active.current = null;
    if (recognition) { recognition.onresult = null; recognition.onerror = null; recognition.onend = null; recognition.abort(); }
  };
  useEffect(() => () => abort(), []);
  useEffect(() => {
    if (disabled) { abort(); setListening(false); notify.current(false); }
  }, [disabled]);

  const toggle = () => {
    if (active.current) { active.current.stop(); return; }
    const speechWindow = window as SpeechWindow;
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    setError(false); setMessage('');
    if (!Constructor) { setError(true); setMessage('当前浏览器不支持语音识别，请使用支持此功能的 Chrome 或 Edge，或直接输入文字。'); return; }
    if (value.length >= 1000) { setError(true); setMessage('描述已达到1000字，请删减后再输入。'); return; }
    const recognition = new Constructor(); active.current = recognition;
    recognition.lang = 'zh-CN'; recognition.continuous = false; recognition.interimResults = true; recognition.maxAlternatives = 1;
    const base = value.trimEnd(); const separator = base && !/[，。！？、；：\s]$/.test(base) ? '，' : '';
    let heard = false; let failed = false;
    recognition.onresult = event => {
      if (active.current !== recognition) return;
      let transcript = '';
      for (let index = 0; index < event.results.length; index++) transcript += event.results[index][0]?.transcript ?? '';
      if (!transcript.trim()) return;
      heard = true;
      const next = base + separator + transcript.trim();
      onChange(next.slice(0, 1000));
      setMessage(next.length > 1000 ? '描述已达到1000字，超出部分未填入。' : '正在识别，请说普通话…');
      if (next.length >= 1000) recognition.stop();
    };
    recognition.onerror = event => {
      if (active.current !== recognition) return;
      failed = true;
      const errors: Record<string, string> = {
        'not-allowed': '麦克风权限未开启，请在浏览器中允许此网站使用麦克风后重试。',
        'service-not-allowed': '浏览器语音服务不可用，请换用支持语音识别的浏览器或输入文字。',
        'audio-capture': '未检测到可用麦克风，请检查电脑的麦克风连接。',
        'no-speech': '没有听到声音，请靠近麦克风后重试。',
        network: '语音服务连接失败，请检查网络后重试，或直接输入文字。',
        'language-not-supported': '当前语音服务不支持普通话，请换用其他浏览器或输入文字。',
      };
      setError(event.error !== 'aborted');
      setMessage(event.error === 'aborted' ? '语音输入已停止。' : errors[event.error] ?? '语音识别失败，请重试或输入文字。');
      // Some implementations emit only error, without a subsequent end event.
      active.current = null; recognition.onresult = null; recognition.onend = null; recognition.onerror = null;
      recognition.abort(); setListening(false); notify.current(false);
    };
    recognition.onend = () => {
      if (active.current !== recognition) return;
      active.current = null; setListening(false); notify.current(false);
      if (!failed) setMessage(heard ? '语音已填入，可修改文字后再生成。' : '没有识别到文字，请重试。');
    };
    try {
      setListening(true); notify.current(true); setMessage('正在听，请说普通话…'); recognition.start();
    } catch {
      abort(); setListening(false); notify.current(false); setError(true); setMessage('语音输入启动失败，请检查麦克风权限后重试。');
    }
  };
  return <div className="voice-input-control">
    <div className="voice-input-row"><button type="button" className={`voice-input-button ${listening ? 'is-listening' : ''}`} aria-pressed={listening} disabled={disabled} onClick={toggle}>{listening ? <Square size={14}/> : <Mic size={16}/>} {listening ? '停止语音输入' : '语音输入'}</button><small>普通话 · 识别后可编辑</small></div>
    {message && <p className={error ? 'voice-input-error' : 'voice-input-status'} role={error ? 'alert' : 'status'}>{message}</p>}
  </div>;
}
