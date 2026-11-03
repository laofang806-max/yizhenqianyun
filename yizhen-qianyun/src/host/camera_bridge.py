"""Forward the board's FT232HL USB Slave FIFO stream to the browser."""
import argparse
import asyncio
import base64
import ctypes
import hashlib
import logging
import os
import struct
import time
from urllib.parse import urlparse


FT_OK = 0
FT_BITMODE_SYNC_FIFO = 0x40
FT_PURGE_RX = 1
FT_PURGE_TX = 2
READ_SIZE = 65536
WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def websocket_accept(key: str) -> str:
    source = (key + WEBSOCKET_GUID).encode("ascii")
    return base64.b64encode(hashlib.sha1(source).digest()).decode("ascii")


def websocket_binary_frame(payload: bytes) -> bytes:
    size = len(payload)
    if size < 126:
        header = struct.pack("!BB", 0x82, size)
    elif size < 65536:
        header = struct.pack("!BBH", 0x82, 126, size)
    else:
        header = struct.pack("!BBQ", 0x82, 127, size)
    return header + payload


class D2xxDevice:
    def __init__(self, device_index: int, serial_number: str | None = None) -> None:
        self.device_index = device_index
        self.serial_number = serial_number
        dll_path = os.environ.get("FTD2XX_DLL", "ftd2xx.dll")
        self.dll = ctypes.WinDLL(dll_path)
        handle_type = ctypes.c_void_p
        dword = ctypes.c_ulong
        byte = ctypes.c_ubyte
        dword_ptr = ctypes.POINTER(dword)
        self._open = self._function("FT_Open", [dword, ctypes.POINTER(handle_type)])
        self._open_ex = self._function("FT_OpenEx", [ctypes.c_void_p, dword, ctypes.POINTER(handle_type)])
        self._reset = self._function("FT_ResetDevice", [handle_type])
        self._timeouts = self._function("FT_SetTimeouts", [handle_type, dword, dword])
        self._usb_parameters = self._function("FT_SetUSBParameters", [handle_type, dword, dword])
        self._latency = self._function("FT_SetLatencyTimer", [handle_type, byte])
        self._bit_mode = self._function("FT_SetBitMode", [handle_type, byte, byte])
        self._purge = self._function("FT_Purge", [handle_type, dword])
        self._read = self._function("FT_Read", [handle_type, ctypes.c_void_p, dword, dword_ptr])
        self._write = self._function("FT_Write", [handle_type, ctypes.c_void_p, dword, dword_ptr])
        self._close = self._function("FT_Close", [handle_type])

        self.handle = ctypes.c_void_p()
        self._open_device()

    def _open_device(self) -> None:
        self.handle = ctypes.c_void_p()
        if self.serial_number:
            serial_buffer = ctypes.create_string_buffer(self.serial_number.encode("ascii"))
            self._check(self._open_ex(serial_buffer, 1, ctypes.byref(self.handle)), "open device by serial")
        else:
            self._check(self._open(self.device_index, ctypes.byref(self.handle)), "open device")
        try:
            self._check(self._reset(self.handle), "reset device")
            self._check(self._timeouts(self.handle, 100, 1000), "set timeouts")
            self._check(self._usb_parameters(self.handle, READ_SIZE, READ_SIZE), "set USB buffers")
            self._check(self._latency(self.handle, 2), "set latency timer")
            self._check(self._purge(self.handle, FT_PURGE_RX | FT_PURGE_TX), "purge buffers")
            self._check(self._bit_mode(self.handle, 0, 0), "reset bit mode")
            self._check(self._bit_mode(self.handle, 0xFF, FT_BITMODE_SYNC_FIFO), "enable sync FIFO mode")
        except BaseException:
            self.close()
            raise

    def _function(self, name: str, arguments: list[object]):
        function = getattr(self.dll, name)
        function.argtypes = arguments
        function.restype = ctypes.c_ulong
        return function

    @staticmethod
    def _check(status: int, operation: str) -> None:
        if status != FT_OK:
            raise RuntimeError(f"FTDI {operation} failed with status {status}")

    def _reopen(self) -> None:
        # A USB unplug/reset invalidates the old handle even though the local
        # WebSocket server is still alive. Reacquire the same serial number.
        self.close()
        self._open_device()

    def start_stream(self) -> None:
        # Called only by the exclusive preview client after its prior reader
        # has stopped. Also purge stale RX bytes from the preceding session.
        self._reopen()
        self._write_command(b"S", "start stream")

    def stop_stream(self) -> None:
        self._write_command(b"P", "stop stream")

    def _write_command(self, value: bytes, operation: str) -> None:
        command = ctypes.create_string_buffer(value)
        written = ctypes.c_ulong()
        self._check(self._write(self.handle, command, 1, ctypes.byref(written)), operation)
        if written.value != 1:
            raise RuntimeError(f"FTDI did not accept the camera {operation} command")

    def read(self, size: int) -> bytes:
        buffer = ctypes.create_string_buffer(size)
        received = ctypes.c_ulong()
        self._check(self._read(self.handle, buffer, size, ctypes.byref(received)), "read stream")
        return buffer.raw[:received.value]

    def close(self) -> None:
        if self.handle:
            self._close(self.handle)
            self.handle = ctypes.c_void_p()


async def receive_controls(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    """Handle browser close/EOF even when the board has no camera data."""
    while True:
        header = await reader.readexactly(2)
        opcode, length = header[0] & 15, header[1] & 127
        if header[0] & 0x70 or not header[0] & 0x80 or not header[1] & 0x80:
            raise ValueError("Invalid WebSocket control frame")
        if opcode not in (8, 9, 10) or length > 125:
            raise ValueError("Only WebSocket control frames are accepted")
        mask = await reader.readexactly(4)
        data = await reader.readexactly(length)
        data = bytes(value ^ mask[index % 4] for index, value in enumerate(data))
        if opcode == 8:
            writer.write(bytes([0x88, len(data)]) + data)
            await asyncio.wait_for(writer.drain(), 2)
            return
        if opcode == 9:
            writer.write(bytes([0x8a, len(data)]) + data)
            await asyncio.wait_for(writer.drain(), 2)


def create_server(device: D2xxDevice, host: str, port: int):
    client_active = False

    async def handler(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        nonlocal client_active
        owns_device = False
        stream_requested = False
        receiver = None
        stopped = asyncio.Event()
        async def send_stream():
            while not stopped.is_set():
                chunk = await asyncio.to_thread(device.read, READ_SIZE)
                if chunk and not stopped.is_set():
                    writer.write(websocket_binary_frame(chunk))
                    await asyncio.wait_for(writer.drain(), 2)

        sender = None
        try:
            raw = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 5)
            lines = raw.decode("ascii", errors="replace").split("\r\n")
            request = lines[0].split()
            headers = {}
            for line in lines[1:]:
                name, separator, value = line.partition(":")
                if separator:
                    headers[name.strip().lower()] = value.strip()
            origin = headers.get("origin")
            origin_host = urlparse(origin).hostname if origin else None
            if origin and origin_host not in ("127.0.0.1", "localhost", "::1"):
                writer.write(b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
                await writer.drain()
                return
            try:
                key_valid = len(base64.b64decode(headers.get("sec-websocket-key", ""), validate=True)) == 16
            except ValueError:
                key_valid = False
            if (len(request) != 3 or request[0] != "GET" or request[1] != "/camera" or
                request[2] != "HTTP/1.1" or headers.get("upgrade", "").lower() != "websocket" or
                "upgrade" not in headers.get("connection", "").lower() or
                headers.get("sec-websocket-version") != "13" or not key_valid):
                writer.write(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
                await writer.drain()
                return
            if client_active:
                writer.write(b"HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n")
                await writer.drain()
                return
            # Claim before the first await; rejected clients never release this lease.
            client_active = owns_device = True
            accept = websocket_accept(headers["sec-websocket-key"]).encode("ascii")
            writer.write(b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
                         b"Connection: Upgrade\r\nSec-WebSocket-Accept: " + accept + b"\r\n\r\n")
            await writer.drain()
            await asyncio.to_thread(device.start_stream)
            stream_requested = True
            logging.info("Camera preview client connected")
            receiver = asyncio.create_task(receive_controls(reader, writer))
            sender = asyncio.create_task(send_stream())
            done, _ = await asyncio.wait((receiver, sender), return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        except (ConnectionError, asyncio.IncompleteReadError, OSError, ValueError,
                RuntimeError, asyncio.TimeoutError, asyncio.LimitOverrunError) as error:
            logging.info("Camera client ended: %s", error)
        finally:
            stopped.set()
            # Finish the bounded FT_Read before sending P or allowing another client.
            if sender:
                await asyncio.gather(sender, return_exceptions=True)
            if receiver:
                receiver.cancel()
                await asyncio.gather(receiver, return_exceptions=True)
            if stream_requested:
                try:
                    await asyncio.to_thread(device.stop_stream)
                except (OSError, RuntimeError) as error:
                    logging.warning("Unable to stop camera stream: %s", error)
            if owns_device:
                client_active = False
            writer.close()
            try:
                await writer.wait_closed()
            except OSError:
                pass

    return asyncio.start_server(handler, host, port, limit=8192)


class SimulatedCamera:
    """Offline test pattern. Generates a simulated KEY2 event every five seconds."""
    def __init__(self):
        self.sequence = 0
        self.pending = b""
        self.active = False
        # YUYV pairs: black, red, yellow and blue bars.
        row = b"".join(bytes(pair) * 80 for pair in (
            (16, 128, 16, 128), (81, 90, 81, 240),
            (210, 16, 210, 146), (41, 240, 41, 110)))
        self.pixels = row * 480

    def start_stream(self):
        self.sequence = 0
        self.pending = b""
        self.active = True

    def stop_stream(self):
        self.active = False

    def read(self, size):
        if not self.active:
            time.sleep(0.01)
            return b""
        if not self.pending:
            time.sleep(0.1)
            self.sequence += 1
            def header(kind, length):
                return struct.pack("<4sBBHHHII", b"OV56", 1, kind, 640, 480, 1, self.sequence, length)
            self.pending = header(1, len(self.pixels)) + self.pixels
            if self.sequence % 50 == 0:
                self.pending += header(2, 0)
        chunk, self.pending = self.pending[:size], self.pending[size:]
        return chunk

    def close(self):
        self.stop_stream()


async def run_server(device_index: int, host: str, port: int, simulate: bool = False, serial_number: str | None = None) -> None:
    device = SimulatedCamera() if simulate else D2xxDevice(device_index, serial_number)
    try:
        server = await create_server(device, host, port)
        async with server:
            logging.info("Camera bridge listening at ws://%s:%d/camera", host, port)
            await server.serve_forever()
    finally:
        device.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=int, default=0, help="FTDI D2XX device index")
    parser.add_argument("--serial", help="Open the confirmed USB Slave serial number instead of a changing index")
    parser.add_argument("--host", default="127.0.0.1", help="WebSocket bind address")
    parser.add_argument("--port", type=int, default=8765, help="WebSocket port")
    parser.add_argument("--simulate", action="store_true", help="Offline color bars; simulated KEY2 every 5 seconds, no board needed")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        if args.simulate:
            logging.warning("SIMULATION: color bars only, NOT a real camera or hardware validation")
        asyncio.run(run_server(args.index, args.host, args.port, args.simulate, args.serial))
    except (OSError, RuntimeError) as error:
        parser.exit(1, f"Camera bridge error: {error}\n")


if __name__ == "__main__":
    main()
