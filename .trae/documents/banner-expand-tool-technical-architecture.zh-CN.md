## 1.Architecture design
```mermaid
graph TD
  A["用户浏览器"] --> B["React 前端应用"]
  B --> C["生图 API（第三方/自建）"]

  subgraph "Frontend Layer"
    B
  end

  subgraph "External Services"
    C
  end
```

## 2.Technology Description
- Frontend: React@18 + vite + TypeScript + tailwindcss@3
- Backend: None（前端直接调用生图 API；API Key 由用户在设置页配置并本地保存，不在代码中硬编码）

## 3.Route definitions
| Route | Purpose |
|-------|---------|
| / | 制作页：上传头图、触发生图、预览与下载结果 |
| /settings | 设置页：配置/校验 API Key 与 API Endpoint |

## 6.Data model(if applicable)
不需要数据库。API Key 仅作为用户本地配置存储于浏览器（例如 localStorage），不随应用代码发布。