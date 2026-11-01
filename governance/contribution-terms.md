# DSH 贡献者条款 v1（DCT v1，CLA 式）

> **状态**：active（D-014，2026-11-01）。**不是法律意见**；在依赖它之前，应由你所在司法辖区的执业律师复核。
> **它不是**：双方合同、版权转让协议、雇佣合同、代理授权、官方标准贡献协议、专利池许可。它是**贡献者的单方声明 + 项目侧使用规则**；DCO 也不是合同，不本身构成许可（见 Linux Foundation 的 DCO 说明）。
> **它是什么**：一个**轻量、可机器校验**的贡献许可 + 声明机制，参考 Apache ICLA 的“许可而非转让”、DCO 1.1 的“逐提交签名”、以及认证标志许可的“使用即遵守”结构。
> **适用**：向 `PerryLink/dsh-standards` 及其官方镜像提交的任何文本、代码、数据、样本、翻译、评审记录或治理建议。

---

## 0. 一句话版本

**你保留版权；你授予项目及下游一项永久、全球、免费、非独占的许可；你用 `Signed-off-by` 声明你有权提交；你披露 AI 辅助与雇主归属；你不转让版权。**

---

## 1. 定义

1. **“项目”**：`PerryLink/dsh-standards` 仓库及其由当前管理人（Steward，现为 PerryLink）发布的官方镜像。
2. **“管理人”**：当前维护项目的自然人或未来依法设立并承接项目的实体。
3. **“贡献”**：你通过 pull request、patch、issue 附件、评审记录或其他方式提交给项目的任何受版权保护的材料。
4. **“材料”**：项目按 `CC BY 4.0`（文本/文档）CC BY 4.0；（代码/脚本）Apache-2.0向外发布的成果。
5. **“AI 辅助”**：使用生成式模型产出的、被你实质性修改或直接纳入贡献的内容。

## 2. 版权许可（许可，不是转让）

在适用法律允许的最大范围内，你授予管理人和所有接收材料的人一项**永久、全球、非独占、免费、不可撤销、可再许可**的版权许可，允许其复制、修改、改编、翻译、汇编、公开展示、分发你的贡献，并将其按项目的出站许可再许可（文本 CC BY 4.0；代码 Apache-2.0）。

- **你保留版权**；本项目不要求版权转让。
- 你授予的许可**不限于**本项目使用；下游接收者可按出站许可继续使用。
- 你同意管理人可以**不署名**或按项目惯例署名；在适用法律要求署名的范围内，管理人会保留你的 `Signed-off-by` 记录。
- 如果你所在司法辖区不允许放弃精神权利，你同意**不主张**会妨碍上述许可行使的精神权利。

## 3. 专利许可（RF + 防御终止）

你授予管理人和下游接收者一项**永久、全球、非独占、免费、不可撤销**的专利许可，仅覆盖你的贡献单独或与项目材料结合时**必然侵犯**的必要权利要求。

- 若你或你的关联方就本项目或其用户实施本项目提起专利诉讼（含反诉），上述专利许可自起诉之日起终止。
- 你无需许可与贡献无关的专利；你应披露你已知的、可能成为必要权利要求的专利，但本条不构成专利检索或保证。

## 4. 你的声明与保证

你声明并保证：

1. 你有权提交该贡献，且贡献是你的原创作品，或你已获得足够的第三方许可；
2. 贡献不包含你无权披露的机密信息、个人信息或第三方专有代码；
3. 如果你代表雇主或其他实体提交，你已获得该实体的授权，或已按 §6 提交 Entity CLA；
4. 你已按 §5 披露 AI 辅助；
5. 你理解项目**不承诺**接受任何贡献，也不支付报酬。

## 5. AI 辅助披露

1. 在提交信息或 PR 正文中标注 `AI-Assisted: yes`，并写明 `AI-Tool: <工具/模型>`。
2. 你对 AI 辅助内容的**正确性、许可合规性和安全性**负责；项目不因标注 AI 而降低审查标准。
3. 若 AI 输出可能不构成可版权作品，你仍授予你所能授予的全部权利，并同意项目可自由使用该贡献。
4. 不得把机密代码、未公开的会话数据、他人个人信息输入公开模型后提交。
5. 纯 AI 生成、无人类实质性修改的贡献**不被接受**；`Signed-off-by` 必须由承担责任的自然人签署。

## 6. 实体贡献（Entity CLA）

如果你代表公司、基金会或其他组织提交，且满足任一条件，需另行签署一页 `Entity CLA`：

- 提交信息含 `On-Behalf-Of: <组织>`；
- 贡献包含该组织的专有代码或未公开材料；
- 单次 PR 新增超过 **300 行**非文档代码；
- 新增或改写**规范性条款**（下游可能把它当合同引用）。

Entity CLA 需由**有权代表该组织的人**签署，列明：组织名称、授权代表、覆盖的 GitHub 账号、许可范围、生效/终止日期。**没有法律实体的一方不能签署 Entity CLA**；此时只能由个人以其自身身份提交。

机器记录：`governance/contributors.json` 的 `entityCla` 字段（值为已归档文件的 SHA-256）。

## 7. DCO 1.1 逐提交签名

每个提交必须包含：

```text
Signed-off-by: Your Real Name <you@example.com>
```

签名表示你同意 [Developer Certificate of Origin 1.1](https://developercertificate.org/)：

> By making a contribution to this project, I certify that:
> (a) The contribution was created in whole or in part by me and I have the right to submit it under the open source license indicated in the file; or
> (b) The contribution is based upon previous work that, to the best of my knowledge, is covered under an appropriate open source license and I have the right under that license to submit that work with modifications, whether created in whole or in part by me, under the same open source license (unless I am permitted to submit under a different license), as indicated in the file; or
> (c) The contribution was provided directly to me by some other person who certified (a), (b) or (c) and I have not modified it.
> (d) I understand and agree that this project and the contribution are public and that a record of the contribution (including all personal information I submit with it, including my sign-off) is maintained indefinitely and may be redistributed consistent with this project or the open source license(s) involved.

**签名必须使用可识别身份**：真实姓名或长期使用的笔名 + 可联系邮箱。匿名提交可以开 issue，但不能合并。

### 7.1 提交信息 trailer

| trailer | 必填 | 含义 |
|---|---|---|
| `Signed-off-by` | 是 | DCO 1.1；**只有人类本人可以签**，AI 不得代签 |
| `DSH-Contribution: dsh-ct/1` | 建议 | 明确接受本条款版本 |
| `AI-Assisted: yes\|no` | 是（AI 时） | 是否使用生成式 AI |
| `AI-Tool: <name>` | AI 时必填 | 工具/模型名 |
| `Assisted-by: <name>` | 可选 | 与内核/Fedora 的 `Assisted-by` 对齐 |
| `On-Behalf-Of: <org>` | 组织贡献时 | 触发 Entity CLA 检查 |
| `Entity-CLA: <id>` | Entity 时 | 已归档的 Entity CLA 编号 |
| `Data-Origin: self\|public-cc0\|vendor-permitted` | 数据/样本时 | 数据来源 |
| `Contains-PII: no` | 数据/样本时 | 声明不含个人信息 |
| `Translation-Of: <sha>` | 翻译时 | 源文本 commit |

## 8. 接受方式

以下任一方式构成对本条款的接受：

1. 在 PR 正文勾选：`- [x] I agree to the DSH Contribution Terms v1 (dsh-ct/1)`；
2. 在提交信息中加入：`DSH-Contribution: dsh-ct/1`；
3. 由管理人记录的 `contributors.json` 条目，且该条目引用了本条款版本。

首次贡献者由 `ai-clerk` 在 PR 中提示；合并前必须通过 `dco-check.mjs`。

## 9. 终止

1. 你可以随时停止贡献；已授予的许可**继续有效**（这是下游可依赖性的基础）。
2. 如果你实质性违反本条款，管理人可终止你**未来**的提交权限，并公开记录（不含不必要的个人信息）。
3. 管理人违反本条款时，你可在项目 issue 中提出；项目应在一个合理期限内更正或说明。

## 10. 隐私

1. `Signed-off-by` 的姓名和邮箱会进入公开 git 历史；这是 DCO 的固有属性。
2. 你可以使用专用邮箱；不要使用包含敏感信息的邮箱。
3. `contributors.json` 只记录 handle、贡献级别、COI 摘要，不记录住址、电话、身份证号。

## 11. 无保证、责任限制

贡献按“现状”提供，不附带任何明示或默示保证。在适用法律允许的最大范围内，管理人和贡献者不对使用贡献造成的间接、附带、特殊或惩罚性损害承担责任。本条款不限制依法不能限制的责任。

## 12. 版本与语言

1. 当前版本：`dsh-ct/1`，2026-11-01。
2. 版本变更只对变更后提交的贡献生效；已授予的许可不受影响。
3. 中文版本为参考文本；如未来出现英文版本且发生冲突，以管理人指定的版本为准，并在 `decision-log.md` 记录。

---

## 机器检查点

| 检查 | 字段/命令 | 失败后果 |
|---|---|---|
| 每个提交有 DCO 签名 | `Signed-off-by` 且邮箱匹配作者 | 阻止合并 |
| PR 接受条款 | PR 正文复选框或 `DSH-Contribution: dsh-ct/1` | 阻止合并 |
| AI 披露 | `AI-Assisted: yes` 时必须有 `AI-Tool:` 和人类签名 | 阻止合并 |
| 实体覆盖 | 超过阈值时 `Entity-CLA` 或 `entityCla` 记录 | 警告，人工复核 |
| 条款版本 | `contributors.json.terms === "dsh-ct/1"` | 治理检查失败 |

> **边界**：本条款不能验证你的真实身份、法律行为能力、雇主授权或专利状态；它只记录你的声明。需要法律确定性的贡献者应自行咨询律师。
