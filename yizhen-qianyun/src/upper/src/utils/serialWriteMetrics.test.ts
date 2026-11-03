import {it,expect} from 'vitest';
import {capturedSerialWrite} from './serialCapture';
import {runtimeMetrics} from './runtimeMetrics';
it('records actual writer failures once and preserves the rejection',async()=>{
 runtimeMetrics.reset();
 const writer={write:async()=>{throw Error('test write failure');}} as unknown as WritableStreamDefaultWriter<Uint8Array>;
 await expect(capturedSerialWrite(writer,new TextEncoder().encode('PING 0001\n'),'test')).rejects.toThrow('test write failure');
 expect(runtimeMetrics.snapshot().writeErrors).toBe(1);
});
