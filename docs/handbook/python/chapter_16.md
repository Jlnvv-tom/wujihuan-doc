# Python进阶与实战：从并发编程到完整项目构建

## 1. 多线程与多进程：解锁Python的并发潜力

在Python的世界里，**GIL（全局解释器锁）** 是个绕不开的话题。正是因为这个设计，Python的多线程并不适合CPU密集型任务，但对于I/O密集型任务却非常有效。而多进程则能真正利用多核CPU的优势。

让我通过一个实际案例来展示它们的区别：

```python
import threading
import multiprocessing
import time
import requests
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from queue import Queue

print("=== Python并发编程实战 ===")

# 1. 多线程基础：爬虫任务示例
class ThreadingDemo:
    """多线程实战：模拟网页爬取"""

    def __init__(self, urls):
        self.urls = urls
        self.results = []
        self.lock = threading.Lock()

    def fetch_url(self, url):
        """模拟网络请求"""
        try:
            # 模拟不同页面的加载时间
            delay = hash(url) % 3 + 1
            time.sleep(delay)

            # 模拟获取页面内容
            content_length = len(url) * 100

            with self.lock:
                self.results.append({
                    'url': url,
                    'status': 'success',
                    'length': content_length,
                    'thread': threading.current_thread().name
                })

            print(f"[Thread] {threading.current_thread().name} 完成 {url}")

        except Exception as e:
            with self.lock:
                self.results.append({
                    'url': url,
                    'status': 'error',
                    'error': str(e),
                    'thread': threading.current_thread().name
                })

    def run_threading(self):
        """使用传统线程方式"""
        print("\n1. 传统线程方式执行")
        start_time = time.time()
        threads = []

        for url in self.urls:
            thread = threading.Thread(target=self.fetch_url, args=(url,))
            threads.append(thread)
            thread.start()

        # 等待所有线程完成
        for thread in threads:
            thread.join()

        elapsed = time.time() - start_time
        print(f"传统线程方式耗时: {elapsed:.2f}秒")
        print(f"成功获取: {len([r for r in self.results if r['status'] == 'success'])}个页面")

        return elapsed

    def run_threadpool(self):
        """使用线程池"""
        print("\n2. 线程池方式执行")
        start_time = time.time()

        with ThreadPoolExecutor(max_workers=5) as executor:
            # 提交所有任务
            futures = [executor.submit(self.fetch_url, url) for url in self.urls]

            # 等待所有任务完成
            for future in futures:
                future.result()

        elapsed = time.time() - start_time
        print(f"线程池方式耗时: {elapsed:.2f}秒")
        return elapsed

# 2. 多进程实战：计算密集型任务
class ProcessingDemo:
    """多进程实战：CPU密集型计算"""

    @staticmethod
    def cpu_intensive_task(n):
        """模拟CPU密集型任务：计算斐波那契数列"""
        def fibonacci(x):
            if x <= 1:
                return x
            return fibonacci(x-1) + fibonacci(x-2)

        start = time.time()
        result = fibonacci(n)
        elapsed = time.time() - start

        return {
            'input': n,
            'result': result,
            'process': multiprocessing.current_process().name,
            'time': elapsed
        }

    def run_processing(self, numbers):
        """使用多进程执行"""
        print("\n3. 多进程方式执行 (CPU密集型)")

        # 单进程基准
        print("单进程基准测试...")
        start_time = time.time()
        single_results = []
        for n in numbers:
            single_results.append(self.cpu_intensive_task(n))
        single_elapsed = time.time() - start_time
        print(f"单进程耗时: {single_elapsed:.2f}秒")

        # 多进程执行
        print("\n多进程执行...")
        start_time = time.time()

        with ProcessPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(self.cpu_intensive_task, n) for n in numbers]
            multi_results = [future.result() for future in futures]

        multi_elapsed = time.time() - start_time
        print(f"多进程耗时: {multi_elapsed:.2f}秒")
        print(f"加速比: {single_elapsed/multi_elapsed:.2f}倍")

        return single_elapsed, multi_elapsed, multi_results

# 3. 生产者-消费者模式
class ProducerConsumerDemo:
    """生产者-消费者模式：线程安全队列"""

    def __init__(self, max_size=10):
        self.queue = Queue(maxsize=max_size)
        self.results = []
        self.producer_done = False

    def producer(self, items):
        """生产者：生成数据"""
        for i, item in enumerate(items):
            # 模拟生产耗时
            time.sleep(0.1)
            self.queue.put(item)
            print(f"[Producer] 生产: {item}")

        # 生产结束信号
        self.queue.put(None)
        print("[Producer] 生产完成")

    def consumer(self, consumer_id):
        """消费者：处理数据"""
        while True:
            item = self.queue.get()

            # 检查结束信号
            if item is None:
                self.queue.put(None)  # 让其他消费者也能结束
                print(f"[Consumer-{consumer_id}] 消费完成")
                break

            # 模拟消费耗时
            time.sleep(0.2)
            result = f"处理后的-{item}"
            self.results.append((consumer_id, result))
            print(f"[Consumer-{consumer_id}] 消费: {item} -> {result}")

            self.queue.task_done()

    def run(self, items, num_consumers=2):
        """运行生产者-消费者模式"""
        print("\n4. 生产者-消费者模式")

        # 创建生产者线程
        producer_thread = threading.Thread(
            target=self.producer,
            args=(items,),
            name="Producer"
        )

        # 创建消费者线程
        consumer_threads = []
        for i in range(num_consumers):
            thread = threading.Thread(
                target=self.consumer,
                args=(i+1,),
                name=f"Consumer-{i+1}"
            )
            consumer_threads.append(thread)

        # 启动所有线程
        start_time = time.time()
        producer_thread.start()
        for thread in consumer_threads:
            thread.start()

        # 等待完成
        producer_thread.join()
        for thread in consumer_threads:
            thread.join()

        elapsed = time.time() - start_time
        print(f"生产者-消费者模式耗时: {elapsed:.2f}秒")
        print(f"处理结果数量: {len(self.results)}")

# 4. 线程/进程通信
class CommunicationDemo:
    """线程和进程间通信示例"""

    @staticmethod
    def thread_communication():
        """线程间通信：使用Queue"""
        print("\n5. 线程间通信")

        def worker(input_queue, output_queue, worker_id):
            while True:
                task = input_queue.get()
                if task is None:
                    input_queue.put(None)  # 让其他worker也能结束
                    break

                # 处理任务
                result = f"Worker-{worker_id}处理:{task*2}"
                output_queue.put(result)
                print(f"[Worker-{worker_id}] {task} -> {result}")
                input_queue.task_done()

        # 创建队列
        task_queue = Queue()
        result_queue = Queue()

        # 提交任务
        for i in range(10):
            task_queue.put(i)
        task_queue.put(None)  # 结束信号

        # 创建工作线程
        workers = []
        for i in range(3):
            worker_thread = threading.Thread(
                target=worker,
                args=(task_queue, result_queue, i+1)
            )
            workers.append(worker_thread)
            worker_thread.start()

        # 收集结果
        results = []
        for _ in range(10):
            results.append(result_queue.get())

        # 等待所有工作线程完成
        for worker_thread in workers:
            worker_thread.join()

        print(f"处理结果: {results[:3]}...")  # 只显示前3个

    @staticmethod
    def process_communication():
        """进程间通信：使用Manager"""
        print("\n6. 进程间通信")

        def process_worker(shared_list, process_id):
            """进程工作函数"""
            import os
            pid = os.getpid()

            # 每个进程添加一些数据
            for i in range(3):
                shared_list.append(f"进程{process_id}(PID:{pid})-数据{i}")

            return process_id, pid

        from multiprocessing import Manager

        # 创建共享数据
        with Manager() as manager:
            shared_list = manager.list()

            # 创建进程池
            with ProcessPoolExecutor(max_workers=3) as executor:
                # 提交任务
                futures = [
                    executor.submit(process_worker, shared_list, i+1)
                    for i in range(3)
                ]

                # 获取结果
                process_results = [future.result() for future in futures]

            print(f"共享数据: {list(shared_list)}")
            print(f"进程结果: {process_results}")

# 运行示例
if __name__ == "__main__":
    # 准备测试数据
    urls = [
        f"https://example.com/page{i}"
        for i in range(1, 11)
    ]

    # 多线程演示
    print("=" * 50)
    print("多线程演示")
    print("=" * 50)

    thread_demo = ThreadingDemo(urls)
    thread_time = thread_demo.run_threading()
    threadpool_time = thread_demo.run_threadpool()

    # 多进程演示
    print("\n" + "=" * 50)
    print("多进程演示")
    print("=" * 50)

    process_demo = ProcessingDemo()
    numbers = [30, 31, 32, 33]  # 计算斐波那契数列
    single_time, multi_time, results = process_demo.run_processing(numbers)

    # 生产者-消费者模式
    print("\n" + "=" * 50)
    print("生产者-消费者模式")
    print("=" * 50)

    pc_demo = ProducerConsumerDemo(max_size=5)
    items = [f"任务-{i}" for i in range(1, 11)]
    pc_demo.run(items, num_consumers=3)

    # 通信演示
    print("\n" + "=" * 50)
    print("进程/线程通信")
    print("=" * 50)

    comm_demo = CommunicationDemo()
    comm_demo.thread_communication()
    comm_demo.process_communication()

    # 性能对比总结
    print("\n" + "=" * 50)
    print("性能对比总结")
    print("=" * 50)

    print(f"多线程 vs 线程池: 线程池快 {thread_time/threadpool_time:.2f}倍")
    print(f"多进程加速比: {single_time/multi_time:.2f}倍")
    print("\n使用建议:")
    print("1. I/O密集型任务 -> 使用多线程或异步")
    print("2. CPU密集型任务 -> 使用多进程")
    print("3. 需要共享状态 -> 多线程 + 锁机制")
    print("4. 需要真正并行 -> 多进程")
```

**关键要点**：

- 多线程适合I/O密集型任务，如网络请求、文件读写
- 多进程适合CPU密集型任务，如数学计算、图像处理
- 使用`concurrent.futures`模块可以简化并发编程
- 注意线程安全和进程间通信的问题

## 2. 异步编程：asyncio让I/O操作飞起来

异步编程是处理高并发I/O操作的利器。Python的`asyncio`库提供了完善的异步编程支持。

```python
import asyncio
import aiohttp
import time
import json
from datetime import datetime
import signal
import sys

print("=== 异步编程深度探索 ===")

# 1. 异步基础：协程与任务
class AsyncBasics:
    """异步编程基础示例"""

    @staticmethod
    async def basic_coroutines():
        """基础协程示例"""
        print("1. 基础协程")

        async def say_hello(name, delay):
            """一个简单的协程"""
            await asyncio.sleep(delay)
            return f"Hello, {name}!"

        # 创建并运行协程
        result = await say_hello("Python", 1)
        print(f"结果: {result}")

        # 创建多个任务
        print("\n运行多个任务:")
        tasks = [
            say_hello("Alice", 1),
            say_hello("Bob", 2),
            say_hello("Charlie", 3)
        ]

        results = await asyncio.gather(*tasks)
        print(f"所有结果: {results}")

    @staticmethod
    async def task_management():
        """任务管理示例"""
        print("\n2. 任务管理")

        async def long_running_task(task_id, duration):
            print(f"任务 {task_id} 开始")
            try:
                await asyncio.sleep(duration)
                print(f"任务 {task_id} 完成")
                return f"任务 {task_id} 结果"
            except asyncio.CancelledError:
                print(f"任务 {task_id} 被取消")
                raise

        # 创建任务
        task1 = asyncio.create_task(long_running_task(1, 5))
        task2 = asyncio.create_task(long_running_task(2, 3))

        # 等待一段时间后取消任务1
        await asyncio.sleep(2)
        task1.cancel()

        try:
            # 等待任务完成（或取消）
            await task1
        except asyncio.CancelledError:
            print("任务1已取消")

        # 等待任务2完成
        result2 = await task2
        print(f"任务2结果: {result2}")

# 2. 异步网络请求
class AsyncHTTPClient:
    """异步HTTP客户端"""

    def __init__(self):
        self.session = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.session.close()

    async def fetch_url(self, url, session):
        """获取单个URL"""
        try:
            async with session.get(url, timeout=10) as response:
                if response.status == 200:
                    text = await response.text()
                    return {
                        'url': url,
                        'status': 'success',
                        'length': len(text),
                        'status_code': response.status
                    }
                else:
                    return {
                        'url': url,
                        'status': 'error',
                        'status_code': response.status
                    }
        except Exception as e:
            return {
                'url': url,
                'status': 'exception',
                'error': str(e)
            }

    async def concurrent_fetch(self, urls, max_concurrent=10):
        """并发获取多个URL"""
        print("\n3. 异步网络请求")

        # 创建信号量控制并发数
        semaphore = asyncio.Semaphore(max_concurrent)

        async def fetch_with_semaphore(url):
            async with semaphore:
                return await self.fetch_url(url, self.session)

        # 创建所有任务
        tasks = [fetch_with_semaphore(url) for url in urls]

        # 显示进度
        print(f"开始获取 {len(urls)} 个URL...")
        start_time = time.time()

        # 分批显示进度
        for i in range(0, len(tasks), max_concurrent):
            batch = tasks[i:i+max_concurrent]
            results = await asyncio.gather(*batch)

            successful = sum(1 for r in results if r['status'] == 'success')
            print(f"批次 {i//max_concurrent + 1}: 成功 {successful}/{len(batch)}")

        # 获取所有结果
        all_results = await asyncio.gather(*tasks)
        elapsed = time.time() - start_time

        # 统计结果
        success_count = sum(1 for r in all_results if r['status'] == 'success')
        print(f"\n完成! 耗时: {elapsed:.2f}秒")
        print(f"成功: {success_count}/{len(urls)}")
        print(f"平均每个请求: {elapsed/len(urls):.3f}秒")

        return all_results

    async def api_rate_limited(self, api_endpoints, requests_per_second=5):
        """速率限制的API调用"""
        print("\n4. 速率限制请求")

        async def call_api(endpoint):
            # 模拟API调用
            await asyncio.sleep(0.5)  # API处理时间
            return {
                'endpoint': endpoint,
                'data': f"来自 {endpoint} 的响应",
                'timestamp': datetime.now().isoformat()
            }

        # 使用信号量进行速率限制
        semaphore = asyncio.Semaphore(requests_per_second)

        async def rate_limited_call(endpoint):
            async with semaphore:
                # 控制请求速率
                await asyncio.sleep(1/requests_per_second)
                return await call_api(endpoint)

        tasks = [rate_limited_call(endpoint) for endpoint in api_endpoints]
        results = await asyncio.gather(*tasks)

        print(f"完成 {len(results)} 个API调用")
        return results

# 3. 异步生产者-消费者模式
class AsyncProducerConsumer:
    """异步生产者-消费者模式"""

    def __init__(self, queue_size=100):
        self.queue = asyncio.Queue(maxsize=queue_size)
        self.producers_done = 0
        self.total_producers = 0

    async def producer(self, producer_id, items):
        """异步生产者"""
        self.total_producers += 1

        for item in items:
            # 模拟生产耗时
            await asyncio.sleep(0.1)

            # 生产项目
            produced_item = f"Producer-{producer_id}:{item}"
            await self.queue.put(produced_item)
            print(f"[Producer-{producer_id}] 生产: {produced_item}")

        self.producers_done += 1
        print(f"[Producer-{producer_id}] 生产完成")

    async def consumer(self, consumer_id):
        """异步消费者"""
        while True:
            try:
                # 设置超时，防止无限等待
                item = await asyncio.wait_for(self.queue.get(), timeout=1.0)

                # 模拟消费耗时
                await asyncio.sleep(0.2)

                consumed_item = f"Consumer-{consumer_id}处理:{item}"
                print(f"[Consumer-{consumer_id}] 消费: {item}")

                self.queue.task_done()

            except asyncio.TimeoutError:
                # 检查是否所有生产者都已完成
                if self.producers_done >= self.total_producers and self.queue.empty():
                    print(f"[Consumer-{consumer_id}] 所有任务完成，退出")
                    break
                continue

    async def run(self, producers_data, num_consumers=3):
        """运行异步生产者-消费者"""
        print("\n5. 异步生产者-消费者模式")

        # 创建消费者任务
        consumer_tasks = [
            asyncio.create_task(self.consumer(i+1))
            for i in range(num_consumers)
        ]

        # 创建生产者任务
        producer_tasks = []
        for i, items in enumerate(producers_data):
            task = asyncio.create_task(self.producer(i+1, items))
            producer_tasks.append(task)

        # 等待所有生产者完成
        await asyncio.gather(*producer_tasks)
        print("所有生产者已完成")

        # 等待队列清空
        await self.queue.join()
        print("队列已清空")

        # 取消消费者任务
        for task in consumer_tasks:
            task.cancel()

        # 等待消费者任务完成取消
        await asyncio.gather(*consumer_tasks, return_exceptions=True)
        print("所有消费者已完成")

# 4. 异步Web服务器
class AsyncWebServer:
    """简易异步Web服务器"""

    @staticmethod
    async def handle_request(reader, writer):
        """处理HTTP请求"""
        # 读取请求
        request = await reader.read(4096)
        request_text = request.decode('utf-8')

        # 解析请求行
        request_lines = request_text.split('\r\n')
        if len(request_lines) > 0:
            request_line = request_lines[0]
            method, path, version = request_line.split(' ')
        else:
            method, path, version = 'GET', '/', 'HTTP/1.1'

        # 获取客户端地址
        addr = writer.get_extra_info('peername')
        print(f"[{datetime.now()}] {addr[0]}:{addr[1]} - {method} {path}")

        # 根据路径返回响应
        if path == '/':
            response_body = "Hello, Async World!"
            content_type = 'text/plain'
        elif path == '/time':
            response_body = datetime.now().isoformat()
            content_type = 'text/plain'
        elif path.startswith('/echo/'):
            response_body = path[6:]  # 移除 '/echo/'
            content_type = 'text/plain'
        elif path == '/json':
            response_body = json.dumps({
                'message': 'Hello from async server!',
                'timestamp': datetime.now().isoformat(),
                'status': 'success'
            })
            content_type = 'application/json'
        else:
            response_body = "404 Not Found"
            content_type = 'text/plain'

        # 构建响应
        response = f"""HTTP/1.1 200 OK
Content-Type: {content_type}; charset=utf-8
Content-Length: {len(response_body)}
Connection: close

{response_body}"""

        # 发送响应
        writer.write(response.encode('utf-8'))
        await writer.drain()
        writer.close()

    @staticmethod
    async def start_server(host='127.0.0.1', port=8888):
        """启动Web服务器"""
        print(f"\n6. 启动异步Web服务器: http://{host}:{port}")

        server = await asyncio.start_server(
            AsyncWebServer.handle_request,
            host,
            port
        )

        addr = server.sockets[0].getsockname()
        print(f'服务器运行在 {addr}')

        async with server:
            await server.serve_forever()

# 5. 异步上下文管理器
class AsyncDatabaseConnection:
    """异步数据库连接示例"""

    def __init__(self, connection_string):
        self.connection_string = connection_string
        self.connected = False

    async def __aenter__(self):
        """进入异步上下文"""
        print(f"连接到数据库: {self.connection_string}")
        await asyncio.sleep(1)  # 模拟连接耗时
        self.connected = True
        print("数据库连接成功")
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """退出异步上下文"""
        if self.connected:
            print("关闭数据库连接")
            await asyncio.sleep(0.5)  # 模拟关闭耗时
            self.connected = False

    async def query(self, sql):
        """执行查询"""
        if not self.connected:
            raise RuntimeError("未连接到数据库")

        print(f"执行查询: {sql}")
        await asyncio.sleep(0.3)  # 模拟查询耗时

        # 模拟返回结果
        return [
            {"id": 1, "name": "Alice", "age": 25},
            {"id": 2, "name": "Bob", "age": 30},
            {"id": 3, "name": "Charlie", "age": 35}
        ]

    async def execute(self, sql):
        """执行更新"""
        if not self.connected:
            raise RuntimeError("未连接到数据库")

        print(f"执行更新: {sql}")
        await asyncio.sleep(0.2)  # 模拟执行耗时
        return {"rows_affected": 1}

# 主异步函数
async def main():
    """主异步函数"""
    print("=" * 50)
    print("异步编程实战")
    print("=" * 50)

    # 1. 基础示例
    basics = AsyncBasics()
    await basics.basic_coroutines()
    await basics.task_management()

    # 2. 异步HTTP客户端
    urls = [
        "https://httpbin.org/get",
        "https://httpbin.org/status/200",
        "https://httpbin.org/status/404",
        "https://httpbin.org/delay/2",
        "https://httpbin.org/headers"
    ] * 2  # 重复一次，总共10个URL

    async with AsyncHTTPClient() as client:
        # 并发请求
        results = await client.concurrent_fetch(urls, max_concurrent=3)

        # API调用（带速率限制）
        api_endpoints = [f"/api/v1/users/{i}" for i in range(1, 11)]
        api_results = await client.api_rate_limited(api_endpoints, requests_per_second=3)

    # 3. 异步生产者-消费者
    pc = AsyncProducerConsumer(queue_size=5)
    producers_data = [
        [f"Item-{i}-{j}" for j in range(1, 4)]
        for i in range(1, 4)
    ]
    await pc.run(producers_data, num_consumers=2)

    # 4. 异步数据库操作
    print("\n7. 异步数据库操作")
    async with AsyncDatabaseConnection("postgresql://user:pass@localhost/db") as db:
        # 查询数据
        users = await db.query("SELECT * FROM users LIMIT 3")
        print(f"查询结果: {users}")

        # 执行更新
        result = await db.execute("UPDATE users SET age = 26 WHERE id = 1")
        print(f"更新结果: {result}")

    print("\n" + "=" * 50)
    print("异步编程示例完成!")
    print("=" * 50)

# 运行异步主函数
if __name__ == "__main__":
    # 设置事件循环策略（Windows需要）
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    # 运行主异步函数
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n程序被用户中断")
```

**异步编程最佳实践**：

1. 使用`async/await`语法，避免直接使用回调
2. 合理控制并发数量，避免资源耗尽
3. 使用`asyncio.gather()`并行执行多个任务
4. 注意异常处理，使用`try...except`包装`await`调用
5. 对于CPU密集型任务，仍然应该使用多进程

## 3. 装饰器与元编程：Python的魔法时刻

装饰器和元编程是Python中最强大的特性之一，它们让代码更加灵活和可重用。

```python
import time
import functools
from datetime import datetime
from typing import Any, Callable, Type, TypeVar
from contextlib import ContextDecorator
import inspect

print("=== Python装饰器与元编程深度探索 ===")

# 1. 基础装饰器
class DecoratorBasics:
    """装饰器基础知识"""

    @staticmethod
    def timer(func: Callable) -> Callable:
        """计时装饰器：测量函数执行时间"""
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            result = func(*args, **kwargs)
            end_time = time.time()
            print(f"函数 {func.__name__} 执行时间: {end_time - start_time:.4f}秒")
            return result
        return wrapper

    @staticmethod
    def debug(func: Callable) -> Callable:
        """调试装饰器：记录函数调用信息"""
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            print(f"[DEBUG] 调用函数: {func.__name__}")
            print(f"[DEBUG] 位置参数: {args}")
            print(f"[DEBUG] 关键字参数: {kwargs}")

            result = func(*args, **kwargs)

            print(f"[DEBUG] 返回值: {result}")
            return result
        return wrapper

    @staticmethod
    def retry(max_attempts: int = 3, delay: float = 1.0):
        """重试装饰器：失败时自动重试"""
        def decorator(func: Callable) -> Callable:
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                for attempt in range(1, max_attempts + 1):
                    try:
                        return func(*args, **kwargs)
                    except Exception as e:
                        if attempt == max_attempts:
                            print(f"函数 {func.__name__} 失败，已达最大重试次数")
                            raise

                        print(f"函数 {func.__name__} 第{attempt}次失败: {e}")
                        print(f"{delay}秒后重试...")
                        time.sleep(delay)
                return None
            return wrapper
        return decorator

# 2. 类装饰器
class ClassDecorators:
    """类装饰器示例"""

    @staticmethod
    def singleton(cls):
        """单例装饰器：确保类只有一个实例"""
        instances = {}

        @functools.wraps(cls)
        def wrapper(*args, **kwargs):
            if cls not in instances:
                instances[cls] = cls(*args, **kwargs)
                print(f"创建 {cls.__name__} 的新实例")
            else:
                print(f"返回 {cls.__name__} 的现有实例")
            return instances[cls]

        return wrapper

    @staticmethod
    def add_methods(methods_dict):
        """动态添加方法装饰器"""
        def decorator(cls):
            for method_name, method_func in methods_dict.items():
                setattr(cls, method_name, method_func)
            return cls
        return decorator

    @staticmethod
    def auto_register(registry=None):
        """自动注册装饰器"""
        if registry is None:
            registry = {}

        def decorator(cls):
            registry[cls.__name__] = cls
            cls.registry = registry
            return cls

        decorator.registry = registry
        return decorator

# 3. 带参数的装饰器
class ParametricDecorators:
    """带参数的装饰器"""

    @staticmethod
    def rate_limited(max_per_second):
        """速率限制装饰器"""
        min_interval = 1.0 / max_per_second

        def decorator(func):
            last_called = [0.0]

            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                elapsed = time.time() - last_called[0]
                left_to_wait = min_interval - elapsed

                if left_to_wait > 0:
                    time.sleep(left_to_wait)

                last_called[0] = time.time()
                return func(*args, **kwargs)

            return wrapper

        return decorator

    @staticmethod
    def validate_input(*validators):
        """输入验证装饰器"""
        def decorator(func):
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                # 验证位置参数
                for i, (arg, validator) in enumerate(zip(args, validators)):
                    if callable(validator) and not validator(arg):
                        raise ValueError(f"参数 {i} 验证失败: {arg}")

                # 这里可以添加关键字参数验证
                return func(*args, **kwargs)

            return wrapper
        return decorator

    @staticmethod
    def cache_results(max_size=128):
        """缓存结果装饰器（带LRU淘汰）"""
        def decorator(func):
            cache = {}
            cache_keys = []

            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                # 创建缓存键
                cache_key = (args, tuple(sorted(kwargs.items())))

                if cache_key in cache:
                    print(f"[CACHE HIT] {func.__name__}{args}")
                    return cache[cache_key]

                print(f"[CACHE MISS] {func.__name__}{args}")
                result = func(*args, **kwargs)

                # 添加到缓存
                cache[cache_key] = result
                cache_keys.append(cache_key)

                # 如果超过最大大小，移除最旧的
                if len(cache) > max_size:
                    oldest_key = cache_keys.pop(0)
                    del cache[oldest_key]

                return result

            wrapper.cache_clear = lambda: (cache.clear(), cache_keys.clear())
            wrapper.cache_info = lambda: {
                'size': len(cache),
                'max_size': max_size,
                'hits': sum(1 for _ in cache_keys)
            }

            return wrapper
        return decorator

# 4. 上下文管理器装饰器
class ContextManagerDecorators:
    """上下文管理器装饰器"""

    class timed_block(ContextDecorator):
        """计时上下文管理器"""
        def __enter__(self):
            self.start_time = time.time()
            print("开始计时...")
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            self.end_time = time.time()
            elapsed = self.end_time - self.start_time
            print(f"代码块执行时间: {elapsed:.4f}秒")
            return False

    @staticmethod
    def as_context_manager(func):
        """将函数转换为上下文管理器"""
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            class FunctionContextManager:
                def __enter__(self):
                    self.result = func(*args, **kwargs)
                    return self.result

                def __exit__(self, exc_type, exc_val, exc_tb):
                    # 可以在这里添加清理代码
                    pass

            return FunctionContextManager()

        return wrapper

# 5. 元类编程
class MetaProgramming:
    """元类编程示例"""

    class SingletonMeta(type):
        """单例元类"""
        _instances = {}

        def __call__(cls, *args, **kwargs):
            if cls not in cls._instances:
                cls._instances[cls] = super().__call__(*args, **kwargs)
            return cls._instances[cls]

    class AutoRegisterMeta(type):
        """自动注册元类"""
        def __init__(cls, name, bases, attrs):
            super().__init__(name, bases, attrs)
            if not hasattr(cls, 'registry'):
                cls.registry = {}
            cls.registry[name] = cls

    class ValidateFieldsMeta(type):
        """字段验证元类"""
        def __new__(mcs, name, bases, attrs):
            # 收集所有带验证器的字段
            validators = {}
            for attr_name, attr_value in attrs.items():
                if hasattr(attr_value, '_validator'):
                    validators[attr_name] = attr_value._validator

            # 创建类
            cls = super().__new__(mcs, name, bases, attrs)
            cls._validators = validators

            # 重写 __setattr__ 以进行验证
            original_setattr = cls.__setattr__

            def new_setattr(self, name, value):
                if name in self._validators:
                    validator = self._validators[name]
                    if not validator(value):
                        raise ValueError(f"字段 {name} 验证失败: {value}")
                original_setattr(self, name, value)

            cls.__setattr__ = new_setattr
            return cls

    @staticmethod
    def validator(func):
        """验证器装饰器（用于字段）"""
        func._validator = True
        return func

# 6. 描述符
class Descriptors:
    """描述符示例"""

    class ValidatedAttribute:
        """验证属性描述符"""
        def __init__(self, validator=None):
            self.validator = validator
            self.data = {}

        def __get__(self, obj, objtype=None):
            if obj is None:
                return self
            return self.data.get(id(obj))

        def __set__(self, obj, value):
            if self.validator and not self.validator(value):
                raise ValueError(f"值验证失败: {value}")
            self.data[id(obj)] = value

        def __delete__(self, obj):
            if id(obj) in self.data:
                del self.data[id(obj)]

    class CachedProperty:
        """缓存属性描述符"""
        def __init__(self, func):
            self.func = func
            self.cache = {}

        def __get__(self, obj, objtype=None):
            if obj is None:
                return self

            cache_key = id(obj)
            if cache_key not in self.cache:
                self.cache[cache_key] = self.func(obj)

            return self.cache[cache_key]

        def __set__(self, obj, value):
            raise AttributeError("缓存属性是只读的")

    class ObservableAttribute:
        """可观察属性描述符"""
        def __init__(self, default=None):
            self.default = default
            self.data = {}
            self.observers = {}

        def __get__(self, obj, objtype=None):
            if obj is None:
                return self
            return self.data.get(id(obj), self.default)

        def __set__(self, obj, value):
            old_value = self.data.get(id(obj))
            self.data[id(obj)] = value

            # 通知观察者
            if id(obj) in self.observers:
                for observer in self.observers[id(obj)]:
                    observer(obj, old_value, value)

        def add_observer(self, obj, observer):
            """添加观察者"""
            if id(obj) not in self.observers:
                self.observers[id(obj)] = []
            self.observers[id(obj)].append(observer)

# 7. 综合示例：使用装饰器和元类构建ORM框架
class MiniORM:
    """迷你ORM框架示例"""

    class Field:
        """字段基类"""
        def __init__(self, field_type, nullable=True, default=None):
            self.field_type = field_type
            self.nullable = nullable
            self.default = default

        def validate(self, value):
            """验证字段值"""
            if value is None:
                return self.nullable

            if not isinstance(value, self.field_type):
                try:
                    # 尝试类型转换
                    value = self.field_type(value)
                except (ValueError, TypeError):
                    return False

            return True

    class IntegerField(Field):
        def __init__(self, nullable=True, default=None):
            super().__init__(int, nullable, default)

    class StringField(Field):
        def __init__(self, max_length=255, nullable=True, default=None):
            super().__init__(str, nullable, default)
            self.max_length = max_length

        def validate(self, value):
            if not super().validate(value):
                return False

            if value is not None and len(value) > self.max_length:
                return False

            return True

    class ModelMeta(type):
        """模型元类"""
        def __new__(mcs, name, bases, attrs):
            # 收集字段
            fields = {}
            for attr_name, attr_value in attrs.items():
                if isinstance(attr_value, MiniORM.Field):
                    fields[attr_name] = attr_value

            # 从基类继承字段
            for base in bases:
                if hasattr(base, '_fields'):
                    fields.update(base._fields)

            # 创建类
            attrs['_fields'] = fields
            attrs['_table_name'] = attrs.get('__tablename__', name.lower())

            cls = super().__new__(mcs, name, bases, attrs)
            return cls

    class Model(metaclass=ModelMeta):
        """模型基类"""

        def __init__(self, **kwargs):
            # 设置字段值
            for field_name, field in self._fields.items():
                value = kwargs.get(field_name, field.default)
                setattr(self, field_name, value)

            # 验证所有字段
            self.validate()

        def validate(self):
            """验证所有字段"""
            errors = []
            for field_name, field in self._fields.items():
                value = getattr(self, field_name, None)
                if not field.validate(value):
                    errors.append(f"字段 {field_name} 验证失败: {value}")

            if errors:
                raise ValueError("; ".join(errors))

        def to_dict(self):
            """转换为字典"""
            result = {}
            for field_name in self._fields:
                result[field_name] = getattr(self, field_name, None)
            return result

        @classmethod
        def from_dict(cls, data):
            """从字典创建实例"""
            return cls(**data)

        def __repr__(self):
            field_values = []
            for field_name in self._fields:
                value = getattr(self, field_name, None)
                field_values.append(f"{field_name}={repr(value)}")

            return f"{self.__class__.__name__}({', '.join(field_values)})"

# 8. 装饰器应用示例
def demonstration():
    """装饰器和元编程演示"""

    # 使用基础装饰器
    @DecoratorBasics.timer
    @DecoratorBasics.debug
    def calculate_sum(n):
        """计算1到n的和"""
        return sum(range(1, n + 1))

    print("1. 基础装饰器示例:")
    result = calculate_sum(100)
    print(f"结果: {result}")

    # 使用重试装饰器
    @DecoratorBasics.retry(max_attempts=3, delay=1)
    def unreliable_function():
        """不可靠的函数（有时会失败）"""
        import random
        if random.random() < 0.7:
            raise ValueError("随机失败!")
        return "成功!"

    print("\n2. 重试装饰器示例:")
    try:
        result = unreliable_function()
        print(f"最终结果: {result}")
    except Exception as e:
        print(f"最终失败: {e}")

    # 使用单例装饰器
    @ClassDecorators.singleton
    class DatabaseConnection:
        def __init__(self, connection_string):
            self.connection_string = connection_string
            print(f"初始化数据库连接: {connection_string}")

    print("\n3. 单例装饰器示例:")
    db1 = DatabaseConnection("mysql://localhost/test")
    db2 = DatabaseConnection("mysql://localhost/test")
    print(f"db1 is db2: {db1 is db2}")

    # 使用速率限制装饰器
    @ParametricDecorators.rate_limited(max_per_second=2)
    def api_call(endpoint):
        """模拟API调用"""
        print(f"调用API: {endpoint}")
        time.sleep(0.1)  # 模拟网络延迟
        return f"响应来自 {endpoint}"

    print("\n4. 速率限制装饰器示例:")
    for i in range(5):
        result = api_call(f"/api/v1/users/{i}")
        print(f"结果: {result}")

    # 使用缓存装饰器
    @ParametricDecorators.cache_results(max_size=3)
    def expensive_computation(n):
        """昂贵的计算"""
        print(f"执行昂贵计算: {n}")
        time.sleep(1)
        return n * n

    print("\n5. 缓存装饰器示例:")
    for i in [1, 2, 3, 1, 2, 4, 5, 1]:
        result = expensive_computation(i)
        print(f"计算结果: {result}")

    print(f"缓存信息: {expensive_computation.cache_info()}")

    # 使用上下文管理器装饰器
    print("\n6. 上下文管理器装饰器示例:")
    with ContextManagerDecorators.timed_block():
        time.sleep(0.5)
        print("在计时块中执行代码")

    # 使用迷你ORM
    print("\n7. 迷你ORM示例:")

    class User(MiniORM.Model):
        __tablename__ = 'users'

        id = MiniORM.IntegerField(nullable=False)
        name = MiniORM.StringField(max_length=100, nullable=False)
        email = MiniORM.StringField(max_length=255)
        age = MiniORM.IntegerField(nullable=True, default=18)

    # 创建用户实例
    user = User(id=1, name="张三", email="zhangsan@example.com", age=25)
    print(f"用户对象: {user}")
    print(f"用户字典: {user.to_dict()}")

    # 验证失败示例
    try:
        invalid_user = User(id="不是数字", name="李四")
    except ValueError as e:
        print(f"验证失败: {e}")

    # 使用描述符
    print("\n8. 描述符示例:")

    class Person:
        age = Descriptors.ValidatedAttribute(
            validator=lambda x: isinstance(x, int) and 0 <= x <= 150
        )

        @Descriptors.CachedProperty
        def birth_year(self):
            """计算出生年份（缓存）"""
            print("计算出生年份...")
            current_year = datetime.now().year
            return current_year - self.age

    person = Person()
    person.age = 30
    print(f"年龄: {person.age}")
    print(f"出生年份: {person.birth_year}")
    print(f"再次获取出生年份: {person.birth_year}")  # 应该使用缓存

    try:
        person.age = 200  # 应该失败
    except ValueError as e:
        print(f"设置无效年龄: {e}")

    # 使用可观察属性
    print("\n9. 可观察属性示例:")

    class ObservableModel:
        value = Descriptors.ObservableAttribute(default=0)

        def __init__(self):
            self.value.add_observer(self, self.on_value_changed)

        def on_value_changed(self, obj, old_value, new_value):
            print(f"值从 {old_value} 变为 {new_value}")

    model = ObservableModel()
    model.value = 10
    model.value = 20

    print("\n" + "=" * 50)
    print("装饰器与元编程演示完成!")
    print("=" * 50)

if __name__ == "__main__":
    demonstration()
```

**装饰器与元编程的核心思想**：

1. 装饰器是修改或增强函数/类的函数
2. 元类是创建类的类，控制类的创建行为
3. 描述符是管理属性访问的协议
4. 合理使用这些特性可以让代码更加优雅和强大

## 4. 单元测试与测试驱动开发

测试是保证代码质量的重要手段。Python的`unittest`和`pytest`框架提供了完善的测试支持。

```python
import unittest
import pytest
import tempfile
import json
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from io import StringIO
import sys

print("=== Python测试实战指南 ===")

# 1. 待测试的代码
class Calculator:
    """计算器类（用于测试示例）"""

    def add(self, a, b):
        """加法"""
        if not (isinstance(a, (int, float)) and isinstance(b, (int, float))):
            raise TypeError("参数必须是数字")
        return a + b

    def subtract(self, a, b):
        """减法"""
        return a - b

    def multiply(self, a, b):
        """乘法"""
        return a * b

    def divide(self, a, b):
        """除法"""
        if b == 0:
            raise ValueError("除数不能为零")
        return a / b

    def factorial(self, n):
        """阶乘"""
        if not isinstance(n, int):
            raise TypeError("参数必须是整数")
        if n < 0:
            raise ValueError("参数不能为负数")

        result = 1
        for i in range(2, n + 1):
            result *= i
        return result

class UserManager:
    """用户管理器（用于测试示例）"""

    def __init__(self):
        self.users = {}
        self.next_id = 1

    def add_user(self, username, email):
        """添加用户"""
        if not username or not email:
            raise ValueError("用户名和邮箱不能为空")

        if '@' not in email:
            raise ValueError("邮箱格式不正确")

        user_id = self.next_id
        self.users[user_id] = {
            'id': user_id,
            'username': username,
            'email': email
        }
        self.next_id += 1
        return user_id

    def get_user(self, user_id):
        """获取用户"""
        return self.users.get(user_id)

    def delete_user(self, user_id):
        """删除用户"""
        if user_id not in self.users:
            raise KeyError(f"用户ID {user_id} 不存在")
        return self.users.pop(user_id)

    def get_all_users(self):
        """获取所有用户"""
        return list(self.users.values())

class FileProcessor:
    """文件处理器（用于测试示例）"""

    def __init__(self):
        self.processed_files = []

    def process_file(self, filepath):
        """处理文件"""
        path = Path(filepath)

        if not path.exists():
            raise FileNotFoundError(f"文件不存在: {filepath}")

        if not path.is_file():
            raise ValueError(f"不是文件: {filepath}")

        # 模拟文件处理
        content = path.read_text(encoding='utf-8')
        processed = content.upper()

        # 保存处理结果
        result_file = path.with_suffix('.processed.txt')
        result_file.write_text(processed, encoding='utf-8')

        self.processed_files.append(str(result_file))
        return processed

    def get_processed_count(self):
        """获取已处理的文件数量"""
        return len(self.processed_files)

# 2. 使用unittest的测试
class TestCalculator(unittest.TestCase):
    """计算器测试类"""

    def setUp(self):
        """每个测试方法前运行"""
        self.calc = Calculator()
        print(f"开始测试 {self._testMethodName}")

    def tearDown(self):
        """每个测试方法后运行"""
        print(f"完成测试 {self._testMethodName}")

    def test_add_integers(self):
        """测试整数加法"""
        result = self.calc.add(2, 3)
        self.assertEqual(result, 5)

    def test_add_floats(self):
        """测试浮点数加法"""
        result = self.calc.add(2.5, 3.1)
        self.assertAlmostEqual(result, 5.6, places=1)

    def test_add_invalid_type(self):
        """测试无效类型加法"""
        with self.assertRaises(TypeError):
            self.calc.add("2", 3)

    def test_divide_by_zero(self):
        """测试除零错误"""
        with self.assertRaises(ValueError):
            self.calc.divide(10, 0)

    def test_factorial(self):
        """测试阶乘"""
        test_cases = [
            (0, 1),   # 0的阶乘是1
            (1, 1),   # 1的阶乘是1
            (5, 120), # 5的阶乘是120
        ]

        for n, expected in test_cases:
            with self.subTest(n=n):
                result = self.calc.factorial(n)
                self.assertEqual(result, expected)

    def test_factorial_negative(self):
        """测试负数的阶乘"""
        with self.assertRaises(ValueError):
            self.calc.factorial(-1)

class TestUserManager(unittest.TestCase):
    """用户管理器测试类"""

    def setUp(self):
        self.manager = UserManager()

    def test_add_user_success(self):
        """测试成功添加用户"""
        user_id = self.manager.add_user("testuser", "test@example.com")
        self.assertEqual(user_id, 1)

        user = self.manager.get_user(user_id)
        self.assertEqual(user['username'], "testuser")
        self.assertEqual(user['email'], "test@example.com")

    def test_add_user_empty_username(self):
        """测试空用户名"""
        with self.assertRaises(ValueError):
            self.manager.add_user("", "test@example.com")

    def test_add_user_invalid_email(self):
        """测试无效邮箱"""
        with self.assertRaises(ValueError):
            self.manager.add_user("testuser", "invalid-email")

    def test_get_nonexistent_user(self):
        """测试获取不存在的用户"""
        user = self.manager.get_user(999)
        self.assertIsNone(user)

    def test_delete_user(self):
        """测试删除用户"""
        user_id = self.manager.add_user("testuser", "test@example.com")
        self.assertEqual(len(self.manager.get_all_users()), 1)

        deleted = self.manager.delete_user(user_id)
        self.assertEqual(deleted['username'], "testuser")
        self.assertEqual(len(self.manager.get_all_users()), 0)

    def test_delete_nonexistent_user(self):
        """测试删除不存在的用户"""
        with self.assertRaises(KeyError):
            self.manager.delete_user(999)

# 3. 使用pytest的测试
class TestFileProcessor:
    """文件处理器测试类（pytest风格）"""

    def test_process_file_success(self, tmp_path):
        """测试成功处理文件"""
        # 创建临时文件
        test_file = tmp_path / "test.txt"
        test_file.write_text("Hello, World!", encoding='utf-8')

        processor = FileProcessor()
        result = processor.process_file(str(test_file))

        # 检查处理结果
        assert result == "HELLO, WORLD!"
        assert processor.get_processed_count() == 1

        # 检查输出文件
        output_file = tmp_path / "test.processed.txt"
        assert output_file.exists()
        assert output_file.read_text(encoding='utf-8') == "HELLO, WORLD!"

    def test_process_nonexistent_file(self):
        """测试处理不存在的文件"""
        processor = FileProcessor()

        with pytest.raises(FileNotFoundError):
            processor.process_file("/nonexistent/file.txt")

    def test_process_directory(self, tmp_path):
        """测试处理目录（应该失败）"""
        processor = FileProcessor()

        with pytest.raises(ValueError, match="不是文件"):
            processor.process_file(str(tmp_path))

# 4. Mock和Patch测试
class TestWithMocks:
    """使用Mock的测试"""

    def test_mock_example(self):
        """Mock基础示例"""
        # 创建Mock对象
        mock_obj = Mock()

        # 设置返回值
        mock_obj.some_method.return_value = 42
        mock_obj.another_method.return_value = "Hello"

        # 调用Mock方法
        assert mock_obj.some_method() == 42
        assert mock_obj.another_method() == "Hello"

        # 检查调用情况
        mock_obj.some_method.assert_called_once()
        mock_obj.another_method.assert_called_once()

    def test_mock_with_side_effect(self):
        """使用side_effect的Mock"""
        mock_obj = Mock()

        # side_effect可以是函数或异常
        mock_obj.get_value.side_effect = [1, 2, 3, ValueError("No more values")]

        assert mock_obj.get_value() == 1
        assert mock_obj.get_value() == 2
        assert mock_obj.get_value() == 3

        with pytest.raises(ValueError):
            mock_obj.get_value()

    @patch('builtins.print')
    def test_patch_builtin(self, mock_print):
        """Patch内置函数"""
        print("Hello, World!")
        print("Another message")

        # 检查print是否被调用
        assert mock_print.call_count == 2
        mock_print.assert_any_call("Hello, World!")
        mock_print.assert_any_call("Another message")

    @patch('os.path.exists')
    def test_patch_os_function(self, mock_exists):
        """Patch OS函数"""
        # 设置返回值
        mock_exists.return_value = False

        from os.path import exists
        assert not exists("/some/path")
        mock_exists.assert_called_once_with("/some/path")

# 5. 测试夹具（Fixtures）
class TestWithFixtures:
    """使用Fixture的测试"""

    @pytest.fixture
    def sample_data(self):
        """提供测试数据"""
        return {
            'numbers': [1, 2, 3, 4, 5],
            'strings': ['a', 'b', 'c'],
            'nested': {'key': 'value'}
        }

    @pytest.fixture
    def calculator(self):
        """提供计算器实例"""
        return Calculator()

    @pytest.fixture
    def temp_file(self, tmp_path):
        """提供临时文件"""
        file_path = tmp_path / "test_data.txt"
        file_path.write_text("Test content\nSecond line", encoding='utf-8')
        return file_path

    def test_with_sample_data(self, sample_data):
        """使用sample_data fixture"""
        assert len(sample_data['numbers']) == 5
        assert sample_data['nested']['key'] == 'value'

    def test_calculator_with_fixture(self, calculator):
        """使用calculator fixture"""
        assert calculator.add(2, 3) == 5
        assert calculator.multiply(4, 5) == 20

    def test_file_processing(self, temp_file):
        """使用temp_file fixture"""
        processor = FileProcessor()
        result = processor.process_file(str(temp_file))
        assert "TEST CONTENT" in result

# 6. 参数化测试
class TestParameterized:
    """参数化测试"""

    @pytest.mark.parametrize("a,b,expected", [
        (1, 2, 3),
        (0, 0, 0),
        (-1, 1, 0),
        (2.5, 3.5, 6.0),
    ])
    def test_addition(self, a, b, expected):
        """参数化加法测试"""
        calc = Calculator()
        result = calc.add(a, b)
        assert result == expected

    @pytest.mark.parametrize("n,expected", [
        (0, 1),
        (1, 1),
        (5, 120),
        (10, 3628800),
    ])
    def test_factorial(self, n, expected):
        """参数化阶乘测试"""
        calc = Calculator()
        result = calc.factorial(n)
        assert result == expected

    @pytest.mark.parametrize("username,email,should_succeed", [
        ("user1", "user1@example.com", True),
        ("", "user@example.com", False),  # 空用户名
        ("user2", "invalid-email", False),  # 无效邮箱
        ("user3", "", False),  # 空邮箱
    ])
    def test_add_user_validation(self, username, email, should_succeed):
        """参数化用户验证测试"""
        manager = UserManager()

        if should_succeed:
            user_id = manager.add_user(username, email)
            assert user_id == 1
        else:
            with pytest.raises(ValueError):
                manager.add_user(username, email)

# 7. 测试覆盖率和性能测试
class TestCoverageAndPerformance:
    """测试覆盖率和性能"""

    def test_performance_basic(self):
        """基础性能测试"""
        import time

        calc = Calculator()

        # 测试阶乘性能
        start_time = time.perf_counter()
        for i in range(1000):
            calc.factorial(10)
        elapsed = time.perf_counter() - start_time

        # 断言执行时间在合理范围内
        assert elapsed < 1.0, f"性能测试失败: 耗时 {elapsed:.2f}秒"
        print(f"性能测试通过: 耗时 {elapsed:.4f}秒")

    def test_memory_usage(self):
        """内存使用测试"""
        import tracemalloc

        tracemalloc.start()

        # 执行可能占用内存的操作
        manager = UserManager()
        for i in range(1000):
            manager.add_user(f"user{i}", f"user{i}@example.com")

        # 获取内存快照
        snapshot = tracemalloc.take_snapshot()
        top_stats = snapshot.statistics('lineno')

        print("\n内存使用情况:")
        for stat in top_stats[:5]:  # 显示前5个
            print(stat)

        tracemalloc.stop()

        # 简单的内存检查
        assert len(manager.get_all_users()) == 1000

# 8. 集成测试和端到端测试
class TestIntegration:
    """集成测试"""

    def test_calculator_integration(self):
        """计算器集成测试"""
        calc = Calculator()

        # 组合多个操作
        result = calc.add(10, 20)
        result = calc.multiply(result, 2)
        result = calc.divide(result, 3)

        assert result == 20.0

    def test_user_manager_integration(self):
        """用户管理器集成测试"""
        manager = UserManager()

        # 添加多个用户
        user_ids = []
        for i in range(3):
            user_id = manager.add_user(f"user{i}", f"user{i}@example.com")
            user_ids.append(user_id)

        # 验证用户
        assert len(manager.get_all_users()) == 3

        # 删除一个用户
        manager.delete_user(user_ids[1])
        assert len(manager.get_all_users()) == 2

        # 验证剩余用户
        remaining_users = manager.get_all_users()
        remaining_usernames = [u['username'] for u in remaining_users]
        assert "user0" in remaining_usernames
        assert "user2" in remaining_usernames
        assert "user1" not in remaining_usernames

# 9. 测试运行器
def run_tests():
    """运行测试套件"""
    print("=" * 50)
    print("运行测试套件")
    print("=" * 50)

    # 创建测试加载器
    loader = unittest.TestLoader()

    # 创建测试套件
    suite = unittest.TestSuite()

    # 添加测试类
    suite.addTests(loader.loadTestsFromTestCase(TestCalculator))
    suite.addTests(loader.loadTestsFromTestCase(TestUserManager))

    # 创建测试运行器
    runner = unittest.TextTestRunner(verbosity=2)

    # 运行测试
    print("\n运行unittest测试:")
    result = runner.run(suite)

    # 统计结果
    print(f"\n测试结果:")
    print(f"运行测试: {result.testsRun}")
    print(f"成功: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"失败: {len(result.failures)}")
    print(f"错误: {len(result.errors)}")

    # 运行pytest测试
    print("\n" + "=" * 50)
    print("运行pytest测试")
    print("=" * 50)

    # 注意：在实际环境中，pytest应该通过命令行运行
    # 这里只是演示如何组织测试代码

    return result

# 10. 测试驱动开发（TDD）示例
class TDDBankAccount:
    """TDD示例：银行账户"""

    def __init__(self, initial_balance=0):
        self.balance = initial_balance
        self.transactions = []

    def deposit(self, amount):
        """存款"""
        if amount <= 0:
            raise ValueError("存款金额必须大于0")

        self.balance += amount
        self.transactions.append(('deposit', amount))
        return self.balance

    def withdraw(self, amount):
        """取款"""
        if amount <= 0:
            raise ValueError("取款金额必须大于0")

        if amount > self.balance:
            raise ValueError("余额不足")

        self.balance -= amount
        self.transactions.append(('withdraw', amount))
        return self.balance

    def get_balance(self):
        """获取余额"""
        return self.balance

    def get_transaction_history(self):
        """获取交易历史"""
        return self.transactions.copy()

class TestBankAccountTDD(unittest.TestCase):
    """银行账户TDD测试"""

    def test_initial_balance(self):
        """测试初始余额"""
        account = TDDBankAccount(100)
        self.assertEqual(account.get_balance(), 100)

    def test_deposit_positive(self):
        """测试存款正数"""
        account = TDDBankAccount()
        new_balance = account.deposit(50)
        self.assertEqual(new_balance, 50)
        self.assertEqual(account.get_balance(), 50)

    def test_deposit_zero(self):
        """测试存款零"""
        account = TDDBankAccount()
        with self.assertRaises(ValueError):
            account.deposit(0)

    def test_deposit_negative(self):
        """测试存款负数"""
        account = TDDBankAccount()
        with self.assertRaises(ValueError):
            account.deposit(-10)

    def test_withdraw_success(self):
        """测试成功取款"""
        account = TDDBankAccount(100)
        new_balance = account.withdraw(30)
        self.assertEqual(new_balance, 70)

    def test_withdraw_insufficient_funds(self):
        """测试余额不足"""
        account = TDDBankAccount(50)
        with self.assertRaises(ValueError):
            account.withdraw(100)

    def test_transaction_history(self):
        """测试交易历史"""
        account = TDDBankAccount(100)
        account.deposit(50)
        account.withdraw(30)

        history = account.get_transaction_history()
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0], ('deposit', 50))
        self.assertEqual(history[1], ('withdraw', 30))

# 主函数
if __name__ == "__main__":
    print("=" * 50)
    print("Python测试实战指南")
    print("=" * 50)

    # 运行TDD示例测试
    print("\nTDD示例测试:")
    tdd_suite = unittest.TestLoader().loadTestsFromTestCase(TestBankAccountTDD)
    tdd_runner = unittest.TextTestRunner(verbosity=1)
    tdd_result = tdd_runner.run(tdd_suite)

    # 运行其他测试
    print("\n运行完整测试套件:")
    result = run_tests()

    print("\n" + "=" * 50)
    print("测试完成!")
    print("=" * 50)

    # 退出码（用于CI/CD）
    exit_code = 0 if result.wasSuccessful() else 1
    print(f"\n退出码: {exit_code}")
```

**测试最佳实践**：

1. 遵循测试金字塔：单元测试 > 集成测试 > 端到端测试
2. 测试应该独立、快速、可重复
3. 使用Mock和Patch来隔离外部依赖
4. 测试覆盖率不是唯一目标，测试质量更重要
5. 实践测试驱动开发（TDD）可以提高代码质量

## 5. 代码打包与分发

将Python代码打包成可以分发的格式是每个开发者都需要掌握的技能。

````python
#!/usr/bin/env python3
"""
Python包打包与分发完整示例

项目结构:
my_package/
├── setup.py           # 打包配置文件
├── pyproject.toml     # 现代打包配置
├── README.md          # 项目说明
├── LICENSE            # 许可证
├── requirements.txt   # 依赖列表
├── tests/             # 测试目录
├── docs/              # 文档目录
└── src/               # 源代码目录
    └── my_package/    # 包目录
        ├── __init__.py
        ├── core.py
        ├── utils.py
        └── cli.py
"""

import os
import sys
import shutil
from pathlib import Path
from setuptools import setup, find_packages
from setuptools.command.build_py import build_py
from setuptools.command.sdist import sdist
import subprocess

print("=== Python包打包与分发实战 ===")

# 1. 创建项目目录结构
def create_project_structure():
    """创建标准的Python项目结构"""
    project_name = "my_package"

    print(f"1. 创建项目结构: {project_name}")

    # 基础目录
    directories = [
        f"{project_name}/src/{project_name}",
        f"{project_name}/tests",
        f"{project_name}/docs",
        f"{project_name}/examples",
    ]

    for directory in directories:
        os.makedirs(directory, exist_ok=True)
        print(f"  创建目录: {directory}")

    # 创建文件
    files_to_create = {
        # 包文件
        f"{project_name}/src/{project_name}/__init__.py": '''"""
My Package - 一个演示用的Python包

功能:
1. 核心功能
2. 工具函数
3. CLI接口
"""

__version__ = "0.1.0"
__author__ = "Your Name"
__email__ = "your.email@example.com"

from .core import CoreClass, main_function
from .utils import helper_function, DataProcessor
from .cli import main as cli_main

__all__ = [
    "CoreClass",
    "main_function",
    "helper_function",
    "DataProcessor",
    "cli_main",
]
''',

        f"{project_name}/src/{project_name}/core.py": '''"""
核心模块
"""

import logging
from typing import Any, List, Dict, Optional
from dataclasses import dataclass

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class CoreClass:
    """核心类示例"""

    name: str
    value: int = 0
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}

    def process(self) -> str:
        """处理数据"""
        logger.info(f"处理 {self.name}")
        result = f"Processed {self.name} with value {self.value}"

        if self.metadata:
            result += f" and metadata {self.metadata}"

        return result

    def update_value(self, increment: int = 1) -> None:
        """更新值"""
        self.value += increment
        logger.debug(f"更新 {self.name} 的值为 {self.value}")

def main_function(input_data: List[str]) -> List[str]:
    """
    主处理函数

    Args:
        input_data: 输入字符串列表

    Returns:
        处理后的字符串列表

    Raises:
        ValueError: 如果输入为空

    Example:
        >>> main_function(["a", "b"])
        ['A', 'B']
    """
    if not input_data:
        raise ValueError("输入数据不能为空")

    logger.info(f"处理 {len(input_data)} 条数据")
    return [item.upper() for item in input_data]

if __name__ == "__main__":
    # 测试代码
    obj = CoreClass("test", 42, {"key": "value"})
    print(obj.process())
''',

        f"{project_name}/src/{project_name}/utils.py": '''"""
工具模块
"""

import json
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Union, Any
import csv

def helper_function(data: Union[str, list, dict]) -> str:
    """
    辅助函数示例

    Args:
        data: 输入数据

    Returns:
        处理后的字符串
    """
    if isinstance(data, str):
        return data.upper()
    elif isinstance(data, list):
        return ', '.join(map(str, data))
    elif isinstance(data, dict):
        return json.dumps(data, ensure_ascii=False)
    else:
        return str(data)

class DataProcessor:
    """数据处理类"""

    def __init__(self, data_dir: Union[str, Path] = "."):
        self.data_dir = Path(data_dir)
        self.processed_count = 0

    def load_json(self, filename: str) -> dict:
        """加载JSON文件"""
        filepath = self.data_dir / filename

        if not filepath.exists():
            raise FileNotFoundError(f"文件不存在: {filepath}")

        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)

    def save_json(self, data: dict, filename: str) -> None:
        """保存JSON文件"""
        filepath = self.data_dir / filename

        # 确保目录存在
        filepath.parent.mkdir(parents=True, exist_ok=True)

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        self.processed_count += 1

    def calculate_hash(self, data: Any) -> str:
        """计算数据的哈希值"""
        if isinstance(data, dict):
            data_str = json.dumps(data, sort_keys=True)
        else:
            data_str = str(data)

        return hashlib.sha256(data_str.encode()).hexdigest()

    def process_csv(self, input_file: str, output_file: str) -> None:
        """处理CSV文件"""
        input_path = self.data_dir / input_file
        output_path = self.data_dir / output_file

        with open(input_path, 'r', encoding='utf-8') as f_in, \
             open(output_path, 'w', encoding='utf-8', newline='') as f_out:

            reader = csv.DictReader(f_in)
            fieldnames = reader.fieldnames

            if fieldnames:
                writer = csv.DictWriter(f_out, fieldnames=fieldnames)
                writer.writeheader()

                for row in reader:
                    # 处理每一行数据
                    processed_row = {
                        key: value.upper() if isinstance(value, str) else value
                        for key, value in row.items()
                    }
                    writer.writerow(processed_row)

        self.processed_count += 1

def format_timestamp(timestamp: datetime = None) -> str:
    """格式化时间戳"""
    if timestamp is None:
        timestamp = datetime.now()
    return timestamp.strftime("%Y-%m-%d %H:%M:%S")
''',

        f"{project_name}/src/{project_name}/cli.py": '''"""
命令行接口
"""

import argparse
import sys
from typing import List
from .core import main_function, CoreClass
from .utils import DataProcessor, helper_function

def create_parser() -> argparse.ArgumentParser:
    """创建命令行解析器"""
    parser = argparse.ArgumentParser(
        description="My Package - 命令行工具",
        epilog="示例: python -m my_package.cli process --input data.txt"
    )

    # 子命令
    subparsers = parser.add_subparsers(dest='command', help='可用的命令')

    # process 命令
    process_parser = subparsers.add_parser('process', help='处理数据')
    process_parser.add_argument(
        '--input', '-i',
        nargs='+',
        required=True,
        help='输入数据'
    )
    process_parser.add_argument(
        '--output', '-o',
        help='输出文件（可选）'
    )

    # info 命令
    info_parser = subparsers.add_parser('info', help='显示包信息')
    info_parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='显示详细信息'
    )

    # utils 命令
    utils_parser = subparsers.add_parser('utils', help='工具函数')
    utils_parser.add_argument(
        'function',
        choices=['hash', 'format'],
        help='要使用的工具函数'
    )
    utils_parser.add_argument(
        'data',
        help='要处理的数据'
    )

    return parser

def handle_process(args) -> int:
    """处理process命令"""
    print(f"处理 {len(args.input)} 个输入项")

    try:
        result = main_function(args.input)

        for item in result:
            print(f"结果: {item}")

        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                for item in result:
                    f.write(f"{item}\\n")
            print(f"结果已保存到: {args.output}")

        return 0

    except Exception as e:
        print(f"处理失败: {e}", file=sys.stderr)
        return 1

def handle_info(args) -> int:
    """处理info命令"""
    from . import __version__, __author__

    print(f"My Package 版本: {__version__}")
    print(f"作者: {__author__}")

    if args.verbose:
        print("\\n详细功能:")
        print("1. 核心功能: CoreClass, main_function")
        print("2. 工具函数: helper_function, DataProcessor")
        print("3. 命令行接口: 当前正在使用")

    return 0

def handle_utils(args) -> int:
    """处理utils命令"""
    from .utils import DataProcessor

    processor = DataProcessor()

    if args.function == 'hash':
        hash_value = processor.calculate_hash(args.data)
        print(f"哈希值: {hash_value}")

    elif args.function == 'format':
        formatted = helper_function(args.data)
        print(f"格式化结果: {formatted}")

    return 0

def main(argv: List[str] = None) -> int:
    """主函数"""
    if argv is None:
        argv = sys.argv[1:]

    parser = create_parser()
    args = parser.parse_args(argv)

    if not args.command:
        parser.print_help()
        return 1

    # 根据命令调用对应的处理函数
    command_handlers = {
        'process': handle_process,
        'info': handle_info,
        'utils': handle_utils,
    }

    handler = command_handlers.get(args.command)
    if handler:
        return handler(args)
    else:
        print(f"未知命令: {args.command}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
''',

        # 测试文件
        f"{project_name}/tests/__init__.py": "",

        f"{project_name}/tests/test_core.py": '''"""
核心模块测试
"""

import pytest
from my_package.core import CoreClass, main_function

def test_core_class():
    """测试CoreClass"""
    obj = CoreClass("test", 42, {"key": "value"})
    assert obj.name == "test"
    assert obj.value == 42
    assert obj.metadata == {"key": "value"}

    result = obj.process()
    assert "test" in result
    assert "42" in result

    obj.update_value(10)
    assert obj.value == 52

def test_main_function():
    """测试main_function"""
    result = main_function(["a", "b", "c"])
    assert result == ["A", "B", "C"]

    # 测试空输入
    with pytest.raises(ValueError):
        main_function([])

def test_main_function_empty_string():
    """测试空字符串输入"""
    result = main_function(["", "hello"])
    assert result == ["", "HELLO"]

if __name__ == "__main__":
    pytest.main([__file__])
''',

        f"{project_name}/tests/test_utils.py": '''"""
工具模块测试
"""

import json
import tempfile
from pathlib import Path
from my_package.utils import helper_function, DataProcessor, format_timestamp

def test_helper_function():
    """测试helper_function"""
    # 测试字符串
    assert helper_function("hello") == "HELLO"

    # 测试列表
    assert helper_function([1, 2, 3]) == "1, 2, 3"

    # 测试字典
    data = {"key": "value"}
    result = helper_function(data)
    assert "key" in result
    assert "value" in result

def test_data_processor():
    """测试DataProcessor"""
    with tempfile.TemporaryDirectory() as tmpdir:
        processor = DataProcessor(tmpdir)

        # 测试保存和加载JSON
        test_data = {"test": "data", "number": 42}
        processor.save_json(test_data, "test.json")

        loaded_data = processor.load_json("test.json")
        assert loaded_data == test_data

        # 测试哈希计算
        hash_value = processor.calculate_hash(test_data)
        assert len(hash_value) == 64  # SHA256哈希长度

        # 测试计数器
        assert processor.processed_count == 1

def test_format_timestamp():
    """测试format_timestamp"""
    from datetime import datetime

    timestamp = format_timestamp()
    assert len(timestamp) == 19  # YYYY-MM-DD HH:MM:SS

    # 测试指定时间戳
    dt = datetime(2023, 1, 1, 12, 0, 0)
    formatted = format_timestamp(dt)
    assert formatted == "2023-01-01 12:00:00"
''',

        # 配置文件
        f"{project_name}/setup.py": '''"""
打包配置文件 (传统方式)
"""

from setuptools import setup, find_packages
import os

# 读取README
with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

# 读取requirements
def read_requirements():
    with open("requirements.txt", "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip() and not line.startswith("#")]

setup(
    name="my-package",
    version="0.1.0",
    author="Your Name",
    author_email="your.email@example.com",
    description="一个演示用的Python包",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/my-package",

    # 包发现
    package_dir={"": "src"},
    packages=find_packages(where="src"),

    # 分类器
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],

    # Python版本要求
    python_requires=">=3.7",

    # 依赖
    install_requires=read_requirements(),

    # 可选依赖
    extras_require={
        "dev": [
            "pytest>=6.0",
            "pytest-cov>=2.0",
            "black>=21.0",
            "flake8>=4.0",
            "mypy>=0.900",
        ],
        "docs": [
            "sphinx>=4.0",
            "sphinx-rtd-theme>=1.0",
        ],
    },

    # 入口点
    entry_points={
        "console_scripts": [
            "my-package=my_package.cli:main",
        ],
    },

    # 包含数据文件
    include_package_data=True,
    package_data={
        "my_package": ["data/*.json", "config/*.yaml"],
    },
)
''',

        f"{project_name}/pyproject.toml": '''[build-system]
requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "my-package"
version = "0.1.0"
authors = [
    {name = "Your Name", email = "your.email@example.com"}
]
description = "一个演示用的Python包"
readme = "README.md"
license = {text = "MIT"}
requires-python = ">=3.7"
classifiers = [
    "Development Status :: 3 - Alpha",
    "Intended Audience :: Developers",
    "License :: OSI Approved :: MIT License",
    "Operating System :: OS Independent",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3.7",
    "Programming Language :: Python :: 3.8",
    "Programming Language :: Python :: 3.9",
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
]

dependencies = [
    "requests>=2.25.0",
    "click>=8.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=6.0",
    "pytest-cov>=2.0",
    "black>=21.0",
    "flake8>=4.0",
    "mypy>=0.900",
]
docs = [
    "sphinx>=4.0",
    "sphinx-rtd-theme>=1.0",
]

[project.scripts]
my-package = "my_package.cli:main"

[project.urls]
Homepage = "https://github.com/yourusername/my-package"
BugTracker = "https://github.com/yourusername/my-package/issues"
Documentation = "https://my-package.readthedocs.io/"

[tool.setuptools]
package-dir = {"" = "src"}
packages = {find = {where = ["src"]}}

[tool.setuptools.package-data]
"my_package" = ["data/*.json", "config/*.yaml"]

[tool.black]
line-length = 88
target-version = ['py37']

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = "-v --tb=short"

[tool.mypy]
python_version = "3.7"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
''',

        f"{project_name}/README.md": '''# My Package

一个演示用的Python包，展示如何正确打包和分发Python项目。

## 功能特性

- ✅ 核心功能模块
- ✅ 工具函数集合
- ✅ 命令行接口
- ✅ 完整测试套件
- ✅ 类型注解支持

## 安装

### 从PyPI安装（如果已发布）

```bash
pip install my-package
````

### 从源码安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/my-package.git
cd my-package

# 安装（开发模式）
pip install -e .

# 安装（带开发依赖）
pip install -e ".[dev]"
```

## 使用示例

### Python代码中使用

```python
from my_package import CoreClass, main_function

# 使用核心类
obj = CoreClass("example", 42)
print(obj.process())

# 使用主函数
result = main_function(["hello", "world"])
print(result)  # ['HELLO', 'WORLD']
```

### 命令行中使用

```bash
# 显示帮助
my-package --help

# 处理数据
my-package process --input hello world

# 显示包信息
my-package info --verbose
```

## 开发指南

### 设置开发环境

```bash
# 1. 克隆仓库
git clone https://github.com/yourusername/my-package.git
cd my-package

# 2. 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\\Scripts\\activate  # Windows

# 3. 安装开发依赖
pip install -e ".[dev]"

# 4. 安装预提交钩子
pre-commit install
```

### 运行测试

```bash
# 运行所有测试
pytest

# 运行特定测试
pytest tests/test_core.py

# 带覆盖率的测试
pytest --cov=my_package tests/

# 运行类型检查
mypy src/
```

### 代码质量检查

```bash
# 代码格式化
black src/ tests/

# 代码检查
flake8 src/ tests/

# 类型检查
mypy src/
```

## 项目结构

```
my-package/
├── src/
│   └── my_package/     # 源代码
│       ├── __init__.py
│       ├── core.py     # 核心功能
│       ├── utils.py    # 工具函数
│       └── cli.py      # 命令行接口
├── tests/              # 测试代码
├── docs/               # 文档
├── examples/           # 示例代码
├── pyproject.toml      # 项目配置
├── setup.py           # 打包配置（兼容）
├── README.md          # 本文档
├── LICENSE            # MIT许可证
└── requirements.txt   # 依赖列表
```

## 贡献指南

1. Fork本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启Pull Request

## 许可证

本项目基于MIT许可证 - 查看[LICENSE](LICENSE)文件了解详情。
''',

        f"{project_name}/requirements.txt": '''# 核心依赖

requests>=2.25.0
click>=8.0.0

# 开发依赖 (可选)

# pytest>=6.0

# black>=21.0

# flake8>=4.0

# mypy>=0.900

''',

        f"{project_name}/LICENSE": '''MIT License

Copyright (c) 2023 Your Name

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF THE SOFTWARE OR ANY KIND, EITHER EXPRESS OR IMPLIED.
''',

        f"{project_name}/.gitignore": '''# Byte-compiled / optimized / DLL files

**pycache**/
_.py[cod]
_$py.class

# C extensions

\*.so

# Distribution / packaging

.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
share/python-wheels/
_.egg-info/
.installed.cfg
_.egg
MANIFEST

# PyInstaller

_.manifest
_.spec

# Installer logs

pip-log.txt
pip-delete-this-directory.txt

# Unit test / coverage reports

htmlcov/
.tox/
.nox/
.coverage
.coverage._
.cache
nosetests.xml
coverage.xml
_.cover
\*.py,cover
.hypothesis/
.pytest_cache/
cover/

# Translations

_.mo
_.pot

# Django stuff:

\*.log
local_settings.py
db.sqlite3
db.sqlite3-journal

# Flask stuff:

instance/
.webassets-cache

# Scrapy stuff:

.scrapy

# Sphinx documentation

docs/\_build/

# PyBuilder

.pybuilder/
target/

# Jupyter Notebook

.ipynb_checkpoints

# IPython

profile_default/
ipython_config.py

# pyenv

.python-version

# pipenv

Pipfile.lock

# poetry

poetry.lock

# pdm

.pdm.toml

# PEP 582; used by e.g. github.com/David-OConnor/pyflow

**pypackages**/

# Celery stuff

celerybeat-schedule
celerybeat.pid

# SageMath parsed files

\*.sage.py

# Environments

.env
.venv
env/
venv/
ENV/
env.bak/
venv.bak/

# Spyder project settings

.spyderproject
.spyproject

# Rope project settings

.ropeproject

# mkdocs documentation

/site

# mypy

.mypy_cache/
.dmypy.json
dmypy.json

# Pyre type checker

.pyre/

# pytype static type analyzer

.pytype/

# Cython debug symbols

cython_debug/

# IDE

.vscode/
.idea/
_.swp
_.swo

# OS

.DS_Store
Thumbs.db
''',

        f"{project_name}/.github/workflows/test.yml": '''name: Tests

on:
push:
branches: [ main, develop ]
pull_request:
branches: [ main ]

jobs:
test:
runs-on: ubuntu-latest
strategy:
matrix:
python-version: ["3.7", "3.8", "3.9", "3.10", "3.11"]

    steps:
    - uses: actions/checkout@v3

    - name: Set up Python ${{ matrix.python-version }}
      uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}

    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -e ".[dev]"

    - name: Run tests
      run: |
        pytest --cov=my_package --cov-report=xml

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml
        fail_ci_if_error: true

    - name: Run type checking
      run: |
        mypy src/

    - name: Run linting
      run: |
        flake8 src/ tests/

''',
}

    for filepath, content in files_to_create.items():
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  创建文件: {filepath}")

    print(f"\n项目结构创建完成!")
    return project_name

# 2. 打包命令示例

def demonstrate_packaging_commands(project_name):
"""演示打包命令"""
print(f"\n2. 打包命令演示")

    commands = [
        ("构建源代码分发版", f"cd {project_name} && python setup.py sdist"),
        ("构建wheel分发版", f"cd {project_name} && python setup.py bdist_wheel"),
        ("使用build工具构建", f"cd {project_name} && python -m build"),
        ("安装包（开发模式）", f"cd {project_name} && pip install -e ."),
        ("安装包（带开发依赖）", f"cd {project_name} && pip install -e \".[dev]\""),
        ("运行测试", f"cd {project_name} && python -m pytest"),
        ("检查打包", f"cd {project_name} && twine check dist/*"),
    ]

    for description, command in commands:
        print(f"\n{description}:")
        print(f"  $ {command}")

        # 在实际环境中，可以执行这些命令
        # 这里只显示命令，不实际执行

    # 显示打包文件结构
    print(f"\n打包后的目录结构:")
    print(f"{project_name}/")
    print(f"├── dist/                    # 分发文件")
    print(f"│   ├── my-package-0.1.0.tar.gz")
    print(f"│   └── my_package-0.1.0-py3-none-any.whl")
    print(f"├── build/                   # 构建临时文件")
    print(f"├── my_package.egg-info/    # egg信息")
    print(f"└── ...")

# 3. 上传到PyPI

def demonstrate_pypi_upload():
"""演示PyPI上传"""
print(f"\n3. PyPI上传流程")

    steps = [
        ("创建PyPI账户", "访问 https://pypi.org/account/register/"),
        ("安装上传工具", "pip install twine"),
        ("构建分发文件", "python -m build"),
        ("检查分发文件", "twine check dist/*"),
        ("上传到TestPyPI", "twine upload --repository-url https://test.pypi.org/legacy/ dist/*"),
        ("从TestPyPI安装测试", "pip install --index-url https://test.pypi.org/simple/ my-package"),
        ("上传到PyPI", "twine upload dist/*"),
    ]

    for i, (description, command) in enumerate(steps, 1):
        print(f"{i}. {description}")
        print(f"   {command}")

    print(f"\n重要注意事项:")
    print(f"• 每次上传需要更新版本号")
    print(f"• 使用TestPyPI进行测试")
    print(f"• 保护API令牌安全")
    print(f"• 遵循语义化版本控制")

# 4. 现代打包工具

def demonstrate_modern_tools():
"""演示现代打包工具"""
print(f"\n4. 现代打包工具")

    tools = {
        "Poetry": {
            "description": "依赖管理和打包工具",
            "features": [
                "依赖解析和锁定",
                "虚拟环境管理",
                "打包和发布",
                "脚本管理"
            ],
            "安装": "pip install poetry",
            "初始化": "poetry new my-project",
            "添加依赖": "poetry add requests",
            "安装依赖": "poetry install",
            "打包": "poetry build",
            "发布": "poetry publish",
        },
        "PDM": {
            "description": "新一代Python包管理器",
            "features": [
                "PEP 582支持",
                "快速依赖解析",
                "多版本Python支持",
                "包管理"
            ],
            "安装": "pip install pdm",
            "初始化": "pdm init",
            "添加依赖": "pdm add requests",
            "安装依赖": "pdm install",
            "打包": "pdm build",
        },
        "Hatch": {
            "description": "现代、可扩展的项目管理器",
            "features": [
                "统一的项目管理",
                "环境管理",
                "版本管理",
                "发布工作流"
            ],
            "安装": "pip install hatch",
            "初始化": "hatch new my-project",
            "创建环境": "hatch env create",
            "运行测试": "hatch run test",
            "打包": "hatch build",
        },
    }

    for tool_name, info in tools.items():
        print(f"\n{tool_name}: {info['description']}")
        print(f"特性: {', '.join(info['features'])}")
        print(f"常用命令:")

        for cmd_name, cmd in info.items():
            if cmd_name not in ['description', 'features']:
                print(f"  {cmd_name}: {cmd}")

# 5. 打包最佳实践

def packaging_best_practices():
"""打包最佳实践"""
print(f"\n5. 打包最佳实践")

    practices = [
        ("使用src/布局", "将源代码放在src/目录下，避免导入问题"),
        ("使用pyproject.toml", "现代打包标准，替代setup.py"),
        ("指定Python版本", "在requires-python中指定支持的Python版本"),
        ("添加分类器", "帮助用户找到你的包"),
        ("包含许可证", "明确许可证信息"),
        ("编写README", "提供清晰的使用文档"),
        ("添加类型注解", "提高代码可维护性"),
        ("编写测试", "确保代码质量"),
        ("使用CI/CD", "自动化测试和发布"),
        ("版本管理", "遵循语义化版本控制"),
        ("发布到PyPI前测试", "使用TestPyPI进行测试"),
        ("维护变更日志", "记录版本变化"),
    ]

    for i, (practice, description) in enumerate(practices, 1):
        print(f"{i:2d}. {practice:20s} - {description}")

# 主函数

def main():
"""主函数"""
print("=" _ 50)
print("Python包打包与分发实战")
print("=" _ 50)

    # 创建项目结构
    project_name = create_project_structure()

    # 演示打包命令
    demonstrate_packaging_commands(project_name)

    # 演示PyPI上传
    demonstrate_pypi_upload()

    # 演示现代工具
    demonstrate_modern_tools()

    # 打包最佳实践
    packaging_best_practices()

    print("\n" + "=" * 50)
    print("打包指南完成!")
    print(f"项目已创建在: {project_name}/")
    print("=" * 50)

    # 清理（可选）
    response = input("\n是否清理创建的项目文件？(y/N): ")
    if response.lower() == 'y':
        shutil.rmtree(project_name)
        print(f"已删除目录: {project_name}")

if **name** == "**main**":
main()

````

**打包与分发关键点**：
1. 使用`pyproject.toml`作为现代打包标准
2. 遵循`src/`目录布局
3. 包含完整的元数据（版本、依赖、分类器等）
4. 提供清晰的文档和示例
5. 使用CI/CD自动化测试和发布流程

## 6. 性能优化技巧

Python代码性能优化是一个系统工程，需要从多个角度考虑。

```python
import time
import sys
import tracemalloc
from functools import lru_cache
from collections import defaultdict, Counter
import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import List, Dict, Set
import cProfile
import pstats
import io

print("=== Python性能优化实战 ===")

# 1. 性能测量工具
class PerformanceMetrics:
    """性能测量工具类"""

    @staticmethod
    def time_function(func, *args, **kwargs):
        """测量函数执行时间"""
        start_time = time.perf_counter()
        result = func(*args, **kwargs)
        end_time = time.perf_counter()

        elapsed = end_time - start_time
        print(f"函数 {func.__name__} 执行时间: {elapsed:.6f}秒")
        return result, elapsed

    @staticmethod
    def measure_memory(func, *args, **kwargs):
        """测量内存使用"""
        tracemalloc.start()

        result = func(*args, **kwargs)

        snapshot = tracemalloc.take_snapshot()
        top_stats = snapshot.statistics('lineno')

        print(f"\n函数 {func.__name__} 内存使用:")
        for stat in top_stats[:3]:
            print(f"  {stat}")

        tracemalloc.stop()
        return result

    @staticmethod
    def profile_function(func, *args, **kwargs):
        """使用cProfile分析函数性能"""
        print(f"\n性能分析: {func.__name__}")

        profiler = cProfile.Profile()
        profiler.enable()

        result = func(*args, **kwargs)

        profiler.disable()

        # 输出分析结果
        stream = io.StringIO()
        stats = pstats.Stats(profiler, stream=stream)
        stats.sort_stats('cumulative')
        stats.print_stats(10)  # 显示前10行

        print(stream.getvalue())
        return result

# 2. 数据结构优化
class DataStructureOptimization:
    """数据结构优化示例"""

    @staticmethod
    def list_vs_generator():
        """列表 vs 生成器性能比较"""
        print("1. 列表 vs 生成器")

        # 列表推导式（立即计算）
        start = time.perf_counter()
        list_result = [x * 2 for x in range(1000000)]
        list_time = time.perf_counter() - start
        print(f"列表推导式: {list_time:.6f}秒, 内存: {sys.getsizeof(list_result)/1024/1024:.2f}MB")

        # 生成器表达式（惰性计算）
        start = time.perf_counter()
        gen_result = (x * 2 for x in range(1000000))
        gen_time = time.perf_counter() - start
        print(f"生成器表达式: {gen_time:.6f}秒, 内存: {sys.getsizeof(gen_result)}字节")

        # 使用生成器
        start = time.perf_counter()
        sum_gen = sum(x * 2 for x in range(1000000))
        gen_sum_time = time.perf_counter() - start
        print(f"生成器求和: {gen_sum_time:.6f}秒")

        return list_time, gen_sum_time

    @staticmethod
    def dict_optimizations():
        """字典优化技巧"""
        print("\n2. 字典优化")

        # 普通字典
        normal_dict = {}
        start = time.perf_counter()
        for i in range(10000):
            normal_dict[f"key_{i}"] = i
        normal_time = time.perf_counter() - start

        # 使用dict comprehension
        start = time.perf_counter()
        dict_comp = {f"key_{i}": i for i in range(10000)}
        dict_comp_time = time.perf_counter() - start

        # 使用defaultdict
        from collections import defaultdict
        start = time.perf_counter()
        default_dict = defaultdict(int)
        for i in range(10000):
            default_dict[f"key_{i}"] = i
        default_time = time.perf_counter() - start

        print(f"普通字典: {normal_time:.6f}秒")
        print(f"字典推导式: {dict_comp_time:.6f}秒")
        print(f"defaultdict: {default_time:.6f}秒")

        # 字典查找优化
        test_dict = {str(i): i for i in range(100000)}

        # 直接访问
        start = time.perf_counter()
        for i in range(10000):
            if str(i) in test_dict:
                _ = test_dict[str(i)]
        direct_time = time.perf_counter() - start

        # 使用get方法
        start = time.perf_counter()
        for i in range(10000):
            _ = test_dict.get(str(i))
        get_time = time.perf_counter() - start

        print(f"\n字典访问优化:")
        print(f"直接访问: {direct_time:.6f}秒")
        print(f"get方法: {get_time:.6f}秒")

        return normal_time, dict_comp_time

    @staticmethod
    def string_concatenation():
        """字符串拼接优化"""
        print("\n3. 字符串拼接优化")

        # 使用+拼接
        start = time.perf_counter()
        result = ""
        for i in range(10000):
            result += str(i)
        concat_time = time.perf_counter() - start

        # 使用列表join
        start = time.perf_counter()
        parts = []
        for i in range(10000):
            parts.append(str(i))
        result = "".join(parts)
        join_time = time.perf_counter() - start

        # 使用生成器表达式
        start = time.perf_counter()
        result = "".join(str(i) for i in range(10000))
        gen_join_time = time.perf_counter() - start

        print(f"使用+拼接: {concat_time:.6f}秒")
        print(f"使用列表join: {join_time:.6f}秒")
        print(f"使用生成器join: {gen_join_time:.6f}秒")

        return concat_time, join_time

# 3. 算法优化
class AlgorithmOptimization:
    """算法优化示例"""

    @staticmethod
    def fibonacci_optimizations():
        """斐波那契数列优化"""
        print("4. 斐波那契数列优化")

        # 递归版本（慢）
        def fib_recursive(n):
            if n <= 1:
                return n
            return fib_recursive(n-1) + fib_recursive(n-2)

        # 记忆化递归
        def fib_memo(n, memo=None):
            if memo is None:
                memo = {}
            if n in memo:
                return memo[n]
            if n <= 1:
                return n

            memo[n] = fib_memo(n-1, memo) + fib_memo(n-2, memo)
            return memo[n]

        # 动态规划
        def fib_dp(n):
            if n <= 1:
                return n

            dp = [0] * (n + 1)
            dp[1] = 1

            for i in range(2, n + 1):
                dp[i] = dp[i-1] + dp[i-2]

            return dp[n]

        # 空间优化动态规划
        def fib_dp_optimized(n):
            if n <= 1:
                return n

            prev, curr = 0, 1
            for _ in range(2, n + 1):
                prev, curr = curr, prev + curr

            return curr

        # 测量性能
        n = 35

        print(f"计算 fib({n}):")

        # 递归版本（很慢，只测小的n）
        if n <= 30:
            start = time.perf_counter()
            result = fib_recursive(n)
            rec_time = time.perf_counter() - start
            print(f"递归: {rec_time:.6f}秒, 结果: {result}")
        else:
            print(f"递归: 跳过（太慢）")

        # 记忆化递归
        start = time.perf_counter()
        result = fib_memo(n)
        memo_time = time.perf_counter() - start
        print(f"记忆化递归: {memo_time:.6f}秒, 结果: {result}")

        # 动态规划
        start = time.perf_counter()
        result = fib_dp(n)
        dp_time = time.perf_counter() - start
        print(f"动态规划: {dp_time:.6f}秒, 结果: {result}")

        # 优化动态规划
        start = time.perf_counter()
        result = fib_dp_optimized(n)
        dp_opt_time = time.perf_counter() - start
        print(f"优化动态规划: {dp_opt_time:.6f}秒, 结果: {result}")

        return memo_time, dp_opt_time

    @staticmethod
    def search_algorithms():
        """搜索算法优化"""
        print("\n5. 搜索算法优化")

        # 创建测试数据
        data = list(range(1000000))
        target = 999999

        # 线性搜索
        def linear_search(arr, target):
            for i, val in enumerate(arr):
                if val == target:
                    return i
            return -1

        # 二分搜索（有序数据）
        def binary_search(arr, target):
            left, right = 0, len(arr) - 1

            while left <= right:
                mid = (left + right) // 2
                if arr[mid] == target:
                    return mid
                elif arr[mid] < target:
                    left = mid + 1
                else:
                    right = mid - 1

            return -1

        # 使用内置index
        def builtin_index(arr, target):
            try:
                return arr.index(target)
            except ValueError:
                return -1

        # 测量性能
        print("线性搜索:")
        start = time.perf_counter()
        result = linear_search(data, target)
        linear_time = time.perf_counter() - start
        print(f"  时间: {linear_time:.6f}秒, 位置: {result}")

        print("二分搜索:")
        start = time.perf_counter()
        result = binary_search(data, target)
        binary_time = time.perf_counter() - start
        print(f"  时间: {binary_time:.6f}秒, 位置: {result}")

        print("内置index:")
        start = time.perf_counter()
        result = builtin_index(data, target)
        builtin_time = time.perf_counter() - start
        print(f"  时间: {builtin_time:.6f}秒, 位置: {result}")

        return linear_time, binary_time

    @staticmethod
    def sorting_algorithms():
        """排序算法优化"""
        print("\n6. 排序算法优化")

        import random

        # 创建测试数据
        data = [random.randint(1, 1000000) for _ in range(10000)]

        # 冒泡排序
        def bubble_sort(arr):
            n = len(arr)
            for i in range(n):
                for j in range(0, n-i-1):
                    if arr[j] > arr[j+1]:
                        arr[j], arr[j+1] = arr[j+1], arr[j]
            return arr

        # 快速排序
        def quick_sort(arr):
            if len(arr) <= 1:
                return arr

            pivot = arr[len(arr) // 2]
            left = [x for x in arr if x < pivot]
            middle = [x for x in arr if x == pivot]
            right = [x for x in arr if x > pivot]

            return quick_sort(left) + middle + quick_sort(right)

        # 内置排序
        def builtin_sort(arr):
            return sorted(arr)

        # 测量性能（使用小数据，因为冒泡排序很慢）
        test_data = data[:1000].copy()

        print("排序1000个随机数:")

        # 冒泡排序
        bubble_data = test_data.copy()
        start = time.perf_counter()
        result = bubble_sort(bubble_data)
        bubble_time = time.perf_counter() - start
        print(f"冒泡排序: {bubble_time:.6f}秒")

        # 快速排序
        quick_data = test_data.copy()
        start = time.perf_counter()
        result = quick_sort(quick_data)
        quick_time = time.perf_counter() - start
        print(f"快速排序: {quick_time:.6f}秒")

        # 内置排序
        builtin_data = test_data.copy()
        start = time.perf_counter()
        result = builtin_sort(builtin_data)
        builtin_time = time.perf_counter() - start
        print(f"内置排序: {builtin_time:.6f}秒")

        return bubble_time, builtin_time

# 4. 缓存与记忆化
class CachingOptimization:
    """缓存优化"""

    @staticmethod
    def lru_cache_example():
        """LRU缓存示例"""
        print("7. LRU缓存优化")

        # 没有缓存的函数
        def expensive_computation(n):
            time.sleep(0.001)  # 模拟耗时计算
            return n * n

        # 使用lru_cache
        from functools import lru_cache

        @lru_cache(maxsize=128)
        def cached_computation(n):
            time.sleep(0.001)  # 模拟耗时计算
            return n * n

        # 测试重复计算
        test_values = [1, 2, 3, 1, 2, 3, 4, 5, 1, 2]

        # 无缓存
        start = time.perf_counter()
        for n in test_values:
            expensive_computation(n)
        no_cache_time = time.perf_counter() - start

        # 有缓存
        start = time.perf_counter()
        for n in test_values:
            cached_computation(n)
        cache_time = time.perf_counter() - start

        print(f"无缓存: {no_cache_time:.6f}秒")
        print(f"有缓存: {cache_time:.6f}秒")
        print(f"加速: {no_cache_time/cache_time:.1f}倍")

        # 缓存信息
        print(f"缓存信息: {cached_computation.cache_info()}")

        return no_cache_time, cache_time

    @staticmethod
    def custom_cache():
        """自定义缓存实现"""
        print("\n8. 自定义缓存")

        class CustomCache:
            def __init__(self, max_size=100):
                self.max_size = max_size
                self.cache = {}
                self.access_order = []

            def get(self, key):
                if key in self.cache:
                    # 更新访问顺序
                    self.access_order.remove(key)
                    self.access_order.append(key)
                    return self.cache[key]
                return None

            def set(self, key, value):
                if len(self.cache) >= self.max_size:
                    # 移除最久未使用的
                    oldest = self.access_order.pop(0)
                    del self.cache[oldest]

                self.cache[key] = value
                self.access_order.append(key)

            def clear(self):
                self.cache.clear()
                self.access_order.clear()

        # 使用自定义缓存
        cache = CustomCache(max_size=5)

        for i in range(10):
            cache.set(f"key_{i}", f"value_{i}")

        print(f"缓存大小: {len(cache.cache)}")
        print(f"缓存内容: {list(cache.cache.keys())}")

        # 测试访问
        print(f"访问 key_5: {cache.get('key_5')}")
        print(f"访问 key_6: {cache.get('key_6')}")
        print(f"访问 key_0: {cache.get('key_0')}")  # 应该不在缓存中

        return cache

# 5. NumPy和Pandas优化
class NumericalOptimization:
    """数值计算优化"""

    @staticmethod
    def numpy_vs_python():
        """NumPy vs 纯Python性能比较"""
        print("9. NumPy vs 纯Python")

        size = 1000000

        # 纯Python列表
        python_list = list(range(size))

        start = time.perf_counter()
        python_result = [x * 2 for x in python_list]
        python_time = time.perf_counter() - start

        # NumPy数组
        numpy_array = np.arange(size)

        start = time.perf_counter()
        numpy_result = numpy_array * 2
        numpy_time = time.perf_counter() - start

        print(f"纯Python: {python_time:.6f}秒")
        print(f"NumPy: {numpy_time:.6f}秒")
        print(f"NumPy比Python快 {python_time/numpy_time:.1f}倍")

        # 内存使用
        python_memory = sys.getsizeof(python_list) + sys.getsizeof(python_result)
        numpy_memory = numpy_array.nbytes + numpy_result.nbytes

        print(f"纯Python内存: {python_memory/1024/1024:.2f}MB")
        print(f"NumPy内存: {numpy_memory/1024/1024:.2f}MB")

        return python_time, numpy_time

    @staticmethod
    def pandas_optimizations():
        """Pandas优化技巧"""
        print("\n10. Pandas优化")

        # 创建测试数据
        n_rows = 100000
        df = pd.DataFrame({
            'A': np.random.randn(n_rows),
            'B': np.random.randn(n_rows),
            'C': np.random.randint(0, 100, n_rows),
            'D': np.random.choice(['X', 'Y', 'Z'], n_rows)
        })

        # 方法1: 使用循环（慢）
        def method_loop(df):
            result = []
            for i in range(len(df)):
                if df.loc[i, 'A'] > 0 and df.loc[i, 'B'] > 0:
                    result.append(df.loc[i, 'C'] * 2)
                else:
                    result.append(df.loc[i, 'C'])
            return result

        # 方法2: 使用apply（中等）
        def method_apply(df):
            def process_row(row):
                if row['A'] > 0 and row['B'] > 0:
                    return row['C'] * 2
                return row['C']
            return df.apply(process_row, axis=1)

        # 方法3: 使用向量化操作（快）
        def method_vectorized(df):
            mask = (df['A'] > 0) & (df['B'] > 0)
            return np.where(mask, df['C'] * 2, df['C'])

        # 测试性能
        print(f"数据形状: {df.shape}")

        # 只测试前10000行，因为循环很慢
        test_df = df.head(10000).copy()

        print("循环方法:")
        start = time.perf_counter()
        result1 = method_loop(test_df)
        time1 = time.perf_counter() - start
        print(f"  时间: {time1:.6f}秒")

        print("apply方法:")
        start = time.perf_counter()
        result2 = method_apply(test_df)
        time2 = time.perf_counter() - start
        print(f"  时间: {time2:.6f}秒")

        print("向量化方法:")
        start = time.perf_counter()
        result3 = method_vectorized(test_df)
        time3 = time.perf_counter() - start
        print(f"  时间: {time3:.6f}秒")

        print(f"\n向量化比循环快 {time1/time3:.1f}倍")
        print(f"向量化比apply快 {time2/time3:.1f}倍")

        return time1, time3

# 6. 并发与并行优化
class ConcurrencyOptimization:
    """并发优化"""

    @staticmethod
    def thread_vs_process():
        """线程 vs 进程性能比较"""
        print("11. 线程 vs 进程")

        import concurrent.futures

        def cpu_bound_task(n):
            """CPU密集型任务"""
            result = 0
            for i in range(n):
                result += i * i
            return result

        def io_bound_task(n):
            """I/O密集型任务"""
            time.sleep(0.001)  # 模拟I/O等待
            return n * n

        n_tasks = 100
        cpu_n = 10000
        io_n = 100

        # 单线程基准
        print("CPU密集型任务:")
        start = time.perf_counter()
        for i in range(n_tasks):
            cpu_bound_task(cpu_n)
        single_cpu_time = time.perf_counter() - start
        print(f"  单线程: {single_cpu_time:.6f}秒")

        # 多线程
        start = time.perf_counter()
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(cpu_bound_task, cpu_n) for _ in range(n_tasks)]
            for future in concurrent.futures.as_completed(futures):
                future.result()
        thread_cpu_time = time.perf_counter() - start
        print(f"  多线程: {thread_cpu_time:.6f}秒")

        # 多进程
        start = time.perf_counter()
        with concurrent.futures.ProcessPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(cpu_bound_task, cpu_n) for _ in range(n_tasks)]
            for future in concurrent.futures.as_completed(futures):
                future.result()
        process_cpu_time = time.perf_counter() - start
        print(f"  多进程: {process_cpu_time:.6f}秒")

        print(f"\nI/O密集型任务:")
        # 单线程基准
        start = time.perf_counter()
        for i in range(n_tasks):
            io_bound_task(io_n)
        single_io_time = time.perf_counter() - start
        print(f"  单线程: {single_io_time:.6f}秒")

        # 多线程
        start = time.perf_counter()
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(io_bound_task, io_n) for _ in range(n_tasks)]
            for future in concurrent.futures.as_completed(futures):
                future.result()
        thread_io_time = time.perf_counter() - start
        print(f"  多线程: {thread_io_time:.6f}秒")

        # 多进程
        start = time.perf_counter()
        with concurrent.futures.ProcessPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(io_bound_task, io_n) for _ in range(n_tasks)]
            for future in concurrent.futures.as_completed(futures):
                future.result()
        process_io_time = time.perf_counter() - start
        print(f"  多进程: {process_io_time:.6f}秒")

        return thread_cpu_time, process_cpu_time, thread_io_time, process_io_time

# 主函数
def main():
    """主函数"""
    print("=" * 50)
    print("Python性能优化实战")
    print("=" * 50)

    metrics = PerformanceMetrics()

    # 1. 数据结构优化
    print("\n" + "=" * 50)
    print("数据结构优化")
    print("=" * 50)

    ds_opt = DataStructureOptimization()
    list_vs_gen = ds_opt.list_vs_generator()
    dict_opt = ds_opt.dict_optimizations()
    str_opt = ds_opt.string_concatenation()

    # 2. 算法优化
    print("\n" + "=" * 50)
    print("算法优化")
    print("=" * 50)

    algo_opt = AlgorithmOptimization()
    fib_opt = algo_opt.fibonacci_optimizations()
    search_opt = algo_opt.search_algorithms()
    sort_opt = algo_opt.sorting_algorithms()

    # 3. 缓存优化
    print("\n" + "=" * 50)
    print("缓存优化")
    print("=" * 50)

    cache_opt = CachingOptimization()
    cache_result = cache_opt.lru_cache_example()
    custom_cache = cache_opt.custom_cache()

    # 4. 数值计算优化
    print("\n" + "=" * 50)
    print("数值计算优化")
    print("=" * 50)

    num_opt = NumericalOptimization()
    numpy_vs_py = num_opt.numpy_vs_python()
    pandas_opt = num_opt.pandas_optimizations()

    # 5. 并发优化
    print("\n" + "=" * 50)
    print("并发优化")
    print("=" * 50)

    conc_opt = ConcurrencyOptimization()
    conc_results = conc_opt.thread_vs_process()

    # 性能优化总结
    print("\n" + "=" * 50)
    print("性能优化总结")
    print("=" * 50)

    print("关键优化策略:")
    print("1. 使用合适的数据结构")
    print("   - 大量数据时使用生成器而非列表")
    print("   - 频繁查找使用字典而非列表")
    print("   - 字符串拼接使用join而非+")

    print("\n2. 选择高效算法")
    print("   - 避免指数级复杂度的算法")
    print("   - 使用二分搜索替代线性搜索")
    print("   - 使用内置排序算法")

    print("\n3. 合理使用缓存")
    print("   - 使用@lru_cache缓存计算结果")
    print("   - 对于重复计算的结果进行缓存")

    print("\n4. 利用NumPy和Pandas")
    print("   - 数值计算使用NumPy数组")
    print("   - Pandas操作使用向量化而非循环")

    print("\n5. 并发与并行")
    print("   - I/O密集型使用多线程")
    print("   - CPU密集型使用多进程")
    print("   - 使用concurrent.futures简化并发编程")

    print("\n6. 其他技巧")
    print("   - 使用局部变量而非全局变量")
    print("   - 避免不必要的对象创建")
    print("   - 使用内置函数和库")
    print("   - 适当使用C扩展或Cython")

    print("\n" + "=" * 50)
    print("性能优化实战完成!")
    print("=" * 50)

if __name__ == "__main__":
    main()
````

**性能优化黄金法则**：

1. **先测量，后优化**：使用性能分析工具找到真正的瓶颈
2. **选择正确的数据结构和算法**：这是最大的性能提升来源
3. **利用Python的高级特性**：生成器、装饰器、内置函数等
4. **适当使用外部库**：NumPy、Pandas等库有高度优化的C实现
5. **考虑并发和并行**：合理使用多线程和多进程

## 7. 开源项目贡献指南

参与开源项目是提升技能的最佳途径之一。以下是完整的贡献指南。

````python
#!/usr/bin/env python3
"""
开源项目贡献指南

本脚本演示如何参与开源项目贡献，
包括fork、clone、开发、测试、提交PR的全过程。
"""

import os
import subprocess
import sys
from pathlib import Path
import json
import textwrap

print("=== 开源项目贡献完全指南 ===")

class OpenSourceContributor:
    """开源贡献者工具类"""

    def __init__(self):
        self.project_info = {
            "name": "example-project",
            "github_url": "https://github.com/username/example-project",
            "description": "一个示例开源项目"
        }

    def show_contribution_workflow(self):
        """展示贡献工作流"""
        print("1. 开源贡献完整工作流")
        print("=" * 50)

        workflow = [
            ("1. 寻找项目", "在GitHub等平台寻找感兴趣的项目"),
            ("2. 了解项目", "阅读README、文档、代码规范"),
            ("3. 探索Issues", "查找适合新手的问题(Good First Issue)"),
            ("4. Fork项目", "在GitHub上fork项目到自己的账号"),
            ("5. Clone到本地", "git clone https://github.com/your-username/project.git"),
            ("6. 创建分支", "git checkout -b feature/your-feature"),
            ("7. 开发实现", "编写代码，添加测试，更新文档"),
            ("8. 运行测试", "确保所有测试通过"),
            ("9. 提交代码", "git add . && git commit -m '描述变更'"),
            ("10. 推送到fork", "git push origin feature/your-feature"),
            ("11. 创建Pull Request", "在GitHub界面上创建PR"),
            ("12. 参与讨论", "根据维护者反馈修改代码"),
            ("13. PR合并", "等待维护者合并你的贡献"),
            ("14. 同步上游", "git remote add upstream original-url && git fetch upstream"),
            ("15. 更新fork", "git merge upstream/main"),
        ]

        for step, description in workflow:
            print(f"{step:20s} - {description}")

    def create_sample_project_structure(self):
        """创建示例项目结构"""
        print("\n2. 创建标准的开源项目结构")
        print("=" * 50)

        project_structure = {
            "README.md": self._create_readme(),
            "CONTRIBUTING.md": self._create_contributing_guide(),
            "CODE_OF_CONDUCT.md": self._create_code_of_conduct(),
            "LICENSE": self._create_license(),
            "pyproject.toml": self._create_pyproject(),
            "requirements.txt": "requests>=2.25.0\npytest>=6.0",
            ".gitignore": self._create_gitignore(),
            ".github/": {
                "workflows/": {
                    "test.yml": self._create_github_workflow(),
                    "lint.yml": "# Lint workflow配置"
                },
                "ISSUE_TEMPLATE/": {
                    "bug_report.md": self._create_issue_template("bug"),
                    "feature_request.md": self._create_issue_template("feature")
                },
                "PULL_REQUEST_TEMPLATE.md": self._create_pr_template()
            },
            "src/": {
                "example_project/": {
                    "__init__.py": '"""示例项目"""\n\n__version__ = "0.1.0"',
                    "core.py": '"""核心模块"""\n\ndef hello():\n    return "Hello, World!"',
                    "utils.py": '"""工具模块"""'
                }
            },
            "tests/": {
                "__init__.py": "",
                "test_core.py": self._create_test_file(),
                "conftest.py": '"""测试配置"""'
            },
            "docs/": {
                "index.md": "# 项目文档",
                "contributing.md": "# 贡献指南"
            },
            "examples/": {
                "basic_usage.py": '"""基础使用示例"""'
            }
        }

        self._print_structure(project_structure, "")
        return project_structure

    def _print_structure(self, structure, prefix):
        """打印项目结构"""
        for key, value in structure.items():
            if isinstance(value, dict):
                print(f"{prefix}├── {key}/")
                self._print_structure(value, prefix + "│   ")
            else:
                print(f"{prefix}├── {key}")

    def _create_readme(self):
        """创建README模板"""
        return '''# 项目名称

简短的项目描述。

## 功能特性

- 功能1
- 功能2
- 功能3

## 安装

```bash
pip install project-name
````

## 使用

```python
from project_name import hello

print(hello())
```

## 贡献

欢迎贡献！请阅读[CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)
'''

    def _create_contributing_guide(self):
        """创建贡献指南"""
        return '''# 贡献指南

感谢您考虑为该项目做出贡献！

## 如何贡献

### 报告Bug

1. 确认Bug尚未被报告
2. 使用Bug报告模板创建Issue
3. 提供详细的复现步骤

### 提出新功能

1. 检查功能是否已被建议
2. 使用功能请求模板创建Issue
3. 详细描述功能需求和用例

### 提交代码

1. Fork本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建Pull Request

## 开发环境设置

```bash
# 克隆仓库
git clone https://github.com/your-username/project.git
cd project

# 安装依赖
pip install -e ".[dev]"

# 运行测试
pytest

# 代码格式化
black src/ tests/
```

## 代码规范

- 遵循PEP 8
- 使用类型注解
- 编写文档字符串
- 添加单元测试
  '''
      def _create_code_of_conduct(self):
          """创建行为准则"""
          return '''# 贡献者行为准则

## 我们的承诺

我们承诺为每个人提供友好、安全的贡献环境。

## 我们的标准

可接受的行为包括：

- 尊重不同的观点和经验
- 建设性批评
- 关注社区最佳利益

不可接受的行为包括：

- 骚扰性语言或行为
- 人身攻击
- 任何不当行为

## 执行

违反行为准则的行为将受到相应处理。

## 联系

如有问题，请联系 maintainer@example.com
'''

    def _create_license(self):
        """创建许可证"""
        return '''MIT License

Copyright (c) 2023 项目作者

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF THE SOFTWARE OR ANY KIND, EITHER EXPRESS OR IMPLIED.
'''

    def _create_pyproject(self):
        """创建pyproject.toml"""
        return '''[build-system]

requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "example-project"
version = "0.1.0"
authors = [
{name = "Author Name", email = "author@example.com"}
]
description = "An example project"
readme = "README.md"
license = {text = "MIT"}
requires-python = ">=3.7"
classifiers = [
"Development Status :: 3 - Alpha",
"License :: OSI Approved :: MIT License",
"Programming Language :: Python :: 3",
]

dependencies = [
"requests>=2.25.0",
]

[project.optional-dependencies]
dev = [
"pytest>=6.0",
"black>=21.0",
"flake8>=4.0",
"mypy>=0.900",
]

[project.urls]
Homepage = "https://github.com/username/example-project"

[tool.black]
line-length = 88

[tool.pytest.ini_options]
testpaths = ["tests"]
'''

    def _create_gitignore(self):
        """创建.gitignore"""
        return '''# Byte-compiled

**pycache**/
\*.py[cod]

# Distribution

dist/
build/
\*.egg-info/

# Environments

.env
.venv
env/

# IDE

.vscode/
.idea/
\*.swp

# OS

.DS_Store
Thumbs.db
'''

    def _create_github_workflow(self):
        """创建GitHub工作流"""
        return '''name: Tests

on: [push, pull_request]

jobs:
test:
runs-on: ubuntu-latest
strategy:
matrix:
python-version: ["3.7", "3.8", "3.9", "3.10", "3.11"]

    steps:
    - uses: actions/checkout@v3
    - name: Set up Python ${{ matrix.python-version }}
      uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -e ".[dev]"
    - name: Run tests
      run: |
        pytest

'''

    def _create_issue_template(self, template_type):
        """创建Issue模板"""
        if template_type == "bug":
            return '''---

name: Bug报告
about: 报告项目中的Bug
title: "[BUG] "
labels: bug
assignees: ''

---

## Bug描述

清晰简洁地描述Bug是什么。

## 复现步骤

1. 转到 '...'
2. 点击 '....'
3. 滚动到 '....'
4. 看到错误

## 期望行为

清晰简洁地描述您期望发生的事情。

## 截图

如果适用，添加屏幕截图以帮助解释您的问题。

## 环境

- OS: [例如 Ubuntu 20.04]
- Python版本: [例如 3.9]
- 项目版本: [例如 0.1.0]

## 附加信息

在此处添加有关该问题的任何其他上下文。
'''
else: # feature request
return '''---
name: 功能请求
about: 为这个项目提出一个想法
title: "[FEATURE] "
labels: enhancement
assignees: ''

---

## 问题描述

清晰简洁地描述问题是什么。例如：当...时，我感到很沮丧。

## 解决方案描述

清晰简洁地描述您希望发生什么。

## 替代方案

清晰简洁地描述您考虑过的任何替代解决方案或功能。

## 附加信息

在此处添加有关功能请求的任何其他上下文或屏幕截图。
'''

    def _create_pr_template(self):
        """创建PR模板"""
        return '''## 描述

请包含您的更改的摘要。

## 相关Issue

解决 #(issue编号)

## 更改类型

- [ ] Bug修复（非破坏性更改，修复问题）
- [ ] 新功能（非破坏性更改，添加功能）
- [ ] 破坏性更改（修复或功能会改变现有功能）
- [ ] 文档更新

## 检查清单

- [ ] 我的代码遵循项目的代码风格
- [ ] 我对自己的代码进行了自查
- [ ] 我添加了注释，特别是在难以理解的代码处
- [ ] 我进行了相应的文档更新
- [ ] 我的更改不会生成新的警告
- [ ] 我添加了测试来证明我的修复是有效的或我的功能有效
- [ ] 新功能和现有测试都通过了本地测试
- [ ] 任何依赖更改都已更新

## 附加信息

添加任何其他关于此PR的信息。
'''

    def _create_test_file(self):
        """创建测试文件"""
        return '''"""

测试文件示例
"""

import pytest
from example_project.core import hello

def test_hello():
"""测试hello函数"""
assert hello() == "Hello, World
