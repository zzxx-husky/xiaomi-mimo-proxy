# Xiaomi MiMo Proxy

一个用于代理小米MiMo API请求的proxy服务器，专门处理Agent产品中reasoning_content字段的缓存和注入问题。

## 重要说明

**🔑 此Proxy不需要API Token！**

- Proxy只负责拦截请求、处理reasoning_content的缓存和注入
- API Token由Agent工具（如Claude Code）直接传递给小米API
- Proxy不会存储或管理任何API Token
- 你只需要提供小米的URL即可

## 问题背景

小米的MiMo Agent产品在多轮对话中要求必须返回完整的`reasoning_content`字段，否则会返回400错误。这是因为缺失历史`reasoning_content`会导致模型上下文不完整，可能降低指令遵循能力、增加幻觉，整体用户体验下降。

## 解决方案

本proxy通过以下方式解决这个问题：

1. **自动拦截请求**：捕获所有发送到小米MiMo API的请求
2. **缓存reasoning_content**：将每个对话中的reasoning_content存储在内存中
3. **自动注入历史内容**：在后续请求中自动注入之前缓存的reasoning_content
4. **支持多对话独立缓存**：每个对话维护独立的reasoning_content历史
5. **Token透传**：API Token由Agent工具直接传递，Proxy不存储

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制`.env.example`为`.env`并填写配置：

```bash
cp .env.example .env
```

编辑`.env`文件：

```env
# 只需要配置小米的URL，不需要API Token
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
PROXY_PORT=3000
```

### 3. 启动代理服务器

```bash
npm start
```

### 4. 配置Agent工具

在你的Agent工具（如Claude Code、Cursor、TRAE等）中配置：

**Claude Code配置：**

在`settings.json`中添加：

```json
{
  "apiProvider": "anthropic",
  "baseUrl": "http://localhost:3000",
  "apiKey": "your_mimo_api_key_here"  // 这里填你的API Token
}
```

**Cursor配置：**

在Settings → AI中配置：

- API Provider: Custom
- Base URL: `http://localhost:3000`
- API Key: `your_mimo_api_key_here`  // 这里填你的API Token

**其他工具：**

对于其他Agent工具，只需将Base URL设置为：

```
http://localhost:3000
```

并配置正确的API Token。

## 工作原理

### 请求流程

```
Agent工具（带API Token） → Proxy服务器 → 小米MiMo API
                              ↓
                        1. 拦截请求
                        2. 识别对话ID
                        3. 提取历史reasoning_content
                        4. 注入到请求中
                        5. 转发到小米API（保留原始Token）
                              ↓
                        6. 接收响应
                        7. 提取新的reasoning_content
                        8. 更新缓存
                        9. 返回给Agent工具
```

### 缓存策略

- **内存缓存**：使用Map存储，性能高效
- **LRU淘汰**：当缓存达到最大容量时，淘汰最旧的条目
- **自动过期**：24小时未访问的缓存自动清理
- **对话隔离**：每个对话维护独立的reasoning_content历史

### 对话ID生成

基于对话前3条消息的内容生成唯一标识符，确保：
- 相同对话使用相同ID
- 不同对话使用不同ID
- 跨请求保持一致性

## API端点

### 健康检查

```bash
GET /health
```

响应：
```json
{
  "status": "healthy",
  "timestamp": "2026-05-12T16:37:26.000Z",
  "cacheStats": {
    "cacheSize": 42,
    "metadataSize": 42,
    "maxSize": 1000,
    "ttlHours": 24
  },
  "proxyConfig": {
    "targetUrl": "https://api.xiaomimimo.com/v1",
    "port": 3000
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

## 配置选项

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `MIMO_BASE_URL` | `https://api.xiaomimimo.com/v1` | 小米API基础URL |
| `PROXY_PORT` | `3000` | 代理服务器端口 |
| `CACHE_MAX_SIZE` | `1000` | 最大缓存对话数 |
| `CACHE_TTL_HOURS` | `24` | 缓存过期时间（小时） |

## 受影响的Agent产品

根据小米官方文档，以下Agent产品需要使用此proxy：

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

## 受影响的模型

- mimo-v2.5-pro
- mimo-v2.5
- mimo-v2-pro
- mimo-v2-omni
- mimo-v2-flash

## 示例：Claude Code配置

在Claude Code的`settings.json`中配置：

```json
{
  "apiProvider": "anthropic",
  "baseUrl": "http://localhost:3000",
  "apiKey": "your_mimo_api_key_here",  // 这里填你的小米API Token
  "model": "mimo-v2.5-pro"
}
```

## 开发说明

### 项目结构

```
xiaomi-mimo-proxy/
├── src/
│   ├── index.js              # 主服务器入口
│   ├── logger.js             # 日志管理器
│   ├── healthcheck.js        # 健康检查脚本
│   ├── cache/
│   │   ├── index.js          # 缓存管理器
│   │   ├── reasoning-cache.js # 内存缓存实现
│   │   └── redis-cache.js    # Redis缓存实现
│   └── handlers/
│       ├── openai-handler.js  # OpenAI格式处理器
│       └── anthropic-handler.js # Anthropic格式处理器
├── logs/                     # 日志目录
├── .env                      # 环境变量配置
├── .env.example              # 环境变量示例
├── package.json              # 项目配置
├── start.sh                  # 启动脚本（Linux/macOS）
├── start.ps1                 # 启动脚本（Windows PowerShell）
├── stop.sh                   # 停止脚本（Linux/macOS）
├── stop.ps1                  # 停止脚本（Windows PowerShell）
├── status.sh                 # 状态检查脚本（Linux/macOS）
├── status.ps1                # 状态检查脚本（Windows PowerShell）
├── README_CN.md              # 项目文档（中文）
└── README.md                 # 项目文档（英文）
```

### 运行测试

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

## 常见问题

### Q: 为什么需要这个proxy？

A: 小米的MiMo Agent产品在多轮对话中要求必须返回完整的reasoning_content字段，但很多Agent工具默认不会发送这个字段。本proxy自动处理这个问题。

### Q: 为什么proxy不需要API Token？

A: Proxy只负责拦截请求、处理reasoning_content的缓存和注入，然后转发请求。API Token由Agent工具直接传递给小米API，Proxy不会存储或管理任何Token，这样更安全。

### Q: 支持流式响应吗？

A: 当前版本支持非流式响应。流式响应的支持需要额外的实现。

### Q: 缓存会泄露敏感信息吗？

A: 缓存存储在内存中，服务器重启后会清空。生产环境建议使用Redis等外部缓存。

### Q: 如何扩展到多实例部署？

A: 可以将内存缓存替换为Redis缓存，实现跨实例共享。

## 许可证

MIT License
