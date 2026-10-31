# Co-maintainer packet

Status: **no co-maintainer recruited yet**. This packet is the publishable ask;
it is not evidence that one exists.

## 150–250 word post (English)

> **Seeking 1–2 co-maintainers for an open, non-official DSH plugin standard**
>
> `dsh-standards` is a small, evidence-first project that defines three adoption
> levels for DeepSeek Harness plugins: ENTRY (it runs), FLOW (it behaves), and
> BOOST (it measurably helps). It is **not** an official DeepSeek standard, not a
> certification, and not a security audit. The checker, the 18-package runtime
> sample, the 60+20 repo static sample, and the benchmark harness are all in one
> repository.
>
> I am the only maintainer and the bus factor is 1. I am looking for one or two
> people who can commit a few hours a month to:
> - review checker/spec changes against the evidence rules;
> - rerun and read CI (static sample, 18-package runtime, web smoke);
> - triage plugin reports and turn vague claims into reproducible rows;
> - own one area (checker, docs, samples, or benchmarks).
>
> What you get: attribution in `MAINTAINERS.md`, a real review role, and a say in
> whether the project stays a draft or becomes useful enough for a beta group.
> No fee, no ranking, no certification, no CLA. Contributions are public and
> forkable.
>
> If you have shipped or reviewed a DSH plugin and can show 1–3 concrete
> contributions, open an issue with your handle, the area you want, and any
> conflicts. Chinese or English is fine.

## 150–250 字招募帖（中文）

> **为一个非官方、证据优先的 DSH 插件标准招募 1–2 名共同维护者**
>
> `dsh-standards` 是一个小项目，定义 DSH 插件的三级采用标准：ENTRY（装完能跑）、
> FLOW（行为顺畅）、BOOST（可量化增效）。它**不是** DeepSeek 官方标准，不是认证，
> 也不是安全审计。checker、18 包运行时样本、60+20 仓库静态样本和基准工具都在
> 同一个仓库里。
>
> 目前只有 1 名维护者，bus factor = 1。希望找 1–2 位每月能投入几小时的人：
> - 按证据规则评审 checker/规范改动；
> - 重跑并读懂 CI（静态样本、18 包运行时、web smoke）；
> - 把模糊的插件报告变成可复现的行；
> - 认领一个方向（checker、文档、样本或基准）。
>
> 你能得到：`MAINTAINERS.md` 署名、真实评审权，以及对项目继续做草稿还是推进到
> 内测的判断权。无费用、无排名、无认证、无 CLA，贡献公开可 fork。
>
> 如果你发布或评审过 DSH 插件，并能给出 1–3 个具体贡献，请开 issue 写明 GitHub
> handle、想认领的方向和利益冲突。中英文均可。

## Where to post

1. **DSH beta group** — the primary channel; attach a one-paragraph summary and a
   link to this repository. The repo is currently **private**, so either make it
   public first or invite the candidate as a read-only collaborator before
   sharing the link.
2. **GitHub Discussions** — enable Discussions on `PerryLink/dsh-standards` and
   pin the post under a `governance` category.
3. **A relevant awesome-list / community thread** — only where self-promotion
   is allowed and the list is about DSH plugins, not generic LLM tooling. Do not
   spam multiple lists with the same text.

## Grant checklist

- [ ] Candidate has 2FA enabled.
- [ ] At least one contribution reviewed end-to-end by the current maintainer.
- [ ] Added as GitHub collaborator with **write**, not admin.
- [ ] Added to `.github/CODEOWNERS` and `MAINTAINERS.md` in one commit.
- [ ] Candidate uses their **own** npm/PyPI token; no shared secret.
- [ ] First release is supervised; after that, release rights are documented.
- [ ] Conflict-of-interest disclosure recorded in the issue.
- [ ] `provisional` marker removed only after the second maintainer's first review.

## What is still human-only

- Inviting a named GitHub account as a collaborator.
- Adding a second owner on npm/PyPI.
- Making the repository public.
- Recruiting the person in the first place.

No agent can complete those four actions without a human identity and explicit
account-level permission.
