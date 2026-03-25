# 数据层设计

## 1. 概述

数据层使用 PostgreSQL + Redis + ClickHouse 实现结构化数据、缓存、时序数据的存储。

## 2. 技术选型

| 存储 | 用途 | 特点 |
|------|------|------|
| PostgreSQL | 结构化数据 | 事务支持、复杂查询 |
| Redis | 缓存、状态 | 高速读写、TTL |
| ClickHouse | 时序数据 | 列式存储、聚合查询 |

## 3. 相关文档

- [PostgreSQL 表结构](./PostgreSQL.md)
- [Redis 数据结构](./Redis.md)
- [ClickHouse 时序表](./ClickHouse.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)