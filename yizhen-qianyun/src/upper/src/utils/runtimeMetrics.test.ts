import {describe,it,expect,vi,afterEach} from 'vitest';
import {runtimeMetrics as m} from './runtimeMetrics';
afterEach(()=>vi.restoreAllMocks());
describe('real device response metrics',()=>{
 it('matches tags and ignores stale replies instead of creating false RTT samples',()=>{
  let now=100;vi.spyOn(performance,'now').mockImplementation(()=>now);m.reset();m.connected(true);m.monitoring(true);
  const first=m.probe()!;now+=45;m.line(first.replace('PING','PONG').trim());
  expect(m.snapshot().meanMs).toBe(45);expect(m.snapshot().received).toBe(1);
  now+=100;const second=m.probe()!;m.line(first.replace('PING','PONG').trim());expect(m.snapshot().received).toBe(1);
  now+=2001;m.probe();expect(m.snapshot().timeouts).toBe(1);
  m.line(second.replace('PING','PONG').trim());expect(m.snapshot().received).toBe(1);
 });
 it('excludes paused time and exports faults and encoder continuity separately',()=>{
  let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);m.reset();m.connected(true);m.monitoring(true);
  now=200;m.line('ENC 00000000 00000000');now=450;m.line('ENC 00000001 00000002');m.line('ERR feedback');m.line('CORRECT');m.line('DONE layer');
  m.monitoring(false);now=5000;expect(m.snapshot().watchedMs).toBe(450);
  expect(m.snapshot()).toMatchObject({boardErrors:1,corrections:1,completed:1,maxEncoderGapMs:250});
 });
});
