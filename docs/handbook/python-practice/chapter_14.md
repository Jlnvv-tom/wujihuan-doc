# 第14章 工作流调度与数据质量

凌晨三点，你的手机突然响了。生产环境的ETL任务挂了，上游数据延迟了六个小时，业务方早上九点的报表全部是空的。你迷迷糊糊爬起来，登录服务器看日志，发现是Airflow的Scheduler进程OOM被杀掉了，DAG排队积压了四十多个，有些任务重试了八次还在失败。你尝试重启Scheduler，结果因为某个DAG文件有语法错误，整个DAG解析循环直接崩溃，所有任务全部停摆。此时距离早会还有四个小时，你一边改代码一边想：为什么我的数据管道这么脆弱？为什么任务调度系统像个黑盒？为什么数据质量问题总是事后才发现？

如果你经历过这些，说明你需要系统性地理解工作流调度系统的底层原理和数据质量保障的完整体系，而不是停留在"能跑就行"的阶段。

我是怕浪猫，这是Python实战训练营第14周的内容。本周我们深入三大核心主题：任务调度系统的架构与实战（Airflow、Prefect、Dagster三巨头对比）、数据质量保障框架（pandera、Great Expectations实战）、端到端数据管道编排（错误处理、血缘追踪、SLA监控）。这三个主题合在一起，解决的是"任务怎么可靠调度、数据怎么保证质量、管道怎么端到端可控"这三个数据工程的核心问题。怕浪猫会把自己在生产环境踩过的坑都写出来，每一块都有完整的代码示例，让你看完就能用。

## 一、任务调度系统：Airflow架构深度解析

### 1.1 Airflow架构全景：你以为的"定时任务"背后是什么

很多人用Airflow用了两年，从来没搞清楚Scheduler、Executor、Worker这三者的关系。他们只知道"写一个DAG文件，Airflow就会帮我跑"，直到有一天Scheduler挂了，所有任务停摆，他们才开始研究Airflow的架构。怕浪猫的建议是：在你把Airflow用到生产环境之前，先把架构心智图印在脑子里。不要等到出了问题才去翻文档，那时候你的手在抖，眼睛在花，文档里的每一个字都像是天书。

Airflow的核心架构由四个组件构成：

- **Scheduler（调度器）**：不断扫描DAG文件，计算哪些Task该执行了，把待执行的Task丢进消息队列。Scheduler是整个系统的心脏，它一旦停了，所有的调度逻辑就全部停了。Airflow 2.x支持Scheduler多实例部署，但需要配合数据库锁机制避免重复调度。
- **Executor（执行器）**：从消息队列里取Task，决定在哪里执行（本地进程、Celery Worker、Kubernetes Pod）。Executor是策略层面的组件，你切换Executor不需要改DAG代码，只需要改配置文件，这就是Airflow架构设计上的一个亮点。
- **Web Server（Web服务）**：提供DAG可视化、任务监控、手动触发等UI功能。Web Server是无状态的，可以多实例部署，挂了不影响任务执行，只是你看不了UI而已。
- **Metadata Database（元数据库）**：存储DAG序列化结果、Task执行状态、变量、连接信息等。元数据库是整个系统的基石，所有的状态都存在这里。怕浪猫的建议是：元数据库一定要用PostgreSQL，不要用SQLite（SQLite只适合开发环境，不支持并发写入，生产环境必挂）。

这四个组件的关系可以这样理解：Scheduler是"大脑"，决定什么时候该做什么；Executor是"手脚"，负责把Task跑起来；Web Server是"眼睛"，让你看到发生了什么；元数据库是"记忆"，记住所有发生过的事情。这四个组件缺一不可，任何一个出了问题，整个系统都会受影响。

```python
# Airflow最小可运行DAG示例
from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime

def extract():
    print("Extracting data...")

def transform():
    print("Transforming data...")

def load():
    print("Loading data...")

with DAG(
    dag_id='etl_pipeline',
    start_date=datetime(2024, 1, 1),
    schedule_interval='0 2 * * *',  # 每天凌晨2点
    catchup=False,
) as dag:
    t1 = PythonOperator(task_id='extract', python_callable=extract)
    t2 = PythonOperator(task_id='transform', python_callable=transform)
    t3 = PythonOperator(task_id='load', python_callable=load)
    t1 >> t2 >> t3  # 定义依赖：t1完成后才能跑t2，t2完成后才能跑t3
```

> Scheduler不是定时器，它是状态机。它不停地计算"当前时间 + DAG调度表达式 + 任务依赖状态"，决定下一个该调度谁。

怕浪猫在项目中踩过的一个坑：有一天所有的DAG突然都不执行了。排查了半天，发现是某个DAG文件里写了一个全局的`requests.get()`调用，这个HTTP请求超时了30秒，导致整个DAG解析循环被卡住30秒。Airflow的Scheduler在解析DAG文件时是串行执行的，一个DAG卡住，所有DAG都跟着等。解决办法是把所有DAG文件里的"重IO操作"全部移到Task内部，DAG文件只做定义，不做执行。

### 1.2 Scheduler调度循环：它到底在干什么

Scheduler的核心是一个无限循环，很多人把Scheduler理解为"定时器"，到了点就触发任务。这个理解是不对的，Scheduler远比定时器复杂。它是状态机，不停地计算"当前时间加上DAG调度表达式再加上任务依赖状态"，决定下一个该调度谁。理解Scheduler的工作原理，对排查"为什么我的DAG没有按时执行"这类问题至关重要。伪代码逻辑如下：

1. 扫描DAGs目录，解析所有DAG文件，生成DAG对象
2. 对每个DAG，根据`schedule_interval`计算下一个执行时间点
3. 检查这个执行时间点是否已经到达，且上一次执行已经完成（或不需要catchup）
4. 如果满足条件，创建DagRun对象，状态设为RUNNING
5. 对每个Task，根据依赖关系计算是否可以执行
6. 把可执行的TaskInstance丢进Executor的消息队列
7. 等待Executor回报执行结果，更新TaskInstance状态
8. 回到步骤1

这个循环默认每秒跑一次（可配置`min_file_process_interval`）。这意味着，如果你修改了DAG文件，最多一秒后Scheduler就会重新解析它。但这里有个性能陷阱：如果你的DAG文件很多（比如超过100个），每秒解析所有DAG文件的开销会很大。Airflow 2.x引入了DAG序列化机制，Scheduler解析完DAG后会把结果序列化到元数据库，Web Server直接从数据库读取序列化结果，不再需要自己解析DAG文件。这大大减轻了Web Server的负担。怕浪猫的建议是：DAG文件数量超过50个时，一定要开启DAG序列化（`store_serialized_dags=True`），否则Web Server会越来越慢。

```python
# 理解DagRun和TaskInstance的关系
# DagRun = 一次DAG的执行（对应一个execution_date）
# TaskInstance = 一个Task在某次DagRun中的执行记录

# 在Airflow UI中，你可以看到：
# DAG: etl_pipeline
#   DagRun: 2024-06-01 02:00:00  [success]
#     TaskInstance: extract [success]
#     TaskInstance: transform [success]
#     TaskInstance: load [success]
#   DagRun: 2024-06-02 02:00:00  [failed]
#     TaskInstance: extract [success]
#     TaskInstance: transform [failed]  <-- 这次执行在这里挂了
#     TaskInstance: load [upstream_failed]
```

一个实战踩坑：怕浪猫曾经设置`schedule_interval='0 2 * * *'`，然后手动触发了一次DAG，结果发现第二天凌晨两点DAG没有自动执行。排查了半天，才发现问题出在execution_date的理解上。Airflow的execution_date不是"任务执行的时间点"，而是"数据时间窗口的起始点"。比如`schedule_interval='0 2 * * *'`，凌晨两点触发的DagRun，其execution_date是前一天的零点（因为数据窗口是"前一天00:00到当天00:00"）。这个设计逻辑让很多新手困惑，但如果你从"数据管道处理的是历史数据"这个角度理解，就说得通了：你凌晨两点跑的ETL，处理的是昨天的数据，所以execution_date是昨天。手动触发时如果指定了"当前时间"作为execution_date，Scheduler会认为"这个数据窗口还没结束"，不会自动创建新的DagRun。解决办法是：手动触发时指定execution_date为一个过去的日期，或者等下一个自然调度周期到达。

还有一个容易踩的坑：`catchup=True`（默认值）。如果你的DAG的`start_date`设为一个月前，而你是今天才部署这个DAG的，Airflow会"追赶"过去一个月的所有错过的执行。也就是说，它会创建30个DagRun，把过去30天的数据全部跑一遍。如果你的DAG是处理大量数据的ETL，这可能会导致资源爆炸。怕浪猫的建议是：生产环境的DAG统一设置`catchup=False`，需要补数据的时候手动触发指定日期的DagRun。

> 时间窗口是数据管道最容易出问题的地方。execution_date不是"执行时间"，它是"数据时间窗口的起始点"。这个概念不理解，数据就会错。

### 1.3 Executor执行器对比：选对了省心，选错了半夜被叫醒

Executor是Airflow中策略性最强的组件，选错了Executor，你会在运维上花大量时间。怕浪猫见过很多团队一开始用SequentialExecutor（开发模式默认的Executor），上了生产环境忘了换，结果所有任务串行执行，一个任务卡住全部卡住，DAG积压像滚雪球一样越滚越大。

Airflow支持多种Executor，核心区别在于"Task在哪里跑"。怕浪猫整理了一个对比表，这张表是怕浪猫在生产环境折腾了三年总结出来的：
|----------|-------------|------|------|----------|
| SequentialExecutor | 本地串行 | 零配置，开箱即用 | 不支持并行，只适合开发 | 本地开发调试 |
| LocalExecutor | 本地并行（多进程） | 配置简单，利用多核 | 单机瓶颈，进程数受限 | 中小规模生产 |
| CeleryExecutor | 远程Worker节点 | 真正分布式，可横向扩展 | 需要维护Celery+Redis/RabbitMQ | 大规模生产 |
| KubernetesExecutor | 每个Task一个Pod | 资源隔离，按需创建 | Pod启动延迟，集群资源消耗大 | 异构任务，资源敏感 |
| LocalKubernetesExecutor | Local+Celery混合 | 灵活切换，兼顾效率和成本 | 配置复杂 | 混合负载 |

怕浪猫的选择建议：如果你只有一台服务器，用LocalExecutor，它利用多进程实现并行，适合中小规模的场景。如果你有多台服务器，且Task执行时间长短不一（有的10秒，有的2小时），用CeleryExecutor，把长时间任务丢到专门的Worker节点上，短任务和长任务互不干扰。如果你的Task需要特殊的运行环境（比如某个Task需要GPU，某个Task需要超大内存），用KubernetesExecutor，每个Task可以有独立的容器镜像和资源配额，用完即销毁，不浪费资源。

这里补充一个怕浪猫踩过的坑：从LocalExecutor切换到CeleryExecutor时，所有的DAG文件需要确保没有模块级别的副作用代码。因为CeleryExecutor的Worker是独立进程，它会重新import你的DAG文件。如果你的DAG文件在import时执行了某些操作（比如发HTTP请求、写文件），这些操作会在每个Worker节点上重复执行，可能导致意想不到的问题。

```python
# airflow.cfg 中配置Executor（核心配置项）
# 单机并行执行（开发/小规模生产）
executor = LocalExecutor

# 分布式执行（生产环境推荐）
executor = CeleryExecutor
broker_url = redis://localhost:6379/0
result_backend = db+postgresql://airflow:password@localhost/airflow

# Kubernetes执行（异构任务）
executor = KubernetesExecutor
# 需要配置pod_template_file，定义Pod的镜像、资源、环境变量
```

一个实战踩坑：怕浪猫在生产环境用CeleryExecutor时，遇到过"任务丢失"的问题。Task被Scheduler丢进Redis队列后，Celery Worker取走了，但Worker节点突然宕机，任务就永远消失了。原因是Celery的`task_acks_late=True`没有配置，Worker取走任务时就立即ACK了，而不是等任务执行完再ACK。配置`task_acks_late=True`后，只有任务执行成功才会ACK，Worker宕机时任务会重新分配给其他Worker。还有一个相关的问题：Celery的`worker_prefetch_multiplier`默认是4，意味着每个Worker会预取4个任务。如果这些任务都是长时间运行的，Worker队列里看起来"积压"了很多任务，实际上是预取导致的。把`worker_prefetch_multiplier`设为1，让Worker每次只取一个任务，可以避免这种假积压现象。

### 1.4 DAG定义即代码：Python代码即配置的哲学

Airflow最核心的设计哲学是"DAGs are defined in Python code, not in a GUI"。这意味着你的DAG定义是版本可控的Python代码，可以走CI/CD流程，可以做Code Review，可以回滚。对比某些调度系统（比如用拖拽连线的商业工具），Airflow的方式在长期维护上有巨大优势。拖拽连线的方式看起来直观，但当你的DAG复杂度上去之后（几十个Task、复杂的分支依赖），维护起来反而更痛苦。而且拖拽生成的配置文件无法做Code Review，出了问题只能靠肉眼看图。Python代码定义的DAG，所有的逻辑都在代码里，`git blame`一下就知道这段逻辑是谁加的、为什么加的。

但"代码即配置"也带来了一些问题。DAG文件本质上是一段会被Scheduler反复执行的Python代码，这意味着你在DAG文件顶层写的所有代码都会在每次解析时执行。怕浪猫在团队里见过有人把数据库密码硬编码在DAG文件里，也有人把API密钥直接写在Python文件里提交到Git。这些做法不仅不安全，还可能导致DAG解析变慢。正确的做法是使用Airflow的Connection和Variable机制。

```python
from airflow.models import Variable
from airflow.providers.http.operators.http import SimpleHttpOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator

# 错误做法：硬编码敏感信息
# password = "my_secret_password"  # 不要这样做

# 正确做法：使用Variable
api_key = Variable.get("external_api_key")
db_conn_id = "my_postgres"

# 使用HttpOperator时，通过Connection管理endpoint和认证
call_api = SimpleHttpOperator(
    task_id='call_external_api',
    http_conn_id='external_api',  # 在Airflow UI中配置Connection
    endpoint='/v1/data',
    headers={"Authorization": f"Bearer {api_key}"},
    method='GET',
    log_response=True,
)

# 使用PostgresOperator时，通过Connection管理数据库连接
query_db = PostgresOperator(
    task_id='update_summary_table',
    postgres_conn_id='my_postgres',  # 在Airflow UI中配置Connection
    sql="""
        INSERT INTO daily_summary (dt, total_orders)
        SELECT DATE(created_at), COUNT(*)
        FROM orders
        WHERE created_at >= '{{ ds }}'
        AND created_at < '{{ next_ds }}'
        GROUP BY 1
    """,
)
```

> 配置和代码分离，不是一句口号，它是生产环境的安全底线。Connection和Variable就是Airflow给出的标准答案。

这里需要特别解释一下`{{ ds }}`和`{{ next_ds }}`这两个模板变量。它们是Airflow提供的Jinja2模板变量，`ds`表示当前DagRun的execution_date（格式`YYYY-MM-DD`），`next_ds`表示下一个执行周期的开始时间。利用这两个变量，你可以写出"处理哪天的数据"完全由调度系统决定的SQL，而不是硬编码日期。

怕浪猫踩过的另一个坑：在DAG文件中使用`datetime.now()`来获取"当前时间"。这是错误的，因为DAG文件在Scheduler解析时就会执行，`datetime.now()`返回的是"Scheduler解析DAG的时间"，而不是"Task执行的时间"。如果Task因为依赖等待了两小时才执行，`datetime.now()`的值已经错了两小时。更妙的是，Scheduler可能每秒都会解析一次DAG文件，所以`datetime.now()`的值每次都不一样，这会导致DAG的行为不确定。正确的做法是在Task内部通过`{{ ts }}`模板变量获取Task执行时间戳，或者用Airflow提供的`execution_date`上下文变量。这两个值的区别是：`{{ ts }}`是ISO格式的时间戳字符串，`execution_date`是DagRun对应的数据窗口起始时间。大部分场景下你需要的都是`execution_date`，因为你处理的是"那天的数据"而不是"此刻的时间"。

### 1.5 Operator体系：别重复造轮子

Airflow提供了丰富的内置Operator，覆盖大部分常见场景。很多新手不知道Operator的存在，所有的逻辑都塞进PythonOperator里用Python代码实现，这其实是浪费了Airflow生态的能力。比如你需要执行一个SQL，用PostgresOperator比用PythonOperator包装一个psycopg2调用要简洁得多，而且Operator自带日志记录、重试、模板渲染等功能。怕浪猫把最常用的Operator整理成下表：

| Operator | 用途 | 典型场景 |
|----------|------|----------|
| PythonOperator | 执行任意Python函数 | 数据清洗、调用API |
| BashOperator | 执行Shell命令 | 调用脚本、启动子进程 |
| HttpOperator | 发送HTTP请求 | 调用REST API |
| PostgresOperator | 执行PostgreSQL查询 | 数据入库、聚合统计 |
| MySqlOperator | 执行MySQL查询 | 数据同步 |
| EmailOperator | 发送邮件 | 任务完成通知、失败告警 |
| Sensor | 等待某个条件满足 | 等待文件到达、等待数据就绪 |

```python
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator
from airflow.sensors.filesystem import FileSensor
import pandas as pd

# PythonOperator：执行数据清洗
def clean_data():
    df = pd.read_csv('/data/raw/users.csv')
    df = df.dropna(subset=['email'])
    df['email'] = df['email'].str.lower()
    df.to_csv('/data/cleaned/users.csv', index=False)

clean_task = PythonOperator(
    task_id='clean_user_data',
    python_callable=clean_data,
)

# BashOperator：调用外部脚本
run_spark = BashOperator(
    task_id='run_spark_job',
    bash_command='spark-submit /opt/jobs/user_analytics.py',
)

# FileSensor：等待数据文件到达
wait_for_file = FileSensor(
    task_id='wait_for_input_file',
    filepath='/data/raw/orders_{{ ds }}.csv',
    poke_interval=60,  # 每60秒检查一次
    timeout=3600,  # 超时时间1小时
)
```

一个实战踩坑：PythonOperator的`python_callable`函数，默认只能接受`**kwargs`参数（Airflow会把上下文变量注入进来）。如果你想传入自定义参数，需要用`op_args`或`op_kwargs`。

```python
# 正确传参方式
def clean_data(table_name, threshold):
    print(f"Cleaning {table_name}, threshold={threshold}")

clean_task = PythonOperator(
    task_id='clean_data',
    python_callable=clean_data,
    op_kwargs={'table_name': 'users', 'threshold': 0.95},
)
```

> Operator是Airflow的"零件"。你不需要自己造轮子，你只需要知道零件箱里有哪些零件，以及怎么把它们组装起来。

### 1.6 XCom：跨任务通信的正确姿势（以及为什么要少用）

XCom（Cross-communication）是Airflow提供的任务间通信机制。Task A可以把一个小数据（字符串、数字、JSON）推送到XCom，Task B可以从XCom把这个数据拉出来。看起来很方便，但怕浪猫要给你泼一盆冷水：XCom能不用就不用。这个结论听起来有点反直觉，既然Airflow提供了这个功能，为什么又不建议用呢？

原因是：XCom的数据存在Airflow的元数据库里，有大小限制（默认64KB，可配置但不建议太大）。如果你用XCom传递DataFrame或者大JSON，元数据库会被撑爆，Scheduler性能会急剧下降。怕浪猫在项目中见过一个极端案例：有人用XCom传了一个5000行的DataFrame（序列化后约2MB），元数据库的task_instance表膨胀到了几十GB，Airflow Web UI加载DAG详情页要等30秒，Scheduler调度延迟从1秒变成了5分钟。最后不得不写脚本清理XCom数据，并且重构了整个DAG的通信方式。

```python
from airflow.operators.python import PythonOperator

# Task A：推送数据到XCom
def push_data(**context):
    result = {'row_count': 10000, 'status': 'success'}
    context['task_instance'].xcom_push(key='etl_result', value=result)

# Task B：从XCom拉取数据
def pull_data(**context):
    result = context['task_instance'].xcom_pull(
        task_ids='extract_task',
        key='etl_result'
    )
    print(f"上一任务处理了{result['row_count']}行")

push_task = PythonOperator(
    task_id='extract_task',
    python_callable=push_data,
)

pull_task = PythonOperator(
    task_id='load_task',
    python_callable=pull_data,
)

push_task >> pull_task
```

如果你确实需要传递大量数据，正确的架构是：Task A把数据写到共享存储（本地文件系统、S3、HDFS），然后把"文件路径"通过XCom传给Task B。Task B根据文件路径去读取数据。这样XCom里只传了一个字符串（文件路径），数据本身不走元数据库。

> XCom是"通知机制"，不是"数据传输机制"。用它传状态、传路径、传小字典，不要用它传数据。

## 二、Prefect 2.x与Dagster：现代调度系统的挑战者

Airflow虽然是数据调度领域的老大哥，但它并不是完美的。Airflow的设计诞生于2015年，当时的数据工程主要需求是"按时跑任务"，而今天的数据工程需求已经进化到"管理数据资产"。这个需求的变化催生了Prefect和Dagster这两款现代调度系统。怕浪猫在这一章会详细对比这三款系统，帮你选择最适合你的工具。选工具这件事，不是追新，而是匹配。Airflow虽然老，但成熟；Prefect和Dagster虽然新，但有些场景还不够稳定。怕浪猫会把三款系统的优缺点都摊开来说，让你做决定时有足够的信息。

### 2.1 Prefect 2.x：Pythonic到极致

如果你觉得Airflow的DAG定义方式太重了（要写一堆DAG对象、Operator对象、依赖关系用位移运算符定义），那你可能会喜欢Prefect。Prefect 2.x的设计哲学是"函数即任务，装饰器即编排"，你几乎是在写普通Python代码，只是加了一些装饰器。Prefect的核心理念是：不要让开发者学习一套新的DSL（领域特定语言），而是用最自然的方式写Python代码，框架在背后帮你处理重试、缓存、并发、状态管理这些繁琐的事情。

```python
from prefect import flow, task
import pandas as pd

@task(retries=3, retry_delay_seconds=60)
def extract(url: str) -> pd.DataFrame:
    return pd.read_csv(url)

@task
def transform(df: pd.DataFrame) -> pd.DataFrame:
    df['amount'] = df['amount'].fillna(0)
    return df

@task
def load(df: pd.DataFrame, table: str):
    df.to_sql(table, con='postgresql://user:pass@localhost/db')

@flow(name="ETL Pipeline")
def etl_flow(url: str, table: str):
    raw = extract(url)
    cleaned = transform(raw)
    load(cleaned, table)

if __name__ == "__main__":
    etl_flow("https://example.com/data.csv", "orders")
```

怕浪猫第一次写Prefect代码时的感受是：这太Pythonic了。`@task`装饰器把一个普通函数变成可重试、可观测、可缓存的任务，`@flow`装饰器把一组任务编织成有依赖关系的工作流。你看这段代码，不需要任何Airflow知识，只需要会Python，就能看懂。

Prefect的另一个亮点是"动态DAG"。Airflow的DAG在解析时是静态的（DAG文件parse完成后，DAG结构就固定了），而Prefect的Flow在运行时可以动态决定执行哪些任务。比如你可以根据上游数据的大小，动态决定启动多少个并行Transform任务。这个能力在处理不确定大小的数据时非常有用，你不需要提前预估数据量，而是在运行时根据实际情况调整并行度。

Prefect还提供了强大的状态管理功能。每个Task执行后都会产生一个State对象，记录了执行结果、异常信息、缓存数据等。你可以通过State实现"缓存命中"的功能：如果输入数据没有变化，直接返回上次的结果，跳过实际计算。这在处理耗时但幂等的任务时非常有用。

```python
from prefect import flow, task
import pandas as pd

@task
def check_data_size(url: str) -> int:
    # 返回数据行数
    return len(pd.read_csv(url))

@task
def process_partition(partition_id: int):
    print(f"Processing partition {partition_id}")

@flow
def dynamic_etl(url: str):
    row_count = check_data_size(url)
    # 动态决定并行任务数
    num_partitions = max(1, row_count // 10000)
    for i in range(num_partitions):
        process_partition(i)
```

> Airflow告诉你"任务怎么编排"，Prefect告诉你"数据怎么流动"。两种不同的抽象层次，适合不同复杂度的场景。

怕浪猫在生产环境中同时用过Airflow和Prefect。结论是：如果你的任务依赖关系复杂（比如有分支、有动态生成、有条件判断），Prefect更合适。Airflow的BranchOperator虽然能实现条件分支，但写起来很繁琐，而且只能在DAG解析时决定走哪个分支，不能在运行时动态调整。Prefect的`if-else`就是普通的Python代码，想怎么写就怎么写。如果你的任务需要精细的调度控制（比如"每个月最后一个周五执行"、"任务失败后等待人工确认再重试"），Airflow更成熟。Prefect 2.x的调度功能在快速追赶，但目前Airflow的调度灵活性仍然更胜一筹。另外Airflow的社区生态更成熟，Provider（插件）覆盖了几乎所有常见的数据源和服务，而Prefect的集成库还在发展中。

### 2.2 Dagster：以数据资产为中心

Dagster是一个更新的调度系统，它的核心概念是"数据资产"（Asset）。在Airflow和Prefect里，你定义的是"任务"（Task），任务是动作；在Dagster里，你定义的是"资产"（Asset），资产是状态。这个区别听起来抽象，用代码一看就懂。怕浪猫第一次接触Dagster时，感觉就像是有人在说："别告诉我你做了什么，告诉我你产出了什么。"这个思维转变看起来微妙，但对数据团队的工作方式影响深远。

```python
from dagster import asset, AssetExecutionContext
import pandas as pd

@asset
def raw_users(context: AssetExecutionContext):
    """原始用户数据，从CSV文件读取。"""
    df = pd.read_csv('/data/raw/users.csv')
    return df

@asset
def cleaned_users(raw_users: pd.DataFrame):
    """清洗后的用户数据，去除空邮箱。"""
    df = raw_users.dropna(subset=['email'])
    return df

@asset
def user_summary(cleaned_users: pd.DataFrame):
    """用户汇总表，按城市统计用户数。"""
    summary = cleaned_users.groupby('city').size().reset_index()
    summary.columns = ['city', 'user_count']
    return summary
```

看到区别了吗？在Dagster里，你不需要显式定义"task A依赖task B"。你只需要定义"资产B的输入是资产A的输出"，Dagster自动推断出依赖关系。这个设计的好处是：当你只关心"数据最终对不对"而不关心"任务是怎么跑的"时，Dagster的抽象层次更贴近业务语义。

Dagster的另一个杀手级功能是IOManager。在Airflow里，任务之间的数据传递要么用XCom（小数据），要么自己管理中间文件的读写（大数据）。Dagster通过IOManager把这个事情标准化了：你只需要声明"这个资产的输出存到哪里"，Dagster自动处理序列化和反序列化。这意味着你可以随时切换存储后端，从本地文件系统切换到S3只需要改IOManager的实现，不需要改Asset代码。这种解耦设计在实际项目中非常实用。

除了Asset和IOManager，Dagster还有一个值得关注的特性：AssetCheck。AssetCheck允许你对每个Asset定义质量检查规则，在Asset产出后自动执行检查。如果检查失败，Dagster会在UI上标记这个Asset的质量状态为"失败"，并可以配置是否阻止下游Asset的执行。这和后面要讲的Great Expectations是互补的关系：AssetCheck适合轻量级的内联检查，Great Expectations适合重量级的独立数据质量平台。

```python
from dagster import IOManager, io_manager

class ParquetIOManager(IOManager):
    def handle_output(self, context, obj):
        # 把DataFrame写成Parquet文件
        path = f"/data/intermediate/{context.asset_key.path[-1]}.parquet"
        obj.to_parquet(path)

    def load_input(self, context):
        # 从Parquet文件读取DataFrame
        path = f"/data/intermediate/{context.asset_key.path[-1]}.parquet"
        return pd.read_parquet(path)

@asset(io_manager_key="parquet_io")
def cleaned_users(raw_users: pd.DataFrame):
    return raw_users.dropna(subset=['email'])
```

怕浪猫的观点：Dagster最适合"数据产品的生产者"。如果你是在构建数据平台，数据是你的产品，数据质量是你的核心KPI，那么Dagster的资产导向抽象会让你事半功倍。你可以把每个Asset看作一个"产品"，Asset的依赖关系就是产品的"供应链"。当某个Asset的质量检查失败时，你可以清晰地看到哪些下游Asset会受影响，需要通知谁。如果你只是在做任务调度（比如"每天凌晨跑一个机器学习训练任务"），Dagster有点杀鸡用牛刀，Airflow或Prefect会更轻量。选择工具的关键是匹配你的工作场景，而不是追新。

### 2.3 三大调度系统对比总结

怕浪猫把三个系统放在一张表里对比，帮你做选择：

| 维度 | Airflow | Prefect 2.x | Dagster |
|------|---------|-------------|---------|
| 抽象层次 | Task为中心 | Flow/Task为中心 | Asset为中心 |
| 学习曲线 | 陡（概念多） | 平缓（Pythonic） | 中等（概念新） |
| 动态DAG | 不支持（需技巧） | 原生支持 | 原生支持 |
| 调度灵活性 | 最强（cron级别） | 中等 | 中等 |
| 数据资产管理 | 弱（靠XCom/IOManager自己写） | 中等 | 最强（原生Asset） |
| 社区生态 | 最成熟 | 快速成长 | 快速成长 |
| 适合人群 | 数据工程师（传统ETL） | Python开发者（通用编排） | 数据平台工程师（数据产品） |

> 工具没有绝对的好坏，只有适合不适合。选工具的时候，先看你的团队背景，再看你的业务场景，最后看工具的生态匹配度。

## 三、数据质量保障：别等数据错了再补救

数据质量是数据工程的"最后一公里"。不管你的调度系统多强大、管道设计多优雅，如果最终产出的数据是错的，一切努力都白费。业务方不会关心你的Airflow架构多精妙，他们只关心报表上的数字对不对。数据质量保障不是锦上添花的事情，它是数据团队信誉的基石。怕浪猫在这一章会系统性地介绍数据质量保障的框架和实践，从轻量级的pandera到企业级的Great Expectations，让你看完就能在自己的项目中落地。

### 3.1 数据质量问题的代价

怕浪猫在一家电商公司做数据工程师时，发生过一次严重的数据质量事故。由于上游订单表的`payment_status`字段枚举值悄悄加了一个新值（`'partial_refunded'`），而我们的ETL代码里 hardcode 了`WHERE payment_status IN ('paid', 'refunded')`，导致所有部分退款的订单在报表中消失了。这个bug在生产环境潜伏了三周，被财务发现时，已经影响了当月的收入确认。最终结果是：数据团队被要求在三天内排查所有ETL脚本中的硬编码枚举值，并建立数据质量检查机制。那三天怕浪猫几乎没合眼，逐行检查了两百多个SQL文件。

这次事故之后，怕浪猫意识到：数据质量保障不是"锦上添花"，它是数据管道的"安全气囊"。没有数据质量检查的ETL，就像没有单元测试的代码，你能跑，但我不敢信。更可怕的是，数据质量问题往往不像代码bug那样立刻报错，它会静默地产生错误结果，而下游业务方基于错误结果做决策，造成的损失是隐性的、累积的。

数据质量保障的核心策略是"分层校验"，每一层解决不同维度的问题：

1. **接入层校验**：数据刚从源系统读出来时，检查格式、类型、非空约束。这是第一道防线，目的是拦截"明显的脏数据"，比如字段类型不对、必填字段为空、数据量异常波动等。
2. **转换层校验**：数据经过清洗转换后，检查业务规则（比如"订单金额不能为负"、"用户年龄不能超过150岁"）。这层校验关注的是"数据在业务层面是否合理"。
3. **输出层校验**：数据写入目标系统后，检查行数、汇总值、唯一性约束。这是最后一道防线，确保写入的数据和预期一致。比如"今天写入的行数和转换后的行数必须相等"、"主键不能重复"。
4. **跨表校验**：检查关联表之间的一致性（比如"订单表中的用户ID都能在用户表中找到"）。跨表校验是最容易被忽略的，但也是最重要的，因为数据仓库的价值在于关联分析，如果关联关系断了，分析结果就是错的。

### 3.2 pandera：DataFrame级别的验证框架

pandera是一个轻量级的数据验证库，它的核心思想是"用Schema定义DataFrame的结构和质量规则，然后对DataFrame进行验证"。它的API设计非常优雅，和pandas无缝集成。怕浪猫选择pandera的原因很简单：它的学习成本极低，如果你会用pandas，你就能用pandera。你不需要学一套新的概念体系，只需要在现有的pandas代码外面套一层Schema定义就行。

pandera的Schema定义方式有两种：一种是基于类的SchemaModel（推荐，支持类型注解，IDE提示友好），另一种是基于对象的DataFrameSchema（更灵活，支持动态构建）。怕浪猫在项目中两种都用过，SchemaModel适合静态的、已知的Schema，DataFrameSchema适合动态的、运行时才能确定的Schema。

```python
import pandas as pd
import pandera as pa
from pandera.typing import DataFrame, Series

# 定义Schema
class UserSchema(pa.SchemaModel):
    user_id: Series[int] = pa.Field(unique=True, nullable=False)
    email: Series[str] = pa.Field(nullable=False, str_matches=r'^[^@]+@[^@]+\.[^@]+$')
    age: Series[int] = pa.Field(in_range={"min_value": 0, "max_value": 150})
    created_at: Series[pd.Timestamp] = pa.Field(nullable=False)

# 验证DataFrame
df = pd.DataFrame({
    'user_id': [1, 2, 3],
    'email': ['a@example.com', 'b@example.com', 'c@example.com'],
    'age': [25, 30, 35],
    'created_at': pd.to_datetime(['2024-01-01', '2024-01-02', '2024-01-03']),
})

validated_df = UserSchema.validate(df)  # 通过则返回原DataFrame，失败则抛出异常
```

pandera的验证失败会抛出非常详细的错误信息，告诉你哪一列、哪一行、什么规则失败了。这对调试非常有帮助。

```python
# 验证失败的详细错误信息示例
try:
    df_bad = pd.DataFrame({
        'user_id': [1, 2, 2],  # user_id重复了
        'email': ['a@example.com', 'bad_email', None],  # 第二个邮箱格式错误，第三个为None
        'age': [25, 200, 35],  # 第二个年龄超出范围
    })
    UserSchema.validate(df_bad)
except pa.errors.SchemaErrors as e:
    print(e.failure_cases)  # 详细的失败用例
    # 输出：
    #   - user_id列存在重复值
    #   - email列存在格式不匹配
    #   - email列存在空值
    #   - age列存在超出范围的值
```

怕浪猫在项目中用pandera的方式是：在每个ETL任务的"数据接入后"和"数据写入前"各加一个验证点。接入后的验证用pandera检查原始数据的格式和完整性，写入前的验证用pandera检查转换后的数据是否符合目标表的Schema。

> pandera的价值不在于"发现错误"（你迟早会发现的），而在于"提前发现错误"。在数据管道的早期阶段就拦截脏数据，比在数据已经被消费后才发现问题，成本低100倍。

pandera还支持与polars集成（pandera 0.16+），如果你在用polars处理数据，同样可以用pandera做验证。polars是近年来崛起的DataFrame库，基于Rust实现，性能比pandas快一个数量级。如果你的数据量超过了pandas的舒适区（比如单表超过10GB），polars是更好的选择，而pandera的polars后端让你在享受高性能的同时不牺牲数据验证能力。

```python
import polars as pl
import pandera.polars as pa_polars
from pandera.polars import DataFrameSchema, Column, Check

schema = DataFrameSchema({
    'order_id': Column(pl.Int64, checks=Check.unique()),
    'amount': Column(pl.Float64, checks=Check.greater_than(0)),
    'status': Column(pl.Utf8, checks=Check.isin(['paid', 'refunded', 'pending'])),
})

df = pl.DataFrame({
    'order_id': [1, 2, 3],
    'amount': [99.9, 199.9, 49.9],
    'status': ['paid', 'paid', 'pending'],
})

validated = schema.validate(df)
```

### 3.3 Great Expectations：企业级数据质量平台

如果你需要的不只是"在代码里加几个验证"，而是一个完整的数据质量平台（有Web UI、有期望套件管理、有验证结果历史、有数据文档生成），那Great Expectations（GE）是更合适的选择。pandera适合在代码层面做验证，GE适合在平台层面做治理。两者的定位不同，不是替代关系，而是互补关系。怕浪猫在项目中同时使用两者：pandera在ETL代码里做实时验证，GE在ETL完成后做离线质量巡检。

GE的核心概念有三个，理解了这三个概念你就理解了GE的设计理念：

- **Expectation（期望）**：对数据的一个断言，比如"这一列的值都不为空"、"这一列的值都在某个范围内"。
- **Expectation Suite（期望套件）**：一组Expectation的集合，描述了一个数据集应该满足的所有质量规则。
- **Checkpoint（检查点）**：执行验证的动作，把一个Expectation Suite应用到一个数据集上，生成验证结果。

```python
import great_expectations as gx
import pandas as pd

# 初始化Data Context（GE的项目根目录）
context = gx.get_context()

# 注册数据源
datasource = context.sources.add_pandas("my_datasource")

# 定义Expectation Suite
suite = context.add_expectation_suite("user_data_quality")

# 添加Expectation
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToNotBeNull(column="user_id")
)
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToMatchRegex(
        column="email",
        regex=r'^[^@]+@[^@]+\.[^@]+$'
    )
)
suite.add_expectation(
    gx.expectations.ExpectColumnValueLengthsToBeBetween(
        column="name",
        min_value=1,
        max_value=100
    )
)

# 执行验证
df = pd.read_csv('/data/raw/users.csv')
batch = context.get_batch(batch_parameters={"dataframe": df})
result = suite.run(batch)

print(result.success)  # True/False
print(result.to_json_dict())  # 详细验证结果
```

GE的一个核心优势是"数据文档"。GE可以基于你的Expectation Suite和验证结果，自动生成一个静态HTML网站，展示你的数据质量规则覆盖情况、每次验证的结果历史、数据分布统计信息等。这个网站可以作为数据团队的"数据质量门户"，让所有人都能看到"哪些数据质量是可信的"。这在跨团队协作时特别有用：数据分析师可以查看数据文档，了解某个表的字段定义、质量规则、历史验证结果，而不需要找数据工程师口头确认。

怕浪猫在生产环境中用GE的方式是：每天凌晨的ETL任务完成后，自动跑一次GE验证，验证结果推送到Slack频道。如果验证失败（比如"订单表的记录数比昨天少了30%"），立即触发告警。这个机制帮我们拦截过多次上游数据源的异常（比如上游数据库迁移导致数据丢失、上游系统bug导致字段值为空、上游ETL逻辑变更导致数据格式变化等）。每一次拦截都是在为业务方避免一次错误决策，这也是数据质量保障的核心价值所在。

> Great Expectations不是"又一个Python库"，它是一个数据质量平台。如果你需要数据质量的可观测性、可追溯性、可协作性，GE值得投入学习时间。

### 3.4 数据质量检查策略清单

怕浪猫把常见的数据质量检查规则整理成一个清单，你可以直接拿去用。这个清单是怕浪猫在多个项目中逐步完善的，每一条背后都有一次真实的数据质量事故。建议你在自己的ETL管道中逐条对照，看看哪些检查已经做了，哪些还没有。没做的那些，就是你数据管道的潜在风险点。

**完整性检查：**
- 主键唯一性：`ExpectColumnValuesToBeUnique`
- 非空检查：`ExpectColumnValuesToNotBeNull`
- 记录数波动检查：今天的记录数与昨天相比，变化不超过30%

**一致性检查：**
- 外键完整性：订单表中的`user_id`都能在用户表中找到
- 跨表汇总一致性：订单表的`SUM(amount)`等于支付表的`SUM(amount)`
- 枚举值完整性：`status`列的所有值都在期望的枚举范围内

**准确性检查：**
- 范围检查：年龄在0-150之间，金额为正数
- 格式检查：邮箱格式、手机号格式、身份证格式
- 业务逻辑检查：订单的`created_at`不应晚于`paid_at`

**及时性检查：**
- 数据新鲜度：最近一条记录的`created_at`距现在不超过24小时
- 延迟监控：ETL任务的端到端延迟不超过2小时

```python
# 及时性检查的实现示例
import pandas as pd
from datetime import datetime, timedelta

def check_data_freshness(df: pd.DataFrame, max_delay_hours: int = 24):
    """检查数据新鲜度"""
    latest = pd.to_datetime(df['created_at']).max()
    delay = datetime.now() - latest
    if delay > timedelta(hours=max_delay_hours):
        raise ValueError(f"数据延迟{delay.total_seconds()/3600:.1f}小时，超过阈值{max_delay_hours}小时")
    return True

# 在ETL任务中调用
df = pd.read_csv('/data/raw/orders.csv')
check_data_freshness(df, max_delay_hours=2)
```

## 四、端到端数据管道编排

前面我们讲了调度系统和数据质量保障，这一章我们把它们串起来，讲怎么设计一个端到端的数据管道。端到端不只是"从源头到目标"，它还包含错误处理、重试策略、血缘追踪、SLA监控这些"运维层面"的能力。一个真正可用的数据管道，不仅要能跑通，还要能在出问题时快速定位、快速恢复。怕浪猫在这一章会把自己设计和管理数据管道的经验全部写出来，包括分层设计、错误处理、血缘追踪和SLA监控四个维度。

### 4.1 数据管道的分层设计

一个健壮的端到端数据管道，应该像洋葱一样分层。每一层只做一件事情，层与层之间通过明确的接口传递数据。怕浪猫推荐的分层结构是数据仓库领域的经典分层模式，虽然看起来有点重，但每一层都有它存在的意义，不是过度设计。

```
接入层（Extract）→ 原始数据层（Raw）→ 清洗层（Cleaned）→ 聚合层（Aggregated）→ 服务层（Serving）
```

每一层的具体职责：

- **接入层**：从源系统读取数据，不做任何转换，原样写入原始数据层。这一层的目标是"快速、完整地拿到数据"。怕浪猫的实践原则是：接入层代码越简单越好，只做"读-写"，不做任何转换。如果在这一层加了转换逻辑，当转换出错时，你连原始数据都没有，只能重新从源系统拉。
- **原始数据层**：存储接入层拿到的原始数据，格式可以是Parquet、Avro或者压缩的JSON。这一层是"数据保险"，当后续处理出错时可以从这里重新处理。怕浪猫建议原始数据层至少保留30天的数据，这样当你发现下游数据有问题时，有足够的历史数据可以重新处理。
- **清洗层**：对原始数据做格式标准化、空值处理、去重、类型转换。输出干净的数据。这一层是数据质量保障的第一道防线，pandera的Schema验证就放在这一层。
- **聚合层**：按业务需求做聚合计算（比如"按天按城市统计订单量"），输出汇总数据。这一层的逻辑最复杂，也最容易出bug，因为聚合逻辑通常涉及业务规则，而业务规则会变化。
- **服务层**：把聚合层的数据同步到线上的服务数据库或者缓存系统，供API查询。这一层关注的是查询性能和数据时效性。

```python
from dataclasses import dataclass
from typing import Callable, Any

@dataclass
class Pipeline:
    name: str
    extractor: Callable
    transformer: Callable
    loader: Callable

    def run(self):
        print(f"Pipeline {self.name} started")
        raw = self.extractor()
        cleaned = self.transformer(raw)
        self.loader(cleaned)
        print(f"Pipeline {self.name} completed")

# 定义各层的具体实现
def extract_from_mysql():
    import pandas as pd
    return pd.read_sql("SELECT * FROM orders", con='mysql://...')

def clean_orders(df):
    df = df.dropna(subset=['user_id'])
    df['amount'] = df['amount'].fillna(0)
    return df

def load_to_dw(df):
    df.to_sql('dw_orders', con='postgresql://...', if_exists='append')

# 组装管道
pipeline = Pipeline(
    name='orders_etl',
    extractor=extract_from_mysql,
    transformer=clean_orders,
    loader=load_to_dw,
)

pipeline.run()
```

> 数据管道的分层不是过度设计，它是故障隔离的基础。当清洗逻辑出错时，你不需要重新从源系统抽取数据，只需要从原始数据层重新跑后面的层。

### 4.2 错误处理与重试策略

数据管道的错误处理，不能只靠"任务失败了重试三次"这种粗暴的方式。怕浪猫在生产环境中见过太多"无脑重试"的案例：数据库连接池满了，重试三次把连接池压得更满；上游数据格式错了，重试三次还是格式错误，白白浪费了三次计算资源。正确的做法是对错误分类，不同类型的错误用不同的处理策略。怕浪猫把错误分为三类，每类需要不同的处理策略：

**类型一：基础设施故障（网络抖动、数据库连接超时、磁盘满）**
- 处理策略：自动重试，指数退避
- 实现方式：在Task级别配置`retries`和`retry_delay`

**类型二：数据质量故障（空值、格式错误、枚举值不支持）**
- 处理策略：跳过脏数据，记录到"坏数据表"，继续处理剩余数据
- 实现方式：在Transformer内部用`try-except`捕获异常，把失败的行写到单独的文件或表

**类型三：业务逻辑故障（上游schema变化、枚举值新增、关联关系破坏）**
- 处理策略：立即失败，发送告警，等待人工介入
- 实现方式：在管道中加入数据质量检查点，检查失败则抛出异常，触发告警

```python
from airflow.operators.python import PythonOperator
from airflow.utils.dates import days_ago

def extract_with_retry(max_retries=3):
    """带重试的数据接入"""
    import time
    for attempt in range(max_retries):
        try:
            # 模拟可能失败的数据接入
            return pd.read_sql("SELECT * FROM orders", con='mysql://...')
        except Exception as e:
            if attempt == max_retries - 1:
                raise  # 最后一次重试仍然失败，抛出异常
            wait_time = 2 ** attempt  # 指数退避：1s, 2s, 4s
            print(f"Attempt {attempt+1} failed: {e}. Waiting {wait_time}s")
            time.sleep(wait_time)

def transform_with_error_handling(df: pd.DataFrame):
    """带错误处理的数据转换：跳过脏数据，记录失败行"""
    good_rows = []
    bad_rows = []

    for idx, row in df.iterrows():
        try:
            # 业务规则检查
            if row['amount'] < 0:
                raise ValueError(f"Negative amount: {row['amount']}")
            if not isinstance(row['user_id'], (int, float)):
                raise ValueError(f"Invalid user_id: {row['user_id']}")
            good_rows.append(row)
        except Exception as e:
            row['error'] = str(e)
            bad_rows.append(row)

    # 把坏数据写到单独的地方
    if bad_rows:
        bad_df = pd.DataFrame(bad_rows)
        bad_df.to_csv(f'/data/bad_rows/orders_{datetime.now():%Y%m%d_%H%M%S}.csv', index=False)
        print(f"Skipped {len(bad_rows)} bad rows, saved to /data/bad_rows/")

    return pd.DataFrame(good_rows)
```

> 重试是解决"暂时性故障"的，不是解决"永久性故障"的。区分这两类故障，是设计健壮数据管道的关键。

### 4.3 数据血缘追踪：当数据出错时，你需要知道根因在哪里

数据血缘（Data Lineage）追踪的是"数据从哪里来，经过哪些处理，最终到哪里去"。当报表数据出错时，如果没有血缘追踪，你需要手动追溯每一个中间表、每一次转换，才能找到根因。怕浪猫曾经在一个没有血缘追踪的数据平台工作过，每次数据出了问题，排查时间平均要四个小时，其中大部分时间花在"这个字段是哪个SQL计算出来的"这种考古式的问题上。有了血缘追踪，你可以直接看到"这个字段的值是由哪张源表的哪些字段计算出来的"，根因分析从"翻代码"变成了"点鼠标"，排查时间从四个小时缩短到三十分钟。

血缘追踪分为两个层次，表级血缘和字段级血缘。表级血缘告诉你表与表之间的依赖关系，字段级血缘告诉你字段与字段之间的计算关系。字段级血缘比表级血缘难得多，因为它需要解析SQL语句，理解每个SELECT、JOIN、CASE WHEN的语义，然后追踪每个输出字段是从哪些输入字段计算来的。目前开源的字段级血缘工具主要是SQLLineage和OpenLineage，商业工具有Collibra和Alation。

在开源世界里，DataHub和OpenMetadata是两个主流的数据血缘平台。DataHub由LinkedIn开源，用Java和Python编写，功能最全面，支持自动从Airflow、dbt、Spark、Kafka等数据源提取血缘关系。OpenMetadata是较新的项目，API设计更现代，但生态不如DataHub成熟。它们的核心功能是：自动扫描你的ETL代码（支持Airflow、Spark、dbt等），提取血缘关系，存储在图数据库中，然后通过Web UI展示。怕浪猫在项目中用的是DataHub，主要是因为它对Airflow和dbt的支持最好。

```python
# 使用DataHub的Python SDK手动上报血缘关系
from datahub.emitter.mce_builder import make_dataset_urn
from datahub.emitter.rest_emitter import DatahubRestEmitter

# 定义上游表URN
source_urn = make_dataset_urn(platform="mysql", name="orders", env="PROD")
# 定义下游表URN
target_urn = make_dataset_urn(platform="postgres", name="dw_orders", env="PROD")

# 上报血缘关系
emitter = DatahubRestEmitter(gms_server="http://localhost:8080")
emitter.emit(
    make_lineage_mce(
        upstream_urns=[source_urn],
        downstream_urn=target_urn,
        actor="urn:li:corpuser:wujihuan",
    )
)
```

怕浪猫的建议是：如果你的数据表少于50张，手动维护血缘文档就够了（用一个Markdown文件或者Excel表格记录表与表之间的依赖关系）。但如果表超过50张，手动维护就开始吃力了，文档很快就会过时。如果你的数据表超过200张，且有很多人在同时使用，上DataHub或者OpenMetadata这样的专业血缘平台。血缘追踪的投入产出比在"数据表数量超过100"这个拐点之后会急剧上升，因为人脑已经无法记住这么多表之间的依赖关系了。

### 4.4 SLA监控与告警

数据管道的SLA（Service Level Agreement）通常定义为"每天上午8点之前，昨天的所有数据必须就绪"。如果8点还没就绪，就是SLA违约，需要告警。SLA不只是技术指标，它是数据团队对业务方的承诺。怕浪猫在项目中见过因为SLA频繁违约，业务方对数据团队失去信任，开始自己用Excel做报表的情况。一旦业务方回到Excel，你的数据平台就名存实亡了。所以SLA监控不是可选项，是数据平台的生死线。

在Airflow中，SLA通过DAG级别的`sla`参数定义：

```python
from datetime import timedelta

with DAG(
    dag_id='daily_etl',
    start_date=datetime(2024, 1, 1),
    schedule_interval='0 2 * * *',
    sla_miss_callback=my_sla_callback,  # SLA违约时的回调函数
    default_args={
        'sla': timedelta(hours=4),  # 从调度时间算起，4小时内必须完成
    }
) as dag:
    ...
```

`sla_miss_callback`可以配置成发送邮件、调用Webhook、推送到Slack等。怕浪猫配置的是推送到Slack，这样每天早上在Slack里就能看到"哪些ETL任务按时完成了，哪些延迟了"。Slack消息里包含DAG名称、违约的Task名称、预期的SLA时间、实际的执行时间，让数据工程师一眼就能看出问题出在哪里。

除了SLA监控，还有一个重要的监控维度是"数据量异常检测"。SLA监控只能告诉你"任务有没有按时完成"，但不能告诉你"数据有没有问题"。一个任务可能按时完成了，但写入的数据量只有平时的一半，这种情况SLA不会告警，但数据实际上是错的。怕浪猫在项目中实现的方式是：每天记录每个表的记录数，存入一个`data_volume_metrics`表，然后用简单的统计方法（比如"过去7天记录数的中位数 ± 2倍标准差"）检测异常。如果今天的记录数偏离太多，自动触发告警。这个机制虽然简单，但效果出奇的好，帮我们发现过多次"沉默的数据问题"。

```python
def check_data_volume_anomaly(table_name: str, today_count: int):
    """数据量异常检测"""
    import numpy as np
    # 获取过去7天的记录数
    history = get_history_counts(table_name, days=7)
    median = np.median(history)
    std = np.std(history)

    if abs(today_count - median) > 2 * std:
        send_alert(f"数据量异常：{table_name} 今日记录数{today_count}，"
                   f"过去7天中位数{median:.0f}，偏离超过2倍标准差")
```

> 监控数据管道的"健康状态"，不能只看"任务是否成功"。任务成功了，但数据量只有平时的一半，这也是故障。

## 五、实战踩坑总结

最后，怕浪猫把这一年做数据调度和质量保障踩过的坑总结成一个清单。每一条都是真金白银的教训，有些是怕浪猫自己踩的，有些是同事踩了怕浪猫帮忙收拾残局的。写在这里不是为了丢人，而是希望你看了之后能绕过去。技术人的成长就是踩坑填坑的过程，但有些坑别人已经踩过了，你没必要再踩一遍。

**数据调度与质量保障避坑清单：**

1. DAG文件里不要写重IO操作。DAG文件在Scheduler的解析循环中被反复执行，一个慢的import或者网络请求会拖慢所有DAG的调度。

2. 不要在DAG文件中用`datetime.now()`。用`{{ ts }}`模板变量获取任务执行时间。execution_date是"数据时间窗口"，不是"任务执行时间"，这两个概念要分清楚。

3. XCom只传小数据。需要传大数据时，传文件路径。怕浪猫见过有人用XCom传一个5MB的JSON，元数据库直接被拖慢。

4. Executor的选择要匹配你的负载特征。如果Task执行时间差异很大（有的10秒，有的2小时），用CeleryExecutor做任务隔离，避免短任务被长任务阻塞。

5. 数据质量检查要分层。接入时检查格式完整性，转换后检查业务规则，写入后检查行数汇总。只在一个点检查，总会有漏网之鱼。

6. pandera适合代码内验证，Great Expectations适合平台化数据质量管理。小团队用pandera足够，大团队（有专门的数据质量工程师）上GE。

7. 数据血缘不是可有可无的"文档"，它是故障排查的"地图"。表超过100张就应该考虑引入血缘追踪工具。

8. SLA监控要包含"数据量异常检测"。任务成功但数据量异常，这种故障比任务失败更危险，因为它不易被发现。

9. 重试策略要区分"可重试错误"和"不可重试错误"。数据格式错误不应该重试，重试一百次还是格式错误。网络连接超时才应该重试。

10. 调度系统本身要有高可用方案。Scheduler是单点（Airflow 2.x已经支持Scheduler HA，但需要正确配置）。怕浪猫的建议是：Scheduler部署两个节点，一个Active一个Standby，通过负载均衡或者Keepalived实现故障切换。

> 数据调度和数据质量，是数据工程的"左右护法"。调度保证数据"按时到"，质量保证数据"值得信"。缺了任何一个，数据平台都是不完整的。

## 收藏引导

如果你觉得这篇文章对你有帮助，点个收藏吧。工作流调度和数据质量的东西太碎了，这篇基本把从Airflow架构、Prefect/Dagster对比、pandera/GE实战、端到端管道编排到血缘追踪的完整链路都覆盖了，下次遇到问题可以直接当手册查。

## 互动引导

你在使用Airflow或者做数据质量保障时踩过最大的坑是什么？是Scheduler的OOM，还是数据质量问题的静默失败？在评论区聊聊，怕浪猫会挨个回复。如果遇到了具体的技术问题，也可以提出来，下篇文章可以针对性解答。

## 追更引导

这是Python实战训练营的第14周内容。如果你跟着追到这里，说明你已经进入了数据工程的核心领域。后面的内容会更偏架构和运维，关注我，别掉队。

---

**系列进度 14/16**

**下章预告：** 第15章 CI/CD与容器化部署。ETL管道写好了，调度系统跑起来了，但怎么把代码可靠地部署到生产环境？怎么用Docker容器化你的Python应用？怎么用GitHub Actions实现自动化测试和部署？下一章我们从CI/CD流水线设计、Docker多阶段构建、Kubernetes生产部署三个维度，把Python应用从"能跑"升级到"生产级部署"。

## 怕浪猫说

数据调度和数据质量这件事，表面上看起来是"让任务按时跑"和"让数据没错"，但深层来说是"建立对数据管道的确定感"。当你凌晨三点被叫醒时，你希望是因为真正的故障，而不是因为调度系统本身的脆弱。当你给业务方看报表时，你希望是因为数据真的可信，而不是因为还没人被发现问题。数据工程的本质不是写代码，是建立信任。业务方信任你的数据，才会用你的数据做决策；数据团队信任自己的管道，才敢在凌晨安睡。怕浪猫写这篇文章的时候，翻了很多自己以前踩坑的记录，有些坑现在看来挺低级的，但当时确实卡了很久。技术成长就是这样，踩过的坑变成了经验，经验变成了直觉。希望这篇文章能帮你少踩几个坑，把时间花在更有价值的事情上。下周见。
