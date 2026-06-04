# UModel Explorer Standalone API

This project can run against the bundled mock data source or a real HTTP API.

## Data Source Switch

Default:

```text
dataSource=mock
```

Use real API:

```text
/?dataSource=api&apiBase=http://your-intranet-api.example.com&workspace=demo
```

If `apiBase` is empty, requests use the same origin. In Vite dev mode, `/api` and `/healthz` are proxied to `UMODEL_API_TARGET`.

## Required Endpoints

### Health

```http
GET /healthz
```

Response:

```json
{
  "status": "ok",
  "graphstore": {
    "provider": "memory",
    "status": "ok",
    "message": "optional"
  }
}
```

### Workspace Metadata

```http
GET /api/v1/workspaces/{workspace}
```

Response:

```json
{
  "id": "demo",
  "name": "demo",
  "description": "Workspace description",
  "labels": { "env": "demo" },
  "paths": { "root": "/path/to/workspace" },
  "status": "active",
  "resource_version": 1,
  "created_at": "2026-06-04T00:00:00Z",
  "updated_at": "2026-06-04T00:00:00Z"
}
```

### List UModel Elements

The UI calls:

```http
POST /api/v1/query/{workspace}/execute
Content-Type: application/json
```

Request:

```json
{
  "query": ".umodel | sort name | limit 1000",
  "limit": 1000
}
```

Preferred response:

```json
{
  "columns": ["kind", "domain", "name", "version", "spec", "metadata"],
  "rows": [
    {
      "kind": "entity_set",
      "domain": "devops",
      "name": "service",
      "version": "v1.0.0",
      "spec": {
        "description": { "zh_cn": "服务实体" },
        "primary_key_fields": ["id"],
        "fields": [
          { "name": "id", "type": "string" },
          { "name": "name", "type": "string" }
        ]
      },
      "metadata": {
        "domain": "devops",
        "name": "service",
        "version": "v1.0.0"
      }
    }
  ],
  "page": {
    "limit": 1000
  }
}
```

The client also accepts this alternate execute shape:

```json
{
  "success": true,
  "code": "OK",
  "message": "ok",
  "data": {
    "header": ["kind", "domain", "name", "version", "spec", "metadata"],
    "data": [["entity_set", "devops", "service", "v1.0.0", {}, {}]],
    "responseStatus": {
      "result": "success",
      "retryPolicy": "none",
      "level": "info",
      "statusItem": []
    }
  }
}
```

### Validate UModel Elements

```http
POST /api/v1/umodel/{workspace}/validate
Content-Type: application/json
```

Request:

```json
{
  "elements": [
    {
      "kind": "entity_set",
      "domain": "devops",
      "name": "service",
      "version": "v1.0.0",
      "spec": {}
    }
  ]
}
```

Response:

```json
{
  "valid": true,
  "errors": []
}
```

Invalid response:

```json
{
  "valid": false,
  "errors": [
    { "field": "elements[0].name", "reason": "name is required" }
  ]
}
```

### Upsert UModel Elements

```http
POST /api/v1/umodel/{workspace}/elements
Content-Type: application/json
```

Request:

```json
{
  "elements": []
}
```

Response:

```json
{
  "accepted": 0,
  "failed": 0,
  "items": []
}
```

### Delete UModel Elements

```http
DELETE /api/v1/umodel/{workspace}/elements
Content-Type: application/json
```

Request:

```json
{
  "ids": ["devops/service/entity_set"]
}
```

Response:

```json
{
  "accepted": 1,
  "failed": 0,
  "items": []
}
```

### Import Sample Data

Used by the UI sample-import action.

```http
POST /api/v1/samples/{workspace}/multi-domain-quickstart:import
Content-Type: application/json
```

Request:

```json
{}
```

Response:

```json
{
  "workspace": "demo",
  "sample": "multi-domain-quickstart",
  "umodel": {
    "workspace": "demo",
    "source": "sample",
    "imported": 0,
    "skipped": 0,
    "elements": []
  },
  "entities": { "accepted": 0, "failed": 0 },
  "relations": { "accepted": 0, "failed": 0 },
  "entity_count": 0,
  "relation_count": 0
}
```

## UModel Element Shape

Node example:

```json
{
  "kind": "entity_set",
  "domain": "devops",
  "name": "service",
  "version": "v1.0.0",
  "spec": {
    "description": {
      "zh_cn": "服务实体",
      "en_us": "Service entity"
    },
    "primary_key_fields": ["id"],
    "fields": [
      {
        "name": "id",
        "type": "string",
        "display_name": { "zh_cn": "主键" },
        "short_description": { "zh_cn": "唯一标识" }
      }
    ]
  }
}
```

Edge example:

```json
{
  "kind": "entity_set_link",
  "domain": "devops",
  "name": "service_runs_on_cluster",
  "version": "v1.0.0",
  "spec": {
    "entity_link_type": "runs_on",
    "src": { "domain": "devops", "kind": "entity_set", "name": "service" },
    "dest": { "domain": "k8s", "kind": "entity_set", "name": "cluster" }
  }
}
```

Endpoint IDs are resolved as `{domain}.{name}` from `spec.src` and `spec.dest`.
