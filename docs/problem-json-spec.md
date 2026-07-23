# CodeForge OJ 题目 JSON 规范（V1）

文件必须使用 UTF-8 编码，根节点必须是 JSON 对象。

## 必填字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 题目标题，不能为空 |
| `description` | string | 题目描述 |
| `inputFormat` | string | 输入格式说明 |
| `outputFormat` | string | 输出格式说明 |
| `samples` | array | 测试点数组，至少一项 |

每个 `samples[]` 对象必须包含字符串类型的 `input` 和 `output`。多行数据在 JSON 字符串中使用 `\n`。

## 可选字段

| 字段 | 类型 | 默认值 / 约束 |
| --- | --- | --- |
| `version` | integer | 仅支持 `1` |
| `id` | string | 仅限字母、数字、下划线和连字符；未提供时自动生成 |
| `difficulty` | string | `入门`、`普及` 或 `提高`；默认 `入门` |
| `time` | string | 默认 `1000 ms` |
| `memory` | string | 默认 `128 MB` |
| `samples[].id` | integer | 可省略，平台自动生成 |

完整机器可读规范见 `public/problem.schema.json`，可导入示例见 `public/problem-example.json`。
