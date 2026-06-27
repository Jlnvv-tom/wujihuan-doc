# 第15章 CI/CD与容器化部署

你写完了一个Python项目,本地跑得好好的。你把代码传到服务器上,`pip install -r requirements.txt`报了一堆依赖冲突。你花了两小时解决依赖,启动应用又报`ModuleNotFoundError`。等你把所有问题解决完,天已经亮了,而你的同事问你:能不能在新服务器上再部署一次?你沉默了。

如果你经历过这些,说明你需要系统性地理解Python项目的工程化、容器化和CI/CD流水线。不是"能跑就行",而是"任何人一键就能跑"。

我是怕浪猫,这是Python实战训练营第15周的内容。本周我们从项目结构规范讲到Docker多阶段构建,从GitHub Actions流水线讲到Kubernetes部署策略,把"从代码到生产"这条路上的坑全部踩一遍。

## 一、Python项目工程化:从草台班子到正规军

很多人写Python项目就是建个文件夹,扔几个`.py`文件进去,加个`requirements.txt`完事。项目小没问题,等项目大了、人多协作了,你会发现包导入路径不对、依赖版本飘了、代码风格不统一。

### 1.1 项目结构:src layout vs flat layout

Python项目有两种主流目录结构。flat layout直接把包目录放在项目根目录下,src layout则把包放在`src/`下。

```text
# flat layout
my_project/
  my_package/
    __init__.py
    core.py
  tests/
  pyproject.toml

# src layout
my_project/
  src/
    my_package/
      __init__.py
      core.py
  tests/
  pyproject.toml
```

flat layout有致命问题:`pip install`之前,`import my_package`直接从项目根目录导入而非site-packages。开发环境跑测试用的是源码,可能掩盖打包配置错误。发布到PyPI后用户装完发现import报错。

src layout强制把源码放在`src/`下,开发时必须`pip install -e .`才能import,测试用的就是真正安装的包,打包配置的错误在开发阶段就能发现。

> 项目结构不是审美问题,是工程问题。一个好的结构能在开发阶段就帮你挡住打包发布时的低级错误。

怕浪猫的踩坑:接手一个flat layout项目,`find_packages()`漏配子包。开发环境一切正常,发布到PyPI后用户反馈import报错,折腾半天才定位。换成src layout后,这类问题在`pip install -e .`阶段就会暴露。

### 1.2 pyproject.toml:统一配置的中心

PEP 518引入了`pyproject.toml`作为Python项目的统一配置文件,PEP 621进一步规范了元数据格式。以前你需要`setup.py`、`setup.cfg`、`.flake8`、`.isort.cfg`等一堆配置文件,现在全部可以收拢到一个`pyproject.toml`里。

```toml
[build-system]
requires = ["setuptools>=68.0", "wheel"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "my-package"
version = "1.2.0"
description = "A sample Python package"
readme = "README.md"
requires-python = ">=3.10"
dependencies = [
    "fastapi>=0.100.0",
    "uvicorn[standard]>=0.23.0",
    "pydantic>=2.0",
    "sqlalchemy>=2.0",
]

[project.optional-dependencies]
dev = ["pytest>=7.0", "ruff>=0.1.0", "mypy>=1.5", "pre-commit>=3.0"]

[project.scripts]
my-app = "my_package.main:run"

[tool.setuptools.packages.find]
where = ["src"]
```

`setup.py`和`setup.cfg`仍然向后兼容,但新项目应该直接用`pyproject.toml`。`setup.py`唯一的残留价值是当你需要动态逻辑时,但这种情况非常少见。

一个容易踩的坑:`requires-python`写`>=3.10`,CI只测了3.11和3.12,结果有用户用3.10.0发现某些标准库函数不存在(3.10.1才加的)。CI的Matrix里要覆盖所有支持版本。

### 1.3 依赖管理工具对比

Python的依赖管理工具之多,堪称编程语言之最。每个工具都说自己解决了依赖地狱,结果工具本身就成了依赖地狱的一部分。

| 工具 | lock文件 | 虚拟环境 | 发布到PyPI | 速度 | 学习成本 |
|------|----------|----------|------------|------|----------|
| pip-tools | requirements.txt | 不管理 | 不支持 | 快 | 低 |
| poetry | poetry.lock | 自动管理 | 支持 | 中等 | 中等 |
| pdm | pdm.lock | 自动管理 | 支持 | 中等 | 中等 |
| uv | uv.lock | 自动管理 | 支持 | 极快 | 低 |

pip-tools最轻量。写`requirements.in`列顶层依赖,`pip-compile`生成含所有间接依赖精确版本的`requirements.txt`,`pip-sync`安装。不管虚拟环境和发布。

poetry是最流行的全功能方案,同时管理依赖、虚拟环境、打包发布。`poetry add`安装依赖并自动更新lock文件,`poetry build`打包,`poetry publish`发布。

uv是Astral公司用Rust写的,速度碾压其他所有工具。`uv pip install`比`pip install`快10-100倍,同时支持pip兼容接口和项目管理接口。

```bash
# uv的项目管理
uv init my-project
uv add fastapi uvicorn pydantic
uv add --dev pytest ruff mypy
uv lock
uv sync
```

> 依赖管理的本质不是装包,是确保"我这台机器上能跑"和"你那台机器上也能跑"用的是同一份依赖快照。lock文件就是这个快照。

怕浪猫的建议:新项目直接上uv。如果团队已在用poetry,没必要强迁。不管选哪个工具,**lock文件一定要提交到版本控制**,这是铁律。

### 1.4 ruff:一个工具干掉五个工具

以前Python开发者需要配置flake8、isort、black、pydocstyle等一堆工具,每个有自己的配置文件,还可能冲突。ruff用Rust实现,全部替代,速度快100倍以上。

```toml
[tool.ruff]
line-length = 100
target-version = "py310"
src = ["src", "tests"]

[tool.ruff.lint]
select = ["E", "W", "F", "I", "B", "C4", "UP", "SIM", "RUF"]
ignore = ["E501"]

[tool.ruff.format]
quote-style = "double"
```

ruff配置有个坑:同时用`ruff check`和`ruff format`时,`E501`(行太长)规则应该忽略,交给格式化器处理。不禁用的话检查器和格式化器会打架。

### 1.5 mypy静态类型检查

mypy在不运行代码的情况下分析类型标注,帮你提前发现类型错误。

```python
from typing import Protocol, TypeVar, Generic, List

# Protocol:结构化子类型(鸭子类型的静态版本)
class Closeable(Protocol):
    def close(self) -> None: ...

def safe_close(obj: Closeable) -> None:
    obj.close()

class FileResource:
    def close(self) -> None:
        print("file closed")

safe_close(FileResource())  # mypy检查通过

# TypeVar和Generic:泛型
T = TypeVar("T")

class Stack(Generic[T]):
    def __init__(self) -> None:
        self._items: List[T] = []
    def push(self, item: T) -> None:
        self._items.append(item)
    def pop(self) -> T:
        return self._items.pop()
```

mypy建议配置`strict`模式但逐步推进。一开始全量strict会产生几百个错误劝退团队。怕浪猫的路线:先开`--disallow-untyped-defs`,再逐步开其他选项。

> 类型标注不是给解释器看的,是给人和工具看的。你花在写类型上的每一分钟,都会在debug时省回来五分钟。

### 1.6 pre-commit git hooks

pre-commit在`git commit`之前执行检查,把问题挡在提交之前。

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.10.0
    hooks:
      - id: mypy
        additional_dependencies: [pydantic, sqlalchemy]
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-merge-conflict
```

团队推广pre-commit的坑:开发者clone后忘了`pre-commit install`,hooks不生效。解决办法:CI里也运行`pre-commit run --all-files`兜底。

## 二、容器化与Docker:把环境装进盒子

Python项目部署最大痛点是环境一致性。Docker通过容器化把应用和整个运行环境打包成不可变镜像,彻底解决了这个问题。"在我机器上能跑"之所以成为经典笑话,就是因为环境差异导致的部署问题太常见了。Docker通过容器化把应用和整个运行环境打包成不可变镜像,彻底解决了这个问题。

### 2.1 Dockerfile最佳实践

一个糟糕的Dockerfile会导致镜像体积超大、构建极慢、安全隐患丛生。来看怕浪猫从血泪教训中总结的最佳实践。

```dockerfile
# 多阶段构建
FROM python:3.12-slim AS builder
WORKDIR /app

# 先复制依赖文件,利用Layer Cache
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync --frozen --no-dev --no-install-project

# 复制源码并安装项目
COPY src/ ./src/
RUN uv sync --frozen --no-dev

# 运行阶段:最小化镜像
FROM python:3.12-slim AS runtime
RUN groupadd -r appuser && useradd -r -g appuser appuser
WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/src /app/src
COPY --from=builder /app/pyproject.toml /app/

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
USER appuser
EXPOSE 8000
CMD ["uvicorn", "my_package.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

关键实践：多阶段构建让构建工具不进入最终镜像。Layer Cache优化——把`COPY pyproject.toml`放在`COPY src/`前面，改代码后依赖安装那层命中缓存。非root用户运行，即使被攻破也只有有限权限。

基础镜像选择上，slim是最佳平衡点。alpine用musl libc替代glibc，很多Python包的预编译wheel不兼容，需要从源码编译。怕浪猫用alpine构建含numpy和pandas的项目，构建时间从30秒暴增到8分钟，老老实实换回slim。

> Docker镜像不是越精简越好,是越可预测越好。你构建10次应该得到10个一模一样的镜像,这就是不可变基础设施的意义。

### 2.2 .dockerignore优化

没有`.dockerignore`,你的`.git`目录、`__pycache__`、`.venv`全部会被发送为构建上下文,拖慢构建。

```text
# .dockerignore
.git
__pycache__
*.pyc
.venv
venv
tests/
docs/
.vscode
.idea
dist/
build/
*.egg-info/
```

一个容易被忽略的点：`.dockerignore`在构建上下文传输阶段生效。如果你单独`COPY tests/ /app/tests/`，但`.dockerignore`排除了`tests/`，会报错——构建上下文里没有这个目录了。

### 2.3 Docker Compose多服务编排

实际项目很少只有一个Python应用。Docker Compose让你用一个YAML文件定义所有服务,一条命令启动整个环境。

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports: ["8000:8000"]
    environment:
      - DATABASE_URL=postgresql://appuser:secret@db:5432/appdb
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      db:
        condition: service_healthy
    networks: [app-network]

  db:
    image: postgres:16-slim
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: appdb
    volumes: [postgres-data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser"]
      interval: 5s
      retries: 5
    networks: [app-network]

  redis:
    image: redis:7-alpine
    volumes: [redis-data:/data]
    networks: [app-network]

volumes:
  postgres-data:
  redis-data:

networks:
  app-network:
    driver: bridge
```

`depends_on`默认只等依赖服务启动，不等就绪。加`condition: service_healthy`，app会等db的healthcheck通过后才启动。`pg_isready`比TCP端口检查可靠得多。

> Compose文件就是你的基础设施即代码。一个`docker compose up`应该能让整个项目在任何机器上跑起来。

### 2.4 镜像优化与安全

distroless镜像只含运行时必需文件，没有shell、没有包管理器。攻击者即使拿到容器权限也没有shell可用，安全性极高。但调试困难——你没法`docker exec`进去排查问题。

Multi-arch构建支持AMD64和ARM64。随着ARM服务器普及,你需要同时构建多架构镜像:

```bash
docker buildx create --name multiarch --use
docker buildx build --platform linux/amd64,linux/arm64 \
  -t myregistry/my-app:1.0.0 --push .
```

镜像扫描工具Trivy和Grype能检测镜像中的CVE漏洞。要在CI流水线里自动执行，发现高危漏洞就阻断构建。但有些漏洞在特定场景下不受影响，需根据实际情况判断是否忽略。

## 三、CI/CD流水线:让交付变成流水线

CI/CD的核心思想是：每次代码变更都自动经历构建、测试、部署流程。成熟的流水线能让团队从“手动部署两小时、出问题回滚一小时”变成“推送代码五分钟后自动上线”。

### 3.1 GitHub Actions

GitHub Actions是目前最流行的CI/CD平台,与GitHub深度集成,配置简单,社区生态丰富。

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.10", "3.11", "3.12"]
    services:
      postgres:
        image: postgres:16-slim
        env:
          POSTGRES_USER: testuser
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: testdb
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U testuser"
          --health-interval 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv sync --frozen
      - run: uv run ruff check src/ tests/
      - run: uv run mypy src/
      - run: uv run pytest --cov=src tests/
        env:
          DATABASE_URL: postgresql://testuser:testpass@localhost:5432/testdb
```

Matrix策略创建3个并行job，分别在Python 3.10、3.11、3.12上运行测试。Services块启动PostgreSQL容器，healthcheck确保就绪后才开始测试。`setup-uv` action自动缓存安装。

Secrets管理有几个注意点：第一，Secrets在日志中会被遮蔽，但如果值太短太常见会导致日志不可读。第二，fork的PR中不能访问仓库级Secrets。第三，敏感信息传递给Docker构建时，用BuildKit的`--secret`而不是`ARG`，因为`ARG`会留在镜像历史中。

> CI流水线不是越快越好,是越可靠越好。一个偶尔失败的流水线比一个慢但稳定的流水线有害得多,因为它会侵蚀团队对CI的信任。

### 3.2 GitLab CI/CD

GitLab CI/CD是企业环境的流行选择,配置文件是`.gitlab-ci.yml`,采用Stage/Job体系。

```yaml
# .gitlab-ci.yml
stages: [lint, test, build, deploy]

cache:
  key:
    files: [uv.lock]
  paths: [.uv-cache]

lint:
  stage: lint
  image: python:3.12-slim
  before_script:
    - pip install uv && uv sync --frozen --no-dev
  script:
    - uv run ruff check src/ tests/
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

test:
  stage: test
  image: python:3.12-slim
  services:
    - name: postgres:16-slim
      alias: db
      variables:
        POSTGRES_USER: testuser
        POSTGRES_PASSWORD: testpass
        POSTGRES_DB: testdb
  variables:
    DATABASE_URL: postgresql://testuser:testpass@db:5432/testdb
  before_script:
    - pip install uv && uv sync --frozen
  script:
    - uv run pytest --cov=src tests/
  coverage: '/TOTAL.*\s+(\d+\%)$/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage.xml
  rules:
    - if: $CI_COMMIT_BRANCH == "main"

build-image:
  stage: build
  image: docker:24
  services: [docker:24-dind]
  before_script:
    - echo $CI_REGISTRY_PASSWORD | docker login -u $CI_REGISTRY_USER
        --password-stdin $CI_REGISTRY
  script:
    - docker buildx build --push -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA .
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

GitLab CI/CD和GitHub Actions的关键对比:

| 特性 | GitHub Actions | GitLab CI/CD |
|------|---------------|--------------|
| 配置文件 | YAML,per-workflow | YAML,per-pipeline |
| 组织方式 | Job + Step | Stage + Job |
| 缓存 | actions/cache | cache关键字 |
| 制品 | upload-artifact | artifacts关键字 |
| 内置容器仓库 | 需要外部(GHCR) | 内置Container Registry |
| 动态Pipeline | 不原生支持 | child pipeline + trigger |

GitLab的独特优势是内置Container Registry和动态Pipeline（通过`trigger`关键字生成子Pipeline），在复杂场景下很有用。

### 3.3 部署策略对比

镜像构建好了,怎么部署到生产环境?直接停掉旧服务再启动新服务会导致服务中断。现代部署策略有多种方案。

**滚动更新**。逐步用新版本实例替换旧版本,期间两版本共存。Kubernetes Deployment的默认策略,适合大多数场景。`maxSurge`和`maxUnavailable`控制更新节奏。

**蓝绿部署**。准备两套完全相同的环境,新版本部署到备用环境,验证通过后切换流量。回滚极快(只需切换流量),但需要双倍资源。

```bash
# Kubernetes蓝绿部署:切换Service selector
kubectl patch service my-app -p '{"spec":{"selector":{"version":"green"}}}'

# 出问题立刻切回
kubectl patch service my-app -p '{"spec":{"selector":{"version":"blue"}}}'
```

**金丝雀发布**。先把少量流量导到新版本,观察没问题再逐步增加比例。更安全(问题只影响小部分用户),但实现更复杂。

```yaml
# Nginx Ingress金丝雀发布:10%流量到新版本
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app-canary
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"
```

| 策略 | 停机时间 | 回滚速度 | 资源开销 | 复杂度 | 适用场景 |
|------|----------|----------|----------|--------|----------|
| 滚动更新 | 无 | 中等 | 低 | 低 | 常规版本迭代 |
| 蓝绿部署 | 无 | 极快 | 高 | 中等 | 大版本升级 |
| 金丝雀发布 | 无 | 快 | 中等 | 高 | 高风险变更 |

> 部署策略的选择不是技术问题,是风险偏好问题。你愿意为"出问题时影响最小"付出多大的资源成本和运维复杂度?

### 3.4 Docker Swarm轻量级集群

不是所有团队都需要Kubernetes。对于小规模部署,Docker Swarm是更轻量的选择。Swarm是Docker内置的集群模式,不需要额外安装。

```yaml
# docker-compose.prod.yml(Swarm配置)
services:
  app:
    image: myregistry/my-app:1.0.0
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
      restart_policy:
        condition: any
        max_attempts: 3
      resources:
        limits:
          cpus: "0.5"
          memory: 512M
    networks: [app-network]

  db:
    image: postgres:16-slim
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: appdb
    volumes: [postgres-data:/var/lib/postgresql/data]
    deploy:
      placement:
        constraints: [node.role == manager]
    networks: [app-network]

volumes:
  postgres-data:

networks:
  app-network:
    driver: overlay
```

Docker Swarm的`deploy`配置在普通`docker compose up`时被忽略，只有`docker stack deploy`才生效。同一个compose文件可同时用于本地开发和集群部署。

怕浪猫的实际经验：一个5人团队、3台服务器的项目，用Docker Swarm比Kubernetes省心得多。Swarm学习成本几乎为零，而Kubernetes需要专门运维人员。但如果服务超过20个、需要自动扩缩容，就该上Kubernetes了。

### 3.5 完整CI/CD流水线模板

把前面的内容串起来,这是一个完整的CI/CD流水线检查清单:

**代码提交阶段**:pre-commit hooks执行ruff lint、格式化、基础检查

**CI阶段(PR触发)**:依赖安装(缓存)、ruff lint检查、mypy类型检查、单元测试+覆盖率、集成测试(with services容器)、镜像构建验证、镜像安全扫描

**CD阶段(main分支触发)**:构建镜像并推送、部署到staging、运行smoke test、手动审批(可选)、部署到production、健康检查、失败自动回滚

```yaml
# 完整CI/CD流水线
name: CI/CD
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  test:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.10", "3.12"]
    services:
      postgres:
        image: postgres:16-slim
        env: {POSTGRES_USER: testuser, POSTGRES_PASSWORD: testpass, POSTGRES_DB: testdb}
        ports: ["5432:5432"]
        options: --health-cmd "pg_isready" --health-interval 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv sync --frozen
      - run: uv run ruff check src/ tests/
      - run: uv run mypy src/
      - run: uv run pytest --cov=src tests/
        env:
          DATABASE_URL: postgresql://testuser:testpass@localhost:5432/testdb

  build-and-deploy:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      - name: Security scan
        run: trivy image --severity HIGH,CRITICAL --exit-code 1
          ghcr.io/${{ github.repository }}:${{ github.sha }}
      - name: Deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/my-app
            docker compose pull && docker compose up -d
            sleep 10
            curl -f http://localhost:8000/health || exit 1
```

PR只跑测试不部署，main分支推送才触发构建和部署。镜像扫描发现高危漏洞会阻断部署。部署后自动健康检查，失败则job标记失败。

## 四、实战踩坑汇总

怕浪猫把CI/CD和容器化部署中的真实坑位整理出来,每个都是血的教训。

**坑1:Docker构建中的.git目录泄露**。用`COPY . /app/`没配`.dockerignore`,`.git`目录被打进镜像,体积直接翻倍。更危险的是`.git`里可能包含曾经的密钥。解决方案:务必配置`.dockerignore`排除`.git`。

**坑2:pip install没固定版本导致CI飘红**。`requirements.txt`写了`flask>=2.0`没锁定间接依赖。某天一个间接依赖发了有bug的新版本,CI突然全红但代码一行没改。解决方案:用lock文件锁定所有依赖精确版本。

**坑3:Docker Compose的depends_on不等服务就绪**。app启动时连db报`Connection refused`然后崩溃。解决方案:用`condition: service_healthy`配合healthcheck。

**坑4:Kubernetes livenessProbe配置不当导致Pod反复重启**。`initialDelaySeconds`设成5秒,但应用启动需要15秒。Pod启动5秒后检查失败被杀掉重启,循环往复。解决方案:`initialDelaySeconds`要大于最长启动时间,或用startupProbe。

**坑5:CI缓存key设置不当导致缓存失效**。缓存key没带依赖文件hash,结果缓存了旧依赖。解决方案:缓存key必须包含`hashFiles('uv.lock')`,依赖变了缓存自动失效。

> 每一个坑都是用加班时间填出来的。把坑记录下来并固化到流程中,是防止重复踩坑的唯一方法。

## 五、项目工程化检查清单

最后,怕浪猫给你一份Python项目工程化的检查清单,可以当成新项目的起手式,逐项检查。

**项目结构**
- 使用src layout,源码放在`src/`下
- `pyproject.toml`作为唯一配置入口
- lock文件提交到版本控制
- `.gitignore`排除`__pycache__`、`.venv`、`dist`等

**代码质量**
- ruff替代flake8+isort+black,配置在`pyproject.toml`
- mypy开启`disallow_untyped_defs`
- pre-commit配置ruff、mypy、基础hooks
- CI流水线中也运行pre-commit检查

**容器化**
- Dockerfile使用多阶段构建
- 基础镜像用`python:3.x-slim`
- 配置`.dockerignore`排除无关文件
- Layer Cache优化:先复制依赖文件,再复制源码
- 非root用户运行
- docker-compose.yml定义完整开发环境

**CI/CD**
- PR触发lint + type-check + test
- Matrix策略覆盖所有支持的Python版本
- Services容器提供测试依赖
- 依赖缓存加速构建
- main分支触发构建镜像 + 部署
- 镜像安全扫描阻断高危漏洞
- 部署后自动健康检查
- 回滚机制可用

**部署**
- 健康检查端点(`/health`和`/ready`分离)
- 优雅关闭(处理SIGTERM信号)
- 配置通过环境变量注入,不硬编码
- 日志输出到stdout/stderr,不写文件
- 资源限制(CPU/Memory limits)

这份清单不是一次性的,每个项目启动时过一遍,能帮你省掉后期无数的补救工作。

## 收藏引导

这篇文章从Python项目结构规范讲到Docker多阶段构建,从GitHub Actions流水线讲到Kubernetes部署策略,覆盖了"从代码到生产"的完整链路。如果你觉得有用,点个收藏,下次配置CI/CD流水线的时候直接拿来抄。

## 互动引导

你目前在CI/CD和容器化部署中遇到过最坑的问题是什么?是Docker镜像体积太大、CI流水线太慢、还是部署回滚出了事故?欢迎在评论区分享你的踩坑经历,怕浪猫会逐条回复。

## 追更引导

这是Python实战训练营系列的第15章,整个系列共16章,覆盖从Python基础到生产部署的完整路径。如果你还没看过前面的章节,建议从第1章开始系统学习。点个关注,不错过后续更新。

## 系列进度 15/16

下章预告:第16章「性能优化与生产就绪」--Python性能瓶颈分析、asyncio异步编程深入、gunicorn/uvicorn工作模型调优、APM监控与告警体系、日志聚合与链路追踪、生产环境故障排查手册。从"能部署"到"能扛住流量",最后一章收尾,把生产环境的最佳实践讲透。

## 怕浪猫说

工程化、容器化、CI/CD这些东西,初学者觉得是"锦上添花",老手知道是"雪中送炭"。区别在于你有没有经历过凌晨三点上线出故障的绝望。好的工程化不是让你写代码更快,而是让你出错时损失更小;好的CI/CD不是让你部署更快,而是让你回滚时不犹豫。这些基础设施就像保险,你平时感觉不到它的存在,但出事的时候它能救你的命。怕浪猫在这条路上走了很多年,最大的感悟就是:别等出事了才补课,从第一个commit开始就把规矩立好。我们下周最后一章见。
