# 技能立绘与生成记录

使用内置 imagegen 工具（非 CLI），生成四套原创甜点主题的二次元技能演出立绘。保存在本仓库 `public/art/`，并由 `src/presentation.js` 按技能类别选择。当前是四个职业原型共享立绘，不是 40 名角色各自独立的最终角色美术。

| 文件 | 角色原型 | 用途 |
| --- | --- | --- |
| strawberry.png | 草莓奶油冲刺少女 | 竞速、幸运、跳跃类 |
| mint.png | 薄荷马卡龙守护骑士 | 防护、冻结、净化类 |
| cocoa.png | 黑巧魔法师 | 换位、封技、操控类 |
| lemon.png | 柠檬挞重锤工匠 | 力量、骰面调整类 |

请求时启用了透明背景，但生成器实际保留了带气氛的绘画背景。本版采用 CSS 边缘渐隐和横切画幅呈现，没有把这些图片声称为已验收的透明抠图。

## 完整基础提示词

Use case: stylized-concept. Asset: transparent anime game ultimate-skill character cut-in for original candy-themed party board game. One original full-body strawberry shortcake female runner hero, adult, playful confident expression, large sparkling anime eyes, cream and strawberry pink layered patisserie-inspired athletic dress, whipped cream hair with strawberry ornament, cape shaped like a cake wrapper, dynamic midair sprinting and punching pose toward viewer, three-quarter angle, strong foreshortening. Professional polished Japanese mobile RPG splash illustration, bold cel shading, exquisite fabric and pastry texture, golden rim light, sweeping pink ribbon, expressive face. Character alone with very few small floating strawberry pieces; entirely transparent background, no backdrop, no text, no typography, no watermark. Full figure and accessories contained with generous margin, portrait 2:3 composition.

## 其余三张的主体替换

- mint：One original full-body mint macaron male guardian hero, adult, handsome anime face, turquoise swept hair, mint-green macaron shoulder armor, elegant cream cloak, translucent mint candy shield and patisserie lance, dynamic defending pose, three-quarter angle, dramatic foreshortening.
- cocoa：One original full-body dark chocolate female sorceress hero, adult, confident playful anime face, deep violet hair, chocolate layered patisserie witch dress with golden caramel trim, huge cocoa cookie magic staff, dynamic casting pose, three-quarter angle, dramatic foreshortening.
- lemon：One original full-body lemon tart male artificer hero, adult, energetic anime face, short golden hair, lemon-yellow and cream fantasy patisserie coat, giant sugar hammer lifted over shoulder, dynamic lunging pose, three-quarter angle, dramatic foreshortening.

三张保留基础提示词的风格／构图要求，将 pink ribbon 改为 colored ribbon，将 floating strawberry pieces 改为 floating candy pieces。原始输出保留于 Codex generated_images，仓库内包含独立副本。
