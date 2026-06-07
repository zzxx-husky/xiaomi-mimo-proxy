# Xiaomi MiMo Proxy

一个用于代理小米MiMo API请求的proxy服务器，专门处理Agent产品中reasoning_content字段的缓存和注入问题。

## 为什么需要这个Proxy？

小米的MiMo Agent产品在多轮对话中要求必须返回完整的`reasoning_content`字段，否则会返回400错误。这是因为缺失历史`reasoning_content`会导致模型上下文不完整，可能降低指令遵循能力、增加幻觉，整体用户体验下降。

本proxy通过以下方式解决这个问题：

1. **自动拦截请求**：捕获所有发送到小米MiMo API的请求
2. **缓存reasoning_content**：将每个对话中的reasoning_content存储在内存中
3. **自动注入历史内容**：在后续请求中自动注入之前缓存的reasoning_content
4. **支持多对话独立缓存**：每个对话维护独立的reasoning_content历史

## 特性

- ✅ **无需API Token**：Proxy只负责拦截请求、处理reasoning_content的缓存和注入，API Token由Agent工具直接传递
- ✅ **多对话支持**：每个对话维护独立的reasoning_content历史
- ✅ **自动缓存**：自动提取和缓存reasoning_content
- ✅ **自动注入**：在后续请求中自动注入历史reasoning_content
- ✅ **详细日志**：所有操作都有详细的日志记录
- ✅ **后台运行**：支持后台运行，自动管理进程

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑`.env`文件，配置小米的URL：

```env
# 小米MiMo API配置
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/anthropic

# Proxy服务器配置
PROXY_PORT=3000
```

### 3. 启动服务器

```bash
# 启动服务器（后台运行）
./start.sh
```

### 4. 配置Agent工具

在你的Agent工具（如Claude Code）中配置：

```json
{
  "apiProvider": "anthropic",
  "baseUrl": "http://localhost:3000",
  "apiKey": "your_mimo_api_key"
}
```

## 使用方法

### 启动服务器

**Linux/macOS:**
```bash
# 启动服务器（后台运行）
./start.sh
```

**Windows (PowerShell):**
```powershell
# 启动服务器（后台运行）
.\start.ps1
```

### 停止服务器

**Linux/macOS:**
```bash
# 停止服务器
./stop.sh
```

**Windows (PowerShell):**
```powershell
# 停止服务器
.\stop.ps1
```

### 查看状态

**Linux/macOS:**
```bash
# 查看服务器状态
./status.sh
```

**Windows (PowerShell):**
```powershell
# 查看服务器状态
.\status.ps1
```

### 查看日志

**Linux/macOS:**
```bash
# 查看实时日志
tail -f logs/proxy-$(date +%Y-%m-%d).log
```

**Windows (PowerShell):**
```powershell
# 查看实时日志
Get-Content logs\proxy-$(Get-Date -Format 'yyyy-MM-dd').log -Wait
```

## API端点

### 健康检查

```bash
GET /health
```

响应示例：
```json
{
  "status": "healthy",
  "timestamp": "2026-06-07T00:00:00.000Z",
  "cacheStats": {
    "cacheSize": 1,
    "metadataSize": 1,
    "maxSize": 1000,
    "ttlHours": 24
  },
  "proxyConfig": {
    "targetUrl": "https://token-plan-cn.xiaomimimo.com/anthropic",
    "port": "3000"
  }
}
```

### 缓存统计

```bash
GET /stats
```

### 清空缓存

```bash
POST /cache/clear
```

## 支持的API格式

### OpenAI格式

- **端点**: `/v1/chat/completions`
- **请求格式**: OpenAI兼容格式
- **支持字段**: `reasoning_content`, `tool_calls`

### Anthropic格式

- **端点**: `/v1/messages`
- **请求格式**: Anthropic兼容格式
- **支持字段**: `reasoning`, `thinking`, `tool_use`, `tool_result`

## 支持的模型

- `mimo-v2.5-pro`
- `mimo-v2.5`
- `mimo-v2-pro`
- `mimo-v2-omni`
- `mimo-v2-flash`

## 支持的Agent工具

### OpenAI兼容协议
- TRAE
- Cursor
- Roo Code
- Codex
- GitHub Copilot CLI
- Zed
- AutoGen
- Goose

### Anthropic兼容协议
- TRAE
- GitHub Copilot CLI
- AutoGen
- Goose
- OpenClaw
- OpenCode
- Kilo Code

## 项目结构

```
xiaomi-mimo-proxy/
├── src/
│   ├── index.js                  # 主服务器入口
│   ├── logger.js                 # 日志管理器
│   ├── healthcheck.js            # 健康检查脚本
│   ├── cache/
│   │   ├── index.js              # 缓存管理器
│   │   ├── reasoning-cache.js    # 内存缓存实现
│   │   └── redis-cache.js        # Redis缓存实现
│   └── handlers/
│       ├── openai-handler.js     # OpenAI格式处理器
│       └── anthropic-handler.js  # Anthropic格式处理器
├── logs/                         # 日志目录
├── .env                          # 环境变量配置
├── .env.example                  # 环境变量示例
├── package.json                  # 项目配置
├── start.sh                      # 启动脚本
├── stop.sh                       # 停止脚本
└── status.sh                     # 状态检查脚本
```

## 配置选项

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `MIMO_BASE_URL` | `https://api.xiaomimimo.com` | 小米API基础URL |
| `PROXY_PORT` | `3000` | 代理服务器端口 |
| `CACHE_MAX_SIZE` | `1000` | 最大缓存对话数 |
| `CACHE_TTL_HOURS` | `24` | 缓存过期时间（小时） |

### 使用Redis缓存（可选）

如果需要在多个实例间共享缓存，可以使用Redis：

1. 安装Redis依赖：
   ```bash
   npm install redis
   ```

2. 配置环境变量：
   ```env
   USE_REDIS=true
   REDIS_URL=redis://localhost:6379
   ```

## 常见问题

### Q: 为什么proxy不需要API Token？

A: Proxy只负责拦截请求、处理reasoning_content的缓存和注入，然后转发请求。API Token由Agent工具直接传递给小米API，Proxy不会存储或管理任何Token，这样更安全。

### Q: 注入操作显示"注入了0条历史reasoning_content"是否正常？

A: 是正常的。当对话是第一次进行时，缓存中没有历史reasoning_content，所以注入操作会显示0条。只有在多轮对话中，当之前的对话包含reasoning_content时，才会注入历史内容。

### Q: 如何查看缓存状态？

A: 使用以下命令：
```bash
curl http://localhost:3000/stats
```

### Q: 如何清空缓存？

A: 使用以下命令：
```bash
curl -X POST http://localhost:3000/cache/clear
```

## 许可证

MIT License
