# 原生决策模型

2026-10-30 查询 OpenRouter 的[决策模型目录](https://openrouter.ai/api/v1/models?output_modalities=decisions)得到 34 条记录。裸 `/api/v1/models` 不包含完整决策目录，必须带 `output_modalities=decisions`。记录包括版本、别名、免费路由和非决策提取模型，不能把条数当作独立原生模型数量。

`src/native-models.json` 保存已核对的 Decisions 模型：29 条记录，其中 24 个具体模型、5 个 latest 别名，涉及 13 个厂商。来源和题型能力随记录保存；清单是可更新的兼容资料，不是已逐模型实测的声明。运行 `node scripts/update-native-models.mjs` 查看目录变化，`--write` 备份后刷新已核对记录的名称；新增记录需核对协议及题型后加入。

| 厂商 | 具体模型 |
| --- | --- |
| TypeSafe | Jev 1.13、1.14 |
| OpenAI | GPT-6 Luna Decisions |
| Microsoft | Microsoft-Decision-1 |
| Perplexity | Decider V1.2、Decider Flash V1.2 |
| Cloudflare | Clef、Clef Flash、Clef Omni |
| Baseten | Joey 1、Elephant 1、Mammoth 1 |
| Liquid AI | d1、d1.1、d1-ultra |
| Nace.AI | Drex v1.5、v2.0、Max |
| Respan | Span-02 |
| Inception | Mercury Decide |
| Upstage | Solar Decide、Solar Decide Flash |
| Jared Palmer | Kev 4B |
| ScaleDown | Classify-1 |

以上模型通过 OpenRouter 的 `POST /api/alpha/decisions` 使用 `choice`、`noul`、`score`；不同厂商直连接口不在本清单的接入范围。输入长度、题目数和服务可用性仍由所选模型决定。GPT-6 Luna Decisions 的[模型说明](https://openrouter.ai/openai/gpt-6-luna-decisions)注明单请求最多 200 题。

三种题型共用[官方请求协议](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request)：`choice.criteria` 为选项对象；`noul.criteria` 可提供 true/false 描述；`score.criteria` 是从低到高的等级数组，返回分数是从 0 开始的等级位置期望值。官方响应中 Choice 的概率和置信度、Score 的概率、图例和置信度为可选字段；缺失时不能伪造成模型概率。

## 需要单独适配的目录项

`docs/native-model-exceptions.json` 记录五条不能直接套用通用适配器的条目，保留在调查结果中。

- [Clairic](https://openrouter.ai/cloudflare/clairic) 使用 Extractions API，输出提取字段，不是这三种题型。
- [Tev1](https://openrouter.ai/togethercomputer/tev1-4b-experimental) 使用聊天补全，输出 2–24 个选项中的一个字母，不返回原生概率。把判断或等级编码成选项可获得类别，但不能据此制造概率或期望评分。
- [Span-01、Lite 及免费路由](https://www.respan.ai/docs/apis/gateway/run-span-01) 使用交互 span 和行为定义，返回存在、不存在、无法观察三项概率。它们不能直接接收当前通用 state，也不能把“无法观察”合并成“否”。Span-02 则有三题型接口，已列入通用清单。

[ScaleDown 官方接口](https://docs.scaledown.ai/api-reference/decisions.md)已确认三题型及状态差异：只读取 `state.text` 或 `state.document`，字符串是 text 的简写。适配器必须保留完整输入并序列化为文本；判断题的 criteria 被上游忽略，正反描述需并入题目；评分题允许 2–10 级。[Jev 选择题](https://docs.typesafe.ai/primitives/choice)最多 255 个选项；不能将互斥选项任意分批后合并概率。

普通聊天模型由兼容适配器实现相同的三种题型，其概率属于模型自报估计。原生仅决策模型不能因为缺少某题型就自动按聊天模型调用；需要独立适配或使用明确配置的兼容模型。
