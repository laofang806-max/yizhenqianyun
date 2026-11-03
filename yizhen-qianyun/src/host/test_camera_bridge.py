import ctypes
import unittest

from host.camera_bridge import D2xxDevice, websocket_accept, websocket_binary_frame


class CameraBridgeTests(unittest.TestCase):
    def test_websocket_accept_matches_protocol_example(self) -> None:
        self.assertEqual(
            websocket_accept("dGhlIHNhbXBsZSBub25jZQ=="),
            "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=",
        )

    def test_binary_frame_lengths(self) -> None:
        self.assertEqual(websocket_binary_frame(b"abc"), b"\x82\x03abc")
        self.assertEqual(websocket_binary_frame(bytes(126))[:4], b"\x82\x7e\x00\x7e")
        self.assertEqual(
            websocket_binary_frame(bytes(65536))[:10],
            b"\x82\x7f\x00\x00\x00\x00\x00\x01\x00\x00",
        )

    def test_ftdi_start_and_stop_commands(self) -> None:
        device = object.__new__(D2xxDevice)
        device.handle = ctypes.c_void_p(1)
        commands: list[bytes] = []

        def fake_write(_handle, buffer, length, written):
            commands.append(ctypes.string_at(buffer, length))
            ctypes.cast(written, ctypes.POINTER(ctypes.c_ulong)).contents.value = length
            return 0

        device._reopen = lambda: None
        device._write = fake_write
        device.start_stream()
        device.stop_stream()
        self.assertEqual(commands, [b"S", b"P"])


class CameraBridgeConnectionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from host.camera_bridge import create_server
        self.commands = []
        commands = self.commands
        class FakeDevice:
            def start_stream(self): commands.append(b'S')
            def stop_stream(self): commands.append(b'P')
            def read(self, _size):
                import time
                time.sleep(0.01)
                return b''
        self.server = await create_server(FakeDevice(), '127.0.0.1', 0)
        self.port = self.server.sockets[0].getsockname()[1]
        self.clients = []

    async def asyncTearDown(self):
        import asyncio
        for writer in self.clients:
            writer.close()
            await writer.wait_closed()
        await asyncio.sleep(0.1)
        self.server.close()
        await self.server.wait_closed()

    async def connect(self):
        import asyncio
        reader, writer = await asyncio.open_connection('127.0.0.1', self.port)
        self.clients.append(writer)
        writer.write(b'GET /camera HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\n'
                     b'Connection: Upgrade\r\nSec-WebSocket-Version: 13\r\n'
                     b'Origin: http://127.0.0.1:4173\r\n'
                     b'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n')
        await writer.drain()
        response = await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'), 1)
        return reader, writer, response

    async def test_rejected_client_does_not_release_active_camera(self):
        import asyncio
        _, writer, response = await self.connect()
        self.assertIn(b'101', response)
        for _ in range(2):
            _, _, response = await self.connect()
            self.assertIn(b'503', response)
        writer.close()
        await writer.wait_closed()
        await asyncio.sleep(0.1)
        self.assertEqual(self.commands, [b'S', b'P'])
        _, _, response = await self.connect()
        self.assertIn(b'101', response)

    async def test_ping_and_close_with_no_camera_frames(self):
        import asyncio
        reader, writer, _ = await self.connect()
        writer.write(b'\x89\x82abcd' + bytes([ord('h') ^ ord('a'), ord('i') ^ ord('b')]))
        await writer.drain()
        self.assertEqual(await asyncio.wait_for(reader.readexactly(4), 1), b'\x8a\x02hi')
        writer.write(b'\x88\x80abcd')
        await writer.drain()
        self.assertEqual(await asyncio.wait_for(reader.readexactly(2), 1), b'\x88\x00')
        await asyncio.sleep(0.1)
        self.assertEqual(self.commands, [b'S', b'P'])


if __name__ == "__main__":
    unittest.main()
