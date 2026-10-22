import base64
import hmac
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import redis


MAX_BODY = 2 * 1024 * 1024
MAX_COMMANDS = 256
ALLOWED = frozenset('GET SET DEL EXISTS EXPIRE PEXPIRE EXPIREAT PEXPIREAT TTL PTTL INCR INCRBY DECR HGET HSET HGETALL HVALS HDEL HLEN HMGET MGET MSET ZRANGE ZRANGEBYSCORE ZADD ZREM ZCARD SCAN TIME PING GETDEL EVAL EVALSHA'.split())


def validate(command):
    if not isinstance(command, list) or not command or not isinstance(command[0], str):
        raise ValueError('Invalid command')
    if command[0].upper() not in ALLOWED:
        raise ValueError('Command is not permitted')
    if any(not isinstance(value, (str, int, float)) or isinstance(value, bool) for value in command):
        raise ValueError('Invalid argument')
    return command


def encode(value, use_base64, top=True):
    if isinstance(value, Exception):
        return {'error': str(value)}
    if isinstance(value, bytes):
        if use_base64 and not (top and value == b'OK'):
            return base64.b64encode(value).decode('ascii')
        return value.decode('utf-8')
    if isinstance(value, list):
        return [encode(item, use_base64, False) for item in value]
    return value


def create_server(token, socket_path, port=8790):
    if len(token) < 32:
        raise ValueError('A storage token of at least 32 characters is required')
    client = redis.Redis(unix_socket_path=socket_path, socket_timeout=5, socket_connect_timeout=3, max_connections=24)
    client.response_callbacks.clear()
    slots = threading.BoundedSemaphore(16)

    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, *_args):
            pass

        def reply(self, status, body):
            payload = json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(payload)
            self.close_connection = True

        def do_POST(self):
            supplied = self.headers.get('Authorization', '').encode()
            if self.headers.get('Origin') or not hmac.compare_digest(supplied, ('Bearer ' + token).encode()):
                self.reply(401, {'error': 'Unauthorized'})
                return
            if self.path not in ('', '/', '/pipeline', '/multi-exec'):
                self.reply(404, {'error': 'Not found'})
                return
            if self.headers.get('Transfer-Encoding'):
                self.reply(400, {'error': 'Content-Length required'})
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length <= 0 or length > MAX_BODY:
                    self.reply(413, {'error': 'Body too large or empty'})
                    return
                self.connection.settimeout(10)
                raw = self.rfile.read(length)
                if len(raw) != length:
                    raise ValueError('Incomplete body')
                body = json.loads(raw)
                batch = self.path in ('/pipeline', '/multi-exec')
                commands = body if batch else [body]
                if not isinstance(commands, list) or not 1 <= len(commands) <= MAX_COMMANDS:
                    raise ValueError('Invalid batch')
                for command in commands:
                    validate(command)
            except (ValueError, UnicodeError, TimeoutError):
                self.reply(400, {'error': 'Invalid request'})
                return
            if not slots.acquire(blocking=False):
                self.reply(503, {'error': 'Storage busy'})
                return
            try:
                use_base64 = self.headers.get('Upstash-Encoding') == 'base64'
                if batch:
                    with client.pipeline(transaction=self.path == '/multi-exec') as pipeline:
                        for command in commands:
                            pipeline.execute_command(*command)
                        results = pipeline.execute(raise_on_error=False)
                    payload = [encode(item, use_base64) if isinstance(item, Exception)
                               else {'result': encode(item, use_base64)} for item in results]
                else:
                    payload = {'result': encode(client.execute_command(*commands[0]), use_base64)}
                self.reply(200, payload)
            except redis.ResponseError as error:
                self.reply(200, {'error': str(error)})
            except (redis.RedisError, UnicodeError):
                self.reply(503, {'error': 'Storage unavailable'})
            finally:
                slots.release()

    class Server(ThreadingHTTPServer):
        daemon_threads = True
        request_queue_size = 32

    return Server(('127.0.0.1', port), Handler)


if __name__ == '__main__':
    create_server(os.environ['STORAGE_TOKEN'], os.environ.get('STORAGE_SOCKET', '/run/owkr-storage-redis/redis.sock'),
                  int(os.environ.get('STORAGE_PORT', '8790'))).serve_forever()
