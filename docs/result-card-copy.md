# 卡牌和星级文案维护

## 文件划分

- `apps/api/app/config/event-scores.json`：事件分值；`event-scores-v4-temporary-null` 将背包及未配置选项暂设四维 NULL。已确认分值不变，旧旅程绑定的版本不改写。
- `apps/api/app/score_normalization.py`：每关各维归一化、按关卡权重合成最终 A/V/T/F；NULL 不作为零分，未测量关卡从该维权重分母排除。
- `apps/api/app/config/portrait-policy.json`：服务端卡牌映射配置，`avtf-signs-v1` 按用户上传原表的编号映射；最终四维各自 0–50 为负（L），大于 50 为正（H）。按编号对应现有卡图并保留原画名称，已获用户确认。
- `apps/api/app/results.py`：从服务端账本汇总生成结果。真我值使用最终 T，恋爱脑使用最终 F，星级分别按 [0,20)、[20,40)、[40,60)、[60,80)、[80,100] 映射 1–5 星。
- `apps/web/src/features/results/portraits.ts`：16 张卡的固定名称、原图、通用文案。
- `apps/web/src/features/results/copy/`：每张卡一个 JSON，真我值和恋爱脑各五段独立文案；不是 25 种交叉组合。
- `apps/web/src/features/results/rating-copy.ts`：按卡牌 ID、指标、星级选取文案，不参与评分。
- `apps/web/src/features/results/ResultDesign.tsx`：显示服务端星级，以及各自对应文案。图片内原有四段内容保持不变，星级扩展文案显示在卡牌下方。

## 例：修改坚韧刺猬四星真我值文案

编辑 `apps/web/src/features/results/copy/16-hedgehog.json` 中 `authenticity` 的 `"4"`：

```json
"4": {
  "title": "填写这一档的小标题",
  "body": "填写坚韧刺猬真我值四星对应的正文。"
}
```

恋爱脑四星改 `love."4"`；其他星级同理。`null` 表示未提供文案，页面不显示该段，不自动编造或借用其他星级。每次可以只改一段，保存并重新构建网页即可生效，不改评分代码、不改历史分数。

每张卡 10 个槽位，共 160 个。文案属于展示内容，可独立更新；分数和卡牌映射策略绑定服务器旅程。正式策略更新后请新建旅程验证，旧回执不自动补分。

暂行限制：L2 放弃重试、探索及搜索的未决触发条件暂不阻塞最终评分；不虚构额外动作或历史事件。已确认但尚未接入触发的条目仍保留配置，后续补触发规则时应发布新版本。
