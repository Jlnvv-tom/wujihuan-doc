# Python网络编程完全指南：从Socket到HTTP服务器实战

> 在互联网的浩瀚海洋中，网络编程是构建连接岛屿的桥梁。每一行代码都是信息高速路上的信号灯，而理解这些信号如何在网络中传递，是现代开发者必备的核心技能。

Python凭借其简洁优雅的语法和丰富的网络编程库，成为学习网络编程的理想语言。从底层Socket接口到高层HTTP请求库，Python提供了一整套完整的网络编程工具链。

无论是构建简单的聊天程序，还是开发复杂的Web服务，理解网络编程原理都是成功的关键。

本文将带你深入Python网络编程的各个方面，从基础概念到实际应用，从TCP/UDP协议到HTTP服务器构建，为你打开网络世界的大门。

## 01 网络编程概念：互联网通信的基石

在深入代码之前，我们需要了解一些基础概念。网络编程本质上是**不同设备间通过协议进行通信**的过程。

OSI七层模型和TCP/IP四层模型是理解网络通信的基础框架。虽然OSI模型更理论化，但TCP/IP模型更贴近实际应用：

- **应用层**（HTTP、FTP、SMTP）- 用户接口和应用程序
- **传输层**（TCP、UDP）- 端到端通信
- **网络层**（IP）- 寻址和路由
- **链路层**（以太网、Wi-Fi）- 物理连接

理解IP地址、端口和协议之间的关系至关重要。IP地址标识网络中的设备，端口标识设备上的特定应用程序，而协议定义了通信规则。

Python标准库中的`socket`模块提供了访问底层网络接口的能力，让我们可以创建各种网络应用程序。

## 02 Socket编程：网络通信的基础接口

Socket（套接字）是网络编程的基石，可以看作是不同主机间进程通信的端点。在Python中，使用`socket`模块可以创建客户端和服务器程序。

让我们从一个最简单的例子开始：

```python
import socket

# 创建一个TCP socket
server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
print("Socket创建成功")

# 设置socket选项，允许地址重用
server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

# 绑定地址和端口
server_address = ('localhost', 12345)
server_socket.bind(server_address)
print(f"Socket绑定到 {server_address}")

# 开始监听连接
server_socket.listen(5)
print("等待连接...")

# 接受客户端连接
client_socket, client_address = server_socket.accept()
print(f"接收到来自 {client_address} 的连接")

# 接收数据
data = client_socket.recv(1024)
print(f"接收到的数据: {data.decode('utf-8')}")

# 发送响应
response = "你好，客户端！"
client_socket.send(response.encode('utf-8'))

# 关闭连接
client_socket.close()
server_socket.close()
```

这个简单的服务器展示了Socket编程的基本流程：创建Socket、绑定地址、监听连接、接受连接、收发数据、关闭连接。

## 03 TCP客户端与服务器：可靠的流式通信

TCP（传输控制协议）提供了可靠的、面向连接的通信。它确保数据按序到达，无丢失和重复，适合需要可靠传输的应用。

下面是一个完整的TCP客户端/服务器示例，实现了一个简单的聊天程序：

```python
# TCP服务器端 - server.py
import socket
import threading

def handle_client(client_socket, client_address):
    """处理客户端连接"""
    print(f"[+] 新连接: {client_address}")

    # 发送欢迎消息
    welcome_msg = "欢迎来到聊天室！输入 'exit' 退出。\n"
    client_socket.send(welcome_msg.encode('utf-8'))

    while True:
        try:
            # 接收客户端消息
            message = client_socket.recv(1024).decode('utf-8')
            if not message or message.strip().lower() == 'exit':
                print(f"[-] 客户端 {client_address} 断开连接")
                break

            print(f"[{client_address}] 说: {message}")

            # 广播消息给所有客户端（简化版）
            response = f"服务器回复: 收到你的消息 '{message}'\n"
            client_socket.send(response.encode('utf-8'))

        except ConnectionResetError:
            print(f"[-] 客户端 {client_address} 异常断开")
            break

    client_socket.close()

def start_tcp_server(host='0.0.0.0', port=8888):
    """启动TCP服务器"""
    # 创建TCP socket
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    try:
        server_socket.bind((host, port))
        server_socket.listen(5)
        print(f"[*] TCP服务器监听在 {host}:{port}")

        while True:
            # 等待客户端连接
            client_socket, client_address = server_socket.accept()

            # 为每个客户端创建新线程
            client_thread = threading.Thread(
                target=handle_client,
                args=(client_socket, client_address)
            )
            client_thread.daemon = True
            client_thread.start()

    except KeyboardInterrupt:
        print("\n[*] 服务器关闭")
    finally:
        server_socket.close()

if __name__ == "__main__":
    start_tcp_server()
```

```python
# TCP客户端 - client.py
import socket
import threading

def receive_messages(sock):
    """接收服务器消息的线程函数"""
    while True:
        try:
            message = sock.recv(1024).decode('utf-8')
            if message:
                print(f"\n[服务器]: {message}", end='')
            else:
                # 服务器关闭了连接
                print("\n[*] 与服务器的连接已关闭")
                break
        except:
            print("\n[*] 接收消息出错")
            break

def start_tcp_client(host='localhost', port=8888):
    """启动TCP客户端"""
    client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    try:
        client_socket.connect((host, port))
        print(f"[*] 已连接到服务器 {host}:{port}")

        # 启动接收消息的线程
        receive_thread = threading.Thread(target=receive_messages, args=(client_socket,))
        receive_thread.daemon = True
        receive_thread.start()

        # 主线程处理用户输入
        while True:
            message = input("> ")
            if message.lower() == 'exit':
                client_socket.send('exit'.encode('utf-8'))
                break

            client_socket.send(message.encode('utf-8'))

    except ConnectionRefusedError:
        print(f"[!] 无法连接到服务器 {host}:{port}")
    except KeyboardInterrupt:
        print("\n[*] 客户端关闭")
    finally:
        client_socket.close()

if __name__ == "__main__":
    start_tcp_client()
```

这个TCP聊天程序展示了多线程在网络编程中的应用。服务器能够同时处理多个客户端连接，每个连接都在独立的线程中处理。

## 04 UDP客户端与服务器：快速的无连接通信

与TCP不同，UDP（用户数据报协议）是无连接的、不可靠的通信协议。它不保证数据包的顺序、可靠性和无重复性，但**传输效率更高**，延迟更低，适合实时性要求高的应用。

```python
# UDP服务器端 - udp_server.py
import socket
import time

def start_udp_server(host='0.0.0.0', port=9999):
    """启动UDP服务器"""
    # 创建UDP socket
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    try:
        server_socket.bind((host, port))
        print(f"[*] UDP服务器监听在 {host}:{port}")

        # 记录客户端地址
        clients = set()

        while True:
            # 接收数据
            data, client_address = server_socket.recvfrom(1024)

            if client_address not in clients:
                clients.add(client_address)
                print(f"[+] 新客户端: {client_address}")

            message = data.decode('utf-8')
            print(f"[{client_address}] 说: {message}")

            if message.lower() == 'ping':
                # 响应ping请求
                response = f"PONG ({time.strftime('%H:%M:%S')})"
                server_socket.sendto(response.encode('utf-8'), client_address)
            elif message.lower() == 'time':
                # 返回当前时间
                current_time = time.strftime('%Y-%m-%d %H:%M:%S')
                response = f"服务器时间: {current_time}"
                server_socket.sendto(response.encode('utf-8'), client_address)
            elif message.lower() == 'broadcast':
                # 广播消息给所有客户端
                broadcast_msg = f"广播消息: 来自 {client_address}"
                for client in clients:
                    if client != client_address:
                        server_socket.sendto(broadcast_msg.encode('utf-8'), client)
                response = "广播已发送"
                server_socket.sendto(response.encode('utf-8'), client_address)
            else:
                # 简单回声
                response = f"收到: {message}"
                server_socket.sendto(response.encode('utf-8'), client_address)

    except KeyboardInterrupt:
        print("\n[*] 服务器关闭")
    finally:
        server_socket.close()

if __name__ == "__main__":
    start_udp_server()
```

```python
# UDP客户端 - udp_client.py
import socket
import threading

def receive_responses(sock):
    """接收服务器响应的线程函数"""
    while True:
        try:
            data, _ = sock.recvfrom(1024)
            print(f"\n[服务器]: {data.decode('utf-8')}", end='\n> ')
        except:
            break

def start_udp_client(server_host='localhost', server_port=9999):
    """启动UDP客户端"""
    client_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    # 设置超时时间
    client_socket.settimeout(5.0)

    # 启动接收线程
    receive_thread = threading.Thread(target=receive_responses, args=(client_socket,))
    receive_thread.daemon = True
    receive_thread.start()

    print(f"[*] UDP客户端已启动，连接到服务器 {server_host}:{server_port}")
    print("可用命令: ping, time, broadcast, exit")

    server_address = (server_host, server_port)

    try:
        while True:
            message = input("> ")

            if message.lower() == 'exit':
                break

            # 发送消息到服务器
            client_socket.sendto(message.encode('utf-8'), server_address)

    except KeyboardInterrupt:
        print("\n[*] 客户端关闭")
    finally:
        client_socket.close()

if __name__ == "__main__":
    start_udp_client()
```

**UDP和TCP的选择**取决于具体应用需求。对于实时音视频、在线游戏等对延迟敏感的应用，UDP通常是更好的选择。而对于文件传输、网页浏览等需要可靠传输的应用，TCP更为合适。

## 05 多线程与网络编程：处理并发连接

在实际网络应用中，服务器需要同时处理多个客户端连接。Python提供了多种并发处理方式：多线程、多进程和异步I/O。

下面是一个使用线程池处理并发连接的高级示例：

```python
# 高级并发服务器 - advanced_server.py
import socket
import threading
import queue
import time
from concurrent.futures import ThreadPoolExecutor

class ThreadPoolServer:
    """使用线程池的TCP服务器"""

    def __init__(self, host='0.0.0.0', port=8888, max_workers=10):
        self.host = host
        self.port = port
        self.max_workers = max_workers
        self.server_socket = None
        self.is_running = False
        self.client_counter = 0
        self.client_queue = queue.Queue()

    def client_handler(self, client_socket, client_address, client_id):
        """处理客户端请求"""
        print(f"[+] 客户端 #{client_id} 连接: {client_address}")

        try:
            # 发送欢迎消息
            welcome_msg = f"欢迎！你是第 {client_id} 个连接的用户\n"
            client_socket.send(welcome_msg.encode('utf-8'))

            while True:
                # 接收客户端数据
                data = client_socket.recv(1024)
                if not data:
                    break

                message = data.decode('utf-8').strip()
                print(f"[客户端 #{client_id}] {message}")

                if message.lower() == 'time':
                    # 返回当前时间
                    response = time.strftime('%Y-%m-%d %H:%M:%S')
                elif message.lower() == 'echo':
                    # 回声
                    response = "这是回声"
                elif message.lower() == 'calc clients':
                    # 返回当前连接数
                    response = f"当前在线客户端数: {threading.active_count() - 1}"
                elif message.lower() == 'exit':
                    response = "再见！"
                    client_socket.send(response.encode('utf-8'))
                    break
                else:
                    response = f"收到: {message}"

                client_socket.send(response.encode('utf-8'))

        except ConnectionResetError:
            print(f"[-] 客户端 #{client_id} 异常断开")
        finally:
            client_socket.close()
            print(f"[-] 客户端 #{client_id} 断开连接")

    def start(self):
        """启动服务器"""
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

        try:
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(5)
            self.is_running = True

            print(f"[*] 服务器启动在 {self.host}:{port}")
            print(f"[*] 最大工作线程数: {self.max_workers}")

            # 创建线程池
            with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                while self.is_running:
                    try:
                        # 接受客户端连接
                        client_socket, client_address = self.server_socket.accept()
                        self.client_counter += 1

                        # 提交任务到线程池
                        executor.submit(
                            self.client_handler,
                            client_socket,
                            client_address,
                            self.client_counter
                        )

                    except KeyboardInterrupt:
                        print("\n[*] 正在关闭服务器...")
                        self.stop()

        except Exception as e:
            print(f"[!] 服务器错误: {e}")
        finally:
            if self.server_socket:
                self.server_socket.close()

    def stop(self):
        """停止服务器"""
        self.is_running = False
        print("[*] 服务器已停止")

if __name__ == "__main__":
    # 启动服务器
    server = ThreadPoolServer(host='0.0.0.0', port=8888, max_workers=5)
    server.start()
```

线程池可以**有效管理资源**，避免创建过多线程导致的性能问题。对于I/O密集型任务，使用线程池是提高并发处理能力的好方法。

## 06 使用requests库：简化HTTP通信

虽然可以直接使用socket进行HTTP通信，但在实际开发中，我们更常使用专门的HTTP库。`requests`是Python中最流行的HTTP客户端库，它提供了简洁优雅的API。

```python
import requests
import json
import time
from requests.exceptions import RequestException

class HTTPClientDemo:
    """requests库使用示例"""

    def __init__(self):
        self.session = requests.Session()
        # 设置默认请求头
        self.session.headers.update({
            'User-Agent': 'PythonRequestsDemo/1.0',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate'
        })

    def basic_requests(self):
        """基础HTTP请求示例"""
        print("=== 基础HTTP请求示例 ===")

        # 1. GET请求
        print("\n1. GET请求示例:")
        response = requests.get('https://httpbin.org/get', params={'name': '张三', 'age': 25})
        print(f"状态码: {response.status_code}")
        print(f"响应头: {dict(response.headers)}")
        print(f"响应内容: {response.json()}")

        # 2. POST请求（表单数据）
        print("\n2. POST请求（表单数据）:")
        form_data = {'username': 'testuser', 'password': 'testpass'}
        response = requests.post('https://httpbin.org/post', data=form_data)
        print(f"状态码: {response.status_code}")
        print(f"响应: {response.json()}")

        # 3. POST请求（JSON数据）
        print("\n3. POST请求（JSON数据）:")
        json_data = {'title': '测试文章', 'content': '这是一篇测试文章的内容'}
        response = requests.post(
            'https://httpbin.org/post',
            json=json_data,
            headers={'Content-Type': 'application/json'}
        )
        print(f"状态码: {response.status_code}")
        print(f"响应: {response.json()}")

        # 4. 上传文件
        print("\n4. 文件上传示例:")
        files = {'file': ('test.txt', b'This is test file content')}
        response = requests.post('https://httpbin.org/post', files=files)
        print(f"文件上传响应: {response.json()}")

    def advanced_features(self):
        """高级功能示例"""
        print("\n=== 高级功能示例 ===")

        # 1. 会话保持（cookies自动管理）
        print("\n1. 会话保持示例:")
        # 第一个请求设置cookie
        response1 = self.session.get('https://httpbin.org/cookies/set/sessionid/123456')
        # 第二个请求会自动携带cookie
        response2 = self.session.get('https://httpbin.org/cookies')
        print(f"Cookies: {response2.json()}")

        # 2. 超时设置
        print("\n2. 超时设置示例:")
        try:
            response = requests.get('https://httpbin.org/delay/5', timeout=3)
        except requests.exceptions.Timeout:
            print("请求超时！")

        # 3. 重试机制
        print("\n3. 重试机制示例:")
        from requests.adapters import HTTPAdapter
        from requests.packages.urllib3.util.retry import Retry

        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST"]
        )

        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

        # 4. 代理设置
        print("\n4. 代理设置示例:")
        proxies = {
            'http': 'http://10.10.1.10:3128',
            'https': 'http://10.10.1.10:1080',
        }
        # 实际使用时取消注释
        # response = requests.get('http://example.org', proxies=proxies)

    def error_handling(self):
        """错误处理示例"""
        print("\n=== 错误处理示例 ===")

        urls = [
            'https://httpbin.org/status/200',
            'https://httpbin.org/status/404',
            'https://httpbin.org/status/500',
            'https://invalid-url-that-does-not-exist.com'
        ]

        for url in urls:
            try:
                response = requests.get(url, timeout=5)
                response.raise_for_status()  # 如果状态码不是200，抛出异常
                print(f"✓ {url} - 成功")

            except requests.exceptions.HTTPError as e:
                print(f"✗ {url} - HTTP错误: {e}")
            except requests.exceptions.ConnectionError as e:
                print(f"✗ {url} - 连接错误: {e}")
            except requests.exceptions.Timeout as e:
                print(f"✗ {url} - 超时错误: {e}")
            except requests.exceptions.RequestException as e:
                print(f"✗ {url} - 请求错误: {e}")

    def api_interaction(self):
        """实际API交互示例"""
        print("\n=== 实际API交互示例 ===")

        # GitHub API示例
        print("\n1. GitHub API示例:")
        response = requests.get('https://api.github.com/users/octocat')
        if response.status_code == 200:
            user_data = response.json()
            print(f"用户: {user_data['login']}")
            print(f"姓名: {user_data.get('name', '未知')}")
            print(f"仓库数: {user_data['public_repos']}")
            print(f"粉丝数: {user_data['followers']}")

        # 天气API示例（使用OpenWeatherMap）
        print("\n2. 天气API示例:")
        # 注意：需要注册获取API key
        api_key = "your_api_key_here"  # 替换为你的API key
        city = "Beijing"

        if api_key != "your_api_key_here":
            url = f"http://api.openweathermap.org/data/2.5/weather?q={city}&appid={api_key}&units=metric"
            response = requests.get(url)

            if response.status_code == 200:
                weather_data = response.json()
                print(f"城市: {weather_data['name']}")
                print(f"温度: {weather_data['main']['temp']}°C")
                print(f"天气: {weather_data['weather'][0]['description']}")
            else:
                print(f"获取天气失败: {response.status_code}")
        else:
            print("请先设置OpenWeatherMap API key")

# 运行示例
if __name__ == "__main__":
    client = HTTPClientDemo()
    client.basic_requests()
    client.advanced_features()
    client.error_handling()
    client.api_interaction()
```

requests库的**简洁API设计**让HTTP通信变得异常简单。通过合理使用会话、超时设置、重试机制等高级功能，可以构建健壮的HTTP客户端应用。

## 07 构建Web服务器：从简单到实用

Python内置了简单的HTTP服务器模块，适合快速搭建测试环境。对于生产环境，我们通常会使用更强大的框架如Flask、Django等。

下面展示如何使用Python内置模块和Flask构建Web服务器：

```python
# 1. 使用http.server模块的简单服务器
import http.server
import socketserver
import threading

def simple_http_server(port=8000):
    """启动简单的HTTP服务器"""
    handler = http.server.SimpleHTTPRequestHandler

    with socketserver.TCPServer(("", port), handler) as httpd:
        print(f"简单HTTP服务器运行在 http://localhost:{port}")
        print("按 Ctrl+C 停止服务器")
        httpd.serve_forever()

# 2. 自定义请求处理器的服务器
class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """自定义HTTP请求处理器"""

    def do_GET(self):
        """处理GET请求"""
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.end_headers()

            html_content = """
            <!DOCTYPE html>
            <html>
            <head>
                <title>Python HTTP服务器</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    h1 { color: #333; }
                    .endpoint { background: #f5f5f5; padding: 10px; margin: 10px 0; }
                </style>
            </head>
            <body>
                <h1>Python HTTP服务器示例</h1>
                <p>这是一个使用Python内置http.server模块创建的服务器。</p>
                <div class="endpoint">
                    <h3>可用端点：</h3>
                    <ul>
                        <li><a href="/">主页</a></li>
                        <li><a href="/time">当前时间</a></li>
                        <li><a href="/api/data">JSON API</a></li>
                        <li><a href="/form">表单示例</a></li>
                    </ul>
                </div>
            </body>
            </html>
            """
            self.wfile.write(html_content.encode('utf-8'))

        elif self.path == '/time':
            import time
            self.send_response(200)
            self.send_header('Content-type', 'text/plain; charset=utf-8')
            self.end_headers()
            current_time = time.strftime('%Y-%m-%d %H:%M:%S')
            self.wfile.write(f"当前服务器时间: {current_time}".encode('utf-8'))

        elif self.path == '/api/data':
            import json
            data = {
                'status': 'success',
                'message': '这是API响应',
                'timestamp': time.time(),
                'data': [1, 2, 3, 4, 5]
            }
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))

        else:
            # 默认行为：提供文件服务
            super().do_GET()

    def do_POST(self):
        """处理POST请求"""
        if self.path == '/submit':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length).decode('utf-8')

            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.end_headers()

            response_html = f"""
            <html>
            <body>
                <h1>表单提交成功</h1>
                <p>接收到的数据：{post_data}</p>
                <a href="/">返回首页</a>
            </body>
            </html>
            """
            self.wfile.write(response_html.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def start_custom_server(port=8080):
    """启动自定义HTTP服务器"""
    with socketserver.TCPServer(("", port), CustomHTTPRequestHandler) as httpd:
        print(f"自定义HTTP服务器运行在 http://localhost:{port}")
        httpd.serve_forever()

# 3. 使用Flask构建Web应用
from flask import Flask, request, jsonify, render_template_string
import json

app = Flask(__name__)

# Flask HTML模板
HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Flask Web服务器</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 800px; margin: 0 auto; }
        .form-group { margin: 15px 0; }
        input, textarea { width: 100%; padding: 8px; }
        button { background: #4CAF50; color: white; padding: 10px 20px; border: none; }
        .api-result { background: #f5f5f5; padding: 15px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Flask Web服务器示例</h1>

        <h2>用户注册</h2>
        <form method="POST" action="/register">
            <div class="form-group">
                <label>用户名:</label>
                <input type="text" name="username" required>
            </div>
            <div class="form-group">
                <label>邮箱:</label>
                <input type="email" name="email" required>
            </div>
            <button type="submit">注册</button>
        </form>

        <h2>API测试</h2>
        <button onclick="testAPI()">测试API</button>
        <div id="api-result" class="api-result"></div>

        <script>
            async function testAPI() {
                const response = await fetch('/api/users');
                const data = await response.json();
                document.getElementById('api-result').innerHTML =
                    '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
            }
        </script>
    </div>
</body>
</html>
"""

@app.route('/')
def home():
    return render_template_string(HTML_TEMPLATE)

@app.route('/register', methods=['POST'])
def register():
    username = request.form.get('username')
    email = request.form.get('email')

    # 在实际应用中，这里会将数据保存到数据库
    return jsonify({
        'status': 'success',
        'message': f'用户 {username} 注册成功',
        'email': email
    })

@app.route('/api/users')
def get_users():
    # 模拟返回用户数据
    users = [
        {'id': 1, 'name': '张三', 'email': 'zhangsan@example.com'},
        {'id': 2, 'name': '李四', 'email': 'lisi@example.com'},
        {'id': 3, 'name': '王五', 'email': 'wangwu@example.com'}
    ]
    return jsonify(users)

@app.route('/api/echo', methods=['POST'])
def echo():
    data = request.get_json()
    return jsonify({
        'received': data,
        'timestamp': time.time()
    })

def start_flask_server(host='0.0.0.0', port=5000):
    """启动Flask服务器"""
    print(f"Flask服务器运行在 http://{host}:{port}")
    app.run(host=host, port=port, debug=True)

# 主程序
if __name__ == "__main__":
    import sys

    print("选择要启动的服务器类型:")
    print("1. 简单HTTP服务器 (端口 8000)")
    print("2. 自定义HTTP服务器 (端口 8080)")
    print("3. Flask Web服务器 (端口 5000)")

    choice = input("请输入选择 (1-3): ").strip()

    if choice == '1':
        simple_http_server(8000)
    elif choice == '2':
        start_custom_server(8080)
    elif choice == '3':
        start_flask_server('0.0.0.0', 5000)
    else:
        print("无效选择")
```

Flask等现代Web框架提供了**更高级的抽象**，让Web开发变得更加高效。它们处理了路由、模板渲染、请求解析等复杂任务，让开发者可以专注于业务逻辑。

## 08 网络安全：保护你的网络应用

网络编程不仅要关注功能实现，还必须重视安全性。以下是几个关键的安全实践：

```python
# 网络安全示例
import ssl
import socket
import hashlib
import secrets

class SecurityDemo:
    """网络安全示例"""

    @staticmethod
    def ssl_socket_example():
        """SSL加密通信示例"""
        # 创建SSL上下文
        context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        context.load_cert_chain(certfile="server.crt", keyfile="server.key")

        # 创建SSL包装的socket
        server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_socket.bind(('localhost', 8443))
        server_socket.listen(5)

        print("SSL服务器监听在 localhost:8443")

        # 接受连接并进行SSL握手
        client_socket, addr = server_socket.accept()
        ssl_socket = context.wrap_socket(client_socket, server_side=True)

        # 安全通信
        data = ssl_socket.recv(1024)
        print(f"接收到的加密数据: {data}")

        ssl_socket.send(b"安全响应")
        ssl_socket.close()
        server_socket.close()

    @staticmethod
    def input_validation_example():
        """输入验证示例"""
        import re

        def validate_username(username):
            """验证用户名"""
            # 防止SQL注入和XSS攻击
            if len(username) < 3 or len(username) > 20:
                return False, "用户名长度必须在3-20字符之间"

            # 只允许字母、数字和下划线
            if not re.match(r'^[a-zA-Z0-9_]+$', username):
                return False, "用户名只能包含字母、数字和下划线"

            return True, "用户名有效"

        def validate_email(email):
            """验证邮箱"""
            email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            if not re.match(email_pattern, email):
                return False, "邮箱格式无效"
            return True, "邮箱有效"

        # 测试验证函数
        test_cases = [
            ("admin", True),
            ("admin' OR '1'='1", False),  # SQL注入尝试
            ("<script>alert('xss')</script>", False),  # XSS尝试
            ("normal_user_123", True)
        ]

        for username, should_pass in test_cases:
            is_valid, message = validate_username(username)
            print(f"用户名 '{username}': {message}")

    @staticmethod
    def password_security():
        """密码安全示例"""
        import bcrypt
        import hmac

        def hash_password(password):
            """使用bcrypt哈希密码"""
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
            return hashed

        def verify_password(password, hashed):
            """验证密码"""
            return bcrypt.checkpw(password.encode('utf-8'), hashed)

        def generate_csrf_token():
            """生成CSRF令牌"""
            return secrets.token_urlsafe(32)

        # 示例
        password = "MySecurePassword123"
        hashed = hash_password(password)

        print(f"原始密码: {password}")
        print(f"哈希密码: {hashed}")
        print(f"验证结果: {verify_password(password, hashed)}")
        print(f"CSRF令牌: {generate_csrf_token()}")

# 运行安全示例
if __name__ == "__main__":
    demo = SecurityDemo()

    print("=== 输入验证示例 ===")
    demo.input_validation_example()

    print("\n=== 密码安全示例 ===")
    demo.password_security()
```

关键安全原则包括：

1. **始终验证和清理用户输入** - 防止注入攻击
2. **使用HTTPS/SSL加密数据传输** - 防止窃听
3. **安全存储密码** - 使用哈希加盐，不要明文存储
4. **实施适当的身份验证和授权** - 最小权限原则
5. **防范CSRF和XSS攻击** - 使用CSRF令牌，转义HTML输出

---

掌握Python网络编程是一个循序渐进的过程。从理解基础的Socket通信开始，逐步掌握TCP/UDP协议的区别与应用场景，再到使用高级库简化开发流程，最后关注安全性和性能优化。

网络编程的真正价值在于连接，不仅仅是计算机之间的连接，更是人与信息、服务与世界之间的连接。无论是构建简单的聊天工具，还是开发复杂的分布式系统，网络编程技能都是不可或缺的。
