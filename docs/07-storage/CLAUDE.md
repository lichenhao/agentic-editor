# 存储组开发规范

## 概述

本文件定义 07-storage 目录下的开发规范和约束。

## 核心约束

### 1. 数据存储选择

| 数据类型 | 存储 | 约束 |
|----------|------|------|
| 结构化数据 | PostgreSQL | 事务查询 |
| 缓存/状态 | Redis | TTL 过期 |
| 时序数据 | ClickHouse | 聚合分析 |

### 2. 多租户

所有查询必须包含 tenant_id：

```typescript
// ✅ 正确
await this.agentRepo.findBy({ tenantId: 'uuid' });

// ❌ 禁止
await this.agentRepo.findAll();
```

### 3. ClickHouse TTL

时序数据必须设置 TTL：

```sql
-- ✅ 正确
TTL timestamp + INTERVAL 90 DAY

-- ❌ 禁止
-- 无 TTL
```

### 4. Redis 缓存失效

配置变更后必须清除缓存：

```typescript
// ✅ 正确
await this.redis.invalidate(`policy:${tenantId}:*`);

// ❌ 禁止
// 配置更新后未清除缓存
```

## 模块划分

```
src/db/
├── index.ts              # 数据库连接
├── clickhouse.ts        # ClickHouse 连接
├── migrations/          # 迁移脚本
└── repositories/        # 数据访问层

src/
└── utils/
    └── cache.ts         # 缓存工具
```

## 索引约束

常用查询字段必须创建索引：

```sql
-- ✅ 正确
CREATE INDEX idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX idx_tasks_user ON tasks(user_id);

-- ❌ 禁止
-- 无索引
```

## 测试约束

- 使用 testcontainers 进行集成测试
- 验证查询性能

## 相关文档

- [数据层设计](./README.md)
- [PostgreSQL 表结构](./PostgreSQL.md)
- [Redis 数据结构](./Redis.md)
- [ClickHouse 时序表](./ClickHouse.md)
- 架构规范：[../01-arch/CLAUDE.md](../01-arch/CLAUDE.md)